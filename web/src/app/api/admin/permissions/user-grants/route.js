// @migrated-to-permissions 2026-04-19
// @feature-verified admin_api 2026-04-19
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';
import { recordAdminAction, requireAdminOutranks } from '@/lib/adminMutation';

// POST   /api/admin/permissions/user-grants   { user_id, permission_set_id, expires_at?, reason? }
// DELETE /api/admin/permissions/user-grants?user_id=...&permission_set_id=...
//
// Round A (C-05) — authenticated INSERT/DELETE on user_permission_sets
// is revoked. Admin UI grants/revokes route through here.
export async function POST(request) {
  let actor;
  try {
    actor = await requirePermission('admin.permissions.assign_to_user');
  } catch (err) {
    if (err.status) {
      console.error('[admin.permissions.user-grants.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.permissions.user-grants.add:${actor.id}`,
    policyKey: 'admin.permissions.user-grants.add',
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
  const { user_id, permission_set_id, expires_at, reason } = body || {};
  if (!user_id || !permission_set_id) {
    return NextResponse.json({ error: 'user_id and permission_set_id required' }, { status: 400 });
  }

  const rankErr = await requireAdminOutranks(user_id, actor.id);
  if (rankErr) return rankErr;

  const row = {
    user_id,
    permission_set_id,
    granted_by: actor.id,
    expires_at: expires_at ?? null,
    reason: reason ?? null,
  };
  const { data, error } = await service.from('user_permission_sets').insert(row).select().single();
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.permissions.user_grants',
      fallbackStatus: 400,
    });

  await recordAdminAction({
    action: 'user_grant.add',
    targetTable: 'user',
    targetId: user_id,
    reason: row.reason,
    newValue: { permission_set_id, expires_at: row.expires_at },
  });

  const { error: bumpErr } = await service.rpc('bump_user_perms_version', {
    p_user_id: user_id,
  });
  if (bumpErr) console.error('[user-grants.add] perms_version bump failed:', bumpErr.message);

  return NextResponse.json({ grant: data });
}

export async function DELETE(request) {
  let actor;
  try {
    actor = await requirePermission('admin.permissions.assign_to_user');
  } catch (err) {
    if (err.status) {
      console.error('[admin.permissions.user-grants.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.permissions.user-grants.revoke:${actor.id}`,
    policyKey: 'admin.permissions.user-grants.revoke',
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
  const user_id = url.searchParams.get('user_id');
  const permission_set_id = url.searchParams.get('permission_set_id');
  if (!user_id || !permission_set_id) {
    return NextResponse.json({ error: 'user_id and permission_set_id required' }, { status: 400 });
  }

  const rankErr = await requireAdminOutranks(user_id, actor.id);
  if (rankErr) return rankErr;

  const { error } = await service
    .from('user_permission_sets')
    .delete()
    .eq('user_id', user_id)
    .eq('permission_set_id', permission_set_id);
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.permissions.user_grants',
      fallbackStatus: 400,
    });

  await recordAdminAction({
    action: 'user_grant.revoke',
    targetTable: 'user',
    targetId: user_id,
    oldValue: { permission_set_id },
  });

  const { error: bumpErr } = await service.rpc('bump_user_perms_version', {
    p_user_id: user_id,
  });
  if (bumpErr) console.error('[user-grants.revoke] perms_version bump failed:', bumpErr.message);

  return NextResponse.json({ ok: true });
}
