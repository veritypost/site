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
  bg: '#ffffff',
  surface: '#fafafa',
  surfaceRaised: '#ffffff',
  surfaceSunken: '#f4f4f5',
  // Lines
  border: '#e4e4e7',
  borderStrong: '#d4d4d8',
  divider: '#f1f1f3',
  // Ink
  ink: '#0a0a0a',
  inkSoft: '#27272a',
  inkMuted: '#52525b',
  inkDim: '#71717a',
  inkFaint: '#a1a1aa',
  // Brand accent — Verity ink-blue. Used sparingly: focus rings, primary CTA,
  // active tab underline. Not for body text or large fills.
  accent: '#0b5cff',
  accentSoft: '#e6efff',
  accentInk: '#ffffff',
  // Semantics
  success: '#15803d',
  successSoft: '#dcfce7',
  warn: '#b45309',
  warnSoft: '#fef3c7',
  danger: '#b91c1c',
  dangerSoft: '#fee2e2',
  info: '#1d4ed8',
  infoSoft: '#dbeafe',
  // Expert / verified
  verified: '#0a66c2',
  verifiedSoft: '#e3f0ff',
  expert: '#7c3aed',
  expertSoft: '#ede9fe',
  // Focus ring (a11y)
  ring: 'rgba(11,92,255,0.30)',
  ringStrong: 'rgba(11,92,255,0.60)',
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
  xs: 11,
  sm: 13,
  base: 15,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  display: 36,
  hero: 44,
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
  serif: "'Source Serif Pro', ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif",
  mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
} as const;

// Helper — a reusable focus-ring style for keyboard a11y.
export const focusRing = {
  outline: 'none',
  boxShadow: SH.ring,
} as const;
