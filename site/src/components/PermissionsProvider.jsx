'use client';

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { createClient } from '../lib/supabase/client';
import {
  getCapabilities,
  refreshIfStale,
  invalidate,
  getKidSession,
  setKidSession as setKidSessionInternal,
  clearKidSession as clearKidSessionInternal,
} from '../lib/permissions';
import { onRlsLocked } from '../lib/rlsErrorHandler';
import LockModal from './LockModal';

const PermissionsContext = createContext(null);

export function PermissionsProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);   // bump to force consumers to re-derive
  const [globalLock, setGlobalLock] = useState(null); // { capability } when an RLS denial triggers

  // Track auth state; invalidate cache on sign-in/out.
  useEffect(() => {
    const supabase = createClient();

    // Restore any kid session persisted to sessionStorage on boot.
    if (typeof window !== 'undefined') {
      import('../lib/kidSession').then(({ loadKidSession }) => loadKidSession());
    }

    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data?.user ?? null);
      setLoaded(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      invalidate();
      setTick((n) => n + 1);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Poll version periodically + on window focus to catch grant changes.
  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      await refreshIfStale();
      if (!cancelled) setTick((n) => n + 1);
    };

    check();
    const iv = setInterval(check, 60_000);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      clearInterval(iv);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Listen for RLS denial events from API calls wrapped with withLockOnRls().
  useEffect(() => {
    return onRlsLocked((detail) => {
      setGlobalLock({
        label:        detail.permission ? detail.permission.split('.').pop() : 'Locked',
        lock_reason:  detail.lock_reason || 'not_granted',
        lock_message: detail.error?.message || null,
        deny_mode:    'locked',
        granted:      false,
        permission_key: detail.permission,
      });
    });
  }, []);

  const reload = useCallback(async () => {
    await refreshIfStale();
    setTick((n) => n + 1);
  }, []);

  const setKidSession = useCallback((s) => {
    setKidSessionInternal(s);
    setTick((n) => n + 1);
  }, []);

  const clearKidSession = useCallback(() => {
    clearKidSessionInternal();
    setTick((n) => n + 1);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loaded,
      reload,
      setKidSession,
      clearKidSession,
      getKidSession,
      tick,                      // consumers read this to trigger re-render after invalidate
      fetchSection: getCapabilities,
    }),
    [user, loaded, reload, setKidSession, clearKidSession, tick],
  );

  return (
    <PermissionsContext.Provider value={value}>
      {children}
      <LockModal
        open={!!globalLock}
        onClose={() => setGlobalLock(null)}
        capability={globalLock}
      />
    </PermissionsContext.Provider>
  );
}

export function usePermissionsContext() {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissionsContext must be used inside <PermissionsProvider>');
  return ctx;
}

// Hook: fetch and subscribe to a section's capabilities.
// Returns { caps, get(key), ready }.
export function useCapabilities(section) {
  const { tick, fetchSection } = usePermissionsContext();
  const [caps, setCaps] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchSection(section).then((rows) => {
      if (!cancelled) setCaps(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [section, tick, fetchSection]);

  const get = useCallback(
    (key) => (caps || []).find((r) => r.permission_key === key) || null,
    [caps],
  );

  return { caps, get, ready: caps !== null };
}
