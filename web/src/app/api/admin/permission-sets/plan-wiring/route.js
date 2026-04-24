// @migrated-to-permissions 2026-04-19
// @feature-verified admin_api 2026-04-19
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { recordAdminAction } from '@/lib/adminMutation';

// POST /api/admin/permission-sets/plan-wiring   { plan_id, permission_set_id, enabled }
//
// Round A (C-05) — writes to plan_permission_sets routed through service.
export async function POST(request) {
  let actor;
  try {
    actor = await requirePermission('admin.permissions.assign_to_plan');
  } catch (err) {
    if (err.status) {
      console.error('[admin.permission-sets.plan-wiring.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.permission-sets.plan-wiring:${actor.id}`,
    policyKey: 'admin.permission-sets.plan-wiring',
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
  const { plan_id, permission_set_id, enabled } = body || {};
  if (!plan_id || !permission_set_id || typeof enabled !== 'boolean') {
    return NextResponse.json(
      { error: 'plan_id, permission_set_id, and enabled required' },
      { status: 400 }
    );
  }

  let err;
  if (enabled) {
    ({ error: err } = await service
      .from('plan_permission_sets')
      .insert({ plan_id, permission_set_id }));
  } else {
    ({ error: err } = await service
      .from('plan_permission_sets')
      .delete()
      .eq('plan_id', plan_id)
      .eq('permission_set_id', permission_set_id));
  }
  if (err) {
    console.error('[admin.permission-sets.plan-wiring.db]', err.message);
    return NextResponse.json({ error: 'Could not save' }, { status: 400 });
  }

  await recordAdminAction({
    action: enabled ? 'permission_set.plan.grant' : 'permission_set.plan.revoke',
    targetTable: 'permission_set',
    targetId: permission_set_id,
    newValue: enabled ? { plan_id } : null,
    oldValue: enabled ? null : { plan_id },
  });

  return NextResponse.json({ ok: true });
}
