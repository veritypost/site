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
let versionState = { user_version: 0, global_version: 0, checkedAt: 0 };
let inflight = new Map(); // section -> Promise (dedupe concurrent fetches)

// --------- Cache control ---------
export function invalidate() {
  sectionCache.clear();
  inflight.clear();
  allPermsCache = null;
  _allPermsFetchedAt = 0;
  allPermsInflight = null;
  versionState = { user_version: 0, global_version: 0, checkedAt: 0 };
}

// --------- Version check ---------
export async function fetchVersion() {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('my_perms_version');
  if (error) return null;
  return data || null;
}

// If the global or user version has bumped since last check, invalidate the
// cached sections and AWAIT a full-perms refresh so any caller that resumes
// after this returns reads coherent permissions. Previously we cleared the
// cache and fired the refresh fire-and-forget; a synchronous `hasPermission`
// call between cache-null and refresh-completion saw `allPermsCache === null`,
// fell through to the empty section cache, and returned `false` for every key.
// That window manifested as random "you don't have permission" toasts on first
// nav after any role/plan change. Awaiting the in-flight refresh closes it.
export async function refreshIfStale() {
  const v = await fetchVersion();
  if (!v) return;
  const bumped =
    v.global_version !== versionState.global_version ||
    v.user_version !== versionState.user_version;
  if (bumped) {
    versionState = { ...v, checkedAt: Date.now() };
    sectionCache.clear();
    // Drop only the inflight handle + timestamp — keep `allPermsCache` populated
    // until the new fetch lands so concurrent `hasPermission` reads return the
    // last-known-good answer (slightly stale > all-deny). `refreshAllPermissions`
    // overwrites the cache atomically once the RPC resolves.
    _allPermsFetchedAt = 0;
    allPermsInflight = null;
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
        // Leave cache as-is on error so stale reads keep working.
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
