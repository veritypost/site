import type { SlotRow } from '../types';

export default function BreakingStrip({ slot }: { slot: SlotRow }) {
  // The lead story now carries urgency on its own; the separate ticker
  // stays in the schema/admin flow but is intentionally invisible here.
  void slot;
  return null;
}
