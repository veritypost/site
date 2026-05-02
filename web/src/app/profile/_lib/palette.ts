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
  // Surfaces
  bg: 'var(--p-bg)',
  surface: 'var(--p-surface)',
  surfaceRaised: 'var(--p-surface-raised)',
  surfaceSunken: 'var(--p-surface-sunken)',
  // Lines
  border: 'var(--p-border)',
  borderStrong: 'var(--p-border-strong)',
  divider: 'var(--p-divider)',
  // Ink
  ink: 'var(--p-ink)',
  inkSoft: 'var(--p-ink-soft)',
  inkMuted: 'var(--p-ink-muted)',
  inkDim: 'var(--p-ink-dim)',
  inkFaint: 'var(--p-ink-faint)',
  // Brand accent — Verity ink-blue. Used sparingly: focus rings, primary CTA,
  // active tab underline. Not for body text or large fills.
  accent: 'var(--p-accent)',
  accentSoft: 'var(--p-accent-soft)',
  accentInk: 'var(--p-accent-ink)',
  // Semantics
  success: 'var(--p-success)',
  successSoft: 'var(--p-success-soft)',
  warn: 'var(--p-warn)',
  warnSoft: '#fef3c7',
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

// Spacing — 4px base, 8px grid. Larger than admin (where S[1]=4, S[4]=16);
// here the same keys exist but base default is wider for the consumer surface.
export const S = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 32,
  8: 40,
  9: 56,
  10: 72,
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
export const R = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

// Shadows. One ambient + one elevated. Used sparingly.
export const SH = {
  ambient: '0 1px 2px rgba(15,15,15,0.04), 0 1px 3px rgba(15,15,15,0.06)',
  elevated: '0 4px 12px rgba(15,15,15,0.06), 0 2px 4px rgba(15,15,15,0.05)',
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
