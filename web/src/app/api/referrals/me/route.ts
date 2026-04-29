// Returns the caller's referral slugs + redemption counts, plus the personal
// invite link data needed by InviteFriendsCard.
//
// Self-heals via mint_referral_codes (idempotent) so users who joined before
// this feature shipped get their codes on first profile-card load.
//
// Personal link: /r/<username> (Path A). The personal_url field lets the card
// display the username-based URL without constructing it client-side.
//
// Counts only — no PII of redeemers (no emails, no names, no avatars).

import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { getSiteUrl } from '@/lib/siteUrl';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  let user;
  try {
    const userClient = await createClient();
    user = await requireAuth(userClient);
  } catch (err) {
    const status =
      err &&
      typeof err === 'object' &&
      'status' in err &&
      typeof (err as { status: unknown }).status === 'number'
        ? (err as { status: number }).status
        : 401;
    return NextResponse.json({ error: 'Unauthorized' }, { status });
  }

  const service = createServiceClient();

  // Banned users must not mint or share referral codes — they're a
  // back-channel growth vector for accounts that were explicitly removed.
  try {
    const { data: row } = await service
      .from('users')
      .select('is_banned, username, invite_cap_override')
      .eq('id', user.id)
      .maybeSingle();
    if (row?.is_banned === true) {
      return NextResponse.json({ slugs: [], invite_cap: 0, invites_left: 0, personal_url: null });
    }

    // Stash user meta for cap calculation below.
    (user as typeof user & { _username?: string | null; _cap_override?: number | null })._username =
      row?.username ?? null;
    (user as typeof user & { _cap_override?: number | null })._cap_override =
      (row?.invite_cap_override as number | null) ?? null;
  } catch (e) {
    console.error('[referrals.me] user row check threw:', e);
  }

  const rate = await checkRateLimit(service, {
    key: `referrals_me:${user.id}`,
    policyKey: 'referrals_me',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': String(rate.windowSec ?? 60) },
      }
    );
  }

  // Self-heal: mint slugs if missing.
  try {
    await service.rpc('mint_referral_codes', { p_user_id: user.id });
  } catch (e) {
    console.error('[referrals.me] mint failed:', e);
  }

  const { data: codes, error } = await service
    .from('access_codes')
    .select(
      'id, code, slot, is_active, disabled_at, current_uses, max_uses, expires_at, created_at, cohort_source, cohort_medium'
    )
    .eq('owner_user_id', user.id)
    .eq('type', 'referral')
    .eq('tier', 'user')
    .order('slot', { ascending: true });

  if (error) {
    console.error('[referrals.me] select failed:', error.message);
    return NextResponse.json({ error: 'Could not load referrals' }, { status: 500 });
  }

  // Resolve invite cap: per-user override ?? global setting default.
  const capOverride = (user as { _cap_override?: number | null })._cap_override ?? null;
  let inviteCap = 2;
  try {
    const { data: capSetting } = await service
      .from('settings')
      .select('value')
      .eq('key', 'invite_cap_default')
      .maybeSingle();
    inviteCap = parseInt((capSetting?.value as string | undefined) ?? '2', 10) || 2;
  } catch {
    // Use default if settings read fails.
  }
  const effectiveCap = capOverride ?? inviteCap;

  const siteUrl = getSiteUrl();
  const username = (user as { _username?: string | null })._username ?? null;

  // Personal URL is /r/<username> if the user has a username.
  const personalUrl = username ? `${siteUrl}/r/${username}` : null;

  const rows = (codes || []).map((c) => ({
    id: c.id,
    slot: c.slot,
    code: c.code,
    url: `${siteUrl}/r/${c.code}`,
    active:
      !!c.is_active && !c.disabled_at && (!c.expires_at || new Date(c.expires_at) > new Date()),
    redemption_count: c.current_uses || 0,
    max_uses: c.max_uses,
    created_at: c.created_at,
    cohort_source: c.cohort_source,
    cohort_medium: c.cohort_medium,
  }));

  // invites_left: how many more people can redeem the personal link (slot=1).
  const slot1 = rows.find((r) => r.slot === 1);
  const usedCount = slot1?.redemption_count ?? 0;
  const invitesLeft = Math.max(0, effectiveCap - usedCount);

  return NextResponse.json({
    slugs: rows,
    invite_cap: effectiveCap,
    invites_left: invitesLeft,
    personal_url: personalUrl,
  });
}
