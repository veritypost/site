'use client';

// Owner cleanup item 12 (2026-05-08) — Following page.
// Lists every story the user has explicitly followed via the
// FollowStoryButton on an article reader. Each row decorated with an
// unread dot when a new article has landed on the story since the
// user's last visit (last_seen_at on the story_follows row).
//
// Tap a row → navigate to the most recent article on that story's
// timeline + PATCH the follow row's last_seen_at so the dot clears.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/app/NavWrapper';
import ErrorState from '@/components/ErrorState';

const C = {
  bg: 'var(--bg)',
  text: 'var(--text)',
  dim: 'var(--muted)',
  muted: 'var(--muted)',
  rule: 'var(--border)',
  breaking: '#dc2626',
  developing: '#d97706',
  unread: 'var(--accent, #2563eb)',
} as const;

const SERIF = "Georgia, 'Times New Roman', serif";

type Row = {
  story: {
    id: string;
    slug: string | null;
    title: string;
    lifecycle_status: string;
    published_at: string | null;
  };
  last_seen_at: string;
  latest_article: {
    id: string;
    title: string;
    published_at: string;
  } | null;
  unread: boolean;
};

function statusColor(status: string) {
  if (status === 'breaking') return C.breaking;
  if (status === 'developing') return C.developing;
  return C.dim;
}

function statusLabel(status: string) {
  if (status === 'breaking') return 'Breaking';
  if (status === 'developing') return 'Developing';
  return status;
}

function timeShort(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) return `${Math.max(1, hours)}h ago`;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
}

export default function FollowingPage() {
  const { loggedIn, authLoaded } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/story-follows', { method: 'GET' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch {
      setError("Couldn't load your follows. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoaded) return;
    if (!loggedIn) {
      setLoading(false);
      return;
    }
    load();
  }, [authLoaded, loggedIn, load]);

  // Mark the row seen when the user clicks through. Optimistically clears
  // the dot client-side; server confirms via PATCH.
  async function handleRowClick(storyId: string) {
    setRows((prev) =>
      prev.map((r) => (r.story.id === storyId ? { ...r, unread: false } : r))
    );
    try {
      await fetch('/api/story-follows', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story_id: storyId }),
      });
    } catch {
      // Non-fatal — next page load will reconcile.
    }
  }

  const hairline: React.CSSProperties = {
    border: 'none',
    borderTop: `1px solid ${C.rule}`,
    margin: 0,
  };

  return (
    <div style={{ background: C.bg, minHeight: '100vh' }}>
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '32px 20px 80px' }}>
        <h1
          style={{
            fontFamily: SERIF,
            fontSize: 32,
            fontWeight: 700,
            color: C.text,
            margin: '0 0 24px',
            letterSpacing: '-0.02em',
          }}
        >
          Following
        </h1>
        <p style={{ fontFamily: SERIF, fontSize: 15, color: C.dim, margin: '0 0 24px', fontWeight: 400 }}>
          Stories you follow. New articles get a dot.
        </p>

        {!authLoaded || loading ? (
          <p style={{ color: C.dim, fontSize: 14 }}>Loading…</p>
        ) : !loggedIn ? (
          <div style={{ paddingTop: 48, textAlign: 'center' }}>
            <p style={{ color: C.dim, fontSize: 15, marginBottom: 16 }}>
              Sign in to follow stories.
            </p>
            <Link
              href="/login"
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                background: C.text,
                color: C.bg,
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Sign in
            </Link>
          </div>
        ) : error ? (
          <ErrorState inline message={error} onRetry={load} style={{ marginTop: 48 }} />
        ) : rows.length === 0 ? (
          <p style={{ color: C.dim, fontSize: 14, paddingTop: 48, textAlign: 'center' }}>
            Tap Follow on a story to start tracking it.
          </p>
        ) : (
          <div>
            {rows.map((row, idx) => {
              // Tap target = the latest article on the story (so the user
              // lands on what's new). Falls back to the story slug if no
              // article published yet (rare).
              const href = row.latest_article
                ? `/${row.story.slug ?? row.story.id}`
                : row.story.slug
                ? `/${row.story.slug}`
                : '#';
              return (
                <div key={row.story.id}>
                  {idx > 0 && <hr style={hairline} />}
                  <Link
                    href={href}
                    onClick={() => handleRowClick(row.story.id)}
                    style={{ textDecoration: 'none', display: 'block' }}
                  >
                    <StoryRow row={row} />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function StoryRow({ row }: { row: Row }) {
  const story = row.story;
  return (
    <div style={{ padding: '16px 0', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span
        aria-label={row.unread ? 'Unread' : undefined}
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: row.unread ? C.unread : 'transparent',
          flexShrink: 0,
          marginTop: 8,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: statusColor(story.lifecycle_status),
              flexShrink: 0,
            }}
          >
            {statusLabel(story.lifecycle_status)}
          </span>
          <span
            style={{
              fontFamily: SERIF,
              fontSize: 16,
              fontWeight: row.unread ? 700 : 600,
              color: 'var(--text)',
              lineHeight: 1.35,
            }}
          >
            {story.title}
          </span>
        </div>
        {row.latest_article && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
            {row.unread ? 'New: ' : 'Latest: '}
            {row.latest_article.title}
            {row.latest_article.published_at && ' · ' + timeShort(row.latest_article.published_at)}
          </p>
        )}
      </div>
    </div>
  );
}
