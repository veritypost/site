import { headers } from 'next/headers';

export async function getClientIp() {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim()
    || h.get('x-real-ip')
    || '127.0.0.1';
}

// DA-031 / F-018 / F-019 — the pre-fix implementation ran a SELECT
// count() followed by a separate INSERT, with a try/catch that
// returned `{ limited: false }` on any DB error. Two defects:
//
//   1. Non-atomic. N concurrent callers could all read count<max and
//      all insert, producing an effective limit of max * concurrency.
//   2. Fail-open. A transient Supabase hiccup silently disabled
//      rate limiting across login, signup, reset-password, signup,
//      email-change, resend-verification, resolve-username — every
//      brute-force-sensitive surface in the app.
//
// Migration 057 introduces a SECURITY DEFINER RPC `check_rate_limit`
// that performs the count+insert in one transaction, serialized on
// the key via pg_advisory_xact_lock. This helper delegates to that
// RPC and now fails CLOSED on any error. All callers today gate
// auth-sensitive work, so treating a DB error as "limited" is the
// safe default.
// 2026-04-17 — dev-mode fail-open guard. Production stays fail-closed as
// intended by the security hardening above; development falls back to
// "not limited" when the RPC isn't present (e.g., migration 057 unapplied
// against a local Supabase). Without this guard, local dev can't sign in
// at all until the migration queue lands. NODE_ENV is set to
// 'production' by Vercel on deploy and 'development' by `next dev`.
const DEV_FAIL_OPEN = process.env.NODE_ENV !== 'production';

export async function checkRateLimit(supabase, { key, max, windowSec }) {
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_key: key,
      p_max: max,
      p_window_sec: windowSec,
    });
    if (error) {
      if (DEV_FAIL_OPEN) {
        console.warn('[rateLimit] RPC error in dev, failing open:', error.message);
        return { limited: false, remaining: max, reason: 'dev_fail_open' };
      }
      console.error('[rateLimit] RPC error, failing closed:', error.message);
      return { limited: true, remaining: 0, reason: 'rpc_error' };
    }
    if (!data || typeof data !== 'object') {
      if (DEV_FAIL_OPEN) {
        console.warn('[rateLimit] malformed RPC response in dev, failing open');
        return { limited: false, remaining: max, reason: 'dev_fail_open' };
      }
      console.error('[rateLimit] malformed RPC response, failing closed');
      return { limited: true, remaining: 0, reason: 'malformed' };
    }
    return {
      limited: Boolean(data.limited),
      remaining: Number.isFinite(data.remaining) ? data.remaining : 0,
    };
  } catch (err) {
    if (DEV_FAIL_OPEN) {
      console.warn('[rateLimit] threw in dev, failing open:', err?.message || err);
      return { limited: false, remaining: max, reason: 'dev_fail_open' };
    }
    console.error('[rateLimit] threw, failing closed:', err?.message || err);
    return { limited: true, remaining: 0, reason: 'threw' };
  }
}
