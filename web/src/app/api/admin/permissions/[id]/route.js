// @admin-verified 2026-04-23
// @migrated-to-permissions 2026-04-19
// @feature-verified admin_api 2026-04-19
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// PATCH /api/admin/permissions/[id]   — update permission row
// DELETE /api/admin/permissions/[id]  — delete permission row
//
// Round A (C-05) — authenticated UPDATE/DELETE on permissions are revoked.
const ALLOWED_FIELDS = new Set([
  'display_name',
  'category',
  'ui_section',
  'lock_message',
  'requires_verified',
  'is_public',
  'is_active',
  'deny_mode',
]);

export async function PATCH(request, { params }) {
  let actor;
  try {
    actor = await requirePermission('admin.permissions.set.edit');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'permission id required' }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const patch = {};
  for (const k of Object.keys(body || {})) {
    if (ALLOWED_FIELDS.has(k)) patch[k] = body[k];
  }
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'no updatable fields in body' }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service.from('permissions').update(patch).eq('id', id);
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.permissions.id',
      fallbackStatus: 400,
    });

  try {
    await service.from('audit_log').insert({
      actor_id: actor.id,
      action: 'permission.update',
      target_type: 'permission',
      target_id: id,
      metadata: patch,
    });
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request, { params }) {
  let actor;
  try {
    actor = await requirePermission('admin.permissions.set.edit');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'permission id required' }, { status: 400 });

  const service = createServiceClient();
  const { error } = await service.from('permissions').delete().eq('id', id);
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.permissions.id',
      fallbackStatus: 400,
    });

  try {
    await service.from('audit_log').insert({
      actor_id: actor.id,
      action: 'permission.delete',
      target_type: 'permission',
      target_id: id,
      metadata: {},
    });
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ ok: true });
}
