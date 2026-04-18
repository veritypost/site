import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { scoreCommentPost } from '@/lib/scoring';
import { v2LiveGuard } from '@/lib/featureFlags';

// POST /api/comments — create a top-level comment or threaded reply.
// Body: { article_id, body, parent_id?, mentions? }
// mentions is an array of { user_id, username }; the RPC strips it
// for free-tier users (D21).
export async function POST(request) {
  const blocked = await v2LiveGuard(); if (blocked) return blocked;
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { article_id, body, parent_id, mentions } = await request.json().catch(() => ({}));
  if (!article_id || !body) {
    return NextResponse.json({ error: 'article_id and body required' }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc('post_comment', {
    p_user_id: user.id,
    p_article_id: article_id,
    p_body: body,
    p_parent_id: parent_id || null,
    p_mentions: Array.isArray(mentions) ? mentions : [],
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Phase 14: award post_comment points + advance streak.
  const scoring = await scoreCommentPost(service, { userId: user.id, commentId: data.id });
  if (scoring?.error) console.error('score_on_comment_post failed', scoring.error);

  // Re-fetch the row so the client gets the full shape (counts etc.).
  const { data: full } = await service
    .from('comments')
    .select('*, users!user_id(id, username, avatar_color, avatar_url, is_verified_public_figure, plans(tier))')
    .eq('id', data.id)
    .maybeSingle();

  return NextResponse.json({ comment: full || { id: data.id }, scoring: scoring?.error ? null : scoring });
}
