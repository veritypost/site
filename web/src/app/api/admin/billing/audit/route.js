// @migrated-to-permissions 2026-04-19
// @feature-verified admin_api 2026-04-19
import { NextResponse } from 'next/server';
import { requireAuth, hasPermissionServer } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { recordAdminAction } from '@/lib/adminMutation';

// POST /api/admin/billing/audit
//
// Round A (C-06) — /admin/subscriptions/page.tsx used to insert directly
// into `audit_log` from the authenticated client. Round A revokes that
// grant; this service-role endpoint preserves the existing fire-and-
// forget pattern used by the billing admin UI.
//
// Body: { action: string, target_type: string, target_id: string, metadata?: object }
// Auth: caller must hold at least one billing-write permission
// (override_plan / cancel / freeze / refund). The prior gate was
// admin.billing.view (READ perm), which let anyone who could look at
// billing plant arbitrary audit rows for arbitrary targets.
export async function POST(request) {
  let actor;
  try {
    actor = await requireAuth();
  } catch (err) {
    if (err.status) {
      console.error('[admin.billing.audit.auth]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const WRITE_PERMS = [
    'admin.billing.override_plan',
    'admin.billing.cancel',
    'admin.billing.freeze',
    'admin.billing.refund',
  ];
  const perms = await Promise.all(WRITE_PERMS.map((k) => hasPermissionServer(k)));
  if (!perms.some(Boolean)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.billing.audit:${actor.id}`,
    policyKey: 'admin.billing.audit',
    max: 60,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 });
  }

  const { action, target_type, target_id, metadata } = body || {};
  if (!action || typeof action !== 'string') {
    return NextResponse.json({ error: 'action required' }, { status: 400 });
  }
  if (!target_type || typeof target_type !== 'string') {
    return NextResponse.json({ error: 'target_type required' }, { status: 400 });
  }
  if (!target_id || typeof target_id !== 'string') {
    return NextResponse.json({ error: 'target_id required' }, { status: 400 });
  }

  await recordAdminAction({
    action,
    targetTable: target_type,
    targetId: target_id,
    newValue: metadata ?? null,
  });

  return NextResponse.json({ ok: true });
}
