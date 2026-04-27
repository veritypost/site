// Server-side referral processing called from signup callbacks.
//
// Contract: never throws. Never blocks signup. All side effects are
// best-effort logged. The signup flow remains identical for users with
// no cookie / invalid cookie / disabled code / self-referral / etc.
//
// Order of operations is critical:
//   1. Clear vp_ref cookie unconditionally (first, before any DB call).
//   2. Apply cohort grant (independent of referral — direct signup hits
//      this path with via_owner_link=false too).
//   3. If cookie was present + verified: redeem with provenance.

import type { NextResponse, NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyRef, REF_COOKIE_NAME } from './referralCookie';
import { normalizeEmail } from './emailNormalize';

type ProvenanceInput = {
  request: NextRequest | Request;
  ip?: string | null;
};

export type ReferralResult = {
  cohort: string | null;
  redeemed: boolean;
  redemption_id: string | null;
  code_tier: 'owner' | 'user' | null;
  referrer_user_id: string | null;
};

function buildProvenance(opts: ProvenanceInput, landingPathname: string): Record<string, string> {
  const headers = opts.request.headers;
  const ua = headers.get('user-agent') || '';
  const referer = headers.get('referer') || '';
  const country = headers.get('x-vercel-ip-country') || headers.get('cf-ipcountry') || '';
  const lower = ua.toLowerCase();
  const device = lower.includes('mobi')
    ? 'mobile'
    : lower.includes('tablet')
      ? 'tablet'
      : lower.includes('bot') || lower.includes('crawler')
        ? 'bot'
        : 'desktop';
  const out: Record<string, string> = {
    landing_url: landingPathname,
    http_referer: referer.slice(0, 500),
    user_agent: ua.slice(0, 500),
    device_type: device,
  };
  if (opts.ip) out.ip_address = opts.ip;
  if (country) out.country_code = country.slice(0, 2).toUpperCase();
  return out;
}

/**
 * Process referral cookie + apply cohort grant for a freshly-created user.
 *
 * @param service service-role Supabase client
 * @param userId the new user's id
 * @param userEmail the new user's email (for self-referral normalization)
 * @param request the incoming Next request (for cookie + provenance headers)
 * @param response the outgoing Next response (cookie cleared on it)
 * @param ip optional client IP for provenance
 */
export async function processSignupReferralAndCohort(
  service: SupabaseClient,
  userId: string,
  userEmail: string | null,
  request: NextRequest | Request,
  response: NextResponse,
  ip: string | null = null
): Promise<ReferralResult> {
  // Step 1 — clear cookie unconditionally, FIRST. Even if every later
  // step fails, the next signup on this browser starts fresh.
  try {
    response.cookies.set(REF_COOKIE_NAME, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    });
  } catch (e) {
    console.error('[referral.process] cookie clear failed:', e);
  }

  // Read cookie before clearing — Next gives us request.cookies regardless
  // of response writes. verifyRef fails closed on missing/expired/tampered.
  const reqCookieValue = (request as NextRequest).cookies?.get?.(REF_COOKIE_NAME)?.value;
  const payload = verifyRef(reqCookieValue);

  // Step 2 — figure out if this signup came through an owner-tier link.
  // We look up the code first (read-only) so we can pass via_owner_link
  // to apply_signup_cohort. This determines whether email-verify is
  // required for the Pro grant.
  let viaOwnerLink = false;
  let codeId: string | null = null;
  let codeOwnerUserId: string | null = null;
  let codeOwnerEmail: string | null = null;

  if (payload?.c) {
    const { data: code } = await service
      .from('access_codes')
      .select('id, tier, owner_user_id')
      .eq('id', payload.c)
      .eq('type', 'referral')
      .maybeSingle();
    if (code) {
      codeId = code.id;
      codeOwnerUserId = code.owner_user_id;
      viaOwnerLink = code.tier === 'owner';
      if (code.owner_user_id) {
        const { data: owner } = await service
          .from('users')
          .select('email')
          .eq('id', code.owner_user_id)
          .maybeSingle();
        codeOwnerEmail = owner?.email || null;
      }
    }
  }

  // Step 3 — apply cohort tag + Pro grant (if eligible).
  let cohort: string | null = null;
  try {
    const { data, error } = await service.rpc('apply_signup_cohort', {
      p_user_id: userId,
      p_via_owner_link: viaOwnerLink,
    });
    if (error) {
      console.error('[referral.process] apply_signup_cohort:', error.message);
    } else if (typeof data === 'string') {
      cohort = data;
    }
  } catch (e) {
    console.error('[referral.process] apply_signup_cohort threw:', e);
  }

  // Step 3b — mint the user's 2 referral slugs if they got Pro. The DB
  // function is idempotent and ON CONFLICT-safe, so calling it on every
  // signup that lands in beta+Pro is fine. We only mint when the grant
  // actually happened (cohort='beta' AND eligibility met) so unverified
  // direct-signup users don't get share links until they verify and
  // complete_email_verification runs.
  if (cohort === 'beta') {
    try {
      const { data: planRow } = await service
        .from('users')
        .select('plan_id')
        .eq('id', userId)
        .maybeSingle();
      if (planRow?.plan_id) {
        await service.rpc('mint_referral_codes', { p_user_id: userId });
      }
    } catch (e) {
      console.error('[referral.process] mint_referral_codes threw:', e);
    }
  }

  // Step 4 — record the redemption (if a valid code was loaded).
  // Self-referral guard: id-match (in DB) + email-normalized match (here).
  if (codeId && codeOwnerUserId) {
    if (codeOwnerUserId === userId) {
      return {
        cohort,
        redeemed: false,
        redemption_id: null,
        code_tier: null,
        referrer_user_id: null,
      };
    }
    const a = normalizeEmail(userEmail);
    const b = normalizeEmail(codeOwnerEmail);
    if (a && b && a === b) {
      return {
        cohort,
        redeemed: false,
        redemption_id: null,
        code_tier: null,
        referrer_user_id: null,
      };
    }

    try {
      const provenance = buildProvenance({ request, ip }, '/r');
      const { data, error } = await service.rpc('redeem_referral', {
        p_code_id: codeId,
        p_used_by_user_id: userId,
        p_provenance: provenance,
      });
      if (error) {
        console.error('[referral.process] redeem_referral:', error.message);
      } else if (Array.isArray(data) && data.length > 0) {
        const row = data[0] as {
          redemption_id: string | null;
          code_tier: string | null;
          referrer_user_id: string | null;
          was_recorded: boolean;
        };
        return {
          cohort,
          redeemed: !!row.was_recorded,
          redemption_id: row.redemption_id,
          code_tier: (row.code_tier as 'owner' | 'user' | null) || null,
          referrer_user_id: row.referrer_user_id,
        };
      }
    } catch (e) {
      console.error('[referral.process] redeem_referral threw:', e);
    }
  }

  return { cohort, redeemed: false, redemption_id: null, code_tier: null, referrer_user_id: null };
}
