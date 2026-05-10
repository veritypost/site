// Slot registry — kind → renderer. Adding a new slot type is one new
// component file + one entry here + a CHECK constraint update on
// home_slots.kind. The dispatcher returns null when a slot has no
// renderable content; admin preview swaps in the EmptySlot placeholder.

import type { ReactNode } from 'react';
import { createElement } from 'react';
import type { SlotKind, SlotRow } from '../types';
import type { CardCtx } from './_shared';
import Lead from './Lead';
import SecondLead from './SecondLead';
import BreakingStrip from './BreakingStrip';
import Cluster from './Cluster';
import ListRail from './ListRail';
import Feature from './Feature';
import Engagement from './Engagement';
import Promo from './Promo';
import SecondaryPair from './SecondaryPair';
import WideStrip from './WideStrip';
import EditorsPicks from './EditorsPicks';
import EmptySlot from './EmptySlot';

type SlotComponent =
  | ((props: { slot: SlotRow; ctx: CardCtx }) => ReactNode | null)
  | ((props: { slot: SlotRow }) => ReactNode | null);

const REGISTRY: Record<SlotKind, SlotComponent> = {
  lead: Lead,
  second_lead: SecondLead,
  breaking_strip: BreakingStrip,
  cluster: Cluster,
  list_rail: ListRail,
  feature: Feature,
  engagement: Engagement,
  promo: Promo,
  secondary_pair: SecondaryPair,
  wide_strip: WideStrip,
  editors_picks: EditorsPicks,
};

// Slots that source their own content (e.g. Feature reads daily_features
// directly). They aren't driven by home_slot_items, so the empty-check
// would falsely hide them.
const SELF_SOURCING: ReadonlySet<SlotKind> = new Set(['feature']);

function slotIsEmpty(slot: SlotRow): boolean {
  if (SELF_SOURCING.has(slot.kind)) return false;
  // Engagement may be a quiz payload (question + options). Treat any
  // non-article item with a non-empty payload as "filled."
  if (slot.kind === 'engagement') {
    return slot.items.length === 0 ||
      slot.items.every((i) => !i.payload || Object.keys(i.payload).length === 0);
  }
  return (
    slot.items.length === 0 ||
    slot.items.every(
      (i) =>
        !i.article &&
        !i.payload?.heading &&
        !i.payload?.body &&
        !i.payload?.prompt &&
        !i.payload?.question &&
        !i.payload?.count,
    )
  );
}

export function renderSlot(
  slot: SlotRow,
  opts: CardCtx & { showEmptyPlaceholders?: boolean },
): ReactNode | null {
  const Component = REGISTRY[slot.kind];
  if (!Component) {
    if (opts.showEmptyPlaceholders) return createElement(EmptySlot, { slot });
    return null;
  }

  if (slotIsEmpty(slot)) {
    if (opts.showEmptyPlaceholders) return createElement(EmptySlot, { slot });
    return null;
  }

  // The two-arg signature (slot + ctx) is used by article-bearing slots;
  // payload-only slots take a single-arg signature. createElement with both
  // props is harmless because the unused `ctx` is ignored by the latter.
  return createElement(Component as (p: { slot: SlotRow; ctx: CardCtx }) => ReactNode, {
    slot,
    ctx: opts,
  });
}
