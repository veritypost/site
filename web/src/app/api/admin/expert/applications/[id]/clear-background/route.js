// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';
import { recordAdminAction } from '@/lib/adminMutation';

// Phase 18.1: admin clears a journalist's background check so
// approve_expert_application will accept them. Journalist approvals
// refuse until background_check_status='cleared'.
export async function POST(request, { params }) {
  let user;
  try {
    user = await requirePermission('admin.expert.applications.clear_background');
  } catch (err) {
    if (err.status) {
      console.error(
        '[admin.expert.applications.[id].clear-background.permission]',
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
    key: `admin.expert.applications.clear-background:${user.id}`,
    policyKey: 'admin.expert.applications.clear-background',
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

  const { data, error } = await service
    .from('expert_applications')
    .update({ background_check_status: 'cleared' })
    .eq('id', params.id)
    .select('id, background_check_status')
    .maybeSingle();

  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.expert.applications.id.clear_background',
      fallbackStatus: 400,
    });
  if (!data) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  await recordAdminAction({
    action: 'expert.background_check.cleared',
    targetTable: 'expert_application',
    targetId: params.id,
    reason: notes,
  });

  return NextResponse.json({ ok: true, background_check_status: data.background_check_status });
}
