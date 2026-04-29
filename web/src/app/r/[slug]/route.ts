// Public referral capture: /r/<slug>
//
// Slug may be either:
//   (a) A username — resolves username → user → their slot-1 user-tier code (Path A).
//       Personal invite link: /r/cliff, /r/alice_m, etc.
//   (b) A legacy random code — resolves via access_codes.code = slug (backward compat).
//       Old-format: 8-12 char alphanumeric, e.g. /r/x3hq7ymvke.
//
// On hit:   set HMAC-signed `vp_ref` cookie carrying { code_id, issued_at,
//           cohort_snapshot } and 302 to /login?mode=create.
// On miss:  same 302 to /login?mode=create with NO cookie. Identical response
//           so an attacker can't enumerate valid slugs.
//
// Signed-in user: redirect to / without touching the cookie (cohort immutable
// post-signup per locked decision).
//
// Hardening:
//  - Slug regex enforced before DB lookup (no enumeration via timing).
//  - IP rate limit at 60/10min closes the bulk-scan vector.
//  - `Sec-Fetch-Dest: document` enforcement prevents CSRF-style forced
//    attribution via <img src> / <iframe> / fetch.
//  - No query params forwarded — open-redirect safe.
//  - Cookie always identical shape on hit; never reveals "exists".

import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { signRef, REF_COOKIE_NAME, REF_COOKIE_TTL_SEC } from '@/lib/referralCookie';
import { getSiteUrl } from '@/lib/siteUrl';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Accepts usernames (3-20 chars, a-z0-9 with underscores) and the legacy
// 8-12 char alphanumeric random codes. Both patterns fit within this range.
const SLUG_RE = /^[a-z0-9_]{3,20}$/;

function redirectToSignup(siteUrl: string): NextResponse {
  // 302 (not 307) — no body, no cookies on miss path.
  return NextResponse.redirect(`${siteUrl}/login?mode=create`, 302);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> | { slug: string } }
) {
  const siteUrl = getSiteUrl();
  const { slug } = await Promise.resolve(params as { slug: string });

  // CSRF / forced-attribution guard. Real navigation has Sec-Fetch-Dest:
  // document; <img>/<iframe>/<script>/fetch set other values. Missing header
  // accepted — older browsers (pre-2020) don't send it and the cost of a
  // false-deny (broken share link) is too high.
  const fetchDest = request.headers.get('sec-fetch-dest');
  if (fetchDest && fetchDest !== 'document') {
    return redirectToSignup(siteUrl);
  }

  // Format gate before any DB lookup — same generic miss shape.
  if (!SLUG_RE.test(slug)) {
    return redirectToSignup(siteUrl);
  }

  // Signed-in user check. Locked decision: if the visitor already has a
  // session, send them home without writing a referral cookie. Their cohort
  // was set at signup and is immutable; overwriting it would corrupt analytics.
  try {
    const userClient = await createClient();
    const { data: { user: sessionUser } } = await userClient.auth.getUser();
    if (sessionUser) {
      return NextResponse.redirect(`${siteUrl}/`, 302);
    }
  } catch {
    // createClient failure (no cookie env, edge case) — treat as anon and
    // continue normal flow rather than blocking a legitimate share link.
  }

  const service = createServiceClient();

  // IP rate limit.
  const ip = await getClientIp();
  const rate = await checkRateLimit(service, {
    key: `referral_landing:ip:${ip || 'unknown'}`,
    policyKey: 'referral_landing_ip',
    max: 60,
    windowSec: 600,
  });
  if (rate.limited) {
    return redirectToSignup(siteUrl);
  }

  // --- Path A: resolve as username → user → their personal slot-1 code ---
  let code: {
    id: string;
    type: string;
    tier: string | null;
    owner_user_id: string | null;
    slot: number | null;
    is_active: boolean;
    disabled_at: string | null;
    expires_at: string | null;
    max_uses: number | null;
    current_uses: number;
    cohort_source: string | null;
    cohort_medium: string | null;
  } | null = null;

  const { data: userRow } = await service
    .from('users')
    .select('id, username, is_banned, deleted_at, invite_cap_override')
    .ilike('username', slug)
    .maybeSingle();

  if (userRow && !userRow.is_banned && !userRow.deleted_at) {
    // User found by username. Ensure their personal code (slot=1) exists.
    try {
      await service.rpc('mint_referral_codes', { p_user_id: userRow.id });
    } catch {
      // mint failure non-fatal — we'll attempt the select; if empty, miss.
    }

    const { data: personalCode } = await service
      .from('access_codes')
      .select('id, type, tier, owner_user_id, slot, is_active, disabled_at, expires_at, max_uses, current_uses, cohort_source, cohort_medium')
      .eq('owner_user_id', userRow.id)
      .eq('type', 'referral')
      .eq('tier', 'user')
      .eq('slot', 1)
      .maybeSingle();

    if (personalCode) {
      // Sync max_uses to the user's effective invite cap. This keeps the
      // code-level gate consistent with the profile counter display.
      const { data: capSetting } = await service
        .from('settings')
        .select('value')
        .eq('key', 'invite_cap_default')
        .maybeSingle();
      const capDefault = parseInt((capSetting?.value as string | undefined) ?? '2', 10);
      const effectiveCap = (userRow.invite_cap_override as number | null) ?? capDefault;

      if (personalCode.max_uses !== effectiveCap) {
        await service
          .from('access_codes')
          .update({ max_uses: effectiveCap })
          .eq('id', personalCode.id);
        personalCode.max_uses = effectiveCap;
      }

      // Stamp cohort tags if missing — happens once on first visit.
      if (!personalCode.cohort_source || !personalCode.cohort_medium) {
        const medium = `user-${userRow.username}`;
        await service
          .from('access_codes')
          .update({ cohort_source: 'referral', cohort_medium: medium })
          .eq('id', personalCode.id);
        personalCode.cohort_source = 'referral';
        personalCode.cohort_medium = medium;
      }

      code = personalCode;
    }
  }

  // --- Legacy path: resolve as access_codes.code = slug ---
  if (!code) {
    const { data: legacyCode } = await service
      .from('access_codes')
      .select('id, type, tier, owner_user_id, slot, is_active, disabled_at, expires_at, max_uses, current_uses, cohort_source, cohort_medium')
      .eq('code', slug)
      .eq('type', 'referral')
      .maybeSingle();
    code = legacyCode ?? null;
  }

  if (!code) return redirectToSignup(siteUrl);
  if (!code.is_active || code.disabled_at) return redirectToSignup(siteUrl);
  if (code.expires_at && new Date(code.expires_at) < new Date()) {
    return redirectToSignup(siteUrl);
  }
  if (code.max_uses != null && (code.current_uses || 0) >= code.max_uses) {
    return redirectToSignup(siteUrl);
  }

  // Snapshot signup_cohort at mint-time so admin flips after this moment
  // don't retroactively change attribution.
  const { data: setting } = await service
    .from('settings')
    .select('value')
    .eq('key', 'signup_cohort')
    .maybeSingle();
  const cohortSnapshot = (setting?.value as string | undefined) || null;

  const signed = signRef({ c: code.id, t: Date.now(), h: cohortSnapshot });
  if (!signed) {
    // REFERRAL_COOKIE_SECRET missing/short. Continue without attribution.
    return redirectToSignup(siteUrl);
  }

  const res = NextResponse.redirect(`${siteUrl}/login?mode=create`, 302);
  res.cookies.set(REF_COOKIE_NAME, signed, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: REF_COOKIE_TTL_SEC,
  });
  return res;
}
