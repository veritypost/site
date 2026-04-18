import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { assertKidOwnership } from '@/lib/kids';
import { createServiceClient } from '@/lib/supabase/server';
import { v2LiveGuard } from '@/lib/featureFlags';

// D1: start a new quiz attempt. Returns 5 random questions from
// the article's active pool, excluding any questions this user
// has already seen on this article across previous submitted
// attempts. Options are returned without is_correct flags.
export async function POST(request) {
  const blocked = await v2LiveGuard(); if (blocked) return blocked;
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { article_id, kid_profile_id } = await request.json().catch(() => ({}));
  if (!article_id) {
    return NextResponse.json({ error: 'article_id required' }, { status: 400 });
  }

  if (kid_profile_id) {
    try {
      await assertKidOwnership(kid_profile_id, { userId: user.id });
    } catch {
      return NextResponse.json({ error: 'Kid profile not accessible' }, { status: 403 });
    }
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc('start_quiz_attempt', {
    p_user_id: user.id,
    p_article_id: article_id,
    p_kid_profile_id: kid_profile_id || null,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data);
}
