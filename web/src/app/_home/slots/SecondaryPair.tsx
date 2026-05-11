// Secondary pair — compact text-first "front line" board under the hero.
// Launch assumes a lighter daily story count, so this tops out at four
// strong cards instead of trying to impersonate an endless feed.

import type { ReactElement } from 'react';
import Ad from '@/components/Ad';
import { createServiceClient } from '@/lib/supabase/server';
import { StoryLink, type CardCtx, type HomeStory } from './_shared';
import { timeShort } from '../_shared-legacy';
import type { SlotRow } from '../types';
import { categoryDotStyle } from './_categoryColor';

const TARGET_COUNT = 4;

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

function renderArticleCard(
  key: string,
  story: HomeStory,
  ctx: CardCtx,
): ReactElement {
  const cat = story.category_id ? ctx.categoryById[story.category_id] : undefined;
  const time = timeShort(story.published_at);
  const catLabel = cat?.name ?? null;
  return (
    <article key={key} className="vp-frontline__card">
      <StoryLink story={story} className="vp-frontline__link">
        {(catLabel || story.is_developing) && (
          <span
            className="vp-frontline__cat"
            style={categoryDotStyle(cat?.color_hex ?? null)}
          >
            {story.is_developing ? 'Developing' : catLabel}
          </span>
        )}
        <h3 className="vp-frontline__hed">{story.title}</h3>
        {story.excerpt && (
          <p className="vp-frontline__dek">{story.excerpt}</p>
        )}
        <div
          className="vp-frontline__meta"
          aria-label={time ? `Published ${time}` : undefined}
        >
          {time}
        </div>
      </StoryLink>
    </article>
  );
}

export default async function SecondaryPair({
  slot,
  ctx,
}: {
  slot: SlotRow;
  ctx: CardCtx;
}) {
  // Per-item dispatch (mirrors Cluster.tsx) — render articles + ads in
  // declared order up to TARGET_COUNT. If editorial left fewer than
  // TARGET_COUNT slotted, backfill with recent articles (legacy behavior)
  // so the front-line grid doesn't visually collapse.
  // Owner can override the cell count via home_slots.config.capacity
  // (validated 1..30 server-side); default is TARGET_COUNT.
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
      rendered.push(renderArticleCard(item.id, story, ctx));
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
          : 'secondary_pair';
      rendered.push(
        <div key={item.id} className="vp-rh-card vp-rh-card-ad">
          <Ad placement={placement} page={page} position={position} />
        </div>,
      );
    }
  }

  if (rendered.length < cap) {
    const filler = await fetchRecent(seededIds, cap - rendered.length);
    for (const story of filler) {
      rendered.push(renderArticleCard(`filler-${story.id}`, story, ctx));
    }
  }

  if (rendered.length === 0) return null;

  const label =
    typeof slot.config.label === 'string' ? slot.config.label : 'Front Line';

  return (
    <section className="vp-frontline">
      <header className="vp-section-head">
        <p className="vp-section-head__label">{label}</p>
      </header>
      <div className="vp-frontline__grid">{rendered}</div>
    </section>
  );
}
