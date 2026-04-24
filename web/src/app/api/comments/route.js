// @migrated-to-permissions 2026-04-18
// @feature-verified comments 2026-04-18
import { NextResponse } from 'next/server';
import { requireAuth, hasPermissionServer } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { scoreCommentPost } from '@/lib/scoring';
import { v2LiveGuard } from '@/lib/featureFlags';
import { checkRateLimit } from '@/lib/rateLimit';

// POST /api/comments — create a top-level comment or threaded reply.
// Body: { article_id, body, parent_id?, mentions? }
// mentions is an array of { user_id, username }; the RPC strips it
// for free-tier users (D21).
export async function POST(request) {
  const blocked = await v2LiveGuard();
  if (blocked) return blocked;

  // M11 — order: auth → rate-limit → permission → quiz → RPC. Rate-limit
  // fires before the perms RPC so an authenticated attacker probing for
  // a permission flip (or running the quiz pre-check as a recon side
  // channel) gets gated at 10/min instead of being able to spam the
  // expensive perms+quiz lookups.
  let user;
  try {
    user = await requireAuth();
  } catch (err) {
    if (err.status) {
      console.error('[comments.POST]', err);
      return NextResponse.json({ error: 'Unauthenticated' }, { status: err.status });
    }
    console.error('[comments.POST]', err);
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `comments:${user.id}`,
    policyKey: 'comments_post',
    max: 10,
    windowSec: 60,
  });
  if (rate.limited) {
    const retryAfter = String(rate.windowSec ?? 60);
    return NextResponse.json(
      { error: 'Posting too quickly. Wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': retryAfter } }
    );
  }

  const allowed = await hasPermissionServer('comments.post');
  if (!allowed) {
    return NextResponse.json({ error: 'Not allowed to post comments' }, { status: 403 });
  }

  const { article_id, body, parent_id, mentions } = await request.json().catch(() => ({}));
  if (!article_id || !body) {
    return NextResponse.json({ error: 'article_id and body required' }, { status: 400 });
  }

  // H4 — surface the quiz-gate failure as a specific 403 before
  // hitting the post_comment RPC.
  {
    const { data: passed, error: passErr } = await service.rpc('user_passed_article_quiz', {
      p_user_id: user.id,
      p_article_id: article_id,
    });
    if (passErr) {
      console.error('[comments.POST.quiz_check]', passErr.message || passErr);
    } else if (!passed) {
      return NextResponse.json(
        { error: 'Pass the quiz on this article to join the discussion.' },
        { status: 403 }
      );
    }
  }

  const { data, error } = await service.rpc('post_comment', {
    p_user_id: user.id,
    p_article_id: article_id,
    p_body: body,
    p_parent_id: parent_id || null,
    p_mentions: Array.isArray(mentions) ? mentions : [],
  });
  if (error) {
    console.error('[comments.POST]', error);
    // Ext-F1 — surface known RPC failure modes as actionable copy.
    // Server log keeps the raw cause; client gets a hint they can act on.
    const code = error.code;
    const msg = (error.message || '').toLowerCase();
    if (code === 'P0001' && (msg.includes('quiz') || msg.includes('not allowed'))) {
      return NextResponse.json(
        { error: 'Pass the quiz on this article to join the discussion.' },
        { status: 403 }
      );
    }
    if (code === '23505' || msg.includes('duplicate')) {
      return NextResponse.json(
        { error: 'Looks like that comment already posted.' },
        { status: 409 }
      );
    }
    if (msg.includes('parent')) {
      return NextResponse.json(
        { error: 'Reply target not found — it may have been removed.' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: 'Could not post comment. Try again in a moment.' },
      { status: 400 }
    );
  }

  // Phase 14: award post_comment points + advance streak.
  const scoring = await scoreCommentPost(service, { userId: user.id, commentId: data.id });
  if (scoring?.error) console.error('score_on_comment_post failed', scoring.error);

  // Re-fetch the row so the client gets the full shape (counts etc.).
  const { data: full } = await service
    .from('comments')
    .select(
      '*, users!user_id(id, username, avatar_color, avatar_url, is_verified_public_figure, is_expert, plans(tier))'
    )
    .eq('id', data.id)
    .maybeSingle();

  return NextResponse.json({
    comment: full || { id: data.id },
    scoring: scoring?.error ? null : scoring,
  });
}
