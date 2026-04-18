'use client';

// ============================================================
// Permissions client — wraps the DB-backed resolver so every
// gate check in the app goes through one place.
//
// Exposes:
//   getCapabilities(section)   — array of { permission_key, granted, deny_mode, lock_reason, lock_message }
//   hasPermission(key)         — boolean across any surface currently cached
//   getCapability(key)         — the full row for `key` if present, else null
//   refreshIfStale()           — checks my_perms_version(), refetches sections if bumped
//   invalidate()               — clears the cache (call on auth change / logout)
//   getKidSession()/setKidSession() — parent-provided (kid_profile_id, token) pair
// ============================================================

import { createClient } from './supabase/client';
import { SECTIONS, DENY_MODE, LOCK_REASON } from './permissionKeys';

const sectionCache = new Map();   // section -> { rows, fetchedAt, version }
let versionState = { user_version: 0, global_version: 0, checkedAt: 0 };
let kidSession = null;            // { kid_profile_id, token } — null when acting as parent
let inflight = new Map();         // section -> Promise (dedupe concurrent fetches)

// --------- Kid session helpers ---------
export function getKidSession() { return kidSession; }
export function setKidSession(s) { kidSession = s || null; invalidate(); }
export function clearKidSession() { kidSession = null; invalidate(); }

// --------- Cache control ---------
export function invalidate() {
  sectionCache.clear();
  inflight.clear();
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
// cached sections so the next getCapabilities() re-hits the DB.
export async function refreshIfStale() {
  const v = await fetchVersion();
  if (!v) return;
  if (
    v.global_version !== versionState.global_version ||
    v.user_version   !== versionState.user_version
  ) {
    versionState = { ...v, checkedAt: Date.now() };
    sectionCache.clear();
  } else {
    versionState.checkedAt = Date.now();
  }
}

// --------- Capability fetch ---------
export async function getCapabilities(section) {
  if (sectionCache.has(section)) return sectionCache.get(section).rows;
  if (inflight.has(section))     return inflight.get(section);

  const supabase = createClient();
  const args = kidSession
    ? { p_section: section, p_as_kid: kidSession.kid_profile_id, p_kid_token: kidSession.token }
    : { p_section: section };

  const p = supabase
    .rpc('get_my_capabilities', args)
    .then(({ data, error }) => {
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
export function hasPermission(key) {
  for (const { rows } of sectionCache.values()) {
    const row = rows.find((r) => r.permission_key === key);
    if (row) return !!row.granted;
  }
  return false;
}

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
  const args = kidSession
    ? { p_key: key, p_as_kid: kidSession.kid_profile_id, p_kid_token: kidSession.token }
    : { p_key: key };
  const { data, error } = await supabase.rpc('has_permission', args);
  if (error) return false;
  return !!data;
}

// Content-scoped check: e.g. "can this user view THIS article?"
export async function hasPermissionFor(key, scopeType, scopeId) {
  const supabase = createClient();
  const base = { p_key: key, p_scope_type: scopeType, p_scope_id: scopeId };
  const args = kidSession
    ? { ...base, p_as_kid: kidSession.kid_profile_id, p_kid_token: kidSession.token }
    : base;
  const { data, error } = await supabase.rpc('has_permission_for', args);
  if (error) return false;
  return !!data;
}

// Export constants for convenience
export { SECTIONS, DENY_MODE, LOCK_REASON };
