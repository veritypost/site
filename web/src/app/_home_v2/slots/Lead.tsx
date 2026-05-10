import { StoryLink, type CardCtx, type HomeStory } from './_shared';
import { timeShort } from '../../_homeShared';
import type { SlotRow } from '../types';
import { categoryGradientStyle, categoryDotStyle } from './_categoryColor';

export default function Lead({
  slot,
  ctx,
}: {
  slot: SlotRow;
  ctx: CardCtx;
}) {
  const story = slot.items.map((i) => i.article).find((s): s is HomeStory => !!s);
  if (!story) return null;

  const cat = story.category_id ? ctx.categoryById[story.category_id] : undefined;
  const imageUrl = story.cover_image_url ?? null;
  const imageAlt = story.cover_image_alt ?? story.title ?? '';
  const time = timeShort(story.published_at);
  const catLabel = cat?.name ?? null;

  return (
    <StoryLink story={story}>
      <article
        className="vp-command-hero"
        style={categoryGradientStyle(cat?.color_hex ?? null)}
      >
        <div className="vp-command-hero__body">
          <div className="vp-command-hero__kicker">
            {story.is_developing && (
              <span className="vp-command-hero__flag">Developing</span>
            )}
            {catLabel && (
              <span
                className="vp-command-hero__cat"
                style={categoryDotStyle(cat?.color_hex ?? null)}
              >
                {catLabel}
              </span>
            )}
          </div>
          <h2 className="vp-command-hero__hed">{story.title}</h2>
          {story.excerpt && (
            <p className="vp-command-hero__dek">{story.excerpt}</p>
          )}
          <div className="vp-command-hero__meta">
            {time && <span>{time}</span>}
            {!time && story.is_developing && <span>Live updates</span>}
          </div>
        </div>
        <div className="vp-command-hero__media">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="vp-command-hero__img" src={imageUrl} alt={imageAlt} />
          ) : (
            <div className="vp-command-hero__wash" aria-hidden />
          )}
        </div>
      </article>
    </StoryLink>
  );
}
