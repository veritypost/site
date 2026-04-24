// @migrated-to-permissions 2026-04-18
// @feature-verified expert 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { v2LiveGuard } from '@/lib/featureFlags';
import { safeErrorResponse } from '@/lib/apiErrors';

// POST /api/expert/ask — D20 Ask an Expert.
// Body: { article_id, body, target_type, target_id }
export async function POST(request) {
  const blocked = await v2LiveGuard();
  if (blocked) return blocked;
  let user;
  try {
    user = await requirePermission('expert.ask');
  } catch (err) {
    if (err.status) {
      console.error('[expert.ask.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { article_id, body, target_type, target_id } = await request.json().catch(() => ({}));
  if (!article_id || !body || !target_type || !target_id) {
    return NextResponse.json(
      { error: 'article_id, body, target_type, target_id required' },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc('ask_expert', {
    p_user_id: user.id,
    p_article_id: article_id,
    p_body: body,
    p_target_type: target_type,
    p_target_id: target_id,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, { route: 'expert.ask', fallbackStatus: 400 });
  return NextResponse.json(data);
}
