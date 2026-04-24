// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// F-034 — the pre-fix handler only checked that the target role being
// granted/revoked was at-or-below the actor's level. That blocks a
// moderator from escalating someone to admin, but still lets the same
// moderator revoke a `moderator` role from an owner (lateral attack
// on higher-ranked accounts). Fix: also require the actor's max level
// to strictly outrank the TARGET'S current max level.
//
// Q6 — rank comparisons are now server-side via require_outranks() +
// caller_can_assign_role() RPCs. The hand-rolled in-code ROLE_HIERARCHY
// map in lib/roles.js is gone; canonical hierarchy lives in
// roles.hierarchy_level.
//
// POST   /api/admin/users/[id]/roles  { role_name }  — grant
// DELETE /api/admin/users/[id]/roles?role_name=...   — revoke

async function assertActorOutranksTarget(authed, actorId, targetUserId) {
  if (actorId === targetUserId) return null;
  const { data: outranks, error } = await authed.rpc('require_outranks', {
    target_user_id: targetUserId,
  });
  if (error) {
    console.error('[admin.users.roles.outranks]', error.message);
    return { error: 'Rank check failed' };
  }
  if (!outranks) return { blocked: true };
  return null;
}

export async function POST(request, { params }) {
  let user;
  try {
    user = await requirePermission('admin.moderation.role.grant');
  } catch (err) {
    if (err.status) {
      console.error('[admin.users.[id].roles.permission]', err?.message || err);
      return NextResponse.json({ error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' }, { status: err.status });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { role_name } = await request.json().catch(() => ({}));
  if (!role_name) return NextResponse.json({ error: 'role_name required' }, { status: 400 });

  // Q6 — role-name validation + actor-vs-role-level check collapsed into
  // one server-side RPC (unknown role returns false; role too high also
  // returns false).
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

  const conflict = await assertActorOutranksTarget(authed, user.id, params.id);
  if (conflict?.error) {
    return NextResponse.json({ error: conflict.error }, { status: 500 });
  }
  if (conflict?.blocked) {
    return NextResponse.json(
      { error: 'Cannot grant to a user whose rank meets or exceeds your own' },
      { status: 403 }
    );
  }

  const service = createServiceClient();
  const { error } = await service.rpc('grant_role', {
    p_admin_id: user.id,
    p_user_id: params.id,
    p_role_name: role_name,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.users.id.roles',
      fallbackStatus: 400,
    });

  // Bump perms_version so the target's client refetches capabilities on
  // next navigation. Without this, moderation console grants/revokes
  // leave the target on stale permissions until their next version-poll
  // catches an unrelated bump. Atomic SQL-level +1 via RPC — see
  // bump_user_perms_version migration. Non-fatal: the role write is the
  // source of truth, the bump is observability.
  const { error: bumpErr } = await service.rpc('bump_user_perms_version', {
    p_user_id: params.id,
  });
  if (bumpErr) console.error('[roles.grant] perms_version bump failed:', bumpErr.message);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request, { params }) {
  let user;
  try {
    user = await requirePermission('admin.moderation.role.revoke');
  } catch (err) {
    if (err.status) {
      console.error('[admin.users.[id].roles.permission]', err?.message || err);
      return NextResponse.json({ error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' }, { status: err.status });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const role_name = url.searchParams.get('role_name');
  if (!role_name) return NextResponse.json({ error: 'role_name required' }, { status: 400 });

  // Q6 — role-name validation + actor-vs-role-level check via RPC.
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

  const conflict = await assertActorOutranksTarget(authed, user.id, params.id);
  if (conflict?.error) {
    return NextResponse.json({ error: conflict.error }, { status: 500 });
  }
  if (conflict?.blocked) {
    return NextResponse.json(
      { error: 'Cannot revoke from a user whose rank meets or exceeds your own' },
      { status: 403 }
    );
  }

  const service = createServiceClient();
  const { error } = await service.rpc('revoke_role', {
    p_admin_id: user.id,
    p_user_id: params.id,
    p_role_name: role_name,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.users.id.roles',
      fallbackStatus: 400,
    });

  // Bump perms_version so the revoked user's client refetches on next
  // navigation (see POST handler above for rationale). Non-fatal.
  const { error: bumpErr } = await service.rpc('bump_user_perms_version', {
    p_user_id: params.id,
  });
  if (bumpErr) console.error('[roles.revoke] perms_version bump failed:', bumpErr.message);
  return NextResponse.json({ ok: true });
}
