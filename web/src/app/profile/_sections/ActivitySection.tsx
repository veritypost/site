// "Activity" — full reading log, comments, bookmarks. Was a tab on the
// legacy dashboard; now its own section in the rail. Real DB-backed,
// filterable, shows empty/error states.

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import type { Tables } from '@/types/database-helpers';
import { createClient } from '@/lib/supabase/client';

import { EmptyState } from '../_components/EmptyState';
import { SkeletonBlock } from '../_components/Skeleton';
import { C, F, FONT, R, S, SH } from '../_lib/palette';

type ArticleWithSlug = { title: string | null; stories: { slug: string } | null } | null;

type ReadingLogJoined = Pick<
  Tables<'reading_log'>,
  'id' | 'created_at' | 'completed' | 'article_id'
> & {
  articles: ArticleWithSlug;
};
type CommentJoined = Pick<Tables<'comments'>, 'id' | 'body' | 'created_at' | 'article_id'> & {
  articles: ArticleWithSlug;
};
type BookmarkJoined = Pick<Tables<'bookmarks'>, 'id' | 'created_at' | 'article_id' | 'notes'> & {
  articles: ArticleWithSlug;
};

type Filter = 'all' | 'articles' | 'comments' | 'bookmarks';

interface Props {
  authUserId: string | null;
  preview: boolean;
  perms: { activity: boolean };
  isPro: boolean;
}

export function ActivitySection({ authUserId, preview, perms, isPro }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reads, setReads] = useState<ReadingLogJoined[]>([]);
  const [comments, setComments] = useState<CommentJoined[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkJoined[]>([]);
  const [streakCurrent, setStreakCurrent] = useState(0);
  const [streakBest, setStreakBest] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');

  const readDaySet = useMemo(() => {
    const cutoff = new Date(Date.now() - 30 * 86400000);
    const s = new Set<string>();
    for (const r of reads) {
      if (r.created_at && new Date(r.created_at) >= cutoff) {
        s.add(r.created_at.slice(0, 10));
      }
    }
    return s;
  }, [reads]);

  const load = useCallback(async () => {
    if (!authUserId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const cutoff30 = !isPro ? new Date(Date.now() - 30 * 86400000).toISOString() : null;

    const readLogQ = supabase
      .from('reading_log')
      .select('id, created_at, completed, article_id, articles(title, stories(slug))')
      .eq('user_id', authUserId)
      .is('kid_profile_id', null);
    const commentsQ = supabase
      .from('comments')
      .select('id, body, created_at, article_id, articles(title, stories(slug))')
      .eq('user_id', authUserId)
      .is('deleted_at', null);
    const bookmarksQ = supabase
      .from('bookmarks')
      .select('id, created_at, article_id, notes, articles(title, stories(slug))')
      .eq('user_id', authUserId);

    const [r, c, b, streakRes] = await Promise.all([
      (cutoff30 ? readLogQ.gte('created_at', cutoff30) : readLogQ)
        .order('created_at', { ascending: false })
        .limit(100),
      (cutoff30 ? commentsQ.gte('created_at', cutoff30) : commentsQ)
        .order('created_at', { ascending: false })
        .limit(50),
      (cutoff30 ? bookmarksQ.gte('created_at', cutoff30) : bookmarksQ)
        .order('created_at', { ascending: false })
        .limit(50),
      (async () => {
        try {
          return await supabase
            .from('users')
            .select('streak_current, streak_best')
            .eq('id', authUserId)
            .maybeSingle();
        } catch {
          return { data: null, error: null };
        }
      })(),
    ]);
    if (r.error || c.error || b.error) {
      setError(r.error?.message || c.error?.message || b.error?.message || 'Load failed.');
      setLoading(false);
      return;
    }
    setReads((r.data ?? []) as unknown as ReadingLogJoined[]);
    setComments((c.data ?? []) as unknown as CommentJoined[]);
    setBookmarks((b.data ?? []) as unknown as BookmarkJoined[]);
    if (streakRes.data) {
      setStreakCurrent((streakRes.data as { streak_current?: number | null }).streak_current ?? 0);
      setStreakBest((streakRes.data as { streak_best?: number | null }).streak_best ?? 0);
    }
    setLoading(false);
  }, [authUserId, isPro, preview, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
        <SkeletonBlock height={64} />
        <SkeletonBlock height={64} />
        <SkeletonBlock height={64} />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Couldn't load your activity"
        body={error}
        cta={{ label: 'Try again', onClick: load }}
        variant="full"
      />
    );
  }

  const items: Array<
    | {
        kind: 'article';
        id: string;
        when: string;
        title: string;
        slug: string | null;
        completed: boolean;
      }
    | {
        kind: 'comment';
        id: string;
        when: string;
        title: string;
        slug: string | null;
        body: string;
      }
    | {
        kind: 'bookmark';
        id: string;
        when: string;
        title: string;
        slug: string | null;
        notes: string | null;
      }
  > = [];
  if (filter === 'all' || filter === 'articles') {
    for (const r of reads) {
      items.push({
        kind: 'article',
        id: r.id,
        when: r.created_at,
        title: r.articles?.title ?? 'Untitled article',
        slug: r.articles?.stories?.slug ?? null,
        completed: !!r.completed,
      });
    }
  }
  if (filter === 'all' || filter === 'comments') {
    for (const c of comments) {
      items.push({
        kind: 'comment',
        id: c.id,
        when: c.created_at,
        title: c.articles?.title ?? 'Untitled article',
        slug: c.articles?.stories?.slug ?? null,
        body: c.body ?? '',
      });
    }
  }
  if (filter === 'all' || filter === 'bookmarks') {
    for (const b of bookmarks) {
      items.push({
        kind: 'bookmark',
        id: b.id,
        when: b.created_at,
        title: b.articles?.title ?? 'Untitled article',
        slug: b.articles?.stories?.slug ?? null,
        notes: b.notes,
      });
    }
  }
  items.sort((a, b) => Date.parse(b.when) - Date.parse(a.when));

  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing here yet"
        body="Read an article, drop a comment, or bookmark something to start your timeline."
        cta={{ label: 'Read today’s top stories', href: '/' }}
        variant="full"
      />
    );
  }

  const filterOpts: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'articles', label: 'Reads' },
    { id: 'comments', label: 'Comments' },
    { id: 'bookmarks', label: 'Bookmarks' },
  ];

  return (
    <div style={{ fontFamily: FONT.sans }}>
      <ReadingHeatmap readDaySet={readDaySet} streakCurrent={streakCurrent} streakBest={streakBest} />
      {!isPro && (
        <p style={{ margin: `0 0 ${S[3]}px`, fontSize: F.xs, color: C.inkMuted }}>Showing your last 30 days.</p>
      )}
      <div style={{ display: 'flex', gap: S[1], marginBottom: S[3], flexWrap: 'wrap' }}>
        {filterOpts.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setFilter(o.id)}
            style={{
              padding: `${S[1]}px ${S[3]}px`,
              background: filter === o.id ? C.ink : 'transparent',
              color: filter === o.id ? C.bg : C.inkSoft,
              border: `1px solid ${filter === o.id ? C.ink : C.border}`,
              borderRadius: R.pill,
              fontSize: F.sm,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: S[2],
        }}
      >
        {items.map((it) => {
          const when = new Date(it.when).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });
          return (
            <li
              key={`${it.kind}-${it.id}`}
              style={{
                background: C.surfaceRaised,
                border: `1px solid ${C.border}`,
                borderRadius: R.lg,
                padding: S[4],
                boxShadow: SH.ambient,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: S[3],
                  marginBottom: S[1],
                }}
              >
                <span
                  style={{
                    fontSize: F.xs,
                    color: C.inkMuted,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}
                >
                  {it.kind === 'article' ? (it.completed ? 'Read' : 'Started') : it.kind}
                </span>
                <span style={{ fontSize: F.xs, color: C.inkFaint }}>{when}</span>
              </div>
              {it.slug ? (
                <Link
                  href={`/${it.slug}`}
                  style={{
                    fontFamily: FONT.serif,
                    fontSize: F.md,
                    fontWeight: 600,
                    color: C.ink,
                    textDecoration: 'none',
                    letterSpacing: '-0.01em',
                    display: 'block',
                  }}
                >
                  {it.title}
                </Link>
              ) : (
                <span
                  style={{
                    fontFamily: FONT.serif,
                    fontSize: F.md,
                    fontWeight: 600,
                    color: C.inkMuted,
                    letterSpacing: '-0.01em',
                    display: 'block',
                  }}
                >
                  {it.title}
                </span>
              )}
              {it.kind === 'comment' && it.body ? (
                <p
                  style={{
                    margin: `${S[1]}px 0 0`,
                    fontSize: F.sm,
                    color: C.inkSoft,
                    lineHeight: 1.55,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {it.body}
                </p>
              ) : null}
              {it.kind === 'bookmark' && it.notes ? (
                <p style={{ margin: `${S[1]}px 0 0`, fontSize: F.sm, color: C.inkMuted }}>
                  {it.notes}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ReadingHeatmap({
  readDaySet,
  streakCurrent,
  streakBest,
}: {
  readDaySet: Set<string>;
  streakCurrent: number;
  streakBest: number;
}) {
  const days = useMemo(() => {
    const result: { date: string; read: boolean }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      result.push({ date: key, read: readDaySet.has(key) });
    }
    return result;
  }, [readDaySet]);

  return (
    <div style={{ marginBottom: S[4] }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(30, 1fr)', gap: 3 }}>
        {days.map(({ date, read }) => (
          <div
            key={date}
            title={date}
            style={{
              aspectRatio: '1',
              borderRadius: 2,
              background: read ? C.accent : C.surfaceSunken,
              border: `1px solid ${C.border}`,
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: S[4], marginTop: S[2], fontSize: F.xs, color: C.inkMuted }}>
        <span>Current streak · {streakCurrent} {streakCurrent === 1 ? 'day' : 'days'}</span>
        <span>Best · {streakBest} {streakBest === 1 ? 'day' : 'days'}</span>
      </div>
    </div>
  );
}
