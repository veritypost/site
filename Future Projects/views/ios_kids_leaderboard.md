# iOS Kids — Leaderboard

**File:** `VerityPostKids/VerityPostKids/LeaderboardView.swift`
**Owner:** Zhuo (kid UX), Ali (privacy posture on rankings), Bell (COPPA sanity).
**Depends on:** `14_KIDS_CHOREOGRAPHY.md`, `07_KIDS_DECISION.md`.

---

## Current state

Per recon: static pill selection. No animated rank changes. Data-dense but visually quiet. Scope pills + category pills + rank rows.

Per `07_KIDS_DECISION.md`: kids leaderboard is **family-scoped only** in Year 1. No global leaderboard. Reduces comparison anxiety and privacy surface.

## What changes

### Scope enforcement

Remove any global-scope option. Kids only see their rank within their family (siblings / cousins / whoever's on the same family plan).

If a family has only one kid, the leaderboard view shows a simple "You're the only one here! Ask your grown-up to add another kid to the family plan." with a parent-facing nudge (not a paywall to the kid — link that goes to parent app).

### Rank change animation

Per `14_KIDS_CHOREOGRAPHY.md` item 10:
- On rank change, row slides to new position with spring animation.
- Rank numbers update via `AnimatedCountUp`.
- Top 3 rows get subtle gradient border (gold/silver/bronze) that shimmers on change.

Animations only on actual rank change — static most of the time.

### Pill selection

- Category filter pills use `KidPressStyle`.
- Selection transitions smoothly (color crossfade).

### Kid's own row highlight

Their row is highlighted with their theme color. Always visible at the top if ranked high, pinned to a "You" indicator if scrolled out of view.

## Files

- `VerityPostKids/VerityPostKids/LeaderboardView.swift` — family scope enforcement, rank animations, pill press style.

## Acceptance criteria

- [ ] No global scope option.
- [ ] Solo-kid state shows warm "only kid here" message.
- [ ] Rank changes animate with spring.
- [ ] Top 3 gold/silver/bronze rows with shimmer on change.
- [ ] Pills use KidPressStyle.
- [ ] Kid's own row highlighted with theme color.
- [ ] Reduce Motion path.
- [ ] VoiceOver reads rank + score.

## Dependencies

Ship after `07_KIDS_DECISION.md` (family scope policy), `14_KIDS_CHOREOGRAPHY.md`.
