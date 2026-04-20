// @migrated-to-permissions 2026-04-18
// @feature-verified notifications 2026-04-18
'use client';
import { useState, useEffect, CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/client';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import type { Tables } from '@/types/database-helpers';

// Notifications inbox. Listing + mark-read traffic runs through
// /api/notifications which mirrors the permission check server-side. The
// client gate here keeps direct-URL hits that aren't eligible from seeing
// the inbox surface (the API would still 401/403 them).
// Gate key: notifications.inbox.view (matches the server route's check).
// R13-T3 — anon visitors now see an in-page Sign-up CTA instead of being
// middleware-redirected to /login. Middleware dropped `/notifications`
// from its PROTECTED_PREFIXES; this page owns the anon empty state.

type NotificationType = Tables<'notifications'>['type'];

type NotificationRow = Pick<
  Tables<'notifications'>,
  'id' | 'type' | 'title' | 'body' | 'action_url' | 'is_read' | 'created_at'
>;

type Filter = 'all' | 'unread';

const C = { card: '#f7f7f7', border: '#e5e5e5', text: '#111', dim: '#666', accent: '#111' } as const;

export default function NotificationsInbox() {
  const [loading, setLoading] = useState<boolean>(true);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<string | null>(null);
  const [canView, setCanView] = useState<boolean>(false);
  const [permsReady, setPermsReady] = useState<boolean>(false);
  // R13-T3 — track anon state so we can render a Sign-up CTA instead of
  // the generic "Sign in" denied-but-authed copy below. Stays `null`
  // until the auth check resolves so we don't flash the wrong message.
  const [isAnon, setIsAnon] = useState<boolean | null>(null);

  async function load() {
    setError(null);
    try {
      const url = filter === 'unread' ? '/api/notifications?unread=1&limit=100' : '/api/notifications?limit=100';
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as { error?: string }));
        setError(data?.error || `Couldn\u2019t load notifications (${res.status}).`);
        setItems([]);
      } else {
        const data = await res.json() as { notifications?: NotificationRow[] };
        setItems(data.notifications || []);
      }
    } catch {
      setError('Network error. Check your connection and try again.');
      setItems([]);
    }
    setLoading(false);
  }

  // Hydrate the permission cache once, then fetch the feed.
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const anon = !authUser;
      setIsAnon(anon);
      if (anon) {
        // Skip permission hydrate for anon — no cookies -> no work to do.
        // `canView` stays false; the anon branch renders the Sign-up CTA.
        setPermsReady(true);
        return;
      }
      await refreshAllPermissions();
      await refreshIfStale();
      setCanView(hasPermission('notifications.inbox.view'));
      setPermsReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!permsReady) return;
    if (!canView) { setLoading(false); return; }
    load();
  }, [filter, permsReady, canView]);

  async function markAllRead() {
    await fetch('/api/notifications', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true, mark: 'read' }),
    });
    load();
  }
  async function markOne(id: string) {
    await fetch('/api/notifications', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id], mark: 'read' }),
    });
    setItems(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  if (!permsReady || loading) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 80px' }}>
        <div style={{ height: 28, width: 160, background: C.card, borderRadius: 6, marginBottom: 16 }} />
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ height: 68, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 8 }} />
        ))}
      </div>
    );
  }

  if (isAnon) {
    // R13-T3 — anon in-page CTA. No redirect to /login; users land here,
    // see what the tab is for, and convert on-page. Matches the
    // /bookmarks empty-state shape (centered hero, primary CTA + secondary
    // sign-in link). Deliberately no emoji; the framed "bell" glyph uses
    // box-drawing characters so the asset renders everywhere.
    return (
      <div style={{ maxWidth: 520, margin: '60px auto', padding: '0 16px', textAlign: 'center' }}>
        <div
          aria-hidden="true"
          style={{
            width: 64, height: 64, margin: '0 auto 18px',
            borderRadius: '50%', background: C.card,
            border: `1px solid ${C.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 700, color: C.accent,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        >
          [!]
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 10px' }}>Keep track of what matters</h1>
        <p style={{ fontSize: 14, color: C.dim, margin: '0 0 22px', lineHeight: 1.55 }}>
          Sign up to get notified when your favorite authors post, when your comments get replies, and when weekly recaps are ready.
        </p>
        <a
          href="/signup"
          style={{
            display: 'inline-block', padding: '11px 22px',
            background: C.accent, color: '#fff',
            borderRadius: 9, fontSize: 14, fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Sign up
        </a>
        <div style={{ marginTop: 14, fontSize: 13, color: C.dim }}>
          Already have an account?{' '}
          <a href="/login" style={{ color: C.accent, fontWeight: 600, textDecoration: 'underline' }}>Sign in</a>
        </div>
      </div>
    );
  }

  if (!canView) {
    // Signed in but lacking the notifications.inbox.view permission
    // (edge case — should be rare). Keep the existing denied-but-authed
    // copy so the message matches the actual situation.
    return (
      <div style={{ maxWidth: 520, margin: '60px auto', padding: '0 16px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>Notifications</h1>
        <p style={{ fontSize: 13, color: C.dim, margin: 0, lineHeight: 1.5 }}>
          Your account doesn&apos;t have access to the notifications inbox yet.
        </p>
      </div>
    );
  }

  const pillBase: CSSProperties = { padding: '5px 12px', borderRadius: 999, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Notifications</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* R13-C5 Fix 1: visible entry to notification preferences so users
              can configure what they receive without hunting through settings. */}
          <a href="/profile/settings#alerts" style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 12, fontWeight: 600, color: C.text, textDecoration: 'none' }}>Preferences</a>
          <button onClick={markAllRead} style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Mark all read</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {(['all', 'unread'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            ...pillBase,
            background: filter === f ? C.accent : C.card,
            color: filter === f ? '#fff' : C.text,
          }}>{f[0].toUpperCase() + f.slice(1)}</button>
        ))}
      </div>

      {error ? (
        <div style={{ padding: 20, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#991b1b', fontSize: 13, marginBottom: 12 }}>
          {error}
          <button onClick={load} style={{ marginLeft: 10, padding: '4px 10px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fff', color: '#991b1b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Retry</button>
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: C.dim, fontSize: 14, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
          {filter === 'unread' ? 'You\u2019re all caught up.' : 'No notifications yet. When someone replies, mentions you, or an article breaks, it lands here.'}
        </div>
      ) : items.map(n => (
        <a key={n.id} href={n.action_url || '#'} onClick={() => markOne(n.id)} style={{
          display: 'block', background: n.is_read ? C.card : '#fff',
          border: `1px solid ${n.is_read ? C.border : C.accent}`,
          borderRadius: 10, padding: 12, marginBottom: 8,
          textDecoration: 'none', color: C.text,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: C.card, color: C.dim, fontWeight: 700, textTransform: 'uppercase' }}>{n.type as NotificationType}</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{n.title}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: C.dim }}>{n.created_at ? new Date(n.created_at).toLocaleString() : ''}</span>
          </div>
          {n.body && <div style={{ fontSize: 13, color: C.text, marginTop: 4 }}>{n.body}</div>}
        </a>
      ))}
    </div>
  );
}
