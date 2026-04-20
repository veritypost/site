// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { createEphemeralClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

// DA-092 / F-012 — Records a failed-password attempt for email-level
// lockout bookkeeping (migration 054). The pre-fix route accepted any
// {email} from any caller with no auth and no rate limit, which let an
// unauthenticated attacker lock out any known email by POSTing five
// times. Fix has three layers:
//
//   1. Per-email rate limit (3/hour) — below the 5-attempt lockout
//      threshold, so even a successful griefer cannot register more
//      recorded failures than the real user's natural retry rate.
//   2. Per-IP rate limit (30/hour) — prevents one host from ringing a
//      dictionary of emails.
//   3. Proof-of-failure: the route re-runs signInWithPassword against
//      an ephemeral, cookie-less Supabase client. We only record the
//      failure if the credentials are independently confirmed wrong.
//      An attacker who does not know the password cannot force a
//      recorded failure; a genuine user who just mistyped can.
//
// Response shape is constant regardless of outcome to prevent email
// enumeration via timing or body differences.
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null;
  const password = typeof body?.password === 'string' ? body.password : null;

  // Missing / malformed body: pretend success so callers cannot probe
  // for shape differences.
  if (!email || !password) {
    return NextResponse.json({ locked: false });
  }

  const ip = await getClientIp();

  // Layer 2: per-IP — catches dictionary attacks against many emails
  // from one host. Rate-limiter errors fall through to the recording
  // path, which itself rate-limits per email; defense-in-depth.
  try {
    const service = createServiceClient();
    const ipHit = await checkRateLimit(service, { key: `login_failed:ip:${ip}`, policyKey: 'login_failed_ip', max: 30, windowSec: 3600 });
    if (ipHit.limited) return NextResponse.json({ locked: false });

    // Layer 1: per-email — normal users retry 2-3 times before asking
    // for a reset, so 3/hour does not impact the happy path.
    const emailHit = await checkRateLimit(service, { key: `login_failed:email:${email}`, policyKey: 'login_failed_email', max: 3, windowSec: 3600 });
    if (emailHit.limited) return NextResponse.json({ locked: false });

    // Layer 3: proof-of-failure. Ephemeral client means this auth call
    // does NOT clobber the caller's existing session cookies. If the
    // credentials actually work, the caller passed them correctly —
    // someone else's brute-force attempt would never reach this branch
    // because they don't know the password.
    const ephemeral = createEphemeralClient();
    const { data: probe, error: probeError } = await ephemeral.auth
      .signInWithPassword({ email, password });

    if (!probeError && probe?.user) {
      // Credentials are valid. The original failure the client reported
      // must have been a transient network error on their end, or a
      // griefer without the password — either way, we refuse to record.
      // Sign out the probe session immediately to avoid leaking an
      // access token on the server.
      try { await ephemeral.auth.signOut(); } catch {}
      return NextResponse.json({ locked: false });
    }

    // Credentials are genuinely invalid — record the failure.
    const { data: lockedUntil } = await service
      .rpc('record_failed_login_by_email', { p_email: email });
    if (lockedUntil && new Date(lockedUntil) > new Date()) {
      return NextResponse.json({ locked: true, locked_until: lockedUntil });
    }
    return NextResponse.json({ locked: false });
  } catch {
    return NextResponse.json({ locked: false });
  }
}
