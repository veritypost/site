# 08 — Design Tokens

**Owner:** Ive (primary — restraint and token hygiene), Vinh (editorial design), Spalter (systemic consistency).
**Depends on:** `00_CHARTER.md`.
**Affects:** `web/src/app/globals.css`, new `web/src/lib/tokens.ts`, adult iOS `Theme.swift`, kids iOS `KidsTheme.swift` + `KidPrimitives.swift`, every component, every view.

---

## Current state (verified 2026-04-21)

The codebase is more disciplined than the prior session's mockups implied. Token inventory:

### Web

- **CSS variables in `globals.css`:** `--bg` (#ffffff), `--card` (#f7f7f7), `--border` (#222222), `--text` (#111111), `--accent` (#111111), `--success` (#22c55e), `--danger` (#b91c1c), `--warn` (#f59e0b), `--dim` (#5a5a5a), `--muted` (#999999), `--soft` (#444444), `--font-serif`, `--font-sans`.
- **Admin palette** (`web/src/lib/adminPalette.js`): separate token file for the admin surface, with its own spacing (S[1–12]) and font (F.xs–F.xxl) scales. `ADMIN_C` (dark-accent) and `ADMIN_C_LIGHT` (light) themes.
- **No Tailwind arbitrary values in active TSX source.** Styling is inline CSSProperties objects referencing CSS variables or direct hex.

Recon finding: the horror stories of "13 radii, 16 font sizes, 47 weight combos" aren't supported by the codebase. The active web surface is reasonably disciplined. The drift risk is in the admin/user duplicate components (Toast.tsx vs admin/Toast.jsx, ConfirmDialog.tsx vs admin/ConfirmDialog.jsx) which are intentional per `@admin-verified` and don't need merging.

### Adult iOS (`VerityPost/VerityPost/Theme.swift`)

Comprehensive and clean. Mirrors web globals.css:

- 23 declared colors covering background/card/text/border/accent/semantic/quiz-badge/activity-type
- 8 kid color options (used in avatar theming)
- Milestone tiers: [1, 5, 10, 25, 50, 100]
- 4 reusable components: `AvatarView`, `VerifiedBadgeView`, `StatRowView`, `PillButton`

Zero emoji. Confirmed compliant.

### Kids iOS (`VerityPostKids/VerityPostKids/KidsTheme.swift` + `KidPrimitives.swift`)

- K namespace: 10 palette colors (teal, tealDark, tealLight, coral, coralDark, gold, sky, mint, purple) + 5 neutrals
- Particle color pool: 7 colors
- 3 animation presets: springOvershoot, springSoft, springSnap
- `Font.scaledSystem(size:weight:design:relativeTo:)` helper routes through UIFontMetrics for Dynamic Type support
- 3 primitives: StatBubble, BadgeTile, LeaderRow

No custom `KidPressStyle` button style exists. (Contradicts one memory — verified absent in recon.) Buttons are plain-styled with manual state handling.

## What the Charter needs from tokens

The Charter says:

- Commitment 1: consistent format — tokens must make the format visually inevitable.
- Commitment 2: dated front page — the front page typography must read as editorial, not feed-algorithmic.
- Commitment 3: earned comments — the quiz gate must be visible and the comment layer must feel distinct from the rest of the page.
- Commitment 4: trust infrastructure — sources, corrections, defection links need a visual vocabulary that reads as trust (muted, restrained, legible).
- Commitment 5: refusal-driven — tokens themselves refuse: no color saturation escalation, no motion on adult surfaces, no variation for its own sake.

Restraint is the aesthetic. The token system is not about flexibility — it's about lockdown. Fewer tokens, used more confidently.

## The consolidated token system

Three layers, clearly separated. Each value appears exactly once.

### Layer 1 — Reference primitives (the raw values)

Never referenced directly in components. Used only by Layer 2.

```
colors.neutral.0   #ffffff
colors.neutral.50  #fafafa
colors.neutral.100 #f5f5f5
colors.neutral.200 #e5e5e5
colors.neutral.300 #d4d4d4
colors.neutral.500 #777777
colors.neutral.600 #5a5a5a
colors.neutral.700 #444444
colors.neutral.800 #333333
colors.neutral.900 #111111

colors.semantic.success #16a34a
colors.semantic.warning #b45309
colors.semantic.danger  #b91c1c
colors.semantic.info    #1d4ed8

colors.kids.teal        #2dd4bf
colors.kids.coral       #fb7185
colors.kids.gold        #fbbf24
colors.kids.sky         #38bdf8
colors.kids.mint        #34d399
colors.kids.purple      #a78bfa

space.0  0
space.1  4
space.2  8
space.3  12
space.4  16
space.6  24
space.8  32
space.12 48
space.16 64

radius.0  0
radius.1  4
radius.2  8
radius.3  12
radius.4  16
radius.capsule 9999

fontSize.11  11
fontSize.13  13
fontSize.15  15
fontSize.17  17
fontSize.20  20
fontSize.24  24
fontSize.28  28
fontSize.34  34
fontSize.42  42

weight.regular  400
weight.medium   500
weight.semibold 600
weight.bold     700
weight.black    800
```

That's the whole primitive set. Any hex or number outside this list is a drift flag.

### Layer 2 — Semantic tokens (what components use)

The contract between primitives and components.

```
surface.bg      neutral.0
surface.card    neutral.50
surface.raised  neutral.100
surface.sunken  neutral.0

border.subtle   neutral.200
border.default  neutral.300
border.strong   neutral.900

text.primary    neutral.900
text.secondary  neutral.600
text.muted      neutral.500
text.disabled   neutral.300
text.inverse    neutral.0

accent.default  neutral.900
accent.hover    neutral.800
accent.pressed  neutral.900 (no shift — pressed is feedback, not color)

status.success.fg neutral.0
status.success.bg semantic.success
status.warning.fg neutral.0
status.warning.bg semantic.warning
status.danger.fg  neutral.0
status.danger.bg  semantic.danger

typography.eyebrow   { size: 11, weight: semibold, tracking: 1.2, upper: true }
typography.meta      { size: 13, weight: regular }
typography.meta_bold { size: 13, weight: medium }
typography.body      { size: 17, weight: regular, leading: 1.5 }
typography.body_lg   { size: 20, weight: regular, leading: 1.4 }
typography.deck      { size: 20, weight: regular, leading: 1.4 }
typography.h3        { size: 20, weight: bold, tracking: -0.3 }
typography.h2        { size: 24, weight: bold, tracking: -0.4 }
typography.h1        { size: 28, weight: bold, tracking: -0.5 }
typography.display   { size: 34, weight: bold, tracking: -0.6 }
typography.hero      { size: 42, weight: bold, tracking: -0.8 }

space.stack.tight   space.2
space.stack.normal  space.3
space.stack.loose   space.4
space.stack.xloose  space.6
space.inline.tight  space.2
space.inline.normal space.3
space.gutter        space.5 (20) — new
space.margin        space.6

radius.tap     radius.2
radius.card    radius.3
radius.modal   radius.4
radius.pill    radius.capsule
```

That's the design vocabulary. Components reference these. New components add to Layer 2 only if absolutely necessary.

### Layer 3 — Component tokens (per-component overrides)

Reserved for components that have a genuinely unique visual identity and can't be expressed with Layer 2 alone. Capped at ~15 components. Examples:

- `button.primary` — references accent.default, text.inverse, space.inline.normal padding, radius.tap
- `button.secondary` — border.default, text.primary, transparent bg
- `paywall.card.padding` — space.margin, not space.stack.loose
- `quiz.option.bg.correct` — a specific muted green, used only in quiz (this is a Layer 3 token because quiz UX wants slightly different feedback colors from generic success)

If a component needs a 16th Layer 3 token, pause. Probably a Layer 2 token is being under-used.

## Kids token system

Kids is not a fork. It's a transformation. The same Layer 1 primitives, the same Layer 2 semantics, with a small set of per-mode overrides.

```
kids.font.design       .rounded
kids.font.weight_delta +1  (semibold → bold, bold → black, etc.)
kids.radius_delta      +1  (tap → card, card → modal)
kids.space_delta       1.25x  (all spaces scale up by 25%)

kids.accent.default    colors.kids.purple (or per-kid theme)
kids.accent.positive   colors.kids.teal
kids.accent.joy        colors.kids.coral
kids.accent.discovery  colors.kids.sky
kids.accent.achievement colors.kids.gold
kids.accent.celebration colors.kids.mint

kids.motion.spring_overshoot { response: 0.55, damping: 0.55 }
kids.motion.spring_soft      { response: 0.60, damping: 0.85 }
kids.motion.spring_snap      { response: 0.35, damping: 0.75 }
```

That's the whole kids delta. Everything else — neutrals, sizes, semantics — is the same tokens.

Per-kid theme color (currently 8 kid color options in `Theme.swift`) stays. Each kid picks their color at profile creation. That color replaces `kids.accent.default` in their experience only.

## Implementation plan

### Web

1. Create `web/src/lib/tokens.ts` — exports Layer 1 and Layer 2 as typed constants.
2. Update `web/src/app/globals.css` — CSS variables redefined to reference the new token structure. Preserve existing variable names (`--bg`, `--text`, etc.) as aliases pointing at the new semantic tokens so no component breaks.
3. Audit every component that hard-codes a hex or pixel value outside tokens. Replace. Start with high-traffic components: `CommentThread.tsx`, `LockModal.tsx`, `ArticleQuiz.tsx`.
4. Delete `adminPalette.js` — admin reads from `tokens.ts` with optional admin overrides via Layer 3. The admin dark theme becomes a Layer 3 variant, not a separate palette.
5. `tsc --noEmit` passes. Visual regression pass on the home feed and story detail.

### Adult iOS

1. `Theme.swift` gets restructured into three sections matching the layers. Existing color constants become aliases to the new semantic layer.
2. `Font.scaledSystem` helper (currently only in kids) extends to adult too — enables Dynamic Type support across the adult app without rewriting every view.
3. All existing views continue to work. The token change is internal.

### Kids iOS

1. `KidsTheme.swift` K namespace is kept. Add the `.kids` overrides from the kids delta section above.
2. `Font.scaledSystem` already exists in kids; no change.
3. Introduce a `KidPressStyle` ButtonStyle (currently absent) that wires the springSnap motion + haptic feedback to every button. This is the "buttons feel tactile" fix from the kids recon. See `14_KIDS_CHOREOGRAPHY.md`.

## What this explicitly doesn't do

- **No dark mode implementation in this doc.** Adding a `theme.mode` variant is a separate decision. Reserve space for it by making Layer 2 semantics mode-aware (e.g., `text.primary` returns light-or-dark value via a theme context), but don't ship dark mode as part of the token refactor.
- **No Tailwind introduction.** The codebase is already past that decision — CSS variables + inline styles is the choice.
- **No design-tokens-in-DB.** Considered in `db/09_design_tokens_table.md` as a future option (to let editors A/B test typography values without deploys). Explicitly rejected for now — tokens as code is simpler, faster, less brittle. Revisit in Year 2 if there's a real case.

## Acceptance criteria

- [ ] `web/src/lib/tokens.ts` exists, exports Layer 1 and Layer 2.
- [ ] `globals.css` variables reference tokens (via CSS custom properties or build-time inlining).
- [ ] `adminPalette.js` is deleted; admin surface reads from `tokens.ts` with admin variants.
- [ ] A grep for hex colors in `web/src/` outside `tokens.ts` returns zero results (or a short list of explicit exceptions documented in a `TOKEN_EXCEPTIONS.md`).
- [ ] `Theme.swift` and `KidsTheme.swift` restructured into the three-layer model; existing views unchanged visually.
- [ ] `KidPressStyle` ButtonStyle exists in kids iOS and is applied to every button.
- [ ] `Font.scaledSystem` helper used in adult iOS at least in `StoryDetailView` body text.
- [ ] Visual regression pass: home feed, story detail, paywall modal, profile, settings — no unintended visual changes.

## Risk register

- **Token refactor accidentally changes a color that someone cared about.** Mitigation: visual regression suite (even manual) before merge. The hex-to-token mapping is 1:1 where we're preserving existing values.
- **Admin palette removal breaks an admin surface.** Mitigation: `admin` is `@admin-verified` locked. Requires explicit owner sign-off on this change. Run the admin views through manual QA before merge.
- **`KidPressStyle` introduces bugs in buttons that were working fine.** Mitigation: ship it behind a local flag, roll out per-view, monitor for regressions.
- **Token names bike-shed.** Mitigation: this doc is the naming. Don't rename in review.

## Sequencing

Ship before: any large visual work (home feed rebuild, paywall rewrite). The token system is the substrate.
Ship after: `00_CHARTER.md` so the system is anchored to the five commitments.
Pairs with: `16_ACCESSIBILITY.md` (Dynamic Type ports ride on the typography tokens).
