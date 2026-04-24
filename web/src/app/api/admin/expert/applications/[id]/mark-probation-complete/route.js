// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';
import { recordAdminAction } from '@/lib/adminMutation';

// Phase 18.3: admin early-completes an expert's 30-day probation.
// Normally probation auto-closes when probation_ends_at passes.
export async function POST(request, { params }) {
  let user;
  try {
    user = await requirePermission('admin.expert.applications.mark_probation_complete');
  } catch (err) {
    if (err.status) {
      console.error(
        '[admin.expert.applications.[id].mark-probation-complete.permission]',
        err?.message || err
      );
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.expert.applications.mark-probation-complete:${user.id}`,
    policyKey: 'admin.expert.applications.mark-probation-complete',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const body = await request.json().catch(() => ({}));
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : '';
  if (!notes) return NextResponse.json({ error: 'Admin notes required' }, { status: 400 });

  const { error } = await service.rpc('mark_probation_complete', {
    p_admin_id: user.id,
    p_application_id: params.id,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.expert.applications.id.mark_probation_complete',
      fallbackStatus: 400,
    });

  await recordAdminAction({
    action: 'expert.probation.complete',
    targetTable: 'expert_application',
    targetId: params.id,
    reason: notes,
  });

  return NextResponse.json({ ok: true });
}
