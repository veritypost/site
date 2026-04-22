# iOS Adult — Home

**File:** `VerityPost/VerityPost/HomeView.swift`
**Owner:** Drudge (curation), Vinh (typography), Ive (restraint).
**Depends on:** `09_HOME_FEED_REBUILD.md`, `08_DESIGN_TOKENS.md`, `05_EDITOR_SYSTEM.md`, `10_SUMMARY_FORMAT.md`, `16_ACCESSIBILITY.md`.

---

## Current state

Per iOS-adult-recon 2026-04-21: streak header at top, category/subcategory filter pills, story feed with Load-More pagination, recap card inline, ad slots every 6 items (free/verity tiers; suppressed for pro+), search overlay.

Issues:
- Stale pagination state when Load-More is exhausted.
- Empty state for filtered search unclear.
- Ad tracking not visible in code.
- Streak header conflates profile + home concerns.

## What changes

Mirror the web rebuild (`09_HOME_FEED_REBUILD.md`). Same architecture, adapted for mobile.

### Remove from HomeView

- Streak header (moves to `ProfileView`).
- Category/subcategory pill filter.
- Ad slots every 6 items.
- Load-More pagination.
- Inline search overlay.

### Add to HomeView

- **Masthead** at top: "Verity" wordmark + today's date. No editor name, no metadata.
- **Hero card** (slot 0): eyebrow, large headline (Dynamic Type scaled), deck, prose summary paragraph.
- **Supporting cards** (slots 1–7): eyebrow, headline, summary paragraph. Hairline dividers. No byline, no read time, no timestamp, no corrections count, no sourcing-strength row.
- **Breaking strip** (conditional): headline only, no timestamp.
- **Bottom block**: "That's today's front page." + archive + recent links.

### Data source

Reads from `front_page_state` (new table) via `/api/front-page` endpoint. iOS makes a single GET request, hydrates into `ArticleCard` views.

### Dynamic Type

Every text element uses `Font.scaledSystem(size:weight:design:relativeTo:)` — helper needs to be ported from kids app per `16_ACCESSIBILITY.md`.

### Typography (per `08_DESIGN_TOKENS.md`)

- Masthead wordmark: `typography.h1` or heavier.
- Hero headline: `typography.h1` (28pt, scaled).
- Hero summary: `typography.body_lg` (20pt, scaled).
- Supporting headline: `typography.h3` (20pt, scaled).
- Meta: `typography.meta` (13pt, scaled).

### Search

Move to a dedicated SearchView accessed via a magnifier icon in the nav bar. Not overlaid on Home.

### Recap

Stays, but moves to its own tab or a dedicated accessor. Per `09_HOME_FEED_REBUILD.md`: recap doesn't belong on Home — it's a weekly product.

## Files

- `VerityPost/VerityPost/HomeView.swift` — substantial rewrite.
- `VerityPost/VerityPost/Views/FrontPageMasthead.swift` — new.
- `VerityPost/VerityPost/Views/FrontPageHero.swift` — new.
- `VerityPost/VerityPost/Views/FrontPageSlot.swift` — new.
- `VerityPost/VerityPost/Views/BreakingStrip.swift` — new.
- `VerityPost/VerityPost/Theme.swift` — port `Font.scaledSystem` helper from kids.

## Acceptance criteria

- [ ] Masthead renders with wordmark + date only.
- [ ] 8 slots render from `/api/front-page`.
- [ ] Hero is typographically dominant.
- [ ] Supporting slots render identically.
- [ ] No byline, read time, publish timestamp, corrections count, or sourcing row on any card.
- [ ] Breaking strip appears only when active; no timestamp inside it.
- [ ] Streak card removed from Home (present on Profile).
- [ ] No category pills on Home.
- [ ] No ads on Home.
- [ ] Bottom block with archive + recent links.
- [ ] Dynamic Type scales correctly at Accessibility Large sizes.
- [ ] Bottom reached doesn't trigger Load-More (page ends).
- [ ] Cold start to Home interactive < 1500ms on iPhone SE 2020.

## Dependencies

Ship after `05_EDITOR_SYSTEM.md` (data source), `08_DESIGN_TOKENS.md`, `16_ACCESSIBILITY.md` (Dynamic Type port).
