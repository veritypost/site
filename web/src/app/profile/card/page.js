// @migrated-to-permissions 2026-04-18
// @feature-verified shared_components 2026-04-18
'use client';
import { useEffect, useState, useMemo } from 'react';
import { createClient } from '../../../lib/supabase/client';
import { hasPermission, refreshAllPermissions } from '@/lib/permissions';

// D32: shareable profile card is a paid-tier feature. Free users should
// not land here at all (the link is hidden on /profile). If a free user
// somehow arrives (direct URL, stale bookmark, role testing), show a
// friendly "available on paid plans" message instead of silently
// redirecting — D10 copy convention.

export default function MyCardPage() {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState('loading');

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        window.location.replace('/login?next=/profile/card');
        return;
      }

      await refreshAllPermissions();

      const { data: me } = await supabase
        .from('users')
        .select('username')
        .eq('id', user.id)
        .maybeSingle();

      if (!me) {
        setState('error');
        return;
      }
      if (!hasPermission('profile.card_share')) {
        setState('locked');
        return;
      }
      if (!me.username) {
        setState('no_username');
        return;
      }

      // Paid user with a username — send them to the public card view.
      window.location.replace(`/card/${me.username}`);
    })();
  }, []);

  if (state === 'loading') {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--dim)', fontSize: 13 }}>
        Loading your card...
      </div>
    );
  }

  if (state === 'locked') {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '48px 16px', textAlign: 'center' }}>
        <h1
          style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}
        >
          Profile Card
        </h1>
        <p style={{ fontSize: 14, color: 'var(--dim)', margin: '0 0 20px' }}>
          Shareable profile cards are available on paid plans.
        </p>
        <a
          href="/profile/settings#billing"
          style={{
            display: 'inline-block',
            padding: '10px 18px',
            borderRadius: 10,
            background: 'var(--accent)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          View plans
        </a>
        <div style={{ marginTop: 14 }}>
          <a href="/profile" style={{ fontSize: 12, color: 'var(--dim)', textDecoration: 'none' }}>
            Back to profile
          </a>
        </div>
      </div>
    );
  }

  if (state === 'no_username') {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '48px 16px', textAlign: 'center' }}>
        <h1
          style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}
        >
          Set a username first
        </h1>
        <p style={{ fontSize: 14, color: 'var(--dim)', margin: '0 0 20px' }}>
          Your card lives at a public URL that uses your username.
        </p>
        <a
          href="/profile/settings/profile"
          style={{
            display: 'inline-block',
            padding: '10px 18px',
            borderRadius: 10,
            background: 'var(--accent)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Set username
        </a>
      </div>
    );
  }

  return (
    <div style={{ padding: 48, textAlign: 'center', color: 'var(--dim)', fontSize: 13 }}>
      Could not load your profile.{' '}
      <a href="/profile" style={{ color: 'var(--accent)' }}>
        Back to profile
      </a>
    </div>
  );
}
