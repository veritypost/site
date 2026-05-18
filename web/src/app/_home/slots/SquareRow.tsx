// Square row — span-12 container holding up to 5 small 1:1 squares in
// an internal 5-track sub-grid. Mock grid uses one of these at pos 95
// to close the page. Each item is either an article (linked) or an ad
// (Ad component).
//
// Owner call 2026-05-17 (registry.ts): no self-sourced empty cells.
// Partial rows render only their real items (1-4 squares); fully empty
// rows are collapsed upstream by slotIsEmpty in registry.ts.

import Link from 'next/link';
import Ad from '@/components/Ad';
import type { SlotRow } from '../types';
import { type CardCtx, categoryFor, storyHref } from './_shared';

export default function SquareRow({ slot, ctx }: { slot: SlotRow; ctx: CardCtx }) {
  return (
    <div className="vp-rh-square-row">
      {slot.items.map((item) => {
        if (item.content_type === 'ad') {
          const placement = (item.payload?.placement as string) || 'home_bottom_row';
          return (
            <div key={item.id} className="vp-rh-square vp-rh-square--ad">
              <Ad placement={placement} page="home" position="footer" />
            </div>
          );
        }
        const story = item.article;
        if (!story) return null;
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
