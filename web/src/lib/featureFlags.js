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
    const safe = false;
    CACHE.set(key, { value: safe, ts: Date.now() });
    return safe;
  }

  const value = data ? !!data.is_enabled : defaultValue;
  CACHE.set(key, { value, ts: Date.now() });
  return value;
}

export function clearFlagCache() {
  CACHE.clear();
}

// Convenience wrapper for the master cutover switch.
// Fail-closed: if the flag row is missing or the DB read fails, treat
// v2 as NOT live so the guard returns 503 rather than silently opening.
export async function isV2Live(client) {
  return isFlagEnabled(client, 'v2_live', false);
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
  return NextResponse.json(
    { error: 'Service temporarily unavailable for maintenance.' },
    { status: 503 }
  );
}
