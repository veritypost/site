// @feature-verified system_auth 2026-04-23
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createEphemeralClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

// Option A item 6 — verify the caller's current password without rotating
// their session cookie. Replaces direct supabase.auth.signInWithPassword
// calls from two surfaces:
//   - profile/settings PasswordCard (verify-then-update-password flow)
//   - api/kids/reset-pin (parent-password gate before kid PIN reset)
//
// Both prior callsites used the cookie-scoped client, which means every
// password probe rotated the user's session token. A stolen session could
// brute-force the password (no per-user rate limit, no per-email lockout
// counter, no audit trail). Once the password changed, the attacker locked
// the legitimate owner out.
//
// Defense:
//   1. requireAuth — caller must be signed in. Endpoint is not for
//      unauthenticated login probes (that's /api/auth/login-failed).
//   2. Per-user rate limit (5/hour). Authed user, so per-user IS the
//      enforcement key — per-IP would punish family/shared-network users.
//   3. Ephemeral Supabase client (no cookie persist, no token refresh)
//      runs the signInWithPassword probe. The caller's session cookie is
//      never touched.
//   4. On wrong password, calls record_failed_login_by_email so failed
//      verifies count toward the same 5-strike account lockout that the
//      login flow uses. One counter for "is this email being attacked,"
//      shared across login + settings.
//   5. Constant 401 response on wrong password — no enumeration of
//      reasons (taken / locked / banned / wrong).
//
// iOS bearer-token support: not currently needed (iOS adult app does not
// have a password-change UI; kid app uses pair-code flow, not password).
// requireAuth IS bearer-aware so adding iOS callers later is a one-line
// change client-side. No endpoint plumbing required.

export async function POST(request) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  if (!user.email) {
    return NextResponse.json({ error: 'No email on account' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const password = typeof body?.password === 'string' ? body.password : null;
  if (!password) {
    return NextResponse.json({ error: 'Password required' }, { status: 400 });
  }

  const service = createServiceClient();
  const hit = await checkRateLimit(service, {
    key: `verify_password:user:${user.id}`,
    policyKey: 'verify_password',
    max: 5,
    windowSec: 3600,
  });
  if (hit.limited) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(hit.windowSec ?? 3600) } }
    );
  }

  // Ephemeral client — no cookie persistence, no autorefresh. The probe
  // succeeds or fails based on the password alone; the caller's session
  // cookie is never written to or rotated.
  const ephemeral = createEphemeralClient();
  const { data: probe, error: probeError } = await ephemeral.auth.signInWithPassword({
    email: user.email,
    password,
  });

  if (probeError || !probe?.user) {
    // Wrong password. Count it toward the 5-strike account lockout shared
    // with the regular login flow. Same RPC, same counter, same lockout
    // window — login-failed and verify-password both feed the same gate.
    try {
      await service.rpc('record_failed_login_by_email', { p_email: user.email });
    } catch (err) {
      console.error(
        '[auth.verify-password] record_failed_login_by_email failed:',
        err?.message || err
      );
    }
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  // Tear down the ephemeral session immediately. Best-effort — the
  // ephemeral client never wrote a cookie, but signOut releases the
  // server-side session record.
  try {
    await ephemeral.auth.signOut();
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ ok: true });
}
