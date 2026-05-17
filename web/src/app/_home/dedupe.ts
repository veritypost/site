// Shared rail-card dedupe helper used by both the public renderer
// (HomeLayout) and the admin canvas (admin/home/page.tsx). Lifted from
// HomeLayout to keep the admin preview honest — when two list-variant
// rail_cards point at the same (source, days), the live page only
// renders the first; the admin canvas now flags the rest as shadowed
// so editors can see + fix the duplicate config without surprises.
//
// The rule: among slots sorted by position ASC, the first list-variant
// rail_card for a given `${source}::${days}` key wins. Non-list
// rail_cards and other kinds always pass through. Slots without a
// configured `source` also pass through (nothing to collide on).
//
// Returned shape:
//   visible — the slots the public renderer will actually emit
//   shadowedIds — slot IDs that were dropped (later duplicates)
//
// Admin uses both: render `visible` first as normal, then render
// shadowed slots with a "Hidden on live — duplicate source" treatment
// so the editor can still click and clear/delete them.

import type { SlotRow } from './types';

export type DedupeResult = {
  visible: SlotRow[];
  shadowedIds: Set<string>;
};

export function partitionDuplicateListRails(slots: SlotRow[]): DedupeResult {
  const seenListKey = new Set<string>();
  const shadowedIds = new Set<string>();
  const visible: SlotRow[] = [];
  // Caller is responsible for passing slots in display order (position
  // ASC). HomeLayout sorts then filters; admin/home keeps its own
  // ordering pipeline and feeds the already-sorted array here.
  for (const s of slots) {
    if (s.kind !== 'rail_card') {
      visible.push(s);
      continue;
    }
    const cfg = (s.config ?? {}) as {
      variant?: string;
      source?: string;
      days?: number;
    };
    if (cfg.variant !== 'list' || !cfg.source) {
      visible.push(s);
      continue;
    }
    const key = `${cfg.source}::${cfg.days ?? 'default'}`;
    if (seenListKey.has(key)) {
      shadowedIds.add(s.id);
      continue;
    }
    seenListKey.add(key);
    visible.push(s);
  }
  return { visible, shadowedIds };
}
