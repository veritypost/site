// Background section — see BackgroundCard for the editable surface. Wraps
// the card in a section so ProfileApp can register it like the rest.

'use client';

import { BackgroundCard } from '../settings/_cards/BackgroundCard';

export function BackgroundSection() {
  return <BackgroundCard />;
}
