// Cluster slot — density-wall stacked story previews. Renders inside a
// single .vp-rh-density-wall section with optional section head, an
// optional batched timeline-event-count fetch, and N stacked
// .vp-rh-story-preview rows separated only by a thin bottom rule.
//
// Card shape: multi-segment kicker (parent category · subcategory ·
// timestamp) → editorial-serif title with inline Link → optional excerpt
// → story-state row (Updated <time> · optional Timeline: N events). No
// whole-card link, no arrow cue. Ad cells reuse the existing
// <SsrAdCell /> path and keep their card chrome — they look out of place
// inside the density wall but functionality is preserved.

import { Fragment, type ReactElement } from 'react';
import Link from 'next/link';
import type { SlotRow } from '../types';
import type { CardCtx, HomeStory } from './_shared';
import SsrAdCell from '../_SsrAdCell';
import { HOME_EDITORIAL_TZ, timeShort } from '../_shared';
import { createServiceClient } from '@/lib/supabase/server';

function articleHref(s: HomeStory): string {
  const slug = s.stories?.slug;
  return slug ? `/${slug}` : '#';
}

function categoryPair(
  story: HomeStory,
  byId: CardCtx['categoryById'],
): { parent: string; sub: string | null } {
  if (!story.category_id) return { parent: 'News', sub: null };
  const c = byId[story.category_id];
  if (!c) return { parent: 'News', sub: null };
  if (c.parent_id) {
    const parent = byId[c.parent_id];
    if (parent) return { parent: parent.name, sub: c.name };
  }
  return { parent: c.name, sub: null };
}

function kickerTimestamp(
  updatedAt: string | null,
  publishedAt: string | null,
): string {
  const pub = publishedAt ? new Date(publishedAt) : null;
  const upd = updatedAt ? new Date(updatedAt) : null;
  if (!pub || Number.isNaN(pub.getTime())) return '';
  if (
    upd &&
    !Number.isNaN(upd.getTime()) &&
    upd.getTime() - pub.getTime() > 30 * 60 * 1000
  ) {
    return 'Updated';
  }
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: HOME_EDITORIAL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayKey = fmt.format(new Date());
  const pubKey = fmt.format(pub);
  if (todayKey === pubKey) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: HOME_EDITORIAL_TZ,
      hour: 'numeric',
      minute: '2-digit',
    }).format(pub);
  }
  return new Intl.DateTimeFormat('en-US', {
    timeZone: HOME_EDITORIAL_TZ,
    month: 'short',
    day: '2-digit',
  }).format(pub);
}

export default async function Cluster({
  slot,
  ctx,
}: {
  slot: SlotRow;
  ctx: CardCtx;
}) {
  const cfgCap = slot.config?.capacity;
  const cap =
    typeof cfgCap === 'number' && cfgCap > 0 && cfgCap <= 30 ? cfgCap : 15;
  const items = [...slot.items]
    .sort((a, b) => a.position - b.position)
    .slice(0, cap);

  // Batch the timeline-event counts for every article in the cluster so
  // each card can show "Timeline: N events" without an N+1 fan-out. Ad
  // items have no story_id; article items without a story_id (one-off
  // pieces that aren't part of a story) just won't surface a count.
  const storyIds = items
    .map((i) => i.article?.story_id)
    .filter((x): x is string => typeof x === 'string' && x.length > 0);

  const timelineCounts: Record<string, number> = {};
  if (storyIds.length > 0) {
    const service = createServiceClient();
    const { data } = await service
      .from('timelines')
      .select('story_id')
      .in('story_id', storyIds);
    for (const row of (data ?? []) as { story_id: string | null }[]) {
      if (row.story_id) {
        timelineCounts[row.story_id] = (timelineCounts[row.story_id] ?? 0) + 1;
      }
    }
  }

  const nodes = await Promise.all(
    items.map(async (item) => {
      if (item.content_type === 'article') {
        const s = item.article;
        if (!s || !s.stories?.slug) return null;
        const { parent, sub } = categoryPair(s, ctx.categoryById);
        const stamp = kickerTimestamp(s.updated_at, s.published_at);
        const tlCount = s.story_id ? timelineCounts[s.story_id] ?? 0 : 0;
        const updatedLabel = timeShort(s.updated_at ?? s.published_at);
        return (
          <article
            key={item.id}
            className="vp-rh-story-preview"
          >
            <div className="vp-rh-story-preview__kicker">
              <span>{parent}</span>
              {sub && (
                <>
                  <span className="sep">·</span>
                  <span>{sub}</span>
                </>
              )}
              {stamp && (
                <>
                  <span className="sep">·</span>
                  <span>{stamp}</span>
                </>
              )}
            </div>
            <h2 className="vp-rh-story-preview__title">
              <Link href={articleHref(s)} data-testid="home-article-link">
                {s.title}
              </Link>
            </h2>
            {s.excerpt && (
              <p className="vp-rh-story-preview__summary">{s.excerpt}</p>
            )}
            <div className="vp-rh-story-state">
              {updatedLabel && <span>Updated {updatedLabel}</span>}
              {tlCount > 0 && (
                <span>
                  Timeline: {tlCount} {tlCount === 1 ? 'event' : 'events'}
                </span>
              )}
            </div>
          </article>
        );
      }
      if (item.content_type === 'ad') {
        const placement = item.payload?.placement;
        if (typeof placement !== 'string' || placement.length === 0) {
          return null;
        }
        const cell = await SsrAdCell({
          placement,
          page: 'home',
          position: `cluster:${placement}`,
          wrapperClassName: 'vp-rh-card vp-rh-card-ad',
          selector: `.vp-rh-card-ad[data-cluster-ad-id="${item.id}"]`,
          dataAttrs: { 'data-cluster-ad-id': String(item.id) },
        });
        if (!cell) return null;
        return <Fragment key={item.id}>{cell}</Fragment>;
      }
      return null;
    }),
  );

  const rendered = nodes.filter(
    (node): node is ReactElement => node !== null,
  );

  if (rendered.length === 0) return null;

  const rawTitle = slot.config?.title;
  const title = typeof rawTitle === 'string' && rawTitle.length > 0 ? rawTitle : null;
  const rawMoreHref = slot.config?.more_href;
  const moreHref =
    typeof rawMoreHref === 'string' && rawMoreHref.length > 0 ? rawMoreHref : null;
  const rawMoreLabel = slot.config?.more_label;
  const moreLabel =
    typeof rawMoreLabel === 'string' && rawMoreLabel.length > 0
      ? rawMoreLabel
      : 'All sections →';

  return (
    <section className="vp-rh-density-wall">
      {title && (
        <div className="vp-rh-sect-head">
          <span className="vp-rh-sect-head__title">{title}</span>
          {moreHref && (
            <Link href={moreHref} className="vp-rh-sect-head__more">
              {moreLabel}
            </Link>
          )}
        </div>
      )}
      {rendered}
    </section>
  );
}
