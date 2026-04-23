// @migrated-to-permissions 2026-04-19
// @feature-verified admin_api 2026-04-19
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// POST /api/admin/permission-sets/role-wiring   { role_id, permission_set_id, enabled }
//
// Round A (C-05) — authenticated INSERT/DELETE on role_permission_sets
// is retained as a SELECT-only grant; writes go through this route.
export async function POST(request) {
  let actor;
  try {
    actor = await requirePermission('admin.permissions.assign_to_role');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { role_id, permission_set_id, enabled } = body || {};
  if (!role_id || !permission_set_id || typeof enabled !== 'boolean') {
    return NextResponse.json(
      { error: 'role_id, permission_set_id, and enabled required' },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  let err;
  if (enabled) {
    ({ error: err } = await service
      .from('role_permission_sets')
      .insert({ role_id, permission_set_id }));
  } else {
    ({ error: err } = await service
      .from('role_permission_sets')
      .delete()
      .eq('role_id', role_id)
      .eq('permission_set_id', permission_set_id));
  }
  if (err) return NextResponse.json({ error: err.message }, { status: 400 });

  try {
    await service.from('audit_log').insert({
      actor_id: actor.id,
      action: enabled ? 'permission_set.role.grant' : 'permission_set.role.revoke',
      target_type: 'permission_set',
      target_id: permission_set_id,
      metadata: { role_id },
    });
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ ok: true });
}
