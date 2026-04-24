// @migrated-to-permissions 2026-04-19
// @feature-verified admin_api 2026-04-19
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { recordAdminAction } from '@/lib/adminMutation';

// POST /api/admin/permission-sets/role-wiring   { role_id, permission_set_id, enabled }
//
// Round A (C-05) — authenticated INSERT/DELETE on role_permission_sets
// is retained as a SELECT-only grant; writes go through this route.
export async function POST(request) {
  let actor;
  try {
    actor = await requirePermission('admin.permissions.assign_to_role');
  } catch (err) {
    if (err.status) {
      console.error('[admin.permission-sets.role-wiring.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.permission-sets.role-wiring:${actor.id}`,
    policyKey: 'admin.permission-sets.role-wiring',
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
  const { role_id, permission_set_id, enabled } = body || {};
  if (!role_id || !permission_set_id || typeof enabled !== 'boolean') {
    return NextResponse.json(
      { error: 'role_id, permission_set_id, and enabled required' },
      { status: 400 }
    );
  }

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
  if (err) {
    console.error('[admin.permission-sets.role-wiring.db]', err.message);
    return NextResponse.json({ error: 'Could not save' }, { status: 400 });
  }

  await recordAdminAction({
    action: enabled ? 'permission_set.role.grant' : 'permission_set.role.revoke',
    targetTable: 'permission_set',
    targetId: permission_set_id,
    newValue: enabled ? { role_id } : null,
    oldValue: enabled ? null : { role_id },
  });

  return NextResponse.json({ ok: true });
}
