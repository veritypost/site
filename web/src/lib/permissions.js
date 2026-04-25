'use client';

// ============================================================
// Permissions client — wraps the DB-backed resolver so every
// gate check in the app goes through one place.
//
// Two cache paths live here side-by-side during the Wave 1→2
// migration:
//
//   OLD (section-scoped, via get_my_capabilities):
//     getCapabilities(section), getCapability(key)
//     still used by all existing callers.
//
//   NEW (full resolver, via compute_effective_perms):
//     refreshAllPermissions(), hasPermission(key), getPermission(key)
//     Wave 2 will migrate call sites onto this path.
//
// Version polling via my_perms_version() now invalidates BOTH
// caches on bump.
//
// Exposes:
//   getCapabilities(section)   — section cache (legacy path)
//   hasPermission(key)         — boolean; prefers the full cache, falls back to sections
//   getCapability(key)         — section-cache row for `key` if present, else null
//   getPermission(key)         — full-cache row for `key` { granted, granted_via, source_detail, deny_mode, lock_message }
//   refreshAllPermissions()    — fetch compute_effective_perms into the full cache
//   refreshIfStale()           — checks my_perms_version(), refreshes on bump
//   invalidate()               — clears both caches (call on auth change / logout)
// ============================================================

import { createClient } from './supabase/client';
import { SECTIONS, DENY_MODE, LOCK_REASON } from './permissionKeys';

const sectionCache = new Map(); // section -> { rows, fetchedAt, version }
let allPermsCache = null; // Map<permission_key, row> — null means "never loaded"
let _allPermsFetchedAt = 0;
let allPermsInflight = null;
// Ext-C3 — sentinel `-1` so the first DB version (always >= 0) compares
// non-equal and triggers refresh. The previous `0` initial would have
// matched a brand-new user's actual version 0 and skipped the first
// refresh — theoretical edge but real per the audit.
let versionState = { user_version: -1, global_version: -1, checkedAt: 0 };
let inflight = new Map(); // section -> Promise (dedupe concurrent fetches)

// --------- Cache control ---------
export function invalidate() {
  sectionCache.clear();
  inflight.clear();
  allPermsCache = null;
  _allPermsFetchedAt = 0;
  allPermsInflight = null;
  // Ext-C3 — same sentinel reset; see initializer comment above.
  versionState = { user_version: -1, global_version: -1, checkedAt: 0 };
}

// --------- Version check ---------
export async function fetchVersion() {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('my_perms_version');
  if (error) return null;
  return data || null;
}

// L2: on a version bump, hard-clear the cache BEFORE awaiting the refetch
// so any synchronous hasPermission() read during the refetch window returns
// false (fail-closed) instead of a stale grant. Previous policy kept the
// old cache populated "to avoid a brief all-deny window" — that's a security
// leak for revokes: a revoked admin / downgraded plan / lifted permission
// kept the capability for the full duration of the refetch (typically
// 100-500ms, longer on cold starts).
//
// The grant-side UX cost is tolerable because:
//   1. perm changes are infrequent (admin action, plan upgrade, role flip).
//   2. refreshIfStale is awaited by every PermissionsProvider entry point,
//      so a component rendered after the await reads the coherent new cache.
//   3. the 60s version poll bounds how long a client can miss a revoke.
//
// The asymmetry (revokes hard-clear, grants tolerate a brief deny) matches
// the server-side security posture: deny is always safe; grant requires
// positive confirmation.
export async function refreshIfStale() {
  const v = await fetchVersion();
  if (!v) return;
  const bumped =
    v.global_version !== versionState.global_version ||
    v.user_version !== versionState.user_version;
  if (bumped) {
    versionState = { ...v, checkedAt: Date.now() };
    sectionCache.clear();
    _allPermsFetchedAt = 0;
    allPermsInflight = null;
    // L2 — hard-clear. Synchronous readers during the refetch get deny-all;
    // refreshAllPermissions swaps in the new map once it resolves.
    allPermsCache = null;
    await refreshAllPermissions();
  } else {
    versionState.checkedAt = Date.now();
  }
}

// --------- New path: compute_effective_perms ---------
export async function refreshAllPermissions() {
  if (allPermsInflight) return allPermsInflight;

  const supabase = createClient();
  const p = (async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) {
        allPermsCache = new Map();
        _allPermsFetchedAt = Date.now();
        return allPermsCache;
      }
      const { data, error } = await supabase.rpc('compute_effective_perms', { p_user_id: userId });
      if (error) {
        console.warn('[permissions] compute_effective_perms failed', error);
        // L2 — on refetch error AFTER a version-bump hard-clear we leave
        // allPermsCache = null so hasPermission continues to deny-all. That's
        // fail-closed; a next poll or focus event will retry and swap in the
        // fresh map on success. On refresh errors during the initial load
        // (no prior cache) the same null-deny semantics apply. Previously
        // this branch returned the prior cache, which re-exposed any stale
        // grant that the revoke-driven version bump was trying to clear.
        return allPermsCache;
      }
      const next = new Map();
      for (const row of Array.isArray(data) ? data : []) {
        if (row && typeof row.permission_key === 'string') {
          next.set(row.permission_key, row);
        }
      }
      allPermsCache = next;
      _allPermsFetchedAt = Date.now();
      return allPermsCache;
    } finally {
      allPermsInflight = null;
    }
  })();
  allPermsInflight = p;
  return p;
}

// --------- Legacy path: section fetch ---------
export async function getCapabilities(section) {
  if (sectionCache.has(section)) return sectionCache.get(section).rows;
  if (inflight.has(section)) return inflight.get(section);

  const supabase = createClient();
  const args = { p_section: section };

  const p = supabase.rpc('get_my_capabilities', args).then(({ data, error }) => {
    inflight.delete(section);
    if (error) {
      console.warn('[permissions] get_my_capabilities failed', section, error);
      return [];
    }
    const rows = Array.isArray(data) ? data : [];
    sectionCache.set(section, {
      rows,
      fetchedAt: Date.now(),
      version: versionState.global_version,
    });
    return rows;
  });
  inflight.set(section, p);
  return p;
}

// --------- Lookup helpers ---------
// Prefer the full-perms cache (Wave 1 path). Falls back to any section cache
// entries that may have been populated by the legacy path so existing callers
// keep working until Wave 2 migrates them.
export function hasPermission(key) {
  if (allPermsCache) {
    const row = allPermsCache.get(key);
    if (row) return !!row.granted;
    // Cache loaded but key not present — treat as deny (NOT_IN_RESOLVED_SET).
    return false;
  }
  for (const { rows } of sectionCache.values()) {
    const row = rows.find((r) => r.permission_key === key);
    if (row) return !!row.granted;
  }
  return false;
}

// Full-cache row lookup. Returns null when the cache has not loaded yet
// or when the key is not in the resolved set.
export function getPermission(key) {
  if (!allPermsCache) return null;
  return allPermsCache.get(key) || null;
}

// Legacy section-cache lookup. Retained for callers that still use
// getCapabilities(section); will be retired in Wave 2.
export function getCapability(key) {
  for (const { rows } of sectionCache.values()) {
    const row = rows.find((r) => r.permission_key === key);
    if (row) return row;
  }
  return null;
}

// Single-permission server-side check (for RLS-mirroring UI logic
// where you don't have the section cached).
export async function hasPermissionServer(key) {
  const supabase = createClient();
  const args = { p_key: key };
  const { data, error } = await supabase.rpc('has_permission', args);
  if (error) return false;
  return !!data;
}

// Content-scoped check: e.g. "can this user view THIS article?"
export async function hasPermissionFor(key, scopeType, scopeId) {
  const supabase = createClient();
  const args = { p_key: key, p_scope_type: scopeType, p_scope_id: scopeId };
  const { data, error } = await supabase.rpc('has_permission_for', args);
  if (error) return false;
  return !!data;
}

// Export constants for convenience
export { SECTIONS, DENY_MODE, LOCK_REASON };
