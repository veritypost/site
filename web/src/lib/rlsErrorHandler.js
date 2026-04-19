'use client';

// ============================================================
// rlsErrorHandler — detect Postgres RLS denials (error code 42501)
// and surface them as a lock modal instead of silent failures.
//
// Usage:
//   import { withLockOnRls } from '../lib/rlsErrorHandler';
//   const res = await withLockOnRls(
//     () => supabase.from('comments').insert(row),
//     { permission: PERM.COMMENTS_POST, section: SECTIONS.COMMENTS }
//   );
//
// When RLS rejects the write, emits a global event that the
// <LockModal> listens for (see PermissionsProvider below).
// ============================================================

import { hasPermissionServer } from './permissions';

const EVENT_NAME = 'vp.rls_locked';

export function onRlsLocked(handler) {
  if (typeof window === 'undefined') return () => {};
  const listener = (e) => handler(e.detail);
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}

function dispatchLocked(detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
}

export function isRlsDenial(error) {
  if (!error) return false;
  // Postgres error code 42501 = insufficient_privilege
  if (error.code === '42501') return true;
  // Supabase often surfaces as: { status: 401/403, message: 'new row violates row-level security policy' }
  const msg = (error.message || '').toLowerCase();
  if (msg.includes('row-level security') || msg.includes('permission denied')) return true;
  return false;
}

// Wraps a Supabase call; if the result/error is an RLS denial,
// dispatches a locked event and returns null. Otherwise returns
// the original payload unchanged.
export async function withLockOnRls(callFn, { permission, section, scope } = {}) {
  let res;
  try {
    res = await callFn();
  } catch (err) {
    if (isRlsDenial(err)) {
      dispatchLocked({ permission, section, scope, error: err });
      return { data: null, error: err, locked: true };
    }
    throw err;
  }
  if (res && res.error && isRlsDenial(res.error)) {
    // Ask the server for the real reason to populate the modal.
    let lock_reason = 'not_granted';
    if (permission) {
      const granted = await hasPermissionServer(permission);
      if (!granted) lock_reason = 'not_granted';
    }
    dispatchLocked({ permission, section, scope, error: res.error, lock_reason });
    return { ...res, locked: true };
  }
  return res;
}
