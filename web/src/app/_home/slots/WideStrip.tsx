// Story river section. Launch assumes a lighter daily volume, so this
// stays intentionally short and curated instead of stretching into a
// long tail of near-duplicate cards.

import { Fragment, type ReactElement } from 'react';
import SsrAdCell from '../_SsrAdCell';
import { createServiceClient } from '@/lib/supabase/server';
import { C, StoryLink, type CardCtx, type HomeStory } from './_shared';
import { timeShort } from '../_shared';
import type { SlotRow } from '../types';

const TARGET_COUNT = 4;

function categoryFor(story: HomeStory, ctx: CardCtx) {
  return story.category_id ? ctx.categoryById[story.category_id] : undefined;
}

async function fetchRecent(excludeIds: Set<string>, limit: number): Promise<HomeStory[]> {
  if (limit <= 0) return [];
  const service = createServiceClient();
  const { data, error } = await service
    .from('articles')
    .select(
      'id, title, excerpt, category_id, is_breaking, is_developing, published_at, cover_image_url, cover_image_alt, stories(slug, lifecycle_status)'
    )
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('published_at', { ascending: false })
    .limit(limit + excludeIds.size);
  if (error || !data) return [];
  const out: HomeStory[] = [];
  for (const row of data as unknown as HomeStory[]) {
    if (excludeIds.has(row.id)) continue;
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

function renderRiverCard(
  key: string,
  story: HomeStory,
  ctx: CardCtx,
): ReactElement {
  const cat = categoryFor(story, ctx);
  const imageUrl = story.cover_image_url ?? null;
  const imageAlt = story.cover_image_alt ?? story.title ?? '';
  const t = timeShort(story.published_at) || '';
  const metaSuffix = cat?.name || '';

  return (
    <article key={key} className="vp-river-card">
      <StoryLink
        story={story}
        className="vp-river-card__link"
      >
        {imageUrl && (
          <div className="vp-river-card__art" style={{ background: C.rule }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={imageAlt}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          </div>
        )}
        {cat && (
          <p
            className="vp-river-card__cat"
            style={{ color: cat.color_hex || C.dim }}
          >
            {cat.name}
          </p>
        )}
        <h3 className="vp-river-card__hed">{story.title}</h3>
        {story.excerpt && (
          <p className="vp-river-card__dek">{story.excerpt}</p>
        )}
        {(t || metaSuffix) && (
          <div className="vp-river-card__meta">
            {[t, metaSuffix].filter(Boolean).join(' · ')}
          </div>
        )}
      </StoryLink>
    </article>
  );
}

export default async function WideStrip({
  slot,
  ctx,
}: {
  slot: SlotRow;
  ctx: CardCtx;
}) {
  // Per-item dispatch (mirrors Cluster.tsx). Articles + ads render in
  // declared order up to `cap`; if editorial left fewer slotted items,
  // backfill with recent articles so the river grid keeps shape. Owner
  // can override the cap via home_slots.config.capacity (validated 1..30
  // server-side); default is TARGET_COUNT.
  const cfgCap = slot.config?.capacity;
  const cap =
    typeof cfgCap === 'number' && cfgCap > 0 && cfgCap <= 30
      ? cfgCap
      : TARGET_COUNT;
  const sortedItems = [...slot.items]
    .sort((a, b) => a.position - b.position)
    .slice(0, cap);

  const seededIds = new Set<string>();
  const rendered: ReactElement[] = [];

  for (const item of sortedItems) {
    if (item.content_type === 'article') {
      const story = item.article;
      if (!story) continue;
      seededIds.add(story.id);
      rendered.push(renderRiverCard(item.id, story, ctx));
      continue;
    }
    if (item.content_type === 'ad') {
      const placement = item.payload?.placement;
      if (typeof placement !== 'string' || placement.length === 0) continue;
      const page =
        typeof item.payload?.page === 'string' && item.payload.page
          ? (item.payload.page as string)
          : 'home';
      const position =
        typeof item.payload?.position === 'string' && item.payload.position
          ? (item.payload.position as string)
          : `wide_strip:${placement}`;
      const cell = await SsrAdCell({
        placement,
        page,
        position,
        wrapperClassName: 'vp-rh-card vp-rh-card-ad',
        selector: `.vp-rh-card-ad[data-river-ad-id="${item.id}"]`,
        dataAttrs: { 'data-river-ad-id': String(item.id) },
      });
      if (cell) rendered.push(<Fragment key={item.id}>{cell}</Fragment>);
    }
  }

  if (rendered.length < cap) {
    const filler = await fetchRecent(seededIds, cap - rendered.length);
    for (const story of filler) {
      rendered.push(renderRiverCard(`filler-${story.id}`, story, ctx));
    }
  }

  if (rendered.length === 0) return null;

  const label =
    typeof slot.config.label === 'string' ? slot.config.label : 'More to Know';

  return (
    <section className="vp-river-section">
      <header className="vp-section-head">
        <p className="vp-section-head__label">{label}</p>
      </header>
      <div className="vp-river-grid">{rendered}</div>
    </section>
  );
}
