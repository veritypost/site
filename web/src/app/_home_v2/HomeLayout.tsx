// Home v2 page layout. The v2 redesign is semantic instead of span-led:
//   - the lead story becomes the single command hero
//   - utility/context modules stay in the right rail on desktop
//   - article-bearing sections flow as a dense story river underneath
//
// The old breaking strip is intentionally hidden in public render so the
// hero carries urgency by itself.

import type { CSSProperties } from 'react';
import type { LayoutRow, SlotKind, SlotRow } from './types';
import type { Tables } from '@/types/database-helpers';
import { renderSlot } from './slots/registry';

type CategoryRow = Pick<
  Tables<'categories'>,
  'id' | 'name' | 'slug' | 'color_hex' | 'parent_id' | 'sort_order'
>;

type CSSVarStyle = CSSProperties & { ['--slot-span']?: number };

type RenderArg = {
  categoryById: Record<string, CategoryRow>;
  showEmptyPlaceholders?: boolean;
};

const HIDDEN_KINDS: ReadonlySet<SlotKind> = new Set(['breaking_strip']);
const RAIL_KINDS: ReadonlySet<SlotKind> = new Set([
  'list_rail',
  'feature',
  'engagement',
  'promo',
]);

function SlotItem({
  slot,
  ctx,
}: {
  slot: SlotRow;
  ctx: RenderArg;
}) {
  const node = renderSlot(slot, ctx);
  if (!node) return null;
  const style: CSSVarStyle = { ['--slot-span']: slot.span };
  return (
    <div
      key={slot.id}
      className="vp-home-slot"
      data-kind={slot.kind}
      style={style}
    >
      {node}
    </div>
  );
}

export default function HomeLayout({
  layout,
  categoryById,
  showEmptyPlaceholders = false,
}: {
  layout: LayoutRow;
  categoryById: Record<string, CategoryRow>;
  showEmptyPlaceholders?: boolean;
}) {
  const ctx: RenderArg = { categoryById, showEmptyPlaceholders };
  const slots = layout.slots.filter((slot) => !HIDDEN_KINDS.has(slot.kind));
  const heroSlot = slots.find((slot) => slot.kind === 'lead') ?? null;
  const heroId = heroSlot?.id ?? null;

  const mainCol: SlotRow[] = [];
  const railCol: SlotRow[] = [];

  slots.forEach((slot) => {
    if (slot.id === heroId) return;
    if (slot.span <= 4 && RAIL_KINDS.has(slot.kind)) {
      railCol.push(slot);
      return;
    }
    mainCol.push(slot);
  });

  const orderedMain = heroSlot ? [heroSlot, ...mainCol] : mainCol;

  return (
    <div className="vp-home-v2">
      <div className="vp-home-v2-grid">
        <div className="vp-home-v2-main">
          {orderedMain.map((s) => (
            <SlotItem key={s.id} slot={s} ctx={ctx} />
          ))}
        </div>
        {railCol.length > 0 && (
          <aside className="vp-home-v2-rail">
            {railCol.map((s) => (
              <SlotItem key={s.id} slot={s} ctx={ctx} />
            ))}
          </aside>
        )}
      </div>
    </div>
  );
}
