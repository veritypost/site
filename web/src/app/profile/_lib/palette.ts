// Profile redesign tokens. Sits alongside (does not replace) `@/lib/adminPalette`.
// The admin palette is dense + monochrome — correct for admin dashboards. The
// owned-profile surface for adults sits in front of 90%+ engagement users daily,
// so the redesign opts for: more breathing room, larger base type, real accent,
// color that earns its place (tier expression, expert badge, plan tier).
//
// Visual language: editorial-grade serif on the hero name, neutral sans
// everywhere else, generous spacing (8px grid), restrained color (one accent
// + tier ramps + semantic states), large tap targets, dark-mode native.

export const C = {
  // Surfaces — owner call 2026-05-16: re-skin to the editorial vp-*
  // palette so /profile lives on the same cream canvas + white cards
  // as the home and article. Keys stay the same; only the CSS vars
  // they alias change.
  bg: 'var(--vp-bg)',
  surface: 'var(--vp-surface)',
  surfaceRaised: 'var(--vp-surface)',
  surfaceSunken: 'var(--vp-surface-soft)',
  // Lines
  border: 'var(--vp-border-soft)',
  borderStrong: 'var(--vp-border)',
  divider: 'var(--vp-border-soft)',
  // Ink — swapped to editorial --vp-* tokens so dark-mode profile cards
  // flip to the warm-dark palette (matches home + article), not the
  // admin slate-grey palette. Semantic state tokens below stay on --p-*.
  ink: 'var(--vp-ink)',
  inkSoft: 'var(--vp-text-muted)',
  inkMuted: 'var(--vp-text-muted)',
  inkDim: 'var(--vp-text-soft)',
  inkFaint: 'var(--vp-text-soft)',
  // Brand accent — Verity ink-blue. Used sparingly: focus rings, primary CTA,
  // active tab underline. Not for body text or large fills.
  accent: 'var(--vp-accent)',
  accentSoft: 'var(--vp-accent-soft)',
  accentInk: 'var(--p-accent-ink)',
  // Semantics
  success: 'var(--p-success)',
  successSoft: 'var(--p-success-soft)',
  warn: 'var(--p-warn)',
  warnSoft: 'var(--p-warn-soft)',
  danger: 'var(--p-danger)',
  dangerSoft: 'var(--p-danger-soft)',
  info: 'var(--p-info)',
  infoSoft: 'var(--p-info-soft)',
  // Expert / verified
  verified: 'var(--p-verified)',
  verifiedSoft: 'var(--p-verified-soft)',
  expert: 'var(--p-expert)',
  expertSoft: 'var(--p-expert-soft)',
  // Focus ring (a11y)
  ring: 'var(--p-ring)',
  ringStrong: 'var(--p-ring-strong)',
} as const;

// Tier expression has no color. Per owner directive (2026-04-27),
// reading tiers do NOT get distinct hues — no rainbow, no muted ramp,
// no gradient. Tiers render as plain text in the neutral ink palette.
// The only user-controlled color in the redesign is the avatar (outer
// ring / inner disc / letters); everything else stays neutral.
//
// TIER_C is intentionally undefined. Consumers that previously read it
// were updated to render the tier name in `C.inkMuted` only.

// Spacing — bumped 2026-05-16 so the cream canvas around each card
// reads as breathing room, not as adjacency. Same key shape, larger
// values from S[3] upward.
export const S = {
  0: 0,
  1: 6,
  2: 12,
  3: 16,
  4: 24,
  5: 28,
  6: 36,
  7: 44,
  8: 56,
  9: 72,
  10: 96,
} as const;

// Type scale. Base 15 (vs admin 13) — denser feels good in admin grids,
// breathy reads better on consumer. Hero name uses serif display.
export const F = {
  xs: '0.6875rem',
  sm: '0.8125rem',
  base: '0.9375rem',
  md: '1rem',
  lg: '1.125rem',
  xl: '1.375rem',
  xxl: '1.75rem',
  display: '2.25rem',
  hero: '2.75rem',
} as const;

// Radii. Cards 14, pills 999, inputs 10. Avoiding too-soft rounding —
// editorial tone wants definition, not bubbliness.
// Radii bumped 2026-05-16 to match the home + article rail-card
// chrome family (18 / 20 / 28px). Editorial-with-presence, not
// bubble-ware.
export const R = {
  sm: 8,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

// Shadows tuned to the same soft warm drop the home rails use so
// /profile cards lift off the cream canvas instead of sitting flush.
export const SH = {
  ambient: '0 6px 18px rgba(20, 16, 12, 0.04)',
  elevated: '0 18px 48px rgba(20, 16, 12, 0.06)',
  ring: `0 0 0 3px ${C.ring}`,
} as const;

// Font stacks. Serif for hero display only; system sans for everything else
// (no webfont fetch on the critical path).
export const FONT = {
  sans:
    "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, " +
    "'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
  serif: 'var(--font-serif)',
  mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
} as const;

// Helper — a reusable focus-ring style for keyboard a11y.
export const focusRing = {
  outline: 'none',
  boxShadow: SH.ring,
} as const;
