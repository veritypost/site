import { headers } from 'next/headers';

export async function getClientIp() {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || '127.0.0.1';
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
// at all until the migration queue lands.
//
// M-15 — widen the prod gate so preview deploys also fail-closed.
// VERCEL_ENV is set by the Vercel runtime to 'production' | 'preview' |
// 'development'. NODE_ENV is set to 'production' on Vercel deploys
// (both prod and preview) and 'development' by `next dev`. Treating
// any VERCEL_ENV value other than 'development' as production-equivalent
// closes the prior gap where a preview environment without NODE_ENV
// set to production could run unlimited.
const IS_PROD =
  process.env.VERCEL_ENV === 'production' ||
  process.env.VERCEL_ENV === 'preview' ||
  process.env.NODE_ENV === 'production';
const DEV_FAIL_OPEN = !IS_PROD;

// T-003 — DB-backed rate-limit policy lookup with 60s in-memory cache.
// Routes name a `policyKey` + supply code defaults; a matching row in
// `rate_limits` (by `key`) overrides the defaults at runtime. When the
// table has no row for the key (bootstrap) or lookup errors, we fall
// back to the code defaults so the route keeps working — this was the
// whole point of landing the helper before the seed SQL runs.
//
// Cache is per-process + 60s TTL. An `admin/system` edit takes effect
// within one TTL window.
const POLICY_CACHE = new Map(); // policyKey -> { max, windowSec, scope, isActive, expiresAt }
const POLICY_TTL_MS = 60_000;

export async function getRateLimit(supabase, policyKey, fallback) {
  const now = Date.now();
  const cached = POLICY_CACHE.get(policyKey);
  if (cached && cached.expiresAt > now) {
    if (cached.isActive === false)
      return { max: Infinity, windowSec: fallback.windowSec, disabled: true };
    return { max: cached.max, windowSec: cached.windowSec };
  }

  try {
    const { data, error } = await supabase
      .from('rate_limits')
      .select('max_requests, window_seconds, scope, is_active')
      .eq('key', policyKey)
      .maybeSingle();
    if (error) {
      console.warn('[rateLimit.getRateLimit] lookup error, using fallback:', error.message);
      return fallback;
    }
    if (!data) {
      // No row — cache the fallback so we don't hammer the DB until the seed lands.
      POLICY_CACHE.set(policyKey, {
        max: fallback.max,
        windowSec: fallback.windowSec,
        scope: null,
        isActive: true,
        expiresAt: now + POLICY_TTL_MS,
      });
      return fallback;
    }
    POLICY_CACHE.set(policyKey, {
      max: data.max_requests,
      windowSec: data.window_seconds,
      scope: data.scope,
      isActive: data.is_active,
      expiresAt: now + POLICY_TTL_MS,
    });
    if (data.is_active === false) {
      return { max: Infinity, windowSec: fallback.windowSec, disabled: true };
    }
    return { max: data.max_requests, windowSec: data.window_seconds };
  } catch (err) {
    console.warn('[rateLimit.getRateLimit] threw, using fallback:', err?.message || err);
    return fallback;
  }
}

export async function checkRateLimit(supabase, { key, policyKey, max, windowSec }) {
  // T-003 — when `policyKey` is supplied, consult `rate_limits` for a
  // DB override of the code-supplied `max`/`windowSec`. Cached per
  // process for 60s. If the row is missing or errored we fall through
  // to the code defaults, so routes keep working before the seed SQL
  // lands. is_active=false disables the limit entirely for that policy.
  let effectiveMax = max;
  let effectiveWindow = windowSec;
  if (policyKey) {
    const policy = await getRateLimit(supabase, policyKey, { max, windowSec });
    if (policy.disabled) return { limited: false, remaining: Infinity, reason: 'policy_disabled' };
    effectiveMax = policy.max;
    effectiveWindow = policy.windowSec;
  }
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_key: key,
      p_max: effectiveMax,
      p_window_sec: effectiveWindow,
    });
    if (error) {
      if (DEV_FAIL_OPEN) {
        console.warn('[rateLimit] RPC error in dev, failing open:', error.message);
        return { limited: false, remaining: effectiveMax, reason: 'dev_fail_open' };
      }
      console.error('[rateLimit] RPC error, failing closed:', error.message);
      return { limited: true, remaining: 0, reason: 'rpc_error' };
    }
    if (!data || typeof data !== 'object') {
      if (DEV_FAIL_OPEN) {
        console.warn('[rateLimit] malformed RPC response in dev, failing open');
        return { limited: false, remaining: effectiveMax, reason: 'dev_fail_open' };
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
      return { limited: false, remaining: effectiveMax, reason: 'dev_fail_open' };
    }
    console.error('[rateLimit] threw, failing closed:', err?.message || err);
    return { limited: true, remaining: 0, reason: 'threw' };
  }
}
