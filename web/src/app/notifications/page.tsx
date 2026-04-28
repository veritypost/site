// @migrated-to-permissions 2026-04-18
// @feature-verified notifications 2026-04-18
'use client';
import { useState, useEffect, CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/client';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import ErrorState from '@/components/ErrorState';
import type { Tables } from '@/types/database-helpers';
import { formatDateTime } from '@/lib/dates';

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

// S5-A96 — split the legacy single "Earlier" bucket into "Earlier this
// month" and "Older" so a 6-month-old reply doesn't sit alongside a 10-day-
// old one. `null`-stamped rows fall into "Older" and render last (the
// caller already orders the feed by created_at DESC, so within "Older" the
// dated rows appear first and the null-dated rows trail). Empty buckets
// don't render — the existing `if (bucket.length)` guards continue to hold.
function groupNotifications(
  notifications: NotificationRow[]
): { section: string; items: NotificationRow[] }[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000);
  const groups: { section: string; items: NotificationRow[] }[] = [];
  const today = notifications.filter(
    (n) => n.created_at != null && new Date(n.created_at) >= todayStart
  );
  const thisWeek = notifications.filter(
    (n) =>
      n.created_at != null &&
      new Date(n.created_at) >= weekStart &&
      new Date(n.created_at) < todayStart
  );
  const earlierThisMonth = notifications.filter(
    (n) =>
      n.created_at != null &&
      new Date(n.created_at) >= monthStart &&
      new Date(n.created_at) < weekStart
  );
  const older = notifications.filter(
    (n) => n.created_at == null || new Date(n.created_at) < monthStart
  );
  if (today.length) groups.push({ section: 'Today', items: today });
  if (thisWeek.length) groups.push({ section: 'This week', items: thisWeek });
  if (earlierThisMonth.length)
    groups.push({ section: 'Earlier this month', items: earlierThisMonth });
  if (older.length) groups.push({ section: 'Older', items: older });
  return groups;
}

// T82 — values point at globals.css CSS vars so brand-color edits cascade.
const C = {
  card: 'var(--card)',
  border: 'var(--border)',
  text: 'var(--text)',
  dim: 'var(--dim)',
  accent: 'var(--accent)',
} as const;

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
      const url =
        filter === 'unread'
          ? '/api/notifications?unread=1&limit=100'
          : '/api/notifications?limit=100';
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}) as { error?: string });
        setError(data?.error || 'Couldn\u2019t load notifications. Try again.');
        setItems([]);
      } else {
        const data = (await res.json().catch(() => ({}))) as { notifications?: NotificationRow[] };
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
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
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
    if (!canView) {
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, permsReady, canView]);

  async function markAllRead() {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true, mark: 'read' }),
    });
    load();
  }
  // S5-A104 — fire-and-forget mark-one-as-read.
  //
  // The previous implementation `await`-ed PATCH /api/notifications inside
  // the row's onClick. When the row had an action_url, the browser's
  // subsequent navigation frequently cancelled the in-flight request, so
  // the badge sat unread on return. Two changes break the race:
  //
  //   1. Use navigator.sendBeacon — the browser hands the request to the
  //      OS for delivery and decouples it from the page lifecycle.
  //   2. Fall back to keepalive fetch when sendBeacon is unavailable or
  //      refuses the payload (some browsers reject beacons over a
  //      configurable byte threshold). keepalive lets the request finish
  //      after the document unloads.
  //
  // Optimistic UI update flips is_read locally so the user doesn't see the
  // row stay highlighted on back-navigation. Because the request is
  // fire-and-forget and the user has already navigated, we can't roll
  // back on failure — the trade-off is the rare ghost-read row that the
  // server didn't actually persist, which the next inbox load self-heals.
  function markOne(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    const url = `/api/notifications/${id}/read`;
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      try {
        const blob = new Blob([JSON.stringify({ id })], { type: 'application/json' });
        if (navigator.sendBeacon(url, blob)) return;
      } catch {
        /* fall through to keepalive */
      }
    }
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
      keepalive: true,
    }).catch(() => {
      /* swallow — user has already navigated; next inbox load self-heals */
    });
  }

  if (!permsReady || loading) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 80px' }}>
        <div
          style={{ height: 28, width: 160, background: C.card, borderRadius: 6, marginBottom: 16 }}
        />
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: 68,
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              marginBottom: 8,
            }}
          />
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
            width: 64,
            height: 64,
            margin: '0 auto 18px',
            borderRadius: '50%',
            background: C.card,
            border: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: C.accent,
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 10px' }}>
          Keep track of what matters
        </h1>
        <p style={{ fontSize: 14, color: C.dim, margin: '0 0 22px', lineHeight: 1.55 }}>
          Sign up to get notified about breaking news, replies to your comments, new articles in
          categories you follow, and achievements you unlock as you read.
        </p>
        <a
          href="/signup"
          style={{
            display: 'inline-block',
            padding: '11px 22px',
            background: C.accent,
            color: '#fff',
            borderRadius: 9,
            fontSize: 14,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Sign up
        </a>
        <div style={{ marginTop: 14, fontSize: 13, color: C.dim }}>
          Already have an account?{' '}
          <a
            href="/login"
            style={{ color: C.accent, fontWeight: 600, textDecoration: 'underline' }}
          >
            Sign in
          </a>
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

  const TYPE_LABELS: Record<string, string> = {
    BREAKING_NEWS: 'Breaking news',
    COMMENT_REPLY: 'Reply',
    MENTION: '@mention',
    EXPERT_ANSWER: 'Expert answer',
  };

  const pillBase: CSSProperties = {
    padding: '5px 12px',
    borderRadius: 999,
    border: 'none',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 36,
  };

  return (
    // Ext-NN1 — main landmark for screen readers.
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 80px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          gap: 8,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Notifications</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* R13-C5 Fix 1: visible entry to notification preferences so users
              can configure what they receive without hunting through settings. */}
          <a
            href="/profile/settings#alerts"
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: 'transparent',
              fontSize: 12,
              fontWeight: 600,
              color: C.text,
              textDecoration: 'none',
              minHeight: 36,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            Preferences
          </a>
          <button
            onClick={markAllRead}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: 'transparent',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: 36,
            }}
          >
            Mark all read
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {(['all', 'unread'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              ...pillBase,
              background: filter === f ? C.accent : C.card,
              color: filter === f ? '#fff' : C.text,
            }}
          >
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState inline message={error} onRetry={load} style={{ marginBottom: 12 }} />
      ) : items.length === 0 ? (
        <div
          style={{
            padding: 48,
            textAlign: 'center',
            color: C.dim,
            fontSize: 14,
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
          }}
        >
          {filter === 'unread'
            ? 'You\u2019re all caught up.'
            : 'No notifications yet. When someone replies, mentions you, or an article breaks, it lands here.'}
        </div>
      ) : (
        groupNotifications(items).map(({ section, items: sectionItems }) => (
          <div key={section}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.dim,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 6,
                marginTop: section !== 'Today' ? 20 : 0,
                paddingBottom: 4,
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              {section}
            </div>
            {sectionItems.map((n) => (
              <a
                key={n.id}
                href={n.action_url || undefined}
                role={n.action_url ? undefined : 'button'}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (!n.action_url && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    markOne(n.id);
                  }
                }}
                onClick={(e) => {
                  if (!n.action_url) e.preventDefault();
                  markOne(n.id);
                }}
                style={{
                  display: 'block',
                  background: n.is_read ? C.card : '#fff',
                  border: `1px solid ${n.is_read ? C.border : C.accent}`,
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 8,
                  textDecoration: 'none',
                  color: C.text,
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span
                    style={{
                      fontSize: 10,
                      padding: '2px 8px',
                      borderRadius: 10,
                      background: C.card,
                      color: C.dim,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                    }}
                  >
                    {TYPE_LABELS[n.type as string] ?? n.type}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{n.title}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: C.dim }}>
                    {formatDateTime(n.created_at)}
                  </span>
                </div>
                {n.body && (
                  <div style={{ fontSize: 13, color: C.text, marginTop: 4 }}>{n.body}</div>
                )}
              </a>
            ))}
          </div>
        ))
      )}
    </main>
  );
}
