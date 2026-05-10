import type { CSSProperties } from 'react';
import {
  C,
  MetaLine,
  StoryLink,
  categoryFor,
  serifStack,
  type CardCtx,
} from './_shared';
import type { SlotRow } from '../types';

export default function Cluster({
  slot,
  ctx,
}: {
  slot: SlotRow;
  ctx: CardCtx;
}) {
  const stories = slot.items
    .map((i) => i.article)
    .filter((s): s is NonNullable<typeof s> => !!s);
  if (stories.length === 0) return null;

  const label =
    typeof slot.config.label === 'string' ? slot.config.label : null;
  const compact = slot.config.layout === 'image_left';
  const cols = compact ? 1 : Math.min(2, Math.max(1, stories.length));

  return (
    <section className="vp-river-section" style={{ minWidth: 0 }}>
      {label && (
        <header className="vp-section-head">
          <p className="vp-section-head__label">{label}</p>
        </header>
      )}
      <div
        className={`vp-cluster-grid${compact ? ' is-compact' : ''}`}
        style={{ '--cluster-cols': cols } as CSSProperties}
      >
        {stories.slice(0, compact ? stories.length : cols).map((story) => {
          const category = categoryFor(story, ctx);
          const imageUrl = story.cover_image_url ?? null;
          const imageAlt = story.cover_image_alt ?? story.title ?? '';

          return (
            <article
              key={story.id}
              className={`vp-cluster-card${compact ? ' is-compact' : ''}`}
            >
              <StoryLink
                story={story}
                className="vp-cluster-card__link"
                style={{ display: 'grid' }}
              >
                {imageUrl && (
                  <div className="vp-cluster-card__art">
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
                {category && (
                  <p
                    className="vp-cluster-card__cat"
                    style={{ color: category.color_hex || C.dim }}
                  >
                    {category.name}
                  </p>
                )}
                <h3
                  className="vp-cluster-card__hed"
                  style={{ fontFamily: serifStack }}
                >
                  {story.title}
                </h3>
                {story.excerpt && (
                  <p className="vp-cluster-card__dek">{story.excerpt}</p>
                )}
                <MetaLine story={story} />
              </StoryLink>
            </article>
          );
        })}
      </div>
    </section>
  );
}
