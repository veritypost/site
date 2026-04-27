// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-23
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

// UJ-702 + UJ-722 — email-change initiation. The user's
// public.users.email_verified flag flips to false when they request a
// change (so verified-only features lock immediately) and flips back to
// true when the new address is confirmed. The post-confirmation flip
// happens automatically via the on_auth_user_updated DB trigger reading
// auth.users.email_confirmed_at.
//
// Prior version (Pass 17) was structurally broken in two ways:
//   1. Flipped email_verified=false BEFORE attempting the auth call,
//      then swallowed the auth error in a bare try/catch. If the auth
//      call failed (mistyped email, taken email, transient network),
//      the user was left in a permanent unverified state with no email
//      sent — the route returned 200 and the client showed "check your
//      inbox" while no email was ever in flight.
//   2. Used auth.resend({type:'email_change', email}) which is the
//      *re-send* API and assumes a pending email-change already exists.
//      Standard Supabase pattern is auth.updateUser({email}) which
//      atomically (a) records the pending change in auth.users and (b)
//      triggers the confirmation email to the new address. The client
//      at verify-email/page.tsx was actually doing this work in a second
//      call after the server endpoint returned, racing the flag flip.
//
// Current shape (4-agent review 2026-04-23):
//   1. Validate email shape (stricter than the old `.includes('@')`).
//   2. No-op if the new email matches the current email.
//   3. Per-user + IP rate limit (3/hour, unchanged).
//   4. Call auth.updateUser({email}) FIRST. Supabase queues the pending
//      change and sends the confirmation. On failure, return generic
//      400 with no leak of "email taken" vs other reasons.
//   5. Only on success, flip email_verified=false. If the flip fails
//      after the auth call succeeded, log + return 200 anyway — the
//      confirmation email is already in flight and the trigger will
//      land the flip when the user clicks the link.
//
// Client (verify-email/page.tsx) no longer calls auth.updateUser
// itself; the server is now the single source of truth for the auth
// state change.

// TODO(T177) — sensitive-action recent-auth gate.
// Under magic-link auth, the natural recency token is the most recent
// signInWithOtp completion timestamp (Supabase exposes session.last_sign_in_at).
// For high-stakes actions (email change, billing cancel, account deletion),
// reject if `now() - last_sign_in_at > 15min` and require a fresh
// magic-link round-trip via /api/auth/re-verify (route owed).
// Defer until AUTH-MIGRATION ships; it would block on a magic-link
// re-verify endpoint that doesn't exist yet.

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { email } = await request.json().catch(() => ({}));
  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'Valid new email required' }, { status: 400 });
  }

  const normalized = email.trim().toLowerCase();

  // Same-email no-op. Avoids consuming a rate-limit slot and avoids
  // round-tripping Supabase for nothing.
  if (user.email && normalized === user.email.toLowerCase()) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const supabase = await createClient();
  const ip = await getClientIp();
  const hit = await checkRateLimit(supabase, {
    key: `email_change:user:${user.id}:${ip}`,
    policyKey: 'email_change',
    max: 3,
    windowSec: 3600,
  });
  if (hit.limited) {
    return NextResponse.json(
      { error: 'Too many email-change attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': '3600' } }
    );
  }

  // Step 1: kick off the email change in Supabase Auth FIRST. This
  // atomically (a) records the pending email on auth.users and (b)
  // triggers the confirmation email to the new address. If this throws
  // or returns an error, we have not mutated anything in our DB — the
  // user keeps their current verified state and learns the request
  // failed.
  const { error: authErr } = await supabase.auth.updateUser({ email: normalized });
  if (authErr) {
    // Generic message: do not leak whether the email is taken vs
    // malformed vs Supabase rate-limited. Real reason in server logs.
    console.error('[auth.email-change] auth.updateUser failed:', authErr.message || authErr);
    return NextResponse.json(
      { error: 'Could not initiate email change. Please try again.' },
      { status: 400 }
    );
  }

  // Step 2: the auth change is in flight; flip our local flag so the
  // user immediately loses verified-only features until the new address
  // is confirmed. If this write fails after the auth call succeeded,
  // the confirmation email is already in the user's inbox and the
  // on_auth_user_updated DB trigger will set email_verified=true once
  // they click the link — so don't fail the request, just log.
  const service = createServiceClient();
  // T306 + T307 — flip the local verified state AND clear two more columns
  // that previously drifted stale across an email-change:
  //   email_verified=false   keeps verified-only features locked
  //   email                  previously only updated by the on_auth_user_updated
  //                           trigger; fall-through cases left public.users.email
  //                           stale until the trigger fired
  //   verify_locked_at=null  a previously locked user (failed-verify lockout)
  //                           changing email gets a clean slate at the new address
  //
  // The third half of T307 — re-stamping `metadata.terms_accepted_at` so the
  // user re-acknowledges ToS at the new identity — is deferred to T362
  // because a plain `metadata: {...}` PATCH would clobber the other JSONB
  // keys (age_confirmed_at, terms_version, etc.). Needs an `update_metadata`
  // RPC with `metadata || $1` semantics to merge cleanly.
  const { error: updErr } = await service
    .from('users')
    .update({
      email_verified: false,
      email: normalized,
      verify_locked_at: null,
    })
    .eq('id', user.id);
  if (updErr) {
    console.error('[auth.email-change] users state flip failed:', updErr.message || updErr);
  } else {
    // T306 — bump perms_version so the 21 `requires_verified=true` perms
    // re-evaluate to `granted=false` on the user's next request. Without
    // this, the client perms cache keeps granting verified-only features
    // until next navigation. Best-effort: a perms-cache lag is the worst
    // case if this rpc fails, not a security regression (server-side
    // requirePermission re-checks every request).
    const { error: bumpErr } = await service.rpc('bump_user_perms_version', {
      p_user_id: user.id,
    });
    if (bumpErr) {
      console.error(
        '[auth.email-change] bump_user_perms_version failed:',
        bumpErr.message || bumpErr
      );
    }
  }

  // Ext-M2 — audit the email-change initiation. Only the SUCCESS path
  // is audited (auth.updateUser already returned ok). Failure paths
  // earlier in the function never mutated anything, so no audit needed.
  // Best-effort: don't fail the request if audit insert fails.
  try {
    await service.from('audit_log').insert({
      actor_id: user.id,
      action: 'auth:email_change_initiated',
      target_type: 'user',
      target_id: user.id,
      metadata: {
        old_email_hash: user.email
          ? Buffer.from(user.email.toLowerCase()).toString('base64').slice(0, 16)
          : null,
        new_email_hash: Buffer.from(normalized).toString('base64').slice(0, 16),
        ip,
      },
    });
  } catch (e) {
    console.error('[auth.email-change] audit_log insert failed:', e);
  }

  return NextResponse.json({ ok: true });
}
