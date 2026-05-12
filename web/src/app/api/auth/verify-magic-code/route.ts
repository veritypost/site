// OTP verification — second half of the sign-in flow.
//
// POST { email, token }
//   → 200 { ok: true }  in every non-malformed case (privacy posture):
//       - correct code → session set, bookkeeping run
//       - wrong / expired / used code
//       - rate-limited
//       - unknown email
//   → 400 { error }     only for malformed input (missing/non-email, non-digit token)
//
// The 400 is the only oracle and leaks only input format — not account state.
// Callers must treat any 200 as "check your app state for an active session".
//
// Rate-limit policies (lib/rateLimits.ts S3-A129):
//   AUTH_VERIFY_MAGIC_CODE_PER_EMAIL  10/hr per lowercased email (all attempts)
//   AUTH_VERIFY_MAGIC_CODE_DAILY_FAILURES  10/day failure counter (monitoring)

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createOtpClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { getRateLimitPolicy } from '@/lib/rateLimits';
import { isAsciiEmail } from '@/lib/emailNormalize';
import { truncateIpV4 } from '@/lib/apiErrors';
import { checkSignupGate, type GateResult } from '@/lib/betaGate';
import { REF_COOKIE_NAME } from '@/lib/referralCookie';
import { cookies } from 'next/headers';
import {
  runSignupBookkeeping,
  runReturningUserBookkeeping,
} from '@/lib/auth/postLoginBookkeeping';
import { enforceDeletedAccountGate } from '@/lib/auth/deletedAccountGate';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

// Map upstream verifyOtp errors to a closed set of audit codes. Avoids
// dumping raw provider strings (which can carry email/IP/user-id hints
// or change wording across Supabase releases) into audit_log.
function classifyOtpError(message: string | undefined | null): string {
  if (!message) return 'no_user';
  const m = message.toLowerCase();
  if (m.includes('expired')) return 'expired';
  if (m.includes('invalid') || m.includes('not found')) return 'invalid';
  if (m.includes('rate') || m.includes('too many')) return 'rate_limited_upstream';
  return 'other';
}

function genericOk() {
  return NextResponse.json({ ok: true }, { status: 200, headers: NO_STORE });
}

function malformed() {
  return NextResponse.json({ error: 'Invalid input.' }, { status: 400, headers: NO_STORE });
}

async function writeAuditRow(
  service: ReturnType<typeof createServiceClient>,
  {
    email,
    reason,
    ipTruncated,
    client,
  }: { email: string; reason: string; ipTruncated: string | null; client?: string }
) {
  try {
    await service.from('audit_log').insert({
      actor_id: null,
      action: 'auth:verify_magic_code',
      target_type: 'email',
      target_id: null,
      metadata: { email_lc: email, reason, ip_24: ipTruncated, client: client || 'web' },
    });
  } catch (err) {
    console.error('[verify-magic-code] audit_log insert failed:', (err as Error)?.message);
  }
}

export async function POST(request: NextRequest) {
  let payload: { email?: unknown; token?: unknown; client?: unknown } | null = null;
  try {
    payload = await request.json();
  } catch {
    return malformed();
  }

  const rawEmail = typeof payload?.email === 'string' ? payload.email.trim() : '';
  const rawToken = typeof payload?.token === 'string' ? payload.token.trim() : '';
  // Caller-surface tag — same enum/whitelist as send-magic-link. Native
  // clients (ios/kids) get the session in the JSON response body since
  // they can't read the SSR cookies set by verifyOtp.
  const rawClient = typeof payload?.client === 'string' ? payload.client.trim().toLowerCase() : '';
  const client: 'web' | 'ios' | 'kids' =
    rawClient === 'kids' ? 'kids' : rawClient === 'ios' ? 'ios' : 'web';

  if (
    !rawEmail ||
    rawEmail.length > 254 ||
    !rawEmail.includes('@') ||
    !isAsciiEmail(rawEmail)
  ) {
    return malformed();
  }
  if (!/^\d{8}$/.test(rawToken)) {
    return malformed();
  }

  const email = rawEmail.toLowerCase();
  const service = createServiceClient();
  const rawIp = await getClientIp();
  const ipTruncated = truncateIpV4(rawIp);

  // Per-email attempts cap. Increments on every attempt so brute-forcing
  // an 8-digit OTP code (10^8 space) over 10 attempts/hr is uneconomic.
  const emailPolicy = getRateLimitPolicy('AUTH_VERIFY_MAGIC_CODE_PER_EMAIL');
  const emailHit = await checkRateLimit(service, {
    key: `verify_magic_code:email:${email}`,
    policyKey: 'auth_verify_magic_code_per_email',
    ...emailPolicy,
  });
  if (emailHit.limited) {
    await writeAuditRow(service, { email, reason: 'rate_limited_email', ipTruncated, client });
    return genericOk();
  }

  const ipPolicy = getRateLimitPolicy('AUTH_VERIFY_MAGIC_CODE_PER_IP');
  const ipHit = await checkRateLimit(service, {
    key: `otp_verify_ip:${ipTruncated || rawIp}`,
    policyKey: 'auth_verify_magic_code_per_ip',
    ...ipPolicy,
  });
  if (ipHit.limited) {
    await writeAuditRow(service, { email, reason: 'rate_limited_ip', ipTruncated, client });
    return genericOk();
  }

  const codePolicy = getRateLimitPolicy('AUTH_VERIFY_MAGIC_CODE_ATTEMPTS_PER_CODE');
  const codeHit = await checkRateLimit(service, {
    key: `verify_magic_code:code:${rawToken}`,
    policyKey: 'auth_verify_magic_code_attempts_per_code',
    ...codePolicy,
  });
  if (codeHit.limited) {
    await writeAuditRow(service, { email, reason: 'rate_limited_code', ipTruncated, client });
    return genericOk();
  }

  // Verify the OTP. type='magiclink' matches the token issued by
  // admin.generateLink({ type: 'magiclink' }) in send-magic-link.
  const supabase = createOtpClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: rawToken,
    type: 'magiclink',
  });

  if (error || !data.user) {
    // Track failures for monitoring (non-blocking increment).
    const failPolicy = getRateLimitPolicy('AUTH_VERIFY_MAGIC_CODE_DAILY_FAILURES');
    void checkRateLimit(service, {
      key: `verify_magic_code:fail:${email}`,
      policyKey: 'auth_verify_magic_code_daily_failures',
      ...failPolicy,
    });
    await writeAuditRow(service, {
      email,
      reason: `otp_failed:${classifyOtpError(error?.message)}`,
      ipTruncated,
      client,
    });
    return genericOk();
  }

  const user = data.user;

  const { data: existing } = await service
    .from('users')
    .select(
      'id, username, onboarding_completed_at, email_verified, deletion_completed_at, deletion_auth_purged_at'
    )
    .eq('id', user.id)
    .maybeSingle();

  // BugList #7 — anonymized account whose auth row survived a prior
  // cron pass. Sign out, drop the credential, return generic OK so
  // we don't reveal account state via the response shape.
  if (existing) {
    const verdict = await enforceDeletedAccountGate(service, {
      id: existing.id,
      deletion_completed_at: (existing as { deletion_completed_at: string | null }).deletion_completed_at,
      deletion_auth_purged_at: (existing as { deletion_auth_purged_at: string | null }).deletion_auth_purged_at,
    });
    if (verdict.kind === 'deleted') {
      try { await supabase.auth.signOut(); } catch (e) {
        console.error('[verify-magic-code] deleted-gate signOut failed:', e);
      }
      // Same cookie-clear pattern as the gate-deny branch above —
      // a partial signOut leaves the JWT chunks alive otherwise.
      try {
        const supabaseRef = (() => {
          try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').hostname.split('.')[0]; }
          catch { return ''; }
        })();
        if (supabaseRef) {
          const cookieJarForClear = await cookies();
          const base = `sb-${supabaseRef}-auth-token`;
          cookieJarForClear.delete(base);
          for (let i = 0; i < 5; i++) cookieJarForClear.delete(`${base}.${i}`);
        }
      } catch (e) {
        console.error('[verify-magic-code] deleted-gate cookie-clear failed:', e);
      }
      await writeAuditRow(service, { email, reason: 'deleted_account', ipTruncated, client });
      return genericOk();
    }
  }

  // Build the response. Web clients pick up the session via the
  // sb-*-auth-token cookies that verifyOtp() set through next/headers.
  // Native clients (ios, kids iOS) cannot read those cookies on a
  // cross-origin URLSession call — they receive the session in the
  // JSON body and install it into their local SDK directly.
  //
  // refresh_token is shipped only to adult iOS. Adult sessions must
  // outlive the app process (users expect to stay signed in across
  // launches), and the Swift SDK's setSession refreshes on its own
  // once it has both tokens. Kids parent sessions are intentionally
  // short-lived and in-memory only — they receive access_token and
  // re-prompt when it expires, so we don't ship a refresh token there.
  // The body shape is additive: web responses unchanged.
  const sessionForBody =
    client !== 'web' && data.session
      ? {
          access_token: data.session.access_token,
          refresh_token: client === 'ios' ? data.session.refresh_token : undefined,
          expires_at: data.session.expires_at ?? null,
          expires_in: data.session.expires_in ?? null,
          token_type: data.session.token_type ?? 'bearer',
        }
      : null;
  const response = NextResponse.json(
    sessionForBody ? { ok: true, session: sessionForBody } : { ok: true },
    { status: 200, headers: NO_STORE }
  );

  if (!existing) {
    // Re-check the beta gate. The OTP may have been issued during an
    // open-beta window or via a referral that has since been revoked.
    // If the gate fails, roll back the auth.users row and return the
    // generic OK — same privacy posture, no leak of why.
    //
    // App Store surfaces (ios + kids) bypass the gate at redemption for
    // the same reason send-magic-link bypasses it at issuance: neither
    // is part of the adult-web waitlist funnel — Apple review is the
    // access control. The auth.users row was created with
    // signup_source set to the originating client; runSignupBookkeeping
    // consumes it below.
    const cookieJar = await cookies();
    const refCookie = cookieJar.get(REF_COOKIE_NAME)?.value;
    const gate: GateResult = (client === 'kids' || client === 'ios')
      ? { allowed: true, viaOwnerLink: false, codeId: null }
      : await checkSignupGate(service, refCookie);
    if (!gate.allowed) {
      try {
        await service.auth.admin.deleteUser(user.id);
      } catch (e) {
        console.error('[verify-magic-code] gate-deny: deleteUser failed:', e);
      }
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.error('[verify-magic-code] gate-deny: signOut failed:', e);
      }
      // Explicitly clear the session cookies regardless of whether signOut
      // succeeded. Without this, a signOut error leaves the sb-*-auth-token
      // cookie alive for a deleted account. Supabase SSR splits large JWTs
      // across .0/.1/.2 chunks so we clear the base + first 5 chunk slots
      // (real-world JWT fits in ≤2; 5 is defensive).
      try {
        const supabaseRef = (() => {
          try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').hostname.split('.')[0]; }
          catch { return ''; }
        })();
        if (supabaseRef) {
          const cookieJarForClear = await cookies();
          const base = `sb-${supabaseRef}-auth-token`;
          cookieJarForClear.delete(base);
          for (let i = 0; i < 5; i++) cookieJarForClear.delete(`${base}.${i}`);
        }
      } catch (e) {
        console.error('[verify-magic-code] gate-deny: cookie-clear failed:', e);
      }
      await writeAuditRow(service, {
        email,
        reason: `gate_denied:${gate.reason || 'unknown'}`,
        ipTruncated,
        client,
      });
      return genericOk();
    }

    const provider = user.app_metadata?.provider || 'email';
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    // Prefer the surface stamp from user_metadata (set by send-magic-link
    // at createUser) so the funnel tag persists even if a future client
    // drops the request-body field. Fall back to request-body `client`
    // for older auth.users rows that pre-date this stamping.
    const signupSource: string =
      typeof meta.signup_source === 'string' && meta.signup_source
        ? meta.signup_source
        : client;
    await runSignupBookkeeping(service, user, provider, meta, request, response, { signupSource });
    await writeAuditRow(service, { email, reason: 'signup_complete', ipTruncated, client: signupSource });
  } else {
    await runReturningUserBookkeeping(service, user, existing, request);
    await writeAuditRow(service, { email, reason: 'signin_complete', ipTruncated, client });
  }

  return response;
}
