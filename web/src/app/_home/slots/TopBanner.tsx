// Top banner — full-width pos-10 row from the mock grid. Renders the
// slot's first item as either a headline-card (article) or an ad
// (content_type='ad' via the universal `<Ad>` component). Outer span
// comes from HomeLayout (slot.span, expected 12).

import Link from 'next/link';
import Ad from '@/components/Ad';
import type { SlotRow } from '../types';
import { type CardCtx, categoryFor, storyHref } from './_shared';

export default function TopBanner({ slot, ctx }: { slot: SlotRow; ctx: CardCtx }) {
  const item = slot.items[0];
  if (!item) return null;

  if (item.content_type === 'ad') {
    const placement = (item.payload?.placement as string) || 'home_top_banner';
    return (
      <section className="vp-rh-banner vp-rh-banner--ad">
        <Ad placement={placement} page="home" position="header" />
      </section>
    );
  }

  const story = item.article;
  if (!story) return null;
  const href = storyHref(story);
  const cat = categoryFor(story, ctx);
  const cover = story.cover_image_url;

  const inner = (
    <>
      {cover && (
        <div
          className="vp-rh-banner__art"
          style={{ backgroundImage: `url("${cover}")` }}
          aria-hidden="true"
        />
      )}
      <div className="vp-rh-banner__body">
        {cat?.name && <p className="vp-rh-banner__cat">{cat.name}</p>}
        <h2 className="vp-rh-banner__title">{story.title}</h2>
        {story.excerpt && <p className="vp-rh-banner__dek">{story.excerpt}</p>}
      </div>
    </>
  );

  return (
    <section className="vp-rh-banner">
      {href ? (
        <Link href={href} className="vp-rh-banner__link">{inner}</Link>
      ) : (
        <div className="vp-rh-banner__link">{inner}</div>
      )}
    </section>
  );
}
