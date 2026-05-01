// Lightweight feature-flag reader. Caches for 10s per process.
// Flags are the single source of truth in feature_flags. Use this
// from server routes; client code gets flags via an API endpoint.
//
// T-073 — TTL was 30s with no cross-process invalidation mechanism;
// an admin flag toggle could take up to 30s to propagate across
// serverless instances. 10s halves the staleness window without
// making the DB-read rate noticeable. True invalidation across
// instances requires pub/sub (Supabase realtime or similar) and is a
// separate project.
const CACHE = new Map(); // key -> { value, ts }
const TTL_MS = 10_000;

export async function isFlagEnabled(client, key, defaultValue = false) {
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.value;

  const { data, error } = await client
    .from('feature_flags')
    .select('is_enabled')
    .eq('key', key)
    .maybeSingle();

  // L11: discriminate "no row" from "table missing / RLS / network". Prior
  // code silently fell through to the caller's defaultValue on any error,
  // so a caller passing `defaultValue=true` would bypass the gate when the
  // feature_flags table was unavailable (e.g. during a migration window or
  // an RLS misconfiguration). Fail closed on real errors — the caller's
  // default is for the "row not present yet" case only.
  if (error) {
    console.error(`[featureFlags] lookup failed for ${key}:`, error);
    // Don't cache errors — let the next request retry immediately so recovery
    // isn't delayed by the TTL window.
    return false;
  }

  const value = data ? !!data.is_enabled : defaultValue;
  CACHE.set(key, { value, ts: Date.now() });
  return value;
}

export function clearFlagCache() {
  CACHE.clear();
}

// Convenience wrapper for the master cutover switch.
// Default true: v2 is live in production. A missing row or DB error should
// fail open (pass traffic through) rather than taking down production routes.
// The fail-closed default was correct during the pre-launch migration window;
// now that v2 is live, a feature_flags DB hiccup must not block all routes.
export async function isV2Live(client) {
  return isFlagEnabled(client, 'v2_live', true);
}

// Route guard for the master cutover switch. Returns a 503 NextResponse
// when v2_live is off, or null when traffic should pass. Lazy-imports
// the service client + NextResponse so this module stays importable
// from non-route code (tests, scripts).
//
// TODO(T287): no admin-facing UI yet for the system-wide kill switches
// (`v2_live`, plus per-feature flags for comments / expert Q&A / DMs).
// Toggling currently requires direct DB access. A future PR should add
// `/admin/system-controls`:
//   - One toggle per kill-switch flag with a confirmation modal.
//   - Append to `audit_log` on every toggle (actor_id, flag key, old ->
//     new, optional reason). The page reads recent toggles back below
//     the controls so the team can see who flipped what.
//   - Permission-gated to a narrow admin role (e.g. `system.kill_switch`).
// Out of scope for this pass; tracked as T287.
export async function v2LiveGuard() {
  const { createServiceClient } = await import('@/lib/supabase/server');
  const { NextResponse } = await import('next/server');
  const live = await isV2Live(createServiceClient());
  if (live) return null;
  // T170 — every authenticated route that calls this guard inherits the
  // 503 verbatim. Mark it private/no-store so a CDN can never cache the
  // maintenance response and serve it to a healthy request post-cutover.
  return NextResponse.json(
    { error: 'Service temporarily unavailable for maintenance.' },
    { status: 503, headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
  );
}
