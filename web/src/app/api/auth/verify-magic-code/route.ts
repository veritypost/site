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
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { getRateLimitPolicy } from '@/lib/rateLimits';
import { isAsciiEmail } from '@/lib/emailNormalize';
import { truncateIpV4 } from '@/lib/apiErrors';
import { checkSignupGate } from '@/lib/betaGate';
import { REF_COOKIE_NAME } from '@/lib/referralCookie';
import { cookies } from 'next/headers';
import {
  runSignupBookkeeping,
  runReturningUserBookkeeping,
} from '@/lib/auth/postLoginBookkeeping';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

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
  }: { email: string; reason: string; ipTruncated: string | null }
) {
  try {
    await service.from('audit_log').insert({
      actor_id: null,
      action: 'auth:verify_magic_code',
      target_type: 'email',
      target_id: null,
      metadata: { email_lc: email, reason, ip_24: ipTruncated },
    });
  } catch (err) {
    console.error('[verify-magic-code] audit_log insert failed:', (err as Error)?.message);
  }
}

export async function POST(request: NextRequest) {
  let payload: { email?: unknown; token?: unknown } | null = null;
  try {
    payload = await request.json();
  } catch {
    return malformed();
  }

  const rawEmail = typeof payload?.email === 'string' ? payload.email.trim() : '';
  const rawToken = typeof payload?.token === 'string' ? payload.token.trim() : '';

  if (
    !rawEmail ||
    rawEmail.length > 254 ||
    !rawEmail.includes('@') ||
    !isAsciiEmail(rawEmail)
  ) {
    return malformed();
  }
  if (!/^\d{6}$/.test(rawToken)) {
    return malformed();
  }

  const email = rawEmail.toLowerCase();
  const service = createServiceClient();
  const rawIp = await getClientIp();
  const ipTruncated = truncateIpV4(rawIp);

  // Per-email attempts cap. Increments on every attempt so brute-forcing
  // a 6-digit OTP code (10^6 space) over 10 attempts/hr is uneconomic.
  const emailPolicy = getRateLimitPolicy('AUTH_VERIFY_MAGIC_CODE_PER_EMAIL');
  const emailHit = await checkRateLimit(service, {
    key: `verify_magic_code:email:${email}`,
    policyKey: 'auth_verify_magic_code_per_email',
    ...emailPolicy,
  });
  if (emailHit.limited) {
    await writeAuditRow(service, { email, reason: 'rate_limited_email', ipTruncated });
    return genericOk();
  }

  // Verify the OTP. Supabase resolves type='email' against OTP codes sent
  // via signInWithOtp. The Supabase dashboard email template must use
  // {{ .Token }} (6-digit code) rather than {{ .ConfirmationURL }}.
  const supabase = createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: rawToken,
    type: 'email',
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
      reason: `otp_failed:${(error?.message || 'no_user').slice(0, 80)}`,
      ipTruncated,
    });
    return genericOk();
  }

  const user = data.user;

  const { data: existing } = await service
    .from('users')
    .select('id, username, onboarding_completed_at, email_verified')
    .eq('id', user.id)
    .maybeSingle();

  // Build the response that will carry the session cookie set by verifyOtp
  // (cookies() writes go through Next.js headers, not NextResponse.cookies,
  // so any response object returned here includes the session automatically).
  const response = NextResponse.json({ ok: true }, { status: 200, headers: NO_STORE });

  if (!existing) {
    // Re-check the beta gate. The OTP may have been issued during an
    // open-beta window or via a referral that has since been revoked.
    // If the gate fails, roll back the auth.users row and return the
    // generic OK — same privacy posture, no leak of why.
    const cookieJar = await cookies();
    const refCookie = cookieJar.get(REF_COOKIE_NAME)?.value;
    const gate = await checkSignupGate(service, refCookie);
    if (!gate.allowed) {
      try {
        await service.auth.admin.deleteUser(user.id);
      } catch (e) {
        console.error('[verify-magic-code] gate-deny: deleteUser failed:', e);
      }
      await writeAuditRow(service, {
        email,
        reason: `gate_denied:${gate.reason || 'unknown'}`,
        ipTruncated,
      });
      return genericOk();
    }

    const provider = user.app_metadata?.provider || 'email';
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    await runSignupBookkeeping(service, user, provider, meta, request, response);
    await writeAuditRow(service, { email, reason: 'signup_complete', ipTruncated });
  } else {
    await runReturningUserBookkeeping(service, user, existing, request);
    await writeAuditRow(service, { email, reason: 'signin_complete', ipTruncated });
  }

  return response;
}
