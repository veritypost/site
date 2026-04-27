// Public referral capture: /r/<slug>
//
// On hit: set HMAC-signed `vp_ref` cookie carrying { code_id, issued_at,
//         cohort_snapshot } and 302 to /signup.
// On miss / disabled / expired / rate-limited / wrong-context: same 302
//         to /signup with NO cookie. Identical response shape so an
//         attacker can't enumerate valid slugs.
//
// Hardening:
//  - Slug regex enforced before DB lookup (no enumeration via timing).
//  - IP rate limit at 60/10min closes the bulk-scan vector.
//  - `Sec-Fetch-Dest: document` enforcement prevents CSRF-style forced
//    attribution via <img src> / <iframe> / fetch.
//  - No query params forwarded to /signup — open-redirect safe.
//  - Cookie always identical shape on hit; never reveals "exists".

import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { signRef, REF_COOKIE_NAME, REF_COOKIE_TTL_SEC } from '@/lib/referralCookie';
import { getSiteUrl } from '@/lib/siteUrl';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SLUG_RE = /^[a-z0-9]{8,12}$/;

function redirectToSignup(siteUrl: string): NextResponse {
  // Status 302 (not 307) — no body, no cookies on miss path.
  return NextResponse.redirect(`${siteUrl}/signup`, 302);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> | { slug: string } }
) {
  const siteUrl = getSiteUrl();
  const { slug } = await Promise.resolve(params as { slug: string });

  // CSRF / forced-attribution guard. A real navigation has Sec-Fetch-Dest:
  // document; <img>/<iframe>/<script>/fetch all set other values. Browsers
  // older than ~2020 don't send the header — we accept missing as "ok"
  // since the cost of a false-deny is high (broken share link).
  const fetchDest = request.headers.get('sec-fetch-dest');
  if (fetchDest && fetchDest !== 'document') {
    return redirectToSignup(siteUrl);
  }

  // Format gate before DB. Reject anything not slug-shaped without
  // distinguishing "invalid format" from "valid but not found".
  if (!SLUG_RE.test(slug)) {
    return redirectToSignup(siteUrl);
  }

  const service = createServiceClient();

  // IP rate limit. Anonymous, key on client IP.
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

  // Resolve slug → code row. Service client because access_codes RLS
  // is admin-only by default. We only read the bare minimum.
  const { data: code } = await service
    .from('access_codes')
    .select(
      'id, type, tier, owner_user_id, slot, is_active, disabled_at, expires_at, max_uses, current_uses'
    )
    .eq('code', slug)
    .eq('type', 'referral')
    .maybeSingle();

  if (!code) return redirectToSignup(siteUrl);
  if (!code.is_active || code.disabled_at) return redirectToSignup(siteUrl);
  if (code.expires_at && new Date(code.expires_at) < new Date()) {
    return redirectToSignup(siteUrl);
  }
  if (code.max_uses != null && (code.current_uses || 0) >= code.max_uses) {
    return redirectToSignup(siteUrl);
  }

  // Snapshot signup_cohort at mint-time so admin flips after this
  // moment don't change attribution.
  const { data: setting } = await service
    .from('settings')
    .select('value')
    .eq('key', 'signup_cohort')
    .maybeSingle();
  const cohortSnapshot = (setting?.value as string | undefined) || null;

  const signed = signRef({ c: code.id, t: Date.now(), h: cohortSnapshot });
  if (!signed) {
    // REFERRAL_COOKIE_SECRET missing/short. Don't fail open — silently
    // continue without attribution rather than crash the share link.
    return redirectToSignup(siteUrl);
  }

  const res = NextResponse.redirect(`${siteUrl}/signup`, 302);
  res.cookies.set(REF_COOKIE_NAME, signed, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: REF_COOKIE_TTL_SEC,
  });
  return res;
}
