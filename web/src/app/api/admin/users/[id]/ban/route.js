// @migrated-to-permissions 2026-04-19
// @feature-verified admin_api 2026-04-19
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';
import { recordAdminAction, requireAdminOutranks } from '@/lib/adminMutation';

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
    // DA-119: don't return raw err.message — leaks internal RLS / policy
    // names. Log server-side, return generic copy. requirePermission
    // already encodes status (401/403), so trust it for the code.
    console.error('[admin.users.ban.permission]', err?.message || err);
    return NextResponse.json({ error: 'Forbidden' }, { status: err?.status || 403 });
  }

  const targetId = params?.id;
  if (!targetId) return NextResponse.json({ error: 'user id required' }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const banned = body?.banned === true;
  const reason = typeof body?.reason === 'string' ? body.reason : null;

  const rankErr = await requireAdminOutranks(targetId, actor.id);
  if (rankErr) return rankErr;

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.users.ban:${actor.id}`,
    policyKey: 'admin.users.ban',
    max: 10,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

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

  await recordAdminAction({
    action: banned ? 'user.ban' : 'user.unban',
    targetTable: 'users',
    targetId: targetId,
    reason: reason,
    newValue: { is_banned: banned },
  });

  const { error: bumpErr } = await service.rpc('bump_user_perms_version', {
    p_user_id: targetId,
  });
  if (bumpErr) console.error('[user.ban] perms_version bump failed:', bumpErr.message);

  return NextResponse.json({ ok: true });
}
