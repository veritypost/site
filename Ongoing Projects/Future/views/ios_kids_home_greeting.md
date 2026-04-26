# iOS Kids — Home (GreetingScene)

**File:** `VerityPostKids/VerityPostKids/GreetingScene.swift`
**Owner:** Ive (motion), Zhuo (first impression).
**Depends on:** `14_KIDS_CHOREOGRAPHY.md`.

---

## Current state

Per kids-iOS-recon: band drop (200ms), shimmer sweep (500ms), time-of-day icon spin (600ms), greeting label fade (750ms), typewriter name with sparkles (900ms), streak card fade (1600ms), staggered category grid (1900ms). Strong staged reveal. The best-choreographed moment besides StreakScene.

Minor flat moments:
- Scroll is immediate; no parallax.
- No seasonal variation in greeting.

## What changes

### Retain

The staged reveal works. Don't rebuild.

### Subtle refinements per `14_KIDS_CHOREOGRAPHY.md`

- Category tiles get progress trails: 5 pill nodes at the bottom edge of each tile, filled as kid reads in that category.
- On home scene reveal, nodes fill left-to-right cascade across all tiles (100ms stagger per tile, 50ms per node).
- On re-entering a category and returning home, the most-recent node briefly glows on the relevant tile.

### Tap on category tile

Apply `KidPressStyle` (scale + haptic on release). Transition to `ArticleListView` for that category.

### Tap on streak card

Tap should trigger `StreakScene` so the kid can re-experience the milestone animation. Currently happens via navigation.

### Morning vs afternoon vs evening

Already handled via time-of-day icon + greeting label. Keep.

### No seasonal flavor

Considered; deferred to Year 2. Keeping the scene tight for launch.

## Files

- `VerityPostKids/VerityPostKids/GreetingScene.swift` — tile progress trails, press style, tap handlers.

## Acceptance criteria

- [ ] Staged reveal sequence unchanged (works).
- [ ] Category tiles show 5-node progress trail.
- [ ] Trail fills left-to-right on scene reveal.
- [ ] Most-recent node glows on return to home.
- [ ] Tap on tile uses KidPressStyle.
- [ ] Tap on streak card opens StreakScene.
- [ ] Reduce Motion path.

## Dependencies

Ship after `14_KIDS_CHOREOGRAPHY.md` (KidPressStyle).
