// Owner cleanup item 12 (2026-05-08) — inline Following list for the
// profile shell. Was an article-level bookmarks list (now retired);
// pulls /api/story-follows and renders the same shape as the
// standalone /following page in compact form. Keeping the file name
// `BookmarksSection.tsx` avoids churning all the import sites; the
// surface label is "Following" (set on the section meta in ProfileApp).

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { Card } from '../_components/Card';
import { EmptyState } from '../_components/EmptyState';
import { SkeletonBlock } from '../_components/Skeleton';
import { useToast } from '../_components/Toast';
import { C, F, FONT, R, S } from '../_lib/palette';

interface Props {
  preview: boolean;
}

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

export function BookmarksSection({ preview: _preview }: Props) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/story-follows', { method: 'GET' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch {
      setError(true);
      toast.error('Could not load follows.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markSeen(storyId: string) {
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
      // Non-fatal — next load reconciles.
    }
  }

  const titleStyle = useMemo(
    () => ({
      fontFamily: FONT.serif,
      fontSize: F.md,
      fontWeight: 600 as const,
      color: C.ink,
      letterSpacing: '-0.02em',
    }),
    []
  );

  if (loading) return <SkeletonBlock height={120} />;
  if (error)
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: C.inkMuted, fontSize: 14 }}>
        <div style={{ marginBottom: S[2] }}>Could not load follows.</div>
        <button
          type="button"
          onClick={() => {
            void load();
          }}
          style={{
            fontFamily: FONT.sans,
            fontSize: F.sm,
            fontWeight: 600,
            color: C.ink,
            background: 'transparent',
            border: `1px solid ${C.border}`,
            borderRadius: R.sm,
            padding: `${S[1]}px ${S[3]}px`,
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    );
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Not following anything yet"
        body="Tap Follow on any story to start tracking it."
        cta={{ label: "Read today's top stories", href: '/' }}
        variant="full"
      />
    );
  }

  return (
    <Card>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: S[2],
          fontFamily: FONT.sans,
        }}
      >
        {rows.map((row) => {
          const slug = row.story.slug || row.story.id;
          return (
            <li
              key={row.story.id}
              style={{
                background: C.surfaceSunken,
                border: `1px solid ${C.border}`,
                borderRadius: R.md,
                padding: S[3],
                display: 'flex',
                gap: S[3],
                alignItems: 'flex-start',
              }}
            >
              <span
                aria-label={row.unread ? 'Unread' : undefined}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: row.unread ? C.ink : 'transparent',
                  flexShrink: 0,
                  marginTop: 7,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link
                  href={`/${slug}`}
                  onClick={() => markSeen(row.story.id)}
                  style={{ ...titleStyle, textDecoration: 'none', display: 'block' }}
                >
                  {row.story.title}
                </Link>
                {row.latest_article && (
                  <div
                    style={{
                      fontSize: F.xs,
                      color: C.inkMuted,
                      marginTop: S[1],
                      lineHeight: 1.5,
                    }}
                  >
                    {row.unread ? 'New: ' : 'Latest: '}
                    {row.latest_article.title}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
