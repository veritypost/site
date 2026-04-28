// Closed-beta signup gate.
//
// During beta_active=true, signup requires a valid vp_ref cookie pointing
// at an active referral code. Without it, signup is rejected with 403 and
// the client redirects to /beta-locked.
//
// This is the access gate for the entire onboarding surface. Existing
// authenticated users (already-onboarded accounts) are NOT affected — they
// log in normally. Only new account creation passes through this gate.

import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyRef } from './referralCookie';

export type GateResult =
  | { allowed: true; viaOwnerLink: boolean; codeId: string | null; viaApproval?: boolean }
  | {
      allowed: false;
      reason:
        | 'beta_closed'
        | 'no_cookie'
        | 'invalid_cookie'
        | 'code_not_found'
        | 'code_disabled'
        | 'code_expired'
        | 'code_exhausted';
    };

/**
 * Approval-based bypass for the cookie gate. An admin-approved
 * `access_requests` row is the canonical source of truth for "this
 * email is allowed in." It must work even when the recipient never
 * clicked the invite link (auto-email failed, link lost in inbox,
 * cookies cleared, different device, etc.). Once approved, that email
 * is in — period.
 */
export async function isApprovedEmail(
  service: SupabaseClient,
  email: string | null | undefined
): Promise<boolean> {
  if (!email) return false;
  const lc = email.toLowerCase();
  try {
    const { data } = await service
      .from('access_requests')
      .select('id')
      .eq('email', lc)
      .eq('status', 'approved')
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

/**
 * Read settings.beta_active. Returns false if the row is missing or
 * unparseable — fails OPEN to avoid locking out users on a bad config.
 * The signup gate only kicks in when beta_active is explicitly true.
 */
export async function isBetaActive(service: SupabaseClient): Promise<boolean> {
  try {
    const { data } = await service
      .from('settings')
      .select('value')
      .eq('key', 'beta_active')
      .maybeSingle();
    return data?.value === 'true';
  } catch {
    return false;
  }
}

/**
 * Check whether a signup attempt should be allowed. Pass the vp_ref
 * cookie value (raw, signed). Returns allowed:true when beta is off OR
 * when a valid cookie maps to an active code.
 */
export async function checkSignupGate(
  service: SupabaseClient,
  cookieValue: string | undefined | null
): Promise<GateResult> {
  const betaActive = await isBetaActive(service);
  if (!betaActive) {
    // Beta off → open signup. Owner-link / user-link still tracked if
    // cookie present, but no gate.
    if (cookieValue) {
      const payload = verifyRef(cookieValue);
      if (payload?.c) {
        const { data: code } = await service
          .from('access_codes')
          .select('id, tier, is_active, disabled_at, expires_at, max_uses, current_uses')
          .eq('id', payload.c)
          .eq('type', 'referral')
          .maybeSingle();
        const ok =
          code &&
          code.is_active &&
          !code.disabled_at &&
          (!code.expires_at || new Date(code.expires_at) > new Date()) &&
          (code.max_uses == null || (code.current_uses || 0) < code.max_uses);
        return {
          allowed: true,
          viaOwnerLink: ok ? code!.tier === 'owner' : false,
          codeId: ok ? code!.id : null,
        };
      }
    }
    return { allowed: true, viaOwnerLink: false, codeId: null };
  }

  // Beta is active — cookie required.
  if (!cookieValue) {
    return { allowed: false, reason: 'no_cookie' };
  }
  const payload = verifyRef(cookieValue);
  if (!payload?.c) {
    return { allowed: false, reason: 'invalid_cookie' };
  }

  const { data: code } = await service
    .from('access_codes')
    .select('id, tier, is_active, disabled_at, expires_at, max_uses, current_uses')
    .eq('id', payload.c)
    .eq('type', 'referral')
    .maybeSingle();
  if (!code) return { allowed: false, reason: 'code_not_found' };
  if (!code.is_active || code.disabled_at) return { allowed: false, reason: 'code_disabled' };
  if (code.expires_at && new Date(code.expires_at) < new Date()) {
    return { allowed: false, reason: 'code_expired' };
  }
  if (code.max_uses != null && (code.current_uses || 0) >= code.max_uses) {
    return { allowed: false, reason: 'code_exhausted' };
  }

  return {
    allowed: true,
    viaOwnerLink: code.tier === 'owner',
    codeId: code.id,
  };
}
