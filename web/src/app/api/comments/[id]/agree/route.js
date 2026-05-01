import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { v2LiveGuard } from '@/lib/featureFlags';
import { safeErrorResponse } from '@/lib/apiErrors';
import { checkRateLimit } from '@/lib/rateLimit';

const NO_STORE = { 'Cache-Control': 'no-store' };

// POST /api/comments/[id]/agree
// Body: { reaction: 'agree' | 'disagree' }
// One reaction per user per comment (upsert). DELETE removes the reaction.
// Agree/disagree is a separate axis and does NOT feed ranking.
export async function POST(request, { params }) {
  const blocked = await v2LiveGuard();
  if (blocked) return blocked;

  let user;
  try {
    user = await requirePermission('comments.react');
  } catch (err) {
    return NextResponse.json(
      { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
      { status: err.status ?? 401 }
    );
  }

  let reaction;
  try {
    const body = await request.json();
    reaction = body?.reaction;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (reaction !== 'agree' && reaction !== 'disagree') {
    return NextResponse.json({ error: 'invalid_reaction' }, { status: 400 });
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `comment_agree:${user.id}`,
    policyKey: 'comment_tag',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  // Block self-reaction
  const { data: comment } = await service
    .from('comments')
    .select('user_id')
    .eq('id', params.id)
    .maybeSingle();
  if (comment?.user_id === user.id) {
    return NextResponse.json({ error: 'cannot_react_to_own_comment' }, { status: 403 });
  }

  // Check existing reaction
  const { data: existing } = await service
    .from('comment_agree_disagree')
    .select('id, reaction')
    .eq('comment_id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    if (existing.reaction === reaction) {
      // Toggle off — remove
      const { error } = await service
        .from('comment_agree_disagree')
        .delete()
        .eq('id', existing.id);
      if (error) return safeErrorResponse(NextResponse, error, { route: 'comments.agree' });
      const counts = await getCounts(service, params.id);
      return NextResponse.json({ reacted: false, reaction: null, ...counts }, { headers: NO_STORE });
    } else {
      // Switch reaction
      const { error } = await service
        .from('comment_agree_disagree')
        .update({ reaction })
        .eq('id', existing.id);
      if (error) return safeErrorResponse(NextResponse, error, { route: 'comments.agree' });
      const counts = await getCounts(service, params.id);
      return NextResponse.json({ reacted: true, reaction, ...counts }, { headers: NO_STORE });
    }
  }

  // Insert new
  const { error } = await service
    .from('comment_agree_disagree')
    .insert({ comment_id: params.id, user_id: user.id, reaction });
  if (error) return safeErrorResponse(NextResponse, error, { route: 'comments.agree' });
  const counts = await getCounts(service, params.id);
  return NextResponse.json({ reacted: true, reaction, ...counts }, { headers: NO_STORE });
}

export async function DELETE(request, { params }) {
  const blocked = await v2LiveGuard();
  if (blocked) return blocked;

  let user;
  try {
    user = await requirePermission('comments.react');
  } catch (err) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from('comment_agree_disagree')
    .delete()
    .eq('comment_id', params.id)
    .eq('user_id', user.id);
  if (error) return safeErrorResponse(NextResponse, error, { route: 'comments.agree.delete' });
  const counts = await getCounts(service, params.id);
  return NextResponse.json({ reacted: false, reaction: null, ...counts }, { headers: NO_STORE });
}

async function getCounts(service, commentId) {
  const { data } = await service
    .from('comments')
    .select('agree_count, disagree_count')
    .eq('id', commentId)
    .maybeSingle();
  return { agree_count: data?.agree_count ?? 0, disagree_count: data?.disagree_count ?? 0 };
}
