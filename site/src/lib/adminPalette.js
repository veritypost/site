// Shared admin color palettes. Two canonical themes + per-page spread overrides.
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
export const ADMIN_C = {
  bg: '#ffffff', card: '#f7f7f7', border: '#222222',
  white: '#111111', dim: '#666666', soft: '#444444', muted: '#999999',
  accent: '#111111', success: '#22c55e', warn: '#f59e0b', danger: '#ef4444',
};

export const ADMIN_C_LIGHT = {
  bg: '#ffffff', card: '#f7f7f7', border: '#e5e5e5',
  text: '#111111', dim: '#666666', accent: '#111111',
  success: '#16a34a', warn: '#b45309', danger: '#dc2626',
};
