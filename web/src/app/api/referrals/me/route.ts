// Returns the caller's two referral slugs + redemption counts per slot.
// Self-heals via mint_referral_codes (idempotent) so a user whose slugs
// were skipped at signup (e.g., joined before this feature shipped, or
// pre-email-verification) gets them on first profile-card load.
//
// Counts only — no PII of redeemers (no emails, no names, no avatars).
// Per the design review's privacy / harassment-vector mitigation.

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

  // Banned users must not be able to mint or share referral codes —
  // they're a back-channel growth vector for accounts that were
  // explicitly removed from the platform. Return empty slugs so the
  // client renders the "no links" state gracefully without leaking
  // ban state.
  try {
    const { data: row } = await service
      .from('users')
      .select('is_banned')
      .eq('id', user.id)
      .maybeSingle();
    if (row?.is_banned === true) {
      return NextResponse.json({ slugs: [] });
    }
  } catch (e) {
    console.error('[referrals.me] ban check threw:', e);
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

  // Self-heal: mint slugs if missing. Function is gated to authenticated
  // for self only (auth.uid() == p_user_id check inside the function).
  // We run it via the service client to avoid an extra round-trip on the
  // user-scoped client; the function still verifies the target.
  try {
    await service.rpc('mint_referral_codes', { p_user_id: user.id });
  } catch (e) {
    console.error('[referrals.me] mint failed:', e);
  }

  const { data: codes, error } = await service
    .from('access_codes')
    .select(
      'id, code, slot, is_active, disabled_at, current_uses, max_uses, expires_at, created_at'
    )
    .eq('owner_user_id', user.id)
    .eq('type', 'referral')
    .eq('tier', 'user')
    .order('slot', { ascending: true });

  if (error) {
    console.error('[referrals.me] select failed:', error.message);
    return NextResponse.json({ error: 'Could not load referrals' }, { status: 500 });
  }

  const siteUrl = getSiteUrl();
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
  }));

  return NextResponse.json({ slugs: rows });
}
