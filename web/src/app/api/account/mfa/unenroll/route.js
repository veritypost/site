import { NextResponse } from 'next/server';
import { requireAuth, resolveAuthedClient } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

// POST /api/account/mfa/unenroll — remove a TOTP factor the caller owns.
//
// Closes the audit-log gap left by Session 5. Prior to this route, both the
// web MFACard and iOS SettingsView called `supabase.auth.mfa.unenroll(...)`
// directly against GoTrue, which bypassed our `audit_log` table — the user
// could disable 2FA with zero forensic trail on our side. This route is the
// single funnel for that destructive action and writes a `mfa.unenroll` row
// for every successful call.
//
// Why POST, not DELETE:
//   - Supabase's unenroll is logically a state-change RPC, not a resource
//     deletion (factors are GoTrue-managed; we don't own a row to delete).
//   - Sidesteps DELETE cache semantics for clients that proxy through CDNs
//     or service workers.
//
// Why we resolve a user-scoped client ourselves (not just `requireAuth()`):
//   - The Supabase Node SDK exposes `auth.mfa.unenroll` on a *user-scoped*
//     client. The user must consent to remove their own factor — service-role
//     bypasses GoTrue's identity check and would let any caller with the
//     service key unenroll any user. We do the unenroll on the same authed
//     client (cookie or bearer) that we use for requireAuth, so GoTrue sees
//     the user's own session and authorizes the unenroll.
//
// iOS bearer-token support: required. iOS clients authenticate via
// `Authorization: Bearer <access_token>`; `@supabase/ssr` only reads cookies.
// `resolveAuthedClient(undefined)` (from lib/auth.js) checks for a bearer
// header, verifies its signature locally, and builds a token-scoped client;
// falls back to the cookie-scoped client when no bearer is present. This is
// the same helper requireAuth uses internally — we call it directly here so
// the user-scoped client exists BEFORE requireAuth runs, since the SDK's
// `auth.mfa.unenroll` call below must inherit the same authed session.

export async function POST(request) {
  let supabase;
  try {
    supabase = await resolveAuthedClient(undefined);
  } catch (err) {
    return NextResponse.json(
      { error: 'Unauthenticated' },
      { status: err?.status ?? 401, headers: NO_STORE }
    );
  }

  let user;
  try {
    user = await requireAuth(supabase);
  } catch (err) {
    return NextResponse.json(
      { error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' },
      { status: err?.status ?? 401, headers: NO_STORE }
    );
  }

  const body = await request.json().catch(() => ({}));
  const factorId = typeof body?.factorId === 'string' ? body.factorId.trim() : '';
  if (!factorId) {
    return NextResponse.json(
      { error: 'factorId required.' },
      { status: 400, headers: NO_STORE }
    );
  }

  // Rate limit: 5/hour per user. Same posture as /api/auth/verify-password —
  // authed, destructive, no legitimate reason to call this more than a few
  // times in a session.
  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `account.mfa.unenroll:${user.id}`,
    policyKey: 'account_mfa_unenroll',
    max: 5,
    windowSec: 3600,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': '3600', ...NO_STORE } }
    );
  }

  // Run the unenroll on the user-scoped client so GoTrue sees the user's
  // own session. Service-role would skip GoTrue's identity check.
  const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId });
  if (unenrollError) {
    // Sanitize the SDK message — don't echo internal GoTrue error text back
    // to the client. Common failure modes: factor doesn't exist (404-ish),
    // factor belongs to a different user (403-ish), GoTrue rate limit (429).
    const status = unenrollError.status || 400;
    const safeStatus = status >= 400 && status < 500 ? status : 400;
    return NextResponse.json(
      { error: 'Could not remove two-factor authentication.' },
      { status: safeStatus, headers: NO_STORE }
    );
  }

  // Audit-log self-action. Mirrors the session.revoke_one / session.revoke_all /
  // block.remove pattern (best-effort insert via service client; never fail
  // the request on audit error). Session 5 follow-up — destructive action
  // audit trail.
  try {
    await service.from('audit_log').insert({
      actor_id: user.id,
      action: 'mfa.unenroll',
      target_type: 'factor',
      target_id: factorId,
    });
  } catch (auditErr) {
    console.error('[account.mfa.unenroll] audit_log insert failed:', auditErr);
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
