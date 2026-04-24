// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';
import { recordAdminAction } from '@/lib/adminMutation';

// POST /api/admin/data-requests/[id]/approve
// Marks the requester's identity as verified so the export cron
// (process-data-exports) can pick up the row. Records the approving
// admin's id + timestamp. Does NOT change status — the cron transitions
// status pending -> processing -> completed via claim_next_export_request.
export async function POST(request, { params }) {
  let user;
  try {
    user = await requirePermission('admin.users.data_requests.process');
  } catch (err) {
    if (err.status) {
      console.error('[admin.data-requests.[id].approve.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.data-requests.approve:${user.id}`,
    policyKey: 'admin.data-requests.approve',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }
  const now = new Date().toISOString();
  const { error } = await service
    .from('data_requests')
    .update({
      identity_verified: true,
      identity_verified_at: now,
      identity_verified_by: user.id,
      processed_by: user.id,
      updated_at: now,
    })
    .eq('id', params.id);
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.data_requests.id.approve',
      fallbackStatus: 400,
    });

  // T-023 — GDPR-touching action; needs audit trail.
  await recordAdminAction({
    action: 'data_request.approve',
    targetTable: 'data_request',
    targetId: params.id,
    newValue: { verified_at: now },
  });

  return NextResponse.json({ ok: true });
}
