'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from './NavWrapper';

// undefined = still loading  |  null = no moment needed  |  string = show this line
type Copy = string | null | undefined;

export default function HomeFirstLoginMoment() {
  const { user, authLoaded } = useAuth();
  const [copy, setCopy] = useState<Copy>(undefined);
  const [opacity, setOpacity] = useState(0);
  const completedRef = useRef(false);

  // Determine which copy line to show (or whether to skip).
  useEffect(() => {
    if (!authLoaded) return;

    if (!user || user.onboarding_completed_at !== null) {
      setCopy(null);
      return;
    }

    const supabase = createClient();
    let cancelled = false;

    (async () => {
      try {
        const { data: myRow } = await supabase
          .from('users')
          .select('referred_by_user_id, email')
          .eq('id', user.id)
          .maybeSingle();

        if (cancelled) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = myRow as any;
        const referredById: string | null = row?.referred_by_user_id ?? null;
        const myEmail: string | null = row?.email ?? null;

        const [referrerRes, accessRes] = await Promise.all([
          referredById
            ? supabase
                .from('users')
                .select('display_name, username')
                .eq('id', referredById)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          myEmail
            ? supabase
                .from('access_requests')
                .select('created_at')
                .eq('email', myEmail)
                .eq('status', 'approved')
                .order('created_at')
                .limit(1)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        if (cancelled) return;

        // Referred path: "[Name] reads this every morning."
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ref = referrerRes.data as any;
        const referrerName: string | null = ref?.display_name || ref?.username || null;
        if (referredById && referrerName) {
          setCopy(`${referrerName} reads this every morning.`);
          return;
        }

        // Waitlisted path: "you've been on the list N days." or "you made it."
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const access = accessRes.data as any;
        if (access?.created_at) {
          const days = Math.floor(
            (Date.now() - new Date(access.created_at).getTime()) / 86400000
          );
          if (days >= 1) {
            setCopy(`you've been on the list ${days} ${days === 1 ? 'day' : 'days'}.`);
            return;
          }
        }

        setCopy('you made it.');
      } catch {
        setCopy(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoaded, user?.id, user?.onboarding_completed_at]);

  // Animate: 200ms fade-in → 1200ms hold → 200ms fade-out → mark done
  const userId = user?.id ?? null;
  useEffect(() => {
    if (typeof copy !== 'string') return;

    completedRef.current = false;

    const rafId = requestAnimationFrame(() => setOpacity(1));
    const outTimer = setTimeout(() => setOpacity(0), 1400);
    const doneTimer = setTimeout(async () => {
      if (completedRef.current) return;
      completedRef.current = true;
      setCopy(null);

      if (userId) {
        const supabase = createClient();
        try {
          await supabase
            .from('users')
            .update({ onboarding_completed_at: new Date().toISOString() })
            .eq('id', userId);
        } catch {}
      }
    }, 1600);

    return () => {
      completedRef.current = true;
      cancelAnimationFrame(rafId);
      clearTimeout(outTimer);
      clearTimeout(doneTimer);
    };
  }, [copy, userId]);

  if (typeof copy !== 'string') return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fafafa',
        opacity,
        transition: 'opacity 200ms ease',
        pointerEvents: 'none',
      }}
      aria-live="polite"
    >
      <p
        style={{
          fontSize: 18,
          fontWeight: 400,
          color: '#374151',
          margin: 0,
          textAlign: 'center',
          padding: '0 24px',
          maxWidth: 480,
        }}
      >
        {copy}
      </p>
    </div>
  );
}
