// Category gradient + slug-class helpers shared by Lead and SecondaryPair.
// Derives `--cat-from` / `--cat-to` from a category's color_hex (the
// "to" stop is a 20%-darker shade of "from"). Returns navy fallback
// when no color is supplied.

import type { CSSProperties } from 'react';

const NAVY_FROM = '#1e3a5f';
const NAVY_TO = '#0a1628';

function clamp(n: number) {
  return Math.max(0, Math.min(255, n));
}

function darken(hex: string, amount = 0.2): string {
  const cleaned = hex.replace('#', '');
  if (cleaned.length !== 6) return hex;
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex;
  const f = 1 - amount;
  const toHex = (n: number) => clamp(Math.round(n * f)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

type CSSVarStyle = CSSProperties & {
  ['--cat-from']?: string;
  ['--cat-to']?: string;
};

type CatDotStyle = CSSProperties & {
  ['--cat-dot']?: string;
};

export function categoryGradientStyle(colorHex: string | null): CSSVarStyle {
  if (!colorHex) {
    return { ['--cat-from']: NAVY_FROM, ['--cat-to']: NAVY_TO };
  }
  return { ['--cat-from']: colorHex, ['--cat-to']: darken(colorHex, 0.22) };
}

export function categoryDotStyle(colorHex: string | null | undefined): CatDotStyle {
  if (!colorHex) return {};
  return { ['--cat-dot']: colorHex };
}

export function categorySlugClass(slug: string | null | undefined): string {
  if (!slug) return '';
  const safe = slug.replace(/[^a-z0-9-]/gi, '').toLowerCase();
  return safe ? `is-${safe}` : '';
}
