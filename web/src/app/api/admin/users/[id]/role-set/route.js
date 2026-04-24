// @migrated-to-permissions 2026-04-19
// @feature-verified admin_api 2026-04-19
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { recordAdminAction, requireAdminOutranks } from '@/lib/adminMutation';

// PATCH /api/admin/users/[id]/role-set  { role_name }
//
// Round A (C-05) — /admin/users/page.tsx used to
//   supabase.from('user_roles').delete()...
//   supabase.from('user_roles').insert(...)
// directly. Round A revokes authenticated INSERT/UPDATE/DELETE on
// user_roles. This endpoint mirrors the admin UI's "set exactly one
// role" semantic: drop any existing roles for the target, then grant
// the requested role. Runs on service-role with the same rank guard
// pattern used by /api/admin/users/[id]/roles (grant path).
export async function PATCH(request, { params }) {
  let actor;
  try {
    actor = await requirePermission('admin.moderation.role.grant');
  } catch (err) {
    if (err.status) {
      console.error('[admin.users.[id].role-set.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const targetId = params?.id;
  if (!targetId) return NextResponse.json({ error: 'user id required' }, { status: 400 });

  const { role_name } = await request.json().catch(() => ({}));
  if (!role_name || typeof role_name !== 'string') {
    return NextResponse.json({ error: 'role_name required' }, { status: 400 });
  }

  // Same role-level + rank checks as /roles grant path.
  const authed = createClient();
  const { data: canAssign, error: canErr } = await authed.rpc('caller_can_assign_role', {
    p_role_name: role_name,
  });
  if (canErr) {
    // DA-119: don't leak raw RPC error message to client.
    console.error('[admin.users.role-set.canAssign]', canErr.message);
    return NextResponse.json({ error: 'Could not check role assignment' }, { status: 500 });
  }
  if (!canAssign) {
    return NextResponse.json(
      { error: 'Unknown role or above your hierarchy level' },
      { status: 403 }
    );
  }

  const rankErr = await requireAdminOutranks(targetId, actor.id);
  if (rankErr) return rankErr;

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.users.role-set:${actor.id}`,
    policyKey: 'admin.users.role-set',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  // Resolve the new role id first so we can fail cleanly before any delete.
  const { data: roleRow, error: roleErr } = await service
    .from('roles')
    .select('id')
    .eq('name', role_name)
    .maybeSingle();
  if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 500 });
  if (!roleRow) return NextResponse.json({ error: 'Role not found' }, { status: 404 });

  // Replace: drop existing user_roles rows, then insert the single new row.
  const { error: delErr } = await service.from('user_roles').delete().eq('user_id', targetId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const { error: insErr } = await service.from('user_roles').insert({
    user_id: targetId,
    role_id: roleRow.id,
    assigned_by: actor.id,
  });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // Audit + perms bump.
  await recordAdminAction({
    action: 'role.set',
    targetTable: 'users',
    targetId: targetId,
    newValue: { role: role_name },
  });

  const { error: bumpErr } = await service.rpc('bump_user_perms_version', {
    p_user_id: targetId,
  });
  if (bumpErr) console.error('[role-set] perms_version bump failed:', bumpErr.message);

  return NextResponse.json({ ok: true });
}
