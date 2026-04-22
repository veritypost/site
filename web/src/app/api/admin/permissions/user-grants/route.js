// @admin-verified 2026-04-19
// @migrated-to-permissions 2026-04-19
// @feature-verified admin_api 2026-04-19
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

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
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { user_id, permission_set_id, expires_at, reason } = body || {};
  if (!user_id || !permission_set_id) {
    return NextResponse.json({ error: 'user_id and permission_set_id required' }, { status: 400 });
  }

  if (user_id !== actor.id) {
    const authed = createClient();
    const { data: outranks, error: rankErr } = await authed.rpc('require_outranks', {
      target_user_id: user_id,
    });
    if (rankErr) return NextResponse.json({ error: rankErr.message }, { status: 500 });
    if (!outranks) {
      return NextResponse.json(
        { error: 'Cannot act on a user whose rank meets or exceeds your own' },
        { status: 403 }
      );
    }
  }

  const service = createServiceClient();
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

  try {
    await service.from('audit_log').insert({
      actor_id: actor.id,
      action: 'user_grant.add',
      target_type: 'user',
      target_id: user_id,
      metadata: { permission_set_id, expires_at: row.expires_at, reason: row.reason },
    });
  } catch {
    /* best-effort */
  }

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
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const user_id = url.searchParams.get('user_id');
  const permission_set_id = url.searchParams.get('permission_set_id');
  if (!user_id || !permission_set_id) {
    return NextResponse.json({ error: 'user_id and permission_set_id required' }, { status: 400 });
  }

  if (user_id !== actor.id) {
    const authed = createClient();
    const { data: outranks, error: rankErr } = await authed.rpc('require_outranks', {
      target_user_id: user_id,
    });
    if (rankErr) return NextResponse.json({ error: rankErr.message }, { status: 500 });
    if (!outranks) {
      return NextResponse.json(
        { error: 'Cannot act on a user whose rank meets or exceeds your own' },
        { status: 403 }
      );
    }
  }

  const service = createServiceClient();
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

  try {
    await service.from('audit_log').insert({
      actor_id: actor.id,
      action: 'user_grant.revoke',
      target_type: 'user',
      target_id: user_id,
      metadata: { permission_set_id },
    });
  } catch {
    /* best-effort */
  }

  const { error: bumpErr } = await service.rpc('bump_user_perms_version', {
    p_user_id: user_id,
  });
  if (bumpErr) console.error('[user-grants.revoke] perms_version bump failed:', bumpErr.message);

  return NextResponse.json({ ok: true });
}
