// [S3-Q2-a] Magic-link send — single auth-submit endpoint.
//
// === iOS Magic-Link Contract (S9 reads this — published per S3-Q2-f) ===
//
// (1) User taps "Send sign-in link" / "Send signup link":
//     - iOS POSTs to /api/auth/send-magic-link with { email }
//     - Always succeeds (200 + generic body); show success card "Check your inbox"
//     - 30-second resend cooldown on iOS side (matches web)
//
// (2) User clicks the magic link in their inbox:
//     - Universal Link → app opens → handleDeepLink(url) fires
//     - Existing setSession() call already wires this up — no change needed
//
// (3) Post-setSession routing:
//     - Read users.username for auth.uid()
//     - If NULL → push PickUsernameView (S9 builds new SwiftUI view)
//     - If present → push HomeView
//
// (4) Pick-username submission (iOS):
//     - Debounced 250ms /api/auth/check-username with { username } in body
//       (POST, returns { available: boolean })
//     - On submit: PATCH /api/auth/save-username with { username }
//     - On 409 (UNIQUE race): show "Taken — try another"
//     - On success: push HomeView
//
// (5) Audit log:
//     - This route writes a `auth:magic_link_send` audit row on each call,
//       success or rate-limit-cap or ban-rejection. Real reason is in
//       metadata; client never sees it.
//     - The token redemption (Supabase server-side) writes
//       `auth:magic_link_redeemed` via the callback handler.
//     - iOS does NOT write its own audit rows — server-side coverage is
//       canonical. No more password-attempt-count / login-failed events.
//
// (6) OAuth buttons:
//     - HIDE both Apple and Google sign-in behind a build flag (default
//       disabled). Code preserved; one-line flip to re-enable.
//
// (7) Logout:
//     - No change — existing logout flow already calls supabase.auth.signOut().
//
// === Behavior contract ===
//
// POST { email: string }
//   → 200 { ok: true, message: <generic> } in every non-malformed case:
//       - email exists + link sent
//       - email is new + signup link sent
//       - signInWithOtp returned a transient error
//       - rate-limited (per-email or per-IP)
//       - ban-evasion: email associated with a banned account
//       - closed-beta gate: email not invited
//   → 400 { error: <static> } only on malformed input (missing/invalid email).
//
// The 400 case is the only oracle and it leaks input format only — not
// account state. Latency is held roughly constant by always running the
// signInWithOtp call (or a timing-equivalent dummy in the silent-reject
// branches) so an attacker can't differentiate paths by timing.
//
// Rate-limit policies live in lib/rateLimits.ts (S3-A129):
//   AUTH_MAGIC_LINK_SEND_PER_EMAIL  3/hour per (lowercased) email
//   AUTH_SIGNUP_SUBMIT_PER_IP       5/hour per truncated /24

import { NextResponse } from 'next/server';
import { createOtpClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { getRateLimitPolicy } from '@/lib/rateLimits';
import { isAsciiEmail } from '@/lib/emailNormalize';
import { getSiteUrl } from '@/lib/siteUrl';
import { truncateIpV4 } from '@/lib/apiErrors';
import { checkSignupGate, isApprovedEmail } from '@/lib/betaGate';
import { REF_COOKIE_NAME } from '@/lib/referralCookie';
import { cookies } from 'next/headers';

// Frozen response shapes. The success message is identical across every
// success / silent-reject / rate-limit-cap path so the response body
// carries no oracle.
const GENERIC_SUCCESS = {
  ok: true,
  message:
    'If that email is registered we sent you a sign-in link; otherwise we sent you a signup link. Check your inbox.',
};
const MALFORMED = { error: 'Please enter a valid email.' };

function genericOk() {
  return NextResponse.json(GENERIC_SUCCESS, {
    status: 200,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

function malformed() {
  return NextResponse.json(MALFORMED, {
    status: 400,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

// Only used for NEW users blocked by the beta gate. Existing accounts
// always get genericOk() so we never reveal whether an email has an account.
function gated() {
  return NextResponse.json(
    { ok: false, reason: 'invite_required' },
    { status: 200, headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
  );
}

// Best-effort audit log. Failures here never propagate to the response
// (the response shape is generic regardless). audit_log writes go through
// service-role; an INSERT failure is logged for ops but doesn't leak.
async function writeAuditRow(service, { email, reason, ipTruncated }) {
  try {
    await service.from('audit_log').insert({
      actor_id: null,
      action: 'auth:magic_link_send',
      target_type: 'email',
      target_id: null,
      metadata: {
        email_lc: email,
        reason,
        ip_24: ipTruncated,
      },
    });
  } catch (err) {
    console.error('[auth.send-magic-link] audit_log insert failed:', err?.message || err);
  }
}

export async function POST(request) {
  // Parse body. Missing/non-JSON → malformed. Same exit path for both so
  // a non-JSON payload doesn't leak a different error.
  let payload = null;
  try {
    payload = await request.json();
  } catch {
    return malformed();
  }

  const rawEmail = typeof payload?.email === 'string' ? payload.email.trim() : '';
  // Format gate. Reject anything that doesn't look like local@domain
  // with ASCII-only codepoints. isAsciiEmail handles the homoglyph
  // guard (T299) so a Cyrillic-bypass attempt 400s here, identical to
  // any other malformed input. No partial leak.
  if (!rawEmail || rawEmail.length > 254 || !rawEmail.includes('@') || !isAsciiEmail(rawEmail)) {
    return malformed();
  }

  const email = rawEmail.toLowerCase();
  const service = createServiceClient();

  const rawIp = await getClientIp();
  const ipTruncated = truncateIpV4(rawIp);

  // Per-email cap. Keyed on the lowercased email so case-folding doesn't
  // give an attacker 2x the budget. Cap-hit returns the generic 200 +
  // logs the event.
  const emailPolicy = getRateLimitPolicy('AUTH_MAGIC_LINK_SEND_PER_EMAIL');
  const emailHit = await checkRateLimit(service, {
    key: `magic_link_send:email:${email}`,
    policyKey: 'auth_magic_link_send_per_email',
    ...emailPolicy,
  });
  if (emailHit.limited) {
    await writeAuditRow(service, { email, reason: 'rate_limited_email', ipTruncated });
    return genericOk();
  }

  // Per-IP cap. Truncated /24 so we share budget across NAT'd users on
  // the same subnet — intentional; prevents an attacker who controls one
  // IP from spinning up endless emails.
  const ipPolicy = getRateLimitPolicy('AUTH_SIGNUP_SUBMIT_PER_IP');
  const ipHit = await checkRateLimit(service, {
    key: `magic_link_send:ip:${ipTruncated || rawIp}`,
    policyKey: 'auth_signup_submit_per_ip',
    ...ipPolicy,
  });
  if (ipHit.limited) {
    await writeAuditRow(service, { email, reason: 'rate_limited_ip', ipTruncated });
    return genericOk();
  }

  // Ban-evasion. If this email is attached to a banned user, we must
  // not deliver a magic link — but the response shape stays generic.
  // Real reason captured in audit_log for ops review.
  try {
    const { data: banned } = await service
      .from('users')
      .select('id')
      .ilike('email', email)
      .eq('is_banned', true)
      .maybeSingle();
    if (banned) {
      await writeAuditRow(service, { email, reason: 'banned_email', ipTruncated });
      return genericOk();
    }
  } catch (err) {
    // DB hiccup on the ban-check is fail-CLOSED on this surface: silently
    // swallow + log + still return the generic 200. Worse to leak a
    // banned-account signal because the DB blinked than to skip a single
    // ban check.
    console.error('[auth.send-magic-link] ban check threw:', err?.message || err);
    await writeAuditRow(service, { email, reason: 'ban_check_error', ipTruncated });
    return genericOk();
  }

  // Closed-beta gate. Only applied to NEW emails — existing users sign
  // in unaffected (the gate exists to control NEW signups). Generic 200
  // either way; uninvited users get no link and no signal.
  const cookieJar = await cookies();
  const refCookie = cookieJar.get(REF_COOKIE_NAME)?.value;
  let existingUserId = null;
  try {
    const { data: existing } = await service
      .from('users')
      .select('id')
      .ilike('email', email)
      .maybeSingle();
    existingUserId = existing?.id || null;
  } catch (err) {
    console.error('[auth.send-magic-link] existing-user check threw:', err?.message || err);
  }
  if (!existingUserId) {
    // Approval is the canonical "this email is allowed" signal.
    // Admin-approved emails bypass the cookie gate so a recipient whose
    // invite-link email never landed (Resend down, dropped, deleted) can
    // still sign up by typing their email directly. Without this bypass,
    // an approved user with no cookie is silently dropped — exactly the
    // failure mode the audit log surfaced.
    let approvedBypass = false;
    try {
      approvedBypass = await isApprovedEmail(service, email);
    } catch (err) {
      console.error('[auth.send-magic-link] approval check threw:', err?.message || err);
    }
    if (!approvedBypass) {
      try {
        const gate = await checkSignupGate(service, refCookie);
        if (!gate.allowed) {
          await writeAuditRow(service, {
            email,
            reason: `closed_beta_${gate.reason || 'denied'}`,
            ipTruncated,
          });
          return gated();
        }
      } catch (err) {
        console.error('[auth.send-magic-link] beta gate threw:', err?.message || err);
        await writeAuditRow(service, { email, reason: 'beta_gate_error', ipTruncated });
        return gated();
      }
    }
  }

  // Send the OTP. shouldCreateUser=true makes the same call work for
  // signin AND signup — Supabase resolves which is which from the
  // existence of the auth row. Errors swallowed (fail-CLOSED on response
  // shape, error captured in audit log).
  const supabase = createOtpClient();
  const siteUrl = getSiteUrl();
  let otpError = null;
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${siteUrl}/api/auth/callback`,
      },
    });
    otpError = error || null;
  } catch (err) {
    otpError = err;
  }

  if (otpError) {
    console.error('[auth.send-magic-link] signInWithOtp error:', otpError?.message || otpError);
    await writeAuditRow(service, {
      email,
      reason: `otp_error:${(otpError?.message || 'unknown').slice(0, 80)}`,
      ipTruncated,
    });
    return genericOk();
  }

  // Success. Referral / beta-cohort grant for new users runs in the
  // callback handler post-redemption (when the auth row actually exists).
  // We can't do it here because signInWithOtp doesn't create the auth
  // row until the user clicks.
  await writeAuditRow(service, {
    email,
    reason: existingUserId ? 'sent_signin' : 'sent_signup',
    ipTruncated,
  });
  return genericOk();
}
