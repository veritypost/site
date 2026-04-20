// Lightweight feature-flag reader. Caches for 30s per process.
// Flags are the single source of truth in feature_flags. Use this
// from server routes; client code gets flags via an API endpoint.

const CACHE = new Map();     // key -> { value, ts }
const TTL_MS = 30_000;

export async function isFlagEnabled(client, key, defaultValue = false) {
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.value;

  const { data } = await client
    .from('feature_flags')
    .select('is_enabled')
    .eq('key', key)
    .maybeSingle();
  const value = data ? !!data.is_enabled : defaultValue;
  CACHE.set(key, { value, ts: Date.now() });
  return value;
}

export function clearFlagCache() { CACHE.clear(); }

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
