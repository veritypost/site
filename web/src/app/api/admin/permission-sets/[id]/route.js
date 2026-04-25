// @migrated-to-permissions 2026-04-19
// @feature-verified admin_api 2026-04-19
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';
import { recordAdminAction } from '@/lib/adminMutation';

// PATCH  /api/admin/permission-sets/[id]  — update a permission set
// DELETE /api/admin/permission-sets/[id]  — delete a permission set
//
// Round A (C-05) — authenticated UPDATE/DELETE on permission_sets are revoked.
const ALLOWED_FIELDS = new Set(['display_name', 'description', 'is_active']);

export async function PATCH(request, { params }) {
  let actor;
  try {
    actor = await requirePermission('admin.permissions.set.edit');
  } catch (err) {
    if (err.status) {
      console.error('[admin.permission-sets.[id].permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'permission_set id required' }, { status: 400 });

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.permission-sets.update:${actor.id}`,
    policyKey: 'admin.permission-sets.update',
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

  const { error } = await service.from('permission_sets').update(patch).eq('id', id);
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.permission_sets.id',
      fallbackStatus: 400,
    });

  await recordAdminAction({
    action: 'permission_set.update',
    targetTable: 'permission_set',
    targetId: id,
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
      console.error('[admin.permission-sets.[id].permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'permission_set id required' }, { status: 400 });

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.permission-sets.delete:${actor.id}`,
    policyKey: 'admin.permission-sets.delete',
    max: 10,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  // Block deletes of system sets defensively (mirrors UI guard).
  const { data: existing, error: lookupErr } = await service
    .from('permission_sets')
    .select('id, is_system, key')
    .eq('id', id)
    .maybeSingle();
  if (lookupErr)
    return safeErrorResponse(NextResponse, lookupErr, { route: 'admin.permission-sets:lookup' });
  if (!existing) return NextResponse.json({ error: 'permission_set not found' }, { status: 404 });
  if (existing.is_system) {
    return NextResponse.json({ error: 'Cannot delete a system set' }, { status: 400 });
  }

  const { error } = await service.from('permission_sets').delete().eq('id', id);
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.permission_sets.id',
      fallbackStatus: 400,
    });

  await recordAdminAction({
    action: 'permission_set.delete',
    targetTable: 'permission_set',
    targetId: id,
    oldValue: { key: existing.key },
  });

  return NextResponse.json({ ok: true });
}
