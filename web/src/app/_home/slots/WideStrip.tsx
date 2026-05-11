// Story river section. Launch assumes a lighter daily volume, so this
// stays intentionally short and curated instead of stretching into a
// long tail of near-duplicate cards.

import { createServiceClient } from '@/lib/supabase/server';
import { C, StoryLink, type CardCtx, type HomeStory } from './_shared';
import { timeShort } from '../../_homeShared';
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

export default async function WideStrip({
  slot,
  ctx,
}: {
  slot: SlotRow;
  ctx: CardCtx;
}) {
  const seeded = slot.items
    .map((i) => i.article)
    .filter((s): s is HomeStory => !!s);

  let stories: HomeStory[] = seeded.slice(0, TARGET_COUNT);
  if (stories.length < TARGET_COUNT) {
    const excludeIds = new Set(stories.map((s) => s.id));
    const filler = await fetchRecent(excludeIds, TARGET_COUNT - stories.length);
    stories = [...stories, ...filler];
  }
  if (stories.length === 0) return null;

  const label =
    typeof slot.config.label === 'string' ? slot.config.label : 'More to Know';

  return (
    <section className="vp-river-section vp-river-section--wide">
      <header className="vp-section-head">
        <p className="vp-section-head__label">{label}</p>
      </header>
      <div className="vp-river-grid">
        {stories.map((story) => {
          const cat = categoryFor(story, ctx);
          const imageUrl = story.cover_image_url ?? null;
          const imageAlt = story.cover_image_alt ?? story.title ?? '';
          const t = timeShort(story.published_at) || '';
          const metaSuffix = cat?.name || '';

          return (
            <article key={story.id} className="vp-river-card">
              <StoryLink
                story={story}
                className="vp-river-card__link"
                style={{ display: 'grid' }}
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
        })}
      </div>
    </section>
  );
}
