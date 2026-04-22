// @migrated-to-permissions 2026-04-18
// @feature-verified shared_components 2026-04-18
'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '../lib/supabase/client';
import {
  getCapabilities,
  refreshIfStale,
  refreshAllPermissions,
  invalidate,
} from '../lib/permissions';
import { onRlsLocked } from '../lib/rlsErrorHandler';
import LockModal from './LockModal';
import type { PermissionCapability } from './PermissionGate';

interface PermissionsContextValue {
  user: User | null;
  loaded: boolean;
  reload: () => Promise<void>;
  tick: number;
  fetchSection: (section: string) => Promise<PermissionCapability[]>;
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

interface PermissionsProviderProps {
  children: ReactNode;
}

export function PermissionsProvider({ children }: PermissionsProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState<boolean>(false);
  const [tick, setTick] = useState<number>(0);
  const [globalLock, setGlobalLock] = useState<PermissionCapability | null>(null);

  useEffect(() => {
    const supabase = createClient();

    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data?.user ?? null);
      setLoaded(true);
      if (data?.user) {
        refreshAllPermissions()
          .then(() => {
            if (mounted) setTick((n) => n + 1);
          })
          .catch((err) => {
            console.error('[permissions] initial refresh', err);
          });
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      invalidate();
      setTick((n) => n + 1);
      if (session?.user) {
        refreshAllPermissions()
          .then(() => setTick((n) => n + 1))
          .catch((err) => {
            console.error('[permissions] auth-change refresh', err);
          });
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

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

  useEffect(() => {
    return onRlsLocked(
      (detail: {
        permission?: string | null;
        lock_reason?: string | null;
        error?: { message?: string } | null;
      }) => {
        setGlobalLock({
          label: detail.permission ? detail.permission.split('.').pop() || 'Locked' : 'Locked',
          lock_reason: detail.lock_reason || 'not_granted',
          lock_message: detail.error?.message || null,
          deny_mode: 'locked',
          granted: false,
          permission_key: detail.permission ?? null,
        });
      }
    );
  }, []);

  const reload = useCallback(async () => {
    await refreshIfStale();
    setTick((n) => n + 1);
  }, []);

  const value = useMemo<PermissionsContextValue>(
    () => ({
      user,
      loaded,
      reload,
      tick,
      fetchSection: getCapabilities as (section: string) => Promise<PermissionCapability[]>,
    }),
    [user, loaded, reload, tick]
  );

  return (
    <PermissionsContext.Provider value={value}>
      {children}
      <LockModal open={!!globalLock} onClose={() => setGlobalLock(null)} capability={globalLock} />
    </PermissionsContext.Provider>
  );
}

export function usePermissionsContext(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissionsContext must be used inside <PermissionsProvider>');
  return ctx;
}

export function useCapabilities(section: string) {
  const { tick, fetchSection } = usePermissionsContext();
  const [caps, setCaps] = useState<PermissionCapability[] | null>(null);

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
    (key: string): PermissionCapability | null =>
      (caps || []).find((r) => r.permission_key === key) || null,
    [caps]
  );

  return { caps, get, ready: caps !== null };
}
