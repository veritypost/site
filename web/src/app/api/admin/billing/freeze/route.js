// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';
import { recordAdminAction, requireAdminOutranks } from '@/lib/adminMutation';

// Skip grace and freeze immediately (D40). Use when an admin
// needs to close out a user past their grace window without
// waiting for the nightly sweeper, or to short-circuit grace.
//
// F-035: actor-outranks-target required (see billing/cancel).
export async function POST(request) {
  let user;
  try {
    user = await requirePermission('admin.billing.freeze');
  } catch (err) {
    if (err.status) {
      console.error('[admin.billing.freeze.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { user_id } = await request.json();
  if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

  if (user_id !== user.id) {
    // Q6 — server-side rank guard via require_outranks RPC.
    const rankErr = await requireAdminOutranks(user_id, user.id);
    if (rankErr) return rankErr;
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.billing.freeze:${user.id}`,
    policyKey: 'admin.billing.freeze',
    max: 10,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }
  const { data, error } = await service.rpc('billing_freeze_profile', { p_user_id: user_id });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.billing.freeze',
      fallbackStatus: 400,
    });

  // C20 / R-6-AGR-05 — audit the admin-initiated freeze. Before this
  // fix, admin-triggered account freezes left no audit trail; a rogue
  // admin could mass-freeze accounts invisibly. recordAdminAction
  // automatically captures actor_id from the session so the log row
  // names the admin, not the affected user (O-DESIGN-08 Option A).
  await recordAdminAction({
    action: 'billing.freeze',
    targetTable: 'users',
    targetId: user_id,
    newValue: { plan_status: 'frozen', initiated_by: 'admin' },
  });

  return NextResponse.json(data);
}
