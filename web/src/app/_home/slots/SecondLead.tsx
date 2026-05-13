import {
  C,
  MetaLine,
  StoryLink,
  categoryFor,
  serifStack,
  type CardCtx,
} from './_shared';
import type { SlotRow } from '../types';

export default function SecondLead({
  slot,
  ctx,
}: {
  slot: SlotRow;
  ctx: CardCtx;
}) {
  const story = slot.items.find((i) => i.article)?.article;
  if (!story) return null;
  const category = categoryFor(story, ctx);
  const imageUrl = story.cover_image_url ?? null;
  const imageAlt = story.cover_image_alt ?? story.title ?? '';

  return (
    <article className="vp-feature-take">
      <StoryLink
        story={story}
        className="vp-feature-take__link"
      >
        {imageUrl && (
          <div className="vp-feature-take__art">
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
        <div className="vp-feature-take__body">
          {category && (
            <p
              className="vp-feature-take__cat"
              style={{ color: category.color_hex || C.dim }}
            >
              {category.name}
            </p>
          )}
          <h2
            className="vp-feature-take__hed"
            style={{ fontFamily: serifStack }}
          >
            {story.title}
          </h2>
          {story.excerpt && (
            <p className="vp-feature-take__dek">{story.excerpt}</p>
          )}
          <MetaLine story={story} />
        </div>
      </StoryLink>
    </article>
  );
}
