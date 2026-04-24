// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';
import { recordAdminAction, requireAdminOutranks } from '@/lib/adminMutation';

// Admin-triggered cancellation. D40 flow: DMs off immediately,
// 7-day grace, then freeze.
//
// F-035: actor must strictly outrank the target. An admin (80) can
// cancel anyone at or below admin; only the owner can cancel another
// owner. Without this, any admin could freeze the owner out of their
// own subscription.
export async function POST(request) {
  let user;
  try {
    user = await requirePermission('admin.billing.cancel');
  } catch (err) {
    if (err.status) {
      console.error('[admin.billing.cancel.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { user_id, reason } = await request.json();
  if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

  if (user_id !== user.id) {
    // Q6 — server-side rank guard via require_outranks RPC.
    const rankErr = await requireAdminOutranks(user_id, user.id);
    if (rankErr) return rankErr;
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.billing.cancel:${user.id}`,
    policyKey: 'admin.billing.cancel',
    max: 10,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }
  const { data, error } = await service.rpc('billing_cancel_subscription', {
    p_user_id: user_id,
    p_reason: reason || 'admin cancel',
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.billing.cancel',
      fallbackStatus: 400,
    });

  // C20 / R-6-AGR-05 — audit the admin-initiated cancel. Previously
  // zero trail on destructive billing mutations initiated by admins.
  // recordAdminAction threads actor_id from the session so the audit
  // log correctly names the admin, not the affected user
  // (O-DESIGN-08 Option A).
  await recordAdminAction({
    action: 'billing.cancel',
    targetTable: 'users',
    targetId: user_id,
    newValue: { reason: reason || 'admin cancel', initiated_by: 'admin' },
  });

  return NextResponse.json(data);
}
