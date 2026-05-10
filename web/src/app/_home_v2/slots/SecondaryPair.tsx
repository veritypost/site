// Secondary pair — compact text-first "front line" board under the hero.
// Launch assumes a lighter daily story count, so this tops out at four
// strong cards instead of trying to impersonate an endless feed.

import { createServiceClient } from '@/lib/supabase/server';
import { StoryLink, type CardCtx, type HomeStory } from './_shared';
import { timeShort } from '../../_homeShared';
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

export default async function SecondaryPair({
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
    typeof slot.config.label === 'string' ? slot.config.label : 'Front Line';

  return (
    <section className="vp-frontline">
      <header className="vp-section-head">
        <p className="vp-section-head__label">{label}</p>
      </header>
      <div className="vp-frontline__grid">
        {stories.map((story) => {
          const cat = story.category_id
            ? ctx.categoryById[story.category_id]
            : undefined;
          const time = timeShort(story.published_at);
          const catLabel = cat?.name ?? null;

          return (
            <article key={story.id} className="vp-frontline__card">
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
        })}
      </div>
    </section>
  );
}
