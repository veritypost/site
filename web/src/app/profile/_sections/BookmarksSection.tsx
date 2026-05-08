// Bookmarks — inline list. Click an article to read; the rest of the
// profile shell stays put. No more being kicked over to /bookmarks.

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/client';
import type { Tables } from '@/types/database-helpers';

import { Card } from '../_components/Card';
import { EmptyState } from '../_components/EmptyState';
import { SkeletonBlock } from '../_components/Skeleton';
import { useToast } from '../_components/Toast';
import { C, F, FONT, R, S } from '../_lib/palette';

type BookmarkRow = Pick<Tables<'bookmarks'>, 'id' | 'created_at' | 'article_id' | 'notes'> & {
  articles: { title: string | null; subtitle: string | null; stories: { slug: string } | null } | null;
};

interface Props {
  preview: boolean;
}

export function BookmarksSection({ preview }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [rows, setRows] = useState<BookmarkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    setLoading(true);
    setError(false);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      if (signal?.cancelled) return;
      setLoading(false);
      return;
    }
    const { data, error: queryError } = await supabase
      .from('bookmarks')
      .select('id, created_at, article_id, notes, articles(title, subtitle, stories(slug))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (signal?.cancelled) return;
    if (queryError) {
      setError(true);
      setLoading(false);
      toast.error('Could not load bookmarks.');
      return;
    }
    setRows((data ?? []) as unknown as BookmarkRow[]);
    setLoading(false);
  }, [supabase, toast]);

  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [preview, load]);

  if (loading) return <SkeletonBlock height={120} />;
  if (error) return (
    <div style={{ padding: '24px 0', textAlign: 'center', color: C.inkMuted, fontSize: 14 }}>
      <div style={{ marginBottom: S[2] }}>Could not load bookmarks.</div>
      <button
        type="button"
        onClick={() => { void load(); }}
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
        body="Tap Follow on any article to save it here."
        cta={{ label: 'Read today’s top stories', href: '/' }}
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
        {rows.map((b) => {
          return (
            <li
              key={b.id}
              style={{
                background: C.surfaceSunken,
                border: `1px solid ${C.border}`,
                borderRadius: R.md,
                padding: S[3],
              }}
            >
              {b.articles?.stories?.slug ? (
                <Link
                  href={`/${b.articles.stories.slug}`}
                  style={{
                    fontFamily: FONT.serif,
                    fontSize: F.md,
                    fontWeight: 600,
                    color: C.ink,
                    textDecoration: 'none',
                    display: 'block',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {b.articles?.title ?? 'Untitled article'}
                </Link>
              ) : (
                <span
                  style={{
                    fontFamily: FONT.serif,
                    fontSize: F.md,
                    fontWeight: 600,
                    color: C.inkMuted,
                    display: 'block',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {b.articles?.title ?? 'Untitled article'}
                </span>
              )}
              {b.articles?.subtitle ? (
                <div
                  style={{ fontSize: F.sm, color: C.inkMuted, marginTop: S[1], lineHeight: 1.5 }}
                >
                  {b.articles.subtitle}
                </div>
              ) : null}
              {b.notes ? (
                <div
                  style={{
                    marginTop: S[2],
                    fontSize: F.sm,
                    color: C.inkSoft,
                    fontStyle: 'italic',
                  }}
                >
                  {b.notes}
                </div>
              ) : null}
              <div style={{ fontSize: F.xs, color: C.inkFaint, marginTop: S[2] }}>
                Saved {new Date(b.created_at).toLocaleDateString()}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
