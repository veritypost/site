// Rail card — single-article cell on the right rail (default) OR a
// list-style card (config.variant='list') driven by config.source:
//   - most_read              top reading_log article counts (7d)
//   - most_discussed         top comment counts (7d)
//   - recent_updates         articles by updated_at desc
//   - most_active_timelines  stories with the most timeline events (30d)
// The list variant matches the trust-rail look from
// redesign-preview.html: mono accent kicker + 4 rows, each a title
// on the left and a small badge on the right, hairline dividers.

import Link from 'next/link';
import Ad from '@/components/Ad';
import { createServiceClient } from '@/lib/supabase/server';
import type { SlotRow } from '../types';
import { type CardCtx, categoryFor, storyHref } from './_shared';

type ListRow = {
  id: string;
  title: string;
  slug: string | null;
  badge: string | null;
};

const ROW_CAP = 4;

const DEFAULT_LABEL: Record<string, string> = {
  most_read: 'Most read',
  most_discussed: 'Most discussed',
  recent_updates: 'Recent updates',
  most_active_timelines: 'Most active timelines',
};

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function relTime(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

/* Default time windows per source. Each can be overridden per slot
   via config.days (1..365), so an owner can set "Most read this
   week" vs "Most read this month" without code changes. */
const DEFAULT_DAYS: Record<string, number> = {
  most_read: 7,
  most_discussed: 7,
  recent_updates: 0, // no window — order by updated_at directly
  most_active_timelines: 30,
};

function resolveDays(source: string, cfgDays: unknown): number {
  if (typeof cfgDays === 'number' && cfgDays > 0 && cfgDays <= 365) {
    return Math.floor(cfgDays);
  }
  return DEFAULT_DAYS[source] ?? 7;
}

async function fetchListRows(
  source: string,
  cfgDays: unknown,
): Promise<ListRow[]> {
  const service = createServiceClient();
  const days = resolveDays(source, cfgDays);

  if (source === 'most_read' || source === 'most_discussed') {
    const fromTable = source === 'most_read' ? 'reading_log' : 'comments';
    const filterCol = source === 'most_discussed' ? 'status' : null;
    const since = isoDaysAgo(days);
    let q = service
      .from(fromTable)
      .select(
        'article_id, articles!inner(id, title, stories(slug))',
      )
      .gte('created_at', since)
      .not('article_id', 'is', null)
      .limit(500);
    if (filterCol) q = q.eq(filterCol as 'id', 'visible');
    const { data } = await q;
    const rows = (data ?? []) as Array<{
      article_id: string;
      articles: {
        id: string;
        title: string | null;
        stories: { slug: string | null } | null;
      } | null;
    }>;
    const counts = new Map<string, { row: ListRow; count: number }>();
    for (const r of rows) {
      if (!r.articles || !r.articles.stories?.slug) continue;
      const existing = counts.get(r.article_id);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(r.article_id, {
          row: {
            id: r.articles.id,
            title: r.articles.title ?? '',
            slug: r.articles.stories.slug,
            badge: null,
          },
          count: 1,
        });
      }
    }
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, ROW_CAP)
      .map(({ row, count }) => ({
        ...row,
        badge: source === 'most_read' ? `${count} reads` : `${count} replies`,
      }));
  }

  if (source === 'recent_updates') {
    const { data } = await service
      .from('articles')
      .select('id, title, updated_at, stories(slug)')
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .limit(ROW_CAP);
    const rows = (data ?? []) as Array<{
      id: string;
      title: string | null;
      updated_at: string | null;
      stories: { slug: string | null } | null;
    }>;
    return rows
      .filter((r) => r.stories?.slug)
      .map((r) => ({
        id: r.id,
        title: r.title ?? '',
        slug: r.stories?.slug ?? null,
        badge: relTime(r.updated_at) || null,
      }));
  }

  if (source === 'most_active_timelines') {
    const since = isoDaysAgo(days);
    const { data } = await service
      .from('timelines')
      .select(
        'story_id, stories!inner(slug, title, articles!fk_articles_story_id(id, title))',
      )
      .gte('event_date', since)
      .limit(500);
    const rows = (data ?? []) as Array<{
      story_id: string;
      stories: {
        slug: string | null;
        title: string | null;
      } | null;
    }>;
    const counts = new Map<
      string,
      { row: ListRow; count: number }
    >();
    for (const r of rows) {
      if (!r.stories?.slug) continue;
      const ex = counts.get(r.story_id);
      if (ex) {
        ex.count += 1;
      } else {
        counts.set(r.story_id, {
          row: {
            id: r.story_id,
            title: r.stories.title ?? '',
            slug: r.stories.slug,
            badge: null,
          },
          count: 1,
        });
      }
    }
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, ROW_CAP)
      .map(({ row, count }) => ({ ...row, badge: `+${count} this month` }));
  }

  return [];
}

export default async function RailCard({
  slot,
  ctx,
}: {
  slot: SlotRow;
  ctx: CardCtx;
}) {
  const config = (slot.config ?? {}) as Record<string, unknown>;
  const variant =
    typeof config.variant === 'string' ? (config.variant as string) : 'card';
  const source =
    typeof config.source === 'string' ? (config.source as string) : null;

  if (variant === 'list' && source && DEFAULT_LABEL[source]) {
    const rows = await fetchListRows(source, config.days);
    const label =
      (typeof config.label === 'string' && config.label) ||
      DEFAULT_LABEL[source];
    const skeletonCss = `
      @keyframes vp-rh-skel-pulse {
        0%, 100% { opacity: 0.7; }
        50% { opacity: 0.35; }
      }
      .vp-rh-skel-bar {
        background: var(--vp-border-soft);
        border-radius: 4px;
        height: 12px;
        display: inline-block;
        animation: vp-rh-skel-pulse 1.4s ease-in-out infinite;
      }
      @media (prefers-reduced-motion: reduce) {
        .vp-rh-skel-bar { animation: none; }
      }
    `;
    if (rows.length === 0) {
      const widths = [80, 70, 75, 65];
      return (
        <aside className="vp-rh-rail-card vp-rh-rail-card--list">
          <style dangerouslySetInnerHTML={{ __html: skeletonCss }} />
          <p className="vp-rh-rail-card__list-label">{label}</p>
          <ul className="vp-rh-rail-card__list-rows">
            {widths.map((w, i) => (
              <li key={i} className="vp-rh-rail-card__list-row">
                <span
                  className="vp-rh-rail-card__list-title"
                  aria-hidden="true"
                >
                  <span
                    className="vp-rh-skel-bar"
                    style={{ width: `${w}%` }}
                  />
                </span>
                <span
                  className="vp-rh-rail-card__list-badge"
                  aria-hidden="true"
                >
                  <span
                    className="vp-rh-skel-bar"
                    style={{ width: '20%' }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </aside>
      );
    }
    return (
      <aside className="vp-rh-rail-card vp-rh-rail-card--list">
        <p className="vp-rh-rail-card__list-label">{label}</p>
        <ul className="vp-rh-rail-card__list-rows">
          {rows.map((r) => (
            <li key={r.id} className="vp-rh-rail-card__list-row">
              {r.slug ? (
                <Link
                  href={`/${r.slug}`}
                  className="vp-rh-rail-card__list-title"
                >
                  {r.title}
                </Link>
              ) : (
                <span className="vp-rh-rail-card__list-title">{r.title}</span>
              )}
              {r.badge && (
                <span className="vp-rh-rail-card__list-badge">{r.badge}</span>
              )}
            </li>
          ))}
        </ul>
      </aside>
    );
  }

  const item = slot.items[0];
  if (!item) return null;

  if (item.content_type === 'ad') {
    const placement = (item.payload?.placement as string) || 'home_rail';
    return (
      <aside className="vp-rh-rail-card vp-rh-rail-card--ad">
        <Ad placement={placement} page="home" position="rail" />
      </aside>
    );
  }

  const story = item.article;
  if (!story) return null;
  const href = storyHref(story);
  const cat = categoryFor(story, ctx);

  const body = (
    <>
      {cat?.name && <p className="vp-rh-rail-card__cat">{cat.name}</p>}
      <h4 className="vp-rh-rail-card__title">{story.title}</h4>
      {story.excerpt && (
        <p className="vp-rh-rail-card__dek">{story.excerpt}</p>
      )}
    </>
  );

  return (
    <aside className="vp-rh-rail-card">
      {href ? (
        <Link href={href} className="vp-rh-rail-card__link">{body}</Link>
      ) : (
        <div className="vp-rh-rail-card__link">{body}</div>
      )}
    </aside>
  );
}
