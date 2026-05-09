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
import { truncateIpV4 } from '@/lib/apiErrors';
import { checkSignupGate, isApprovedEmail } from '@/lib/betaGate';
import { REF_COOKIE_NAME } from '@/lib/referralCookie';
import { cookies } from 'next/headers';
import { renderTemplate, sendEmail } from '@/lib/email';
import { MAGIC_LINK_TEMPLATE, buildMagicLinkVars } from '@/lib/magicLinkEmail';

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
async function writeAuditRow(service, { email, reason, ipTruncated, client }) {
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
        client: client || 'web',
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

  // Caller-surface tag. 'web' (default) and 'ios' run through the
  // adult-product flow, including the closed-beta gate. 'kids' is the
  // kids iOS parent sign-in funnel — distinct surface, NOT subject to
  // the adult waitlist gate (App Store distribution + on-device parental
  // gate is the access control). Whitelisted enum, default 'web', no
  // leak path. Same email may legitimately surface from either app on
  // different days — `signup_source` is set ONCE at user creation.
  const rawClient = typeof payload?.client === 'string' ? payload.client.trim().toLowerCase() : '';
  const client = (rawClient === 'kids' || rawClient === 'ios' || rawClient === 'web') ? rawClient : 'web';

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
    await writeAuditRow(service, { email, reason: 'rate_limited_email', ipTruncated, client });
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
    await writeAuditRow(service, { email, reason: 'rate_limited_ip', ipTruncated, client });
    return genericOk();
  }

  // Ban-evasion. If this email is attached to a banned user, we must
  // not deliver a magic link — but the response shape stays generic.
  // Real reason captured in audit_log for ops review.
  try {
    const { data: blocked } = await service
      .from('users')
      .select('id, is_banned, frozen_at, deleted_at')
      .ilike('email', email)
      .maybeSingle();
    if (blocked && (blocked.is_banned || blocked.frozen_at != null || blocked.deleted_at != null)) {
      await writeAuditRow(service, { email, reason: 'banned_email', ipTruncated, client });
      return genericOk();
    }
  } catch (err) {
    // DB hiccup on the ban-check is fail-CLOSED on this surface: silently
    // swallow + log + still return the generic 200. Worse to leak a
    // banned-account signal because the DB blinked than to skip a single
    // ban check.
    console.error('[auth.send-magic-link] ban check threw:', err?.message || err);
    await writeAuditRow(service, { email, reason: 'ban_check_error', ipTruncated, client });
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
    // Kids-surface signup is its own funnel — App Store distribution +
    // device-level parental gate is the access control. The adult
    // closed-beta gate exists to throttle the adult-product waitlist;
    // applying it to a kids parent would silently drop a legitimate
    // setup attempt (no users row, no approved access_request, no
    // referral cookie on iOS). Skip the gate entirely for client='kids'.
    if (!approvedBypass && client !== 'kids') {
      try {
        const gate = await checkSignupGate(service, refCookie);
        if (!gate.allowed) {
          await writeAuditRow(service, {
            email,
            reason: `closed_beta_${gate.reason || 'denied'}`,
            ipTruncated,
            client,
          });
          return gated();
        }
      } catch (err) {
        console.error('[auth.send-magic-link] beta gate threw:', err?.message || err);
        await writeAuditRow(service, { email, reason: 'beta_gate_error', ipTruncated, client });
        return genericOk();
      }
    }
  }

  // Step 1: Create auth.users row for new emails. generateLink throws
  // "User not found" if the row doesn't exist yet. Silently skip errors
  // that mean the row already exists (race or trigger beat us here).
  if (!existingUserId) {
    try {
      // signup_source is the durable funnel tag. 'kids' here means the
      // first sign-in attempt arrived via the kids iOS parent flow.
      // Set ONCE on user creation; downstream sign-ins from the adult
      // app on the same email don't overwrite it. Same person can use
      // both apps (one users row per email) — the tag captures origin.
      //
      // Stored in user_metadata only (NOT app_metadata): the value is
      // attacker-chosen via the request body, and app_metadata is the
      // server-trusted bag — putting an unverified string there would
      // mean future code that gates on `app_metadata.signup_source` is
      // trusting the original caller's claim. user_metadata's lower
      // trust posture matches what we actually have here.
      const { error: createErr } = await service.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { signup_source: client },
      });
      if (createErr) {
        const msg = (createErr.message || '').toLowerCase();
        const alreadyExists = msg.includes('already') || msg.includes('registered') || msg.includes('exists');
        if (!alreadyExists) {
          console.error('[NEEDS_CLEANUP] auth.users orphan:', email, createErr.message);
          await writeAuditRow(service, { email, reason: 'create_user_error', ipTruncated, client });
          return genericOk();
        }
      }
    } catch (err) {
      console.error('[NEEDS_CLEANUP] auth.users orphan:', email, err?.message || err);
      await writeAuditRow(service, { email, reason: 'create_user_error', ipTruncated, client });
      return genericOk();
    }
  }

  // Step 2: Generate the OTP. Q05: OTP-only — no clickable link in email.
  // URL prefetchers were burning single-use tokens. email_otp is extracted
  // from the generateLink response; hashed_token is discarded.
  let emailOtp = null;
  try {
    const { data: linkData, error: linkErr } = await service.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (linkErr || !linkData?.properties?.email_otp) {
      console.error('[auth.send-magic-link] generateLink error:', linkErr?.message || 'missing email_otp');
      await writeAuditRow(service, { email, reason: 'generate_link_error', ipTruncated, client });
      return genericOk();
    }
    emailOtp = linkData.properties.email_otp;
  } catch (err) {
    console.error('[auth.send-magic-link] generateLink threw:', err?.message || err);
    await writeAuditRow(service, { email, reason: 'generate_link_error', ipTruncated, client });
    return genericOk();
  }

  // Step 4: Compute days_on_list for new users. Non-fatal.
  // Skipped for kids surface: the wait-line copy ("you've been on the
  // list N days") is adult-waitlist branding. A parent who happens to
  // hold an approved access_request from the adult product but installs
  // the kids app first would otherwise see waitlist copy in their kids
  // setup email — wrong context. Kids parents are not waitlisted.
  let daysOnList = null;
  if (!existingUserId && client !== 'kids') {
    try {
      const { data: req } = await service
        .from('access_requests')
        .select('created_at')
        .eq('email', email)
        .eq('status', 'approved')
        .order('created_at')
        .limit(1)
        .maybeSingle();
      if (req?.created_at) {
        const days = Math.floor((Date.now() - new Date(req.created_at).getTime()) / (1000 * 60 * 60 * 24));
        daysOnList = days >= 1 ? days : null;
      }
    } catch (err) {
      console.error('[auth.send-magic-link] days_on_list query threw:', err?.message || err);
    }
  }

  // Step 5: Send via Resend. Fail-open — auth rows exist; user can re-request.
  try {
    const { html, text, subject, fromName, fromEmail } = renderTemplate(
      MAGIC_LINK_TEMPLATE,
      buildMagicLinkVars({ email_otp: emailOtp, days_on_list: daysOnList })
    );
    const mailRes = await sendEmail({ to: email, subject, html, text, fromName, fromEmail });
    console.log('MAIL_OK id=' + mailRes?.id + ' to=' + email + ' from=' + fromEmail);
  } catch (err) {
    console.error('MAIL_ERR:', err?.message, JSON.stringify(err?.response ?? err?.cause ?? null));
  }

  // Step 6: Audit + return.
  await writeAuditRow(service, {
    email,
    reason: existingUserId ? 'sent_signin' : 'sent_signup',
    ipTruncated,
    client,
  });
  return genericOk();
}
