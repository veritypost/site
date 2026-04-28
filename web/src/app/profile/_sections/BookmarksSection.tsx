// Bookmarks — inline list. Click an article to read; the rest of the
// profile shell stays put. No more being kicked over to /bookmarks.

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/client';
import type { Tables } from '@/types/database-helpers';

import { Card } from '../_components/Card';
import { EmptyState } from '../_components/EmptyState';
import { SkeletonBlock } from '../_components/Skeleton';
import { C, F, FONT, R, S } from '../_lib/palette';

type BookmarkRow = Pick<Tables<'bookmarks'>, 'id' | 'created_at' | 'article_id' | 'notes'> & {
  articles: { title: string | null; slug: string | null; subtitle: string | null } | null;
};

interface Props {
  preview: boolean;
}

export function BookmarksSection({ preview }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<BookmarkRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('bookmarks')
        .select('id, created_at, article_id, notes, articles(title, slug, subtitle)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (cancelled) return;
      setRows((data ?? []) as unknown as BookmarkRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [preview, supabase]);

  if (loading) return <SkeletonBlock height={120} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No bookmarks yet"
        body="Tap the bookmark icon on any article to save it here."
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
          const target = b.articles?.slug ? `/article/${b.articles.slug}` : '#';
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
              <Link
                href={target}
                style={{
                  fontFamily: FONT.serif,
                  fontSize: F.md,
                  fontWeight: 600,
                  color: C.ink,
                  textDecoration: 'none',
                  display: 'block',
                  letterSpacing: '-0.01em',
                }}
              >
                {b.articles?.title ?? 'Untitled article'}
              </Link>
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
