// Single-column slot renderer for the bordered-grid home.
// Slots are sorted by `position` and emitted as direct children of the
// `vp-rh-grid` container. Slots that need to span the full row (lead,
// ticker, insight_row, discovery_feed) declare `grid-column: 1 / -1`
// in their own CSS rules — this layout file applies no per-slot
// overrides. The `breaking_strip` slot kind no-ops at the component
// level (BreakingStrip.tsx returns null); no filter needed here.

import type { LayoutRow } from './types';
import type { Tables } from '@/types/database-helpers';
import { renderSlot } from './slots/registry';
import RhStyles from './styles';

type CategoryRow = Pick<
  Tables<'categories'>,
  'id' | 'name' | 'slug' | 'color_hex' | 'parent_id' | 'sort_order'
>;

export default function HomeLayout({
  layout,
  categoryById,
  showEmptyPlaceholders = false,
}: {
  layout: LayoutRow;
  categoryById: Record<string, CategoryRow>;
  showEmptyPlaceholders?: boolean;
}) {
  const slots = [...layout.slots].sort((a, b) => a.position - b.position);

  return (
    <div className="vp-rh">
      <h1 className="vp-rh-sr">Verity Post</h1>
      {/* `<div>` not `<main>` — the outer `<main id="main-content">` in
          app/layout.js already provides the page landmark. WHATWG forbids
          two `<main>` per document. */}
      <div className="vp-rh-grid">
        {slots.map((s) => {
          const node = renderSlot(s, { categoryById, showEmptyPlaceholders });
          if (!node) return null;
          // Each slot's renderer owns its own outer markup — Lead returns
          // an <article>, Cluster returns a <Fragment> of <Link> cards,
          // ticker/insight/discovery return their own outer divs with
          // `grid-column: 1 / -1` declared in CSS.
          return <span key={s.id} style={{ display: 'contents' }}>{node}</span>;
        })}
      </div>
      <RhStyles />
    </div>
  );
}
