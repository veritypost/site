// Square row — span-12 container holding 5 small 1:1 squares in an
// internal 5-track sub-grid. Mock grid uses one of these at pos 95
// to close the page (5 ad/story squares). Each item is either an
// article (linked) or an ad (Ad component). Empty items collapse
// without breaking the row width — but typical case is all 5 filled.

import Link from 'next/link';
import Ad from '@/components/Ad';
import type { SlotRow } from '../types';
import { type CardCtx, categoryFor, storyHref } from './_shared';

export default function SquareRow({ slot, ctx }: { slot: SlotRow; ctx: CardCtx }) {
  // Always render 5 cells. Missing items render an empty placeholder
  // so the row geometry is stable regardless of how many items the
  // admin has pinned.
  const cells = Array.from({ length: 5 }, (_, i) => slot.items[i] ?? null);

  return (
    <div className="vp-rh-square-row">
      {cells.map((item, i) => {
        if (!item) {
          return <div key={`empty-${i}`} className="vp-rh-square vp-rh-square--empty" />;
        }
        if (item.content_type === 'ad') {
          const placement = (item.payload?.placement as string) || 'home_bottom_row';
          return (
            <div key={item.id} className="vp-rh-square vp-rh-square--ad">
              <Ad placement={placement} page="home" position="footer" />
            </div>
          );
        }
        const story = item.article;
        if (!story) {
          return <div key={item.id} className="vp-rh-square vp-rh-square--empty" />;
        }
        const href = storyHref(story);
        const cat = categoryFor(story, ctx);
        const inner = (
          <>
            {cat?.name && <p className="vp-rh-square__cat">{cat.name}</p>}
            <h5 className="vp-rh-square__title">{story.title}</h5>
          </>
        );
        return (
          <div key={item.id} className="vp-rh-square">
            {href ? (
              <Link href={href} className="vp-rh-square__link">{inner}</Link>
            ) : (
              <div className="vp-rh-square__link">{inner}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
