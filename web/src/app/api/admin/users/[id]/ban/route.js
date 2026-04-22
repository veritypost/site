// @admin-verified 2026-04-19
// @migrated-to-permissions 2026-04-19
// @feature-verified admin_api 2026-04-19
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// POST /api/admin/users/[id]/ban  { banned: boolean, reason?: string }
//
// Round A — /admin/users/page.tsx used to update
//   supabase.from('users').update({ is_banned: true }).eq('id', ...)
// directly from the client. `reject_privileged_user_updates` blocks
// `is_banned` writes from non-admins, so the client call fell over
// silently on the actual admin path too (the admin-or-above check the
// trigger does is for the authenticated session, not for the DB user's
// role — the service-role shortcut matters). Route through service-role
// with the rank guard.
export async function POST(request, { params }) {
  let actor;
  try {
    actor = await requirePermission('admin.users.ban');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const targetId = params?.id;
  if (!targetId) return NextResponse.json({ error: 'user id required' }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const banned = body?.banned === true;
  const reason = typeof body?.reason === 'string' ? body.reason : null;

  if (targetId !== actor.id) {
    const authed = createClient();
    const { data: outranks, error: rankErr } = await authed.rpc('require_outranks', {
      target_user_id: targetId,
    });
    if (rankErr)
      return safeErrorResponse(NextResponse, rankErr, {
        route: 'admin.users.ban',
        fallbackStatus: 500,
        fallbackMessage: 'Rank check failed',
      });
    if (!outranks) {
      return NextResponse.json(
        { error: 'Cannot act on a user whose rank meets or exceeds your own' },
        { status: 403 }
      );
    }
  }

  const service = createServiceClient();

  const update = banned
    ? {
        is_banned: true,
        banned_at: new Date().toISOString(),
        banned_by: actor.id,
        ban_reason: reason,
      }
    : { is_banned: false, banned_at: null, banned_by: null, ban_reason: null };

  const { error: upErr } = await service.from('users').update(update).eq('id', targetId);
  if (upErr)
    return safeErrorResponse(NextResponse, upErr, {
      route: 'admin.users.ban',
      fallbackStatus: 500,
      fallbackMessage: 'Could not update ban state',
    });

  try {
    await service.from('audit_log').insert({
      actor_id: actor.id,
      action: banned ? 'user.ban' : 'user.unban',
      target_type: 'user',
      target_id: targetId,
      metadata: { reason },
    });
  } catch {
    /* best-effort */
  }

  const { error: bumpErr } = await service.rpc('bump_user_perms_version', {
    p_user_id: targetId,
  });
  if (bumpErr) console.error('[user.ban] perms_version bump failed:', bumpErr.message);

  return NextResponse.json({ ok: true });
}
