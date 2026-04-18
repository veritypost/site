// Kid-mode visual tokens. Chunk 3 of the kids-mode audit + repair pass.
//
// One source of truth for typography scale, palette, spacing, and hit
// target minimums on /kids/* surfaces. Kid pages import KID directly
// via inline styles. When the project migrates to CSS vars / Tailwind,
// this file becomes the seed for `.kid-surface { --bg: ...; }`.
//
// WCAG AA contrast ratios (WebAIM formula, manually verified):
//   dim (#7A6A5A) on cream (#FDF8EC)   = 4.91:1  AA normal PASS
//   white on accent (#C2410C)           = 5.18:1  AA normal PASS
//   white on success (#15803D)          = 5.01:1  AA normal PASS
//   white on danger (#B91C1C)           ~ 7.0:1   AA normal PASS (adult convention)
//   ink (#1F1A15) on gold (#CA8A04)     = 5.88:1  AA normal PASS
//   ink (#1F1A15) on streak (#EA580C)   = 4.85:1  AA normal PASS
//   white on streak (#EA580C)           = 3.56:1  FAIL normal — never for small text
//   white on gold (#CA8A04)             = 2.94:1  FAIL both — never
//
// Usage guidance:
//   - White text is reserved for surfaces on accent, success, danger.
//   - Ink text goes on gold and streak.
//   - Streak (#EA580C) is also safe as non-text ornamentation —
//     icon strokes, progress bar fills, borders — no contrast rule.

export const KID = {
  // ------- Surfaces -------
  bg: '#FDF8EC',           // warm paper cream
  card: '#FFFFFF',         // inner cards keep crisp contrast on cream
  cardAlt: '#F5EED9',      // tinted card for layered surfaces
  border: '#E8DDC3',       // warm cream-grey, not the adult #E5E5E5

  // ------- Text -------
  text: '#1F1A15',         // warm ink (never pure black on cream)
  dim: '#7A6A5A',          // secondary / labels / timestamps
  onAccent: '#FFFFFF',     // safe on accent, success, danger
  onWarm: '#1F1A15',       // use on gold or streak surfaces

  // ------- Accents -------
  accent: '#C2410C',       // buttons, active state, primary CTA
  streak: '#EA580C',       // celebratory orange — ink text only
  achievement: '#CA8A04',  // gold badge — ink text only
  success: '#15803D',      // quiz pass, positive flash
  danger: '#B91C1C',       // lock, error, destructive
  warn: '#B45309',         // trial, grace — matches adult warn

  // Soft tints for alert washes (backgrounds behind success/danger/warn text)
  successSoft: '#ECFDF5',
  dangerSoft: '#FEF2F2',
  warnSoft: '#FFFBEB',
  warnInk: '#78350F',      // readable warn text on warnSoft wash

  // Translucency. Derived from KID.text (#1F1A15 = rgb 31,26,21) so
  // overlays and shadows stay in the warm-ink palette rather than
  // the cold adult rgba(0,0,0,…) convention.
  backdrop: 'rgba(31, 26, 21, 0.55)', // modal backdrop overlay
  shadow: '0 8px 24px rgba(31, 26, 21, 0.18)', // elevated card + avatar drop

  // ------- Typography (px) -------
  font: {
    body: 18,
    h1: 30,
    h2: 22,
    h3: 18,
    label: 11,             // uppercase mini-labels (ARTICLES, etc.)
    sub: 14,               // body-dim between body and label
    stat: 34,              // hero stat numbers
  },
  weight: {
    body: 400,
    bold: 700,
    extra: 800,
  },
  leading: {
    body: 1.6,
    heading: 1.2,
    relaxed: 1.5,
  },
  tracking: {
    tight: '-0.02em',      // headings
    loose: '0.5px',        // uppercase labels
  },

  // ------- Spacing (px) -------
  space: {
    cardPad: 20,
    gridGap: 16,
    sectionGap: 24,
    rowGap: 12,
    maxWidth: 640,
    hitMin: 56,
  },

  // ------- Radius (px) -------
  radius: {
    card: 14,
    button: 12,
    chip: 999,
  },
};
