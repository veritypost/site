# 16 — Accessibility

**Owner:** Weinschenk (primary — behavioral UX spans accessibility), Zhuo (lifecycle + cross-surface consistency), Abramov (React implementation).
**Depends on:** `08_DESIGN_TOKENS.md`, `15_PERFORMANCE_BUDGET.md`.
**Affects:** every web view, every iOS view. Global font scaling, color contrast, keyboard navigation, screen-reader announcements, motion preferences.

---

## Why this is its own doc

Accessibility is usually treated as a compliance afterthought. For Verity it's commercial. Readers 55+ are a core audience (the "tired reader" segment from `01_POSITIONING.md`); many of them have mild visual or motor limitations. A news product that fights their settings is a news product they leave.

Also: accessibility is cheap when done as tokens (see `08_DESIGN_TOKENS.md`). Every typography token has a base size and respects Dynamic Type. Every tap target is at least 44pt. Every color pair meets WCAG AA contrast. You ship it once in the token layer and every view inherits.

## The commitments

Ranked by ROI per the panel's ordering (highest first):

### 1. Dynamic Type on article body (web + iOS)

Readers pick their system text size. Verity honors it. Article body, headlines, meta lines, comments all scale.

**Web:** Use `rem` units for typography. Base is browser-default (usually 16px, can be user-configured). Headlines use `rem` multipliers. Don't override the reader's base with `html { font-size: 14px }` — that's a common accessibility anti-pattern and it's not in the current codebase but flag it.

**iOS:** Use `UIFontMetrics.default.scaledFont(for:)` via the `Font.scaledSystem` helper (exists in kids app; port to adult app — `Theme.swift` needs the equivalent). Every font in `Theme.swift` routes through the scaling helper.

**Testing:** Set iOS text size to the largest option ("Large Accessibility Sizes" → max). Verify: home page still readable, no text clipped, no overlap, interactive elements still tappable. Set browser zoom to 200%. Same verification.

### 2. Color contrast AA everywhere, AAA on body

- Body text (`text.primary` on `surface.bg`): must pass WCAG AAA (7:1). Currently `#111111` on `#ffffff` = 19.77:1. Pass.
- Secondary text (`text.secondary` on `surface.bg`): must pass AA (4.5:1). Currently `#5a5a5a` on `#ffffff` = 7.03:1. Pass.
- Muted text (`text.muted` on `surface.bg`): must pass AA for large text (3:1). Currently `#999999` on `#ffffff` = 2.85:1. **Fails.** Fix: darken to `#767676` (4.54:1 AA) or restrict `text.muted` to large-text use only.
- Status colors: `success` (#22c55e) on white = 2.4:1. **Fails AA for text.** Use for icon / fill only, not text. For status text, use a darker variant — `#16a34a` or darker.
- Links, active navigation, focus states: ≥ 3:1 against surrounding content.

Recon flagged `#22c55e` on white at 2.4:1. Fix.

### 3. VoiceOver + screen reader support on every interactive surface

Every button, input, link has a meaningful label. Every image has alt text. Every interactive element has a clear role.

**Specific surfaces to audit:**

- `ArticleQuiz.tsx` — the quiz interactions must announce state transitions ("Question 2 of 5. Which of the following..."). Currently the quiz is unverified for screen-reader support — likely gaps.
- `CommentThread.tsx` — each comment should have `role="article"` or equivalent landmark, commenter name, and body are in a readable order.
- Home tabs / navigation — `role="navigation"` on the main nav, labels on each section link.
- Paywall modal — `role="dialog"`, `aria-modal="true"`, focus traps the reader in until dismissed, Esc closes.
- Quiz result / unlock moment — VoiceOver announces "Score 3 of 5. You are in. The conversation is below."
- iOS: every SwiftUI `Button` gets `.accessibilityLabel` and `.accessibilityHint`.

### 4. Reduce Motion support

`prefers-reduced-motion: reduce` on web and `@Environment(\.accessibilityReduceMotion)` on iOS.

Replace:
- Scroll-into-view animations → instant scroll.
- Particle bursts (kids) → single opacity fade.
- Quiz unlock moment (adult) → 150ms cross-fade.
- Badge unlock scene (kids) → static badge appears.
- Press style bounces → no scale change.

Haptics and static visual feedback remain — those aren't motion.

### 5. Keyboard navigation on desktop web

Every action reachable via keyboard. Skip link at top of every page. Focus rings visible (not hidden via `outline: none` — a common anti-pattern).

**Keyboard shortcuts, by explicit request from memory:**
- No keyboard shortcuts on admin (per memory note: admin is click-driven only).
- On reader surfaces: Tab works. Forward slash (`/`) focuses search. `Esc` closes modals. That's it. No `j`/`k` movement, no chord shortcuts — hidden keyboard shortcuts are a hostile-to-new-user pattern. Keep it simple.

Admin's no-keyboard-shortcut rule (per existing memory) applies. Delete any keyboard-shortcut UI mentioned in the home feed earlier drafts — confirmed absent from the MD set.

### 6. Tap target sizes

Per CLAUDE.md memory: 13 sub-44pt tap targets currently in the adult iOS app, flagged as a one-day sweep. Same bar for web: 44px minimum on mobile.

Sweep and fix. Small buttons grow their hit areas via invisible padding rather than changing visual size.

### 7. Haptics as accessibility affordance

Haptics are a non-visual signal. For a visually-impaired reader, a confirm haptic on a button press is the only feedback they get that the press was registered.

**Placement (adult iOS):**
- Quiz pass — single `.soft` haptic.
- Successful subscription — single `.success` notification haptic.
- Bookmark toggle — `.soft` on add, no haptic on remove.
- Comment post — `.soft` after server confirms.
- Failed subscription, failed login — `.error` notification haptic.

**Placement (kids iOS):** per `14_KIDS_CHOREOGRAPHY.md` — `.soft` on affirmative, `.rigid` on wrong, `.success` on celebrations.

**Placement (web):** no haptics. Browser APIs don't provide them reliably.

### 8. Focus management on paywall and quiz interactions

A common accessibility failure: focus jumps to a modal but returns somewhere random when the modal closes.

- When paywall modal opens, focus traps within it. Esc closes. On close, focus returns to the triggering element (the "Subscribe" button or the story body).
- When quiz result card shows, focus moves to the comment composer (per `13_QUIZ_UNLOCK_MOMENT.md`).
- When a toast notification appears, focus does not shift. Toast is announced via ARIA live region.

## The adult iOS gap

Recon flagged: the kids iOS app has `Font.scaledSystem` for Dynamic Type support; the adult iOS app does not. This is the single highest-leverage accessibility fix for the adult iOS surface. Port the helper and route `Theme.swift` fonts through it.

## The web gap

Recon did not confirm Dynamic Type equivalent on web — likely some font sizes use pixel values instead of rems. Audit and fix as part of the token migration (`08_DESIGN_TOKENS.md` — typography tokens should emit rem units).

## Testing

### Automated

- axe-core on every page via Playwright or similar integration tests.
- Lighthouse accessibility score ≥ 95 on every major route.
- Color contrast tooling in the design system (Figma plugin + design review).

### Manual

- Monthly: run the site in VoiceOver (macOS) / NVDA (Windows) for a full reading session on the 3 primary flows (home → story → quiz → comment).
- Monthly: run the iOS app with VoiceOver enabled.
- Quarterly: test with users who have disabilities (paid user research — flag for Year 2 once revenue supports it).

## Acceptance criteria

- [ ] Web typography uses rem units; zooming to 200% doesn't break layout.
- [ ] Adult iOS has `Font.scaledSystem` helper; Theme.swift uses it.
- [ ] Color contrast sweep done: all fails (e.g., `#22c55e` text on white) fixed.
- [ ] Every interactive element on web and iOS has an accessibility label.
- [ ] Reduce Motion path implemented and tested.
- [ ] Tap targets ≥ 44pt across adult iOS.
- [ ] Haptic coverage matches spec (no haptic on fail on adult, soft on pass).
- [ ] Focus management tested on paywall, quiz, and toast flows.
- [ ] axe-core clean on 10 representative routes.
- [ ] Lighthouse accessibility score ≥ 95 on home, story, profile.

## Risk register

- **Dynamic Type breaks a carefully-sized UI.** Mitigation: test at max accessibility sizes early. Design for expansion, not pixel-exact layouts.
- **VoiceOver disagreements with custom components.** Mitigation: use native HTML semantics where possible (`<button>`, `<nav>`, `<article>`). Custom components only when necessary, with ARIA roles.
- **Reduce Motion makes the kids app feel flat.** Acceptable. Kids who have Reduce Motion enabled prefer flat to dizzy.
- **Contrast fixes change the brand feel.** Mitigation: most fixes are edge cases (status colors, muted text). Primary brand palette is already high-contrast.

## What this doesn't include

- Internationalization / localization. English only for Year 1.
- Deaf / hard-of-hearing specific features (transcript on TTS audio, etc.) — scoped but not spec'd here.
- Dyslexia-friendly font option. Considered; not in Year 1. If added, it's a user preference, not a default.

## Sequencing

Ship with: `08_DESIGN_TOKENS.md` (typography tokens must be rem on web; must route through `Font.scaledSystem` on iOS).
Ship before: major marketing push — a11y is a trust signal and an SEO signal.
Pairs with: `15_PERFORMANCE_BUDGET.md` — accessibility and performance compound; Dynamic Type done wrong is janky.
