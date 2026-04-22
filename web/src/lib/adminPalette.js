// Shared admin color palettes + design tokens. Two canonical themes + per-page
// spread overrides.
//
// ADMIN_C — dark-bordered admin theme. Used by 24 /admin pages (Pass 12 Task 104
// initial consolidation) plus story-manager and kids-story-manager via the
// spread-override pattern. Distinctive values: border '#222222' (near-black),
// `white` semantic key (value '#111111' — "content color on dark bg" slot),
// brighter danger red '#ef4444', success green '#22c55e', warn amber '#f59e0b'.
//
// ADMIN_C_LIGHT — light-bordered admin theme. Used by 11 /admin pages on the
// editorial and trust-safety surfaces (ad-campaigns, ad-placements,
// data-requests, expert-sessions, moderation, recap, reports, settings,
// sponsors, stories/[id]/quiz, verification). Distinctive values: border
// '#e5e5e5' (light grey), `text` semantic key (same near-black content color
// '#111111' but named by purpose), muted danger '#dc2626', softer success
// '#16a34a', deeper warn amber '#b45309'.
//
// Consumers use one palette or the other, never both. Semantic key naming
// differs deliberately — ADMIN_C's `white` maps to the same value as
// ADMIN_C_LIGHT's `text`, but each theme's consumers already use one or the
// other; renaming across both would cause ~880 call-site edits for no
// behavioural gain.
//
// Per-page variations (e.g. kids-story-manager's blue accent, story-manager's
// now/nowBg highlight colors) use the spread-override pattern:
//   const C = { ...ADMIN_C, accent: '#2563eb', now: '#c2410c', nowBg: '#fff3e0' };
//
// Structural outliers: `admin/permissions/page.js` and `admin/stories/page.js`
// use inline hex colors + custom style constants by design; they do not follow
// either palette shape and are intentionally out of scope for this module.
//
// Additional tokens (added Pass 13): `ring`, `hover`, `divider` slots on
// ADMIN_C; spacing scale `S` and font-size scale `F` exported alongside. These
// feed the shared admin component library under
// `site/src/components/admin/`.
export const ADMIN_C = {
  bg: '#ffffff',
  card: '#f7f7f7',
  border: '#222222',
  white: '#111111',
  dim: '#666666',
  soft: '#444444',
  muted: '#999999',
  accent: '#111111',
  success: '#22c55e',
  warn: '#f59e0b',
  danger: '#ef4444',
  // Focus ring: 2px accent outline at 40% alpha. Rendered via
  // `box-shadow: 0 0 0 2px var(--ring)` in inline styles.
  ring: 'rgba(17,17,17,0.40)',
  // Row hover: subtle wash, deliberately darker than `card` so a hovered
  // row inside a `card`-backed section remains distinguishable.
  hover: '#efefef',
  // Divider: horizontal rules + section separators. Slightly softer than
  // `border` (which is used for outline-weight edges).
  divider: '#e5e5e5',
};

export const ADMIN_C_LIGHT = {
  bg: '#ffffff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111111',
  dim: '#666666',
  accent: '#111111',
  success: '#16a34a',
  warn: '#b45309',
  danger: '#dc2626',
};

// Spacing scale — a 4px base unit. Keys are multipliers (S[4] === 16px).
// Prefer these over raw pixel literals in admin components so spacing
// edits can ripple from one file.
export const S = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
};

// Type scale — admin prefers dense. base (13) is the default body, xs (11)
// for secondary metadata, xxl (28) for page titles. Values are numbers;
// consumers add 'px' in the style object.
export const F = {
  xs: 11,
  sm: 12,
  base: 13,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 28,
};
