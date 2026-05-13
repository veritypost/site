import { Fragment, type ReactElement } from 'react';
import SsrAdCell from '../_SsrAdCell';
import {
  C,
  StoryLink,
  type CardCtx,
  type HomeStory,
} from './_shared';
import type { SlotRow } from '../types';

function categoryFor(story: HomeStory, ctx: CardCtx) {
  return story.category_id ? ctx.categoryById[story.category_id] : undefined;
}

export default async function EditorsPicks({
  slot,
  ctx,
}: {
  slot: SlotRow;
  ctx: CardCtx;
}) {
  // Per-item dispatch on content_type (mirrors Cluster.tsx). Cap mixed
  // articles + ads at 3 total so the section keeps its three-up shape.
  // Cell-count cap. Owner can override via home_slots.config.capacity
  // (validated 1..30 server-side); default 3 keeps the three-up shape.
  const cfgCap = slot.config?.capacity;
  const cap =
    typeof cfgCap === 'number' && cfgCap > 0 && cfgCap <= 30 ? cfgCap : 3;
  const items = [...slot.items]
    .sort((a, b) => a.position - b.position)
    .slice(0, cap);

  const rendered = (
    await Promise.all(
      items.map(async (item): Promise<ReactElement | null> => {
        if (item.content_type === 'article') {
          const story = item.article;
          if (!story) return null;
          const cat = categoryFor(story, ctx);
          return (
            <article key={item.id} className="vp-editors-band__card">
              <StoryLink story={story} className="vp-editors-band__link">
                {cat && (
                  <p
                    className="vp-editors-band__cat"
                    style={{ color: cat.color_hex || C.dim }}
                  >
                    {cat.name}
                  </p>
                )}
                <h4 className="vp-editors-band__hed">{story.title}</h4>
                {story.excerpt && (
                  <p className="vp-editors-band__dek">{story.excerpt}</p>
                )}
              </StoryLink>
            </article>
          );
        }
        if (item.content_type === 'ad') {
          const placement = item.payload?.placement;
          if (typeof placement !== 'string' || placement.length === 0) {
            return null;
          }
          const page =
            typeof item.payload?.page === 'string' && item.payload.page
              ? (item.payload.page as string)
              : 'home';
          const position =
            typeof item.payload?.position === 'string' && item.payload.position
              ? (item.payload.position as string)
              : `editors_picks:${placement}`;
          const cell = await SsrAdCell({
            placement,
            page,
            position,
            wrapperClassName: 'vp-rh-card vp-rh-card-ad',
            selector: `.vp-rh-card-ad[data-pick-ad-id="${item.id}"]`,
            dataAttrs: { 'data-pick-ad-id': String(item.id) },
          });
          if (!cell) return null;
          return <Fragment key={item.id}>{cell}</Fragment>;
        }
        return null;
      }),
    )
  ).filter((node): node is ReactElement => node !== null);

  if (rendered.length === 0) return null;

  const label =
    typeof slot.config.label === 'string' ? slot.config.label : 'Worth Your Time';

  return (
    <section className="vp-editors-band" style={{ minWidth: 0 }}>
      <header className="vp-section-head">
        <p className="vp-section-head__label">{label}</p>
      </header>
      <div className="vp-editors-band__grid">{rendered}</div>
    </section>
  );
}
