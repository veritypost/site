// @migrated-to-permissions 2026-04-18
// @feature-verified comments 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { v2LiveGuard } from '@/lib/featureFlags';
import { safeErrorResponse } from '@/lib/apiErrors';
import { scoreReceiveUpvote } from '@/lib/scoring';

// POST /api/comments/[id]/vote
// Body: { type: 'upvote' | 'downvote' | 'clear' }
// D29: separate counts. Same vote twice clears. Different vote switches.
export async function POST(request, { params }) {
  const blocked = await v2LiveGuard();
  if (blocked) return blocked;
  let user;
  try {
    user = await requirePermission('comments.upvote');
  } catch (err) {
    if (err.status) {
      console.error('[comments.[id].vote.permission]', err?.message || err);
      return NextResponse.json({ error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' }, { status: err.status });
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { id } = params;
  const { type } = await request.json().catch(() => ({}));
  if (!['upvote', 'downvote', 'clear'].includes(type)) {
    return NextResponse.json({ error: 'type must be upvote/downvote/clear' }, { status: 400 });
  }

  const service = createServiceClient();

  // Y2 / scoring: capture the prior vote + the comment author so we can
  // award `receive_upvote` to the author when the actor flips into an
  // upvote (and only on a fresh up-flip — not on a re-affirm or a
  // downvote/clear). Pre-load both before mutating; both are best-effort.
  let priorVoteType = null;
  let commentAuthorId = null;
  try {
    const [{ data: priorVote }, { data: comment }] = await Promise.all([
      service
        .from('comment_votes')
        .select('vote_type')
        .eq('comment_id', id)
        .eq('user_id', user.id)
        .maybeSingle(),
      service.from('comments').select('user_id').eq('id', id).maybeSingle(),
    ]);
    priorVoteType = priorVote?.vote_type ?? null;
    commentAuthorId = comment?.user_id ?? null;
  } catch (e) {
    console.error('[comments.id.vote] prior-state lookup', e);
  }

  const { data, error } = await service.rpc('toggle_vote', {
    p_user_id: user.id,
    p_comment_id: id,
    p_vote_type: type,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'comments.id.vote',
      fallbackStatus: 400,
    });

  // Award only when the new vote is an upvote AND the prior state was
  // not already an upvote (no double-award for re-affirm). The helper
  // also enforces (actor, comment) idempotency via synthetic_key dedupe,
  // so up→down→up still awards only once. Skip self-votes silently.
  if (data?.your_vote === 'upvote' && priorVoteType !== 'upvote' && commentAuthorId) {
    try {
      const result = await scoreReceiveUpvote(service, {
        actorId: user.id,
        authorId: commentAuthorId,
        commentId: id,
      });
      if (result?.error) {
        console.error('[comments.id.vote] scoreReceiveUpvote', result.error);
      }
    } catch (e) {
      console.error('[comments.id.vote] scoreReceiveUpvote threw', e);
    }
  }

  return NextResponse.json(data);
}
