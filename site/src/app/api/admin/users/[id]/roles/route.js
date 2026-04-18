import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { getMaxRoleLevel, roleLevel, isValidRole } from '@/lib/roles';

// F-034 — the pre-fix handler only checked that the target role being
// granted/revoked was at-or-below the actor's level. That blocks a
// moderator from escalating someone to admin, but still lets the same
// moderator revoke a `moderator` role from an owner (lateral attack
// on higher-ranked accounts). Fix: also require the actor's max level
// to strictly outrank the TARGET'S current max level.
//
// POST   /api/admin/users/[id]/roles  { role_name }  — grant
// DELETE /api/admin/users/[id]/roles?role_name=...   — revoke

async function assertActorOutranksTarget(actor, targetUserId) {
  if (actor.id === targetUserId) return null;
  const actorLevel = await getMaxRoleLevel(actor.id);
  const targetLevel = await getMaxRoleLevel(targetUserId);
  if (actorLevel <= targetLevel) {
    return { actorLevel, targetLevel };
  }
  return null;
}

export async function POST(request, { params }) {
  let user;
  try { user = await requireRole('moderator'); }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }

  const { role_name } = await request.json().catch(() => ({}));
  if (!role_name) return NextResponse.json({ error: 'role_name required' }, { status: 400 });
  if (!isValidRole(role_name)) return NextResponse.json({ error: 'Unknown role' }, { status: 400 });

  const actorLevel = await getMaxRoleLevel(user.id);
  if (roleLevel(role_name) > actorLevel) {
    return NextResponse.json({ error: 'Cannot grant a role above your own hierarchy level' }, { status: 403 });
  }

  const conflict = await assertActorOutranksTarget(user, params.id);
  if (conflict) {
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
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request, { params }) {
  let user;
  try { user = await requireRole('moderator'); }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }

  const url = new URL(request.url);
  const role_name = url.searchParams.get('role_name');
  if (!role_name) return NextResponse.json({ error: 'role_name required' }, { status: 400 });
  if (!isValidRole(role_name)) return NextResponse.json({ error: 'Unknown role' }, { status: 400 });

  const actorLevel = await getMaxRoleLevel(user.id);
  if (roleLevel(role_name) > actorLevel) {
    return NextResponse.json({ error: 'Cannot revoke a role above your own hierarchy level' }, { status: 403 });
  }

  const conflict = await assertActorOutranksTarget(user, params.id);
  if (conflict) {
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
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
