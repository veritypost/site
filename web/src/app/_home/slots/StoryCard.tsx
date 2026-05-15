// Story card — single article in a horizontal main-column cell. The
// mock grid stacks ~7 of these between pos 20 and pos 56 at span 8.
// Renders eyebrow (category) + headline + dek + optional cover image
// (right side). Ad variant routes through the universal `<Ad>` so the
// mock's "ad/story — swap per viewer tier" semantics work end-to-end.

import Link from 'next/link';
import Ad from '@/components/Ad';
import type { SlotRow } from '../types';
import { type CardCtx, categoryFor, storyHref } from './_shared';

export default function StoryCard({ slot, ctx }: { slot: SlotRow; ctx: CardCtx }) {
  const item = slot.items[0];
  if (!item) return null;

  if (item.content_type === 'ad') {
    const placement = (item.payload?.placement as string) || 'home_in_feed';
    return (
      <article className="vp-rh-story-card vp-rh-story-card--ad">
        <Ad placement={placement} page="home" position="in_body" />
      </article>
    );
  }

  const story = item.article;
  if (!story) return null;
  const href = storyHref(story);
  const cat = categoryFor(story, ctx);
  const cover = story.cover_image_url;

  const body = (
    <>
      <div className="vp-rh-story-card__body">
        {cat?.name && <p className="vp-rh-story-card__cat">{cat.name}</p>}
        <h3 className="vp-rh-story-card__title">{story.title}</h3>
        {story.excerpt && (
          <p className="vp-rh-story-card__dek">{story.excerpt}</p>
        )}
      </div>
      {cover && (
        <div
          className="vp-rh-story-card__art"
          style={{ backgroundImage: `url("${cover}")` }}
          aria-hidden="true"
        />
      )}
    </>
  );

  return (
    <article className="vp-rh-story-card">
      {href ? (
        <Link href={href} className="vp-rh-story-card__link">{body}</Link>
      ) : (
        <div className="vp-rh-story-card__link">{body}</div>
      )}
    </article>
  );
}
