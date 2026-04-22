// @admin-verified 2026-04-19
// @migrated-to-permissions 2026-04-19
// @feature-verified admin_api 2026-04-19
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';

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
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
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
  if (canErr) return NextResponse.json({ error: canErr.message }, { status: 500 });
  if (!canAssign) {
    return NextResponse.json(
      { error: 'Unknown role or above your hierarchy level' },
      { status: 403 }
    );
  }

  if (targetId !== actor.id) {
    const { data: outranks, error: rankErr } = await authed.rpc('require_outranks', {
      target_user_id: targetId,
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
  try {
    await service.from('audit_log').insert({
      actor_id: actor.id,
      action: 'role.set',
      target_type: 'user',
      target_id: targetId,
      metadata: { role: role_name },
    });
  } catch {
    /* best-effort */
  }

  const { error: bumpErr } = await service.rpc('bump_user_perms_version', {
    p_user_id: targetId,
  });
  if (bumpErr) console.error('[role-set] perms_version bump failed:', bumpErr.message);

  return NextResponse.json({ ok: true });
}
