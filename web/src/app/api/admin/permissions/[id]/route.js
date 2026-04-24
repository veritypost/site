// @migrated-to-permissions 2026-04-19
// @feature-verified admin_api 2026-04-19
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';
import { recordAdminAction } from '@/lib/adminMutation';

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
    if (err.status) {
      console.error('[admin.permissions.[id].permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'permission id required' }, { status: 400 });

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.permissions.update:${actor.id}`,
    policyKey: 'admin.permissions.update',
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
  const patch = {};
  for (const k of Object.keys(body || {})) {
    if (ALLOWED_FIELDS.has(k)) patch[k] = body[k];
  }
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'no updatable fields in body' }, { status: 400 });
  }

  // M10 — capture old values for audit before mutation. Project to the
  // patched fields only so the audit row is the smallest faithful diff.
  const patchedKeys = Object.keys(patch);
  const { data: existingRow } = await service
    .from('permissions')
    .select(patchedKeys.join(','))
    .eq('id', id)
    .maybeSingle();
  const oldValue = existingRow ?? null;

  const { error } = await service.from('permissions').update(patch).eq('id', id);
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.permissions.id',
      fallbackStatus: 400,
    });

  await recordAdminAction({
    action: 'permission.update',
    targetTable: 'permission',
    targetId: id,
    oldValue,
    newValue: patch,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request, { params }) {
  let actor;
  try {
    actor = await requirePermission('admin.permissions.set.edit');
  } catch (err) {
    if (err.status) {
      console.error('[admin.permissions.[id].permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'permission id required' }, { status: 400 });

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.permissions.delete:${actor.id}`,
    policyKey: 'admin.permissions.delete',
    max: 10,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }
  // M10 — capture full row before delete so audit history can reconstruct.
  const { data: existingRow } = await service
    .from('permissions')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  const { error } = await service.from('permissions').delete().eq('id', id);
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.permissions.id',
      fallbackStatus: 400,
    });

  await recordAdminAction({
    action: 'permission.delete',
    targetTable: 'permission',
    targetId: id,
    oldValue: existingRow ?? null,
  });

  return NextResponse.json({ ok: true });
}
