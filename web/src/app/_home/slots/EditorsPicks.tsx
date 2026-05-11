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

export default function EditorsPicks({
  slot,
  ctx,
}: {
  slot: SlotRow;
  ctx: CardCtx;
}) {
  const stories = slot.items
    .map((i) => i.article)
    .filter((s): s is HomeStory => !!s)
    .slice(0, 3);
  if (stories.length === 0) return null;
  const label =
    typeof slot.config.label === 'string' ? slot.config.label : 'Worth Your Time';

  return (
    <section className="vp-editors-band" style={{ minWidth: 0 }}>
      <header className="vp-section-head">
        <p className="vp-section-head__label">{label}</p>
      </header>
      <div className="vp-editors-band__grid">
        {stories.map((story) => {
          const cat = categoryFor(story, ctx);
          return (
            <article key={story.id} className="vp-editors-band__card">
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
        })}
      </div>
    </section>
  );
}
