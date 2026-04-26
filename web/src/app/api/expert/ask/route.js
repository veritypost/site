// @migrated-to-permissions 2026-04-18
// @feature-verified expert 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
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

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `expert-ask:${user.id}`,
    policyKey: 'expert-ask',
    max: 5,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Asking too quickly. Wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const { article_id, body, target_type, target_id } = await request.json().catch(() => ({}));
  if (!article_id || !body || !target_type || !target_id) {
    return NextResponse.json(
      { error: 'article_id, body, target_type, target_id required' },
      { status: 400 }
    );
  }
  if (body.length > 1000) {
    console.error('[expert.ask] input_too_long', {
      field: 'body',
      length: body.length,
      userId: user.id,
    });
    return NextResponse.json({ error: 'Input too long' }, { status: 400 });
  }
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
