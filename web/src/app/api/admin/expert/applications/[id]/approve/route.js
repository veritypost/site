// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { recordAdminAction } from '@/lib/adminMutation';
import { safeErrorResponse } from '@/lib/apiErrors';

export async function POST(request, { params }) {
  let user;
  try {
    user = await requirePermission('admin.expert.applications.approve');
  } catch (err) {
    if (err.status) {
      console.error('[admin.expert.applications.[id].approve.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.expert.applications.approve:${user.id}`,
    policyKey: 'admin.expert.applications.approve',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }
  const { review_notes } = await request.json().catch(() => ({}));
  const { error } = await service.rpc('approve_expert_application', {
    p_reviewer_id: user.id,
    p_application_id: params.id,
    p_review_notes: review_notes || null,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.expert.applications.id.approve',
      fallbackStatus: 400,
    });
  await recordAdminAction({
    action: 'expert.application.approve',
    targetTable: 'expert_applications',
    targetId: params.id,
    reason: review_notes || null,
  });
  return NextResponse.json({ ok: true });
}
