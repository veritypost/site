# Web — Leaderboard

**File:** `web/src/app/leaderboard/page.tsx`
**Owner:** Zhuo (engagement design), Thompson (editorial posture on public ranking).
**Depends on:** `08_DESIGN_TOKENS.md`, `17_REFUSAL_LIST.md`.
**DB touchpoints:** `users` (read), `category_scores` (read).

---

## Current state

Global user rankings (score-based). Permissions gate access. Renders a list of top users by various metrics.

## What changes

This view exists on iOS too (`LeaderboardView.swift`). The adult leaderboard is low-priority — it's engagement-game aesthetic in a product whose Charter refuses engagement metrics shown to readers (refusal list item 5 in `17_REFUSAL_LIST.md`).

**Decision:** adult leaderboard is de-emphasized. Not removed (paid users like it), but not marketed, not linked from the home, not pitched as a core feature.

- Keep `/leaderboard` route.
- Remove from top navigation (if present).
- Access via profile settings only ("See where you rank" as a small link in `/profile`).
- Token pass for typography.

This is a deliberate de-invest. The kids leaderboard is different (family-scoped, appropriate to kid framing).

## Files

- `web/src/app/leaderboard/page.tsx` — token pass, de-emphasize.
- Navigation audit — remove leaderboard from primary nav.

## Acceptance criteria

- [ ] Leaderboard page loads and ranks correctly.
- [ ] Not linked from primary navigation.
- [ ] Linked from `/profile` as a small discoverable link.
- [ ] Token pass applied.

## Dependencies

Ship after `08_DESIGN_TOKENS.md`.
