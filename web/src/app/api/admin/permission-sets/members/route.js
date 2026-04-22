// @admin-verified 2026-04-19
// @migrated-to-permissions 2026-04-19
// @feature-verified admin_api 2026-04-19
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// POST   /api/admin/permission-sets/members   { permission_set_id, permission_id }
// DELETE /api/admin/permission-sets/members?permission_set_id=...&permission_id=...
//
// Round A (C-05) — authenticated INSERT/DELETE on permission_set_perms
// are revoked. Membership edits now route through service-role.
export async function POST(request) {
  let actor;
  try {
    actor = await requirePermission('admin.permissions.set.edit');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { permission_set_id, permission_id } = body || {};
  if (!permission_set_id || !permission_id) {
    return NextResponse.json(
      { error: 'permission_set_id and permission_id required' },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { error } = await service
    .from('permission_set_perms')
    .insert({ permission_set_id, permission_id });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.permission_sets.members',
      fallbackStatus: 400,
    });

  try {
    await service.from('audit_log').insert({
      actor_id: actor.id,
      action: 'permission_set.add_member',
      target_type: 'permission_set',
      target_id: permission_set_id,
      metadata: { permission_id },
    });
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  let actor;
  try {
    actor = await requirePermission('admin.permissions.set.edit');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const permission_set_id = url.searchParams.get('permission_set_id');
  const permission_id = url.searchParams.get('permission_id');
  if (!permission_set_id || !permission_id) {
    return NextResponse.json(
      { error: 'permission_set_id and permission_id required' },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { error } = await service
    .from('permission_set_perms')
    .delete()
    .eq('permission_set_id', permission_set_id)
    .eq('permission_id', permission_id);
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.permission_sets.members',
      fallbackStatus: 400,
    });

  try {
    await service.from('audit_log').insert({
      actor_id: actor.id,
      action: 'permission_set.remove_member',
      target_type: 'permission_set',
      target_id: permission_set_id,
      metadata: { permission_id },
    });
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ ok: true });
}
