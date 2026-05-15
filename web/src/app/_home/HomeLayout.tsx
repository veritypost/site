// 12-column slot renderer for the bordered-grid home.
// Slots are sorted by `position` and emitted as direct children of the
// `vp-rh-grid` container. Each slot's outer wrapper claims a fraction
// of the 12-track row via `grid-column: span ${slot.span}` (span ∈
// {3,4,6,8,12}). Span 8 + Span 4 reads as a 3fr/1fr main+rail pair;
// Span 12 fills the row. Mobile collapses to single column via a
// media query in styles.tsx that resets grid-column on all children.
// Legacy slot kinds whose own CSS declared `grid-column: 1 / -1`
// (Cluster, DataTicker, InsightRow, DiscoveryFeed, SecondLead) keep
// working — the wrapper at span=12 already gives them full width.
// `breaking_strip` no-ops at the component level (BreakingStrip.tsx
// returns null); no filter needed here.

import type { LayoutRow } from './types';
import type { Tables } from '@/types/database-helpers';
import { renderSlot } from './slots/registry';
import type { TrendingArticle } from './slots/_shared';
import RhStyles from './styles';

type CategoryRow = Pick<
  Tables<'categories'>,
  'id' | 'name' | 'slug' | 'color_hex' | 'parent_id' | 'sort_order'
>;

export default function HomeLayout({
  layout,
  categoryById,
  trendingArticles,
  showEmptyPlaceholders = false,
}: {
  layout: LayoutRow;
  categoryById: Record<string, CategoryRow>;
  // Wave 3: pre-fetched by HomeRoot when at least one list_rail slot in
  // the layout has `config.source === 'trending'`. Threaded into the
  // renderSlot ctx so ListRail can substitute these for hand-picked items.
  trendingArticles?: TrendingArticle[];
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
          const node = renderSlot(s, {
            categoryById,
            trendingArticles,
            showEmptyPlaceholders,
          });
          if (!node) return null;
          // gridColumn from data — span 12 fills the row, span 8 is the
          // main column, span 4 is the right rail. Mobile collapses via
          // the `.vp-rh-grid > *` rule in styles.tsx.
          return (
            <div
              key={s.id}
              data-slot-kind={s.kind}
              data-slot-key={s.key}
              style={{ gridColumn: `span ${s.span}`, minWidth: 0 }}
            >
              {node}
            </div>
          );
        })}
      </div>
      <RhStyles />
    </div>
  );
}
