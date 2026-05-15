// Rail card — single article or ad in a 1:1 square cell on the right
// rail (span 4). Mock grid uses these between pos 25 and pos 51,
// interleaved with list_rail (Trending/Most Read) and engagement
// (quiz) variants. Compact layout: eyebrow + tight headline only —
// the rail cells are square and need to read at a glance.

import Link from 'next/link';
import Ad from '@/components/Ad';
import type { SlotRow } from '../types';
import { type CardCtx, categoryFor, storyHref } from './_shared';

export default function RailCard({ slot, ctx }: { slot: SlotRow; ctx: CardCtx }) {
  const item = slot.items[0];
  if (!item) return null;

  if (item.content_type === 'ad') {
    const placement = (item.payload?.placement as string) || 'home_rail';
    return (
      <aside className="vp-rh-rail-card vp-rh-rail-card--ad">
        <Ad placement={placement} page="home" position="rail" />
      </aside>
    );
  }

  const story = item.article;
  if (!story) return null;
  const href = storyHref(story);
  const cat = categoryFor(story, ctx);

  const body = (
    <>
      {cat?.name && <p className="vp-rh-rail-card__cat">{cat.name}</p>}
      <h4 className="vp-rh-rail-card__title">{story.title}</h4>
    </>
  );

  return (
    <aside className="vp-rh-rail-card">
      {href ? (
        <Link href={href} className="vp-rh-rail-card__link">{body}</Link>
      ) : (
        <div className="vp-rh-rail-card__link">{body}</div>
      )}
    </aside>
  );
}
