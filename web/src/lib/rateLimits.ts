// [S3-A129] Centralized rate-limit policy.
//
// Every API route's rate-limit window/cap pair lives here as a named
// constant. Direct literals (`windowSec: 3600`, `max: 5`) inside route
// handlers are forbidden — drift across 40+ endpoints is the exact
// failure mode this lib exists to prevent.
//
// Naming convention: <DOMAIN>_<ACTION>_<SCOPE>. Scope is one of
// PER_IP, PER_EMAIL, PER_SESSION, PER_USER, PER_TOKEN. Always explicit.
//
// Adding a new key: extend `RATE_LIMITS` here, then import in the route.
// Do not inline a literal even for a one-off — the next agent will copy
// the pattern and the drift starts again.
//
// Cross-session edits: S4/S5/S6 may ADD new keys to this record. They
// MUST NOT change the `RateLimitPolicy` field shape, the
// `getRateLimitPolicy` helper, or any existing key's value. Any
// cross-session write commit-tags `[S3-shared]` regardless of which
// session ships it. Shape owner: S3 (this file).
//
// Field shape (`max` + `windowSec`) intentionally matches the existing
// `checkRateLimit({ key, policyKey, max, windowSec })` call signature
// in `web/src/lib/rateLimit.js` so a policy spreads directly:
//
//   const policy = getRateLimitPolicy('AUTH_MAGIC_LINK_SEND_PER_EMAIL');
//   const r = await checkRateLimit(supabase, { key, policyKey, ...policy });
//
// The session manual's draft used `maxAttempts` and named the helper
// `getRateLimit`; both collided with current code. Field renamed to
// `max` for spread compatibility, helper renamed to
// `getRateLimitPolicy` to avoid colliding with the
// DB-backed `getRateLimit` exported from `rateLimit.js`.

export interface RateLimitPolicy {
  /** Window in seconds. */
  windowSec: number;
  /** Max attempts within the window. */
  max: number;
}

export const RATE_LIMITS = {
  // === Auth ===

  // Magic-link send. Per email, 3/hour. Returning generic body always
  // (Q2b oracle-collapse), so the cap is a soft denial — message stays
  // identical, internal log captures the cap event.
  AUTH_MAGIC_LINK_SEND_PER_EMAIL: { windowSec: 3600, max: 3 },

  // Pick-username availability check. Per session, 30/minute. Anonymous
  // calls 401 — the cap only applies to authed sessions in the
  // post-signin pick-username flow. Abusers spinning fresh sessions hit
  // the per-IP signup cap first.
  AUTH_USERNAME_CHECK_PER_SESSION: { windowSec: 60, max: 30 },

  // Per-IP signup submit. Combined with per-email, makes enumeration
  // uneconomic. 5/hour is loose enough for legitimate retry, tight
  // enough to prevent automated probing.
  AUTH_SIGNUP_SUBMIT_PER_IP: { windowSec: 3600, max: 5 },

  // Graduation claim — per-IP cap. 10/hour is permissive enough for a
  // kid retrying on a flaky connection.
  AUTH_GRADUATE_CLAIM_IP: { windowSec: 3600, max: 10 },

  // Graduation claim — per-token cap. Prevents focused brute force on
  // a single guessed token. 5/min is tight; a real kid retrying within
  // a minute is rare. Key on SHA-256(token), never the raw token.
  AUTH_GRADUATE_CLAIM_TOKEN: { windowSec: 60, max: 5 },

  // Beta access-request intake. Per IP cap is loose enough for a normal
  // visitor retrying on a flaky connection but tight enough that one IP
  // can't burst-flood the queue. Per email cap is 1/day so a single
  // inbox can't be used as a battering ram against the admin queue.
  ACCESS_REQUEST_SUBMIT_PER_IP: { windowSec: 3600, max: 5 },
  ACCESS_REQUEST_SUBMIT_PER_EMAIL: { windowSec: 86400, max: 1 },

  // === Comments / votes (S5 imports — declared here for shared config) ===

  COMMENT_POST_PER_USER: { windowSec: 60, max: 10 },
  COMMENT_VOTE_PER_USER: { windowSec: 60, max: 30 },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitKey = keyof typeof RATE_LIMITS;

/**
 * Read a policy by key with a fail-loud miss. Use this in route
 * handlers instead of `RATE_LIMITS[key]` so a typo throws at boot
 * rather than silently disabling the rate limit.
 *
 * Named `getRateLimitPolicy` (not `getRateLimit`) to avoid colliding
 * with the DB-backed `getRateLimit` from `lib/rateLimit.js`.
 */
export function getRateLimitPolicy(key: RateLimitKey): RateLimitPolicy {
  const policy = RATE_LIMITS[key];
  if (!policy) {
    throw new Error(`RATE_LIMITS missing key: ${String(key)}`);
  }
  return policy;
}
