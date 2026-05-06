// "Activity" — full reading log and comments. Was a tab on the
// legacy dashboard; now its own section in the rail. Real DB-backed,
// filterable, shows empty/error states.

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

type Filter = 'all' | 'articles' | 'comments';

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
  const [filter, setFilter] = useState<Filter>('all');

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

    const [r, c] = await Promise.all([
      (cutoff30 ? readLogQ.gte('created_at', cutoff30) : readLogQ)
        .order('created_at', { ascending: false })
        .limit(100),
      (cutoff30 ? commentsQ.gte('created_at', cutoff30) : commentsQ)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    if (r.error || c.error) {
      setError('Could not load your activity. Try again.');
      setLoading(false);
      return;
    }
    setReads((r.data ?? []) as unknown as ReadingLogJoined[]);
    setComments((c.data ?? []) as unknown as CommentJoined[]);
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
  items.sort((a, b) => Date.parse(b.when) - Date.parse(a.when));

  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing here yet"
        body="Read an article or drop a comment to start your timeline."
        cta={{ label: 'Read today’s top stories', href: '/' }}
        variant="full"
      />
    );
  }

  const filterOpts: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'articles', label: 'Reads' },
    { id: 'comments', label: 'Comments' },
  ];

  return (
    <div style={{ fontFamily: FONT.sans }}>
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
          const cardContent = (
            <>
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
              <span
                style={{
                  fontFamily: FONT.serif,
                  fontSize: F.md,
                  fontWeight: 600,
                  color: it.slug ? C.ink : C.inkMuted,
                  letterSpacing: '-0.01em',
                  display: 'block',
                }}
              >
                {it.title}
              </span>
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
            </>
          );
          const cardStyle: React.CSSProperties = {
            background: C.surfaceRaised,
            border: `1px solid ${C.border}`,
            borderRadius: R.lg,
            padding: S[4],
            boxShadow: SH.ambient,
            display: 'block',
            textDecoration: 'none',
            color: 'inherit',
          };
          return (
            <li key={`${it.kind}-${it.id}`}>
              {it.slug ? (
                <Link
                  href={it.kind === 'comment' ? `/${it.slug}#comment-${it.id}` : `/${it.slug}`}
                  style={cardStyle}
                >
                  {cardContent}
                </Link>
              ) : (
                <div style={{ ...cardStyle, cursor: 'default' }}>{cardContent}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
