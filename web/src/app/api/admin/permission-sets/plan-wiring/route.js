// @migrated-to-permissions 2026-04-19
// @feature-verified admin_api 2026-04-19
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

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
      return NextResponse.json({ error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' }, { status: err.status });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { plan_id, permission_set_id, enabled } = body || {};
  if (!plan_id || !permission_set_id || typeof enabled !== 'boolean') {
    return NextResponse.json(
      { error: 'plan_id, permission_set_id, and enabled required' },
      { status: 400 }
    );
  }

  const service = createServiceClient();
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

  try {
    await service.from('audit_log').insert({
      actor_id: actor.id,
      action: enabled ? 'permission_set.plan.grant' : 'permission_set.plan.revoke',
      target_type: 'permission_set',
      target_id: permission_set_id,
      metadata: { plan_id },
    });
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ ok: true });
}
