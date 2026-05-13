// Category dot helper for SecondaryPair. Sets the `--cat-dot` CSS var
// from a category's color_hex; consumed by `.vp-frontline__cat::before`
// in _home/styles.tsx.

import type { CSSProperties } from 'react';

type CatDotStyle = CSSProperties & {
  ['--cat-dot']?: string;
};

export function categoryDotStyle(colorHex: string | null | undefined): CatDotStyle {
  if (!colorHex) return {};
  return { ['--cat-dot']: colorHex };
}
