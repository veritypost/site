// @migrated-to-permissions 2026-04-18
// @feature-verified quiz 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { assertKidOwnership } from '@/lib/kids';
import { createServiceClient } from '@/lib/supabase/server';
import { v2LiveGuard } from '@/lib/featureFlags';
import { safeErrorResponse } from '@/lib/apiErrors';

export async function POST(request) {
  const blocked = await v2LiveGuard();
  if (blocked) return blocked;
  let user;
  try {
    user = await requirePermission('quiz.attempt.start');
  } catch (err) {
    // DA-119: don't leak raw err.message to the client. requirePermission
    // attaches a status (401/403); use that with generic copy.
    console.error('[quiz.start.permission]', err?.message || err);
    return NextResponse.json({ error: 'Not allowed to start quiz' }, { status: err?.status || 401 });
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
    return safeErrorResponse(NextResponse, error, { route: 'quiz.start', fallbackStatus: 400 });
  }
  return NextResponse.json(data);
}
