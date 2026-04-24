// @migrated-to-permissions 2026-04-19
// @feature-verified admin_api 2026-04-19
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';
import { recordAdminAction } from '@/lib/adminMutation';

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
    if (err.status) {
      console.error('[admin.permission-sets.members.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.permission-sets.members.add:${actor.id}`,
    policyKey: 'admin.permission-sets.members.add',
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
  const { permission_set_id, permission_id } = body || {};
  if (!permission_set_id || !permission_id) {
    return NextResponse.json(
      { error: 'permission_set_id and permission_id required' },
      { status: 400 }
    );
  }

  const { error } = await service
    .from('permission_set_perms')
    .insert({ permission_set_id, permission_id });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.permission_sets.members',
      fallbackStatus: 400,
    });

  await recordAdminAction({
    action: 'permission_set.add_member',
    targetTable: 'permission_set',
    targetId: permission_set_id,
    newValue: { permission_id },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  let actor;
  try {
    actor = await requirePermission('admin.permissions.set.edit');
  } catch (err) {
    if (err.status) {
      console.error('[admin.permission-sets.members.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.permission-sets.members.remove:${actor.id}`,
    policyKey: 'admin.permission-sets.members.remove',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
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

  await recordAdminAction({
    action: 'permission_set.remove_member',
    targetTable: 'permission_set',
    targetId: permission_set_id,
    oldValue: { permission_id },
  });

  return NextResponse.json({ ok: true });
}
