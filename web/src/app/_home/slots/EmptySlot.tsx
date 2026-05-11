// Admin-only placeholder for slots that haven't been filled. Public
// renders skip empty slots entirely — this is what the admin preview
// renders so editors can see what's missing.

import { C } from './_shared';
import type { SlotRow } from '../types';

export default function EmptySlot({ slot }: { slot: SlotRow }) {
  return (
    <div
      style={{
        border: `1px dashed ${C.rule}`,
        padding: 24,
        textAlign: 'center',
        color: C.dim,
        fontSize: 12,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}
    >
      <strong style={{ color: C.soft }}>{slot.kind.replace('_', ' ')}</strong>
      <span style={{ margin: '0 8px' }}>·</span>
      <span>{slot.key}</span>
      <span style={{ margin: '0 8px' }}>·</span>
      <span>span {slot.span}</span>
      <span style={{ margin: '0 8px' }}>·</span>
      <span>empty</span>
    </div>
  );
}
