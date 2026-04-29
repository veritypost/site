// T-005 — server route for admin/users delete.
// Closes C-05 / A1:T-015 (the originally-named T-005 scope). Client was
// calling `supabase.from('users').delete().eq('id', u.id)` with the
// user JWT — admin-or-above RLS passed, but there was no rank guard
// (a lower admin could delete a higher-ranked user) and no server-side
// audit. Route through service-role + require_outranks + audit.
//
// T238 — converted from hard-delete to soft-delete. Hard-deleting a user
// orphans every row that referenced them by user_id (comments, articles,
// follows, …) since not every FK in the schema is ON DELETE CASCADE. The
// soft-delete tombstones the row, scrubs PII, marks the account banned so
// auth is locked out, and preserves authored content with a "deleted"
// display identity. Real GDPR-erasure (hard purge after a 30-day grace)
// is a separate cron — see TODO at bottom of this file.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction, requireAdminOutranks } from '@/lib/adminMutation';

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const targetId = params?.id;
  if (!targetId) return NextResponse.json({ error: 'user id required' }, { status: 400 });

  let actor;
  try {
    actor = await requirePermission('admin.users.delete_account');
  } catch (err) {
    return permissionError(err);
  }

  const rankErr = await requireAdminOutranks(targetId, actor.id);
  if (rankErr) return rankErr;

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.users.delete:${actor.id}`,
    policyKey: 'admin.users.delete',
    max: 10,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }
  const { data: prior } = await service
    .from('users')
    .select('id, username, email, display_name, deleted_at')
    .eq('id', targetId)
    .maybeSingle();
  if (!prior) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // T238 — idempotent: if already soft-deleted, no-op success.
  if (prior.deleted_at) return NextResponse.json({ ok: true, already_deleted: true });

  await recordAdminAction({
    action: 'user.delete',
    targetTable: 'users',
    targetId,
    oldValue: {
      username: prior.username,
      email: prior.email,
      display_name: prior.display_name,
    },
    newValue: { soft_deleted: true },
  });

  // T238 — soft-delete + PII scrub. We tombstone the email/display_name with
  // a unique-per-id suffix so the (unique) email constraint still holds if
  // this user is ever re-deleted or another row collides. is_banned blocks
  // login. avatar_url + bio + banner_url + first/last name + phone +
  // username are nulled so no PII surfaces in any read path that forgets to
  // filter on deleted_at.
  const nowIso = new Date().toISOString();
  const tombstoneEmail = `deleted-${targetId}@deleted.invalid`;
  const { error } = await service
    .from('users')
    .update({
      deleted_at: nowIso,
      display_name: 'deleted',
      username: null,
      email: tombstoneEmail,
      avatar_url: null,
      banner_url: null,
      bio: null,
      first_name: null,
      last_name: null,
      phone: null,
      is_banned: true,
      ban_reason: 'admin_delete',
      banned_at: nowIso,
      banned_by: actor.id,
      is_active: false,
      updated_at: nowIso,
    })
    .eq('id', targetId);
  if (error) {
    console.error('[admin.users.delete]', error.message);
    return NextResponse.json({ error: 'Could not delete user' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// PATCH — update per-user admin-only fields.
// Accepted fields:
//   invite_cap_override: number (0–100) | null  — override personal invite cap
//   trial_extension_until: ISO string | null    — admin trial override
//     null = clear override (user reverts to comped_until)
//     'lifetime' sentinel = set comped_until=null, trial_extension_until=null (no expiry)
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const targetId = params?.id;
  if (!targetId) return NextResponse.json({ error: 'user id required' }, { status: 400 });

  let actor;
  try {
    actor = await requirePermission('admin.users.change_plan');
  } catch (err) {
    return permissionError(err);
  }

  const rankErr = await requireAdminOutranks(targetId, actor.id);
  if (rankErr) return rankErr;

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.users.patch:${actor.id}`,
    policyKey: 'admin.users.patch',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const update: {
    invite_cap_override?: number | null;
    trial_extension_until?: string | null;
    comped_until?: string | null;
    trial_extended_seen_at?: string | null;
  } = {};

  if ('invite_cap_override' in body) {
    const v = body.invite_cap_override;
    if (v === null || v === undefined) {
      update.invite_cap_override = null;
    } else {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 100) {
        return NextResponse.json(
          { error: 'invite_cap_override must be an integer 0–100 or null' },
          { status: 400 }
        );
      }
      update.invite_cap_override = n;
    }
  }

  if ('trial_extension_until' in body) {
    const v = body.trial_extension_until;
    if (v === null || v === undefined) {
      // Clear override — user reverts to comped_until clock
      update.trial_extension_until = null;
    } else if (v === 'lifetime') {
      // Lifetime grant — null comped_until + null trial_extension_until = no expiry
      update.comped_until = null;
      update.trial_extension_until = null;
    } else {
      // Validate ISO string
      const d = new Date(String(v));
      if (isNaN(d.getTime())) {
        return NextResponse.json(
          { error: 'trial_extension_until must be a valid ISO date string, null, or "lifetime"' },
          { status: 400 }
        );
      }
      update.trial_extension_until = d.toISOString();
      // Clear the seen flag so the user sees the "trial extended" banner again
      update.trial_extended_seen_at = null;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data: prior } = await service
    .from('users')
    .select('invite_cap_override, trial_extension_until, comped_until')
    .eq('id', targetId)
    .maybeSingle();
  if (!prior) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { error } = await service.from('users').update(update).eq('id', targetId);
  if (error) {
    console.error('[admin.users.patch]', error.message);
    return NextResponse.json({ error: 'Could not update user' }, { status: 500 });
  }

  // When invite_cap_override changes, sync the personal code (slot=1) max_uses
  // so the route-level cap gate stays consistent with the profile counter.
  if ('invite_cap_override' in update) {
    try {
      const newCap = update.invite_cap_override as number | null;
      if (newCap !== null) {
        // Sync to the explicit override value.
        await service
          .from('access_codes')
          .update({ max_uses: newCap })
          .eq('owner_user_id', targetId)
          .eq('type', 'referral')
          .eq('tier', 'user')
          .eq('slot', 1);
      } else {
        // Reset to global default.
        const { data: capSetting } = await service
          .from('settings')
          .select('value')
          .eq('key', 'invite_cap_default')
          .maybeSingle();
        const defaultCap = parseInt((capSetting?.value as string | undefined) ?? '2', 10) || 2;
        await service
          .from('access_codes')
          .update({ max_uses: defaultCap })
          .eq('owner_user_id', targetId)
          .eq('type', 'referral')
          .eq('tier', 'user')
          .eq('slot', 1);
      }
    } catch (e) {
      // Non-fatal — the users row is already updated. The cap sync will
      // re-run on the next /r/<username> hit via the route's lazy-sync.
      console.error('[admin.users.patch] cap sync failed:', e);
    }
  }

  await recordAdminAction({
    action: 'user.patch',
    targetTable: 'users',
    targetId,
    oldValue: { ...prior },
    newValue: update,
    reason: typeof body.reason === 'string' ? body.reason : null,
  });

  return NextResponse.json({ ok: true });
}

// TODO(T238): RLS verification — confirm public reads of `users` filter
// `deleted_at IS NULL`. If not, add a migration that updates the SELECT
// policies on `users` (and any view that fans out from it: comments,
// articles authored, follower lists) to exclude soft-deleted rows for
// non-admin viewers. Admin queries should still see tombstones.
//
// TODO(T238): GDPR hard-purge — add a separate "purge" admin endpoint
// (or a nightly cron) that hard-deletes any row with
// `deleted_at < now() - interval '30 days'` once associated content
// (comments authored, articles authored) has been re-attributed to a
// shared "deleted user" sentinel or anonymized. Not built here; this
// route stays soft-only so authored content survives.
