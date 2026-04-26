# Web — Home Feed

**File:** `web/src/app/page.tsx` (main component `HomePage`)
**Owner:** Drudge (curation), Vinh (typography), Thompson (editorial hierarchy).
**Depends on:** `09_HOME_FEED_REBUILD.md`, `05_EDITOR_SYSTEM.md`, `10_SUMMARY_FORMAT.md`, `08_DESIGN_TOKENS.md`.
**DB touchpoints:** `front_page_state` (new — see `db/04_editorial_charter_table.md`), `articles`.

---

## Current state

`HomePage` reads articles, joins categories/subcategories/sources, renders a flat feed of cards. Includes category/subcategory filter pills, search overlay, breaking-news banner gated by permission. `FALLBACK_CATEGORIES` constant is still hardcoded (flagged T-017 per CLAUDE.md).

Problems:
- Every card is equally weighted. No visual hierarchy.
- No masthead.
- Category pills create feed-like noise on what should be editorial.
- Search overlay competes with reading posture.
- Ad slots every 6 items interrupt the page.
- Infinite scroll with "Load More."
- Cards include byline, read time, timestamp — all cut per Charter commitment 4.

## What changes

Per `09_HOME_FEED_REBUILD.md`, the page becomes a dated, editor-curated artifact.

### Masthead (top strip)

Two elements in one line:

- Wordmark "Verity" at `typography.h1` scale or heavier.
- Today's date ("Friday, January 10, 2025") in `typography.meta`.

No editor-on-shift name visible to readers (per Charter commitment 4 — production metadata is cut).

### Hero slot (slot 0)

- Eyebrow (category · subcategory)
- Headline at display scale
- Deck (one line completing the headline)
- Prose summary (2–4 sentences, identical text to on-page summary)

No byline, no read time, no timestamp, no sourcing row, no corrections count.

### Supporting slots (1–7)

Consistent treatment:
- Eyebrow
- Headline at h3 scale
- One-paragraph summary
- Hairline divider between stories

No card background, no shadow, no metadata strip.

### Breaking strip (conditional)

If active, above the hero:
- `BREAKING` in bold white on `neutral.900`
- Story headline
- Click → story detail

No timestamp ("46 min ago"). The strip reads as "this is breaking now"; the date is implicit.

### Bottom

- "That's today's front page."
- "See yesterday's archive →" → `/archive/[date]`
- "Browse all recent articles →" → `/recent`

### What to delete from current file

- `FALLBACK_CATEGORIES` constant.
- Category/subcategory filter pills.
- Breaking-news banner (replaced by breaking strip).
- Search overlay (moved to `/search`).
- Ad slot rendering every 6 items.
- Load-more pagination.
- Any per-card byline, read time, published-timestamp, corrections count, sourcing-strength row.

### Data flow

Single query reads `front_page_state` → joins `articles` for summaries and eyebrow data. No join on `corrections` or `editor_shifts` (neither is surfaced to readers).

Cached at edge for 30 seconds. Client polls `/api/front-page/version` every 60 seconds for a hash.

### Accessibility

- Masthead, hero, each slot are semantic HTML landmarks.
- Keyboard: Tab moves through slots.
- Reduce motion: no animation.
- Typography in `rem` units.

## Files

- `web/src/app/page.tsx` — main rewrite.
- `web/src/components/FrontPageMasthead.tsx` — wordmark + date.
- `web/src/components/FrontPageHero.tsx` — hero slot.
- `web/src/components/FrontPageSlot.tsx` — supporting slot.
- `web/src/components/BreakingStrip.tsx` — conditional.
- `web/src/components/FrontPageBottom.tsx` — end-of-page links.
- `web/src/lib/api/frontPage.ts` — data fetcher.
- `web/src/app/api/front-page/version/route.ts` — returns version hash.
- `web/src/app/archive/[date]/page.tsx` — read-only render of past front pages.
- `web/src/app/recent/page.tsx` — chronological feed.

Delete components if they exist: `FrontPageByline`, `FrontPageReadTime`, `FrontPageTimestamp`, `SourcingStrengthRow`, `CorrectionsCount`.

## Acceptance criteria

- [ ] Masthead renders wordmark + current date only. No editor name.
- [ ] 8 slots render from `front_page_state`.
- [ ] Hero is typographically dominant.
- [ ] Each slot shows only eyebrow, headline, (deck for hero), and summary. No byline, read time, timestamp, or sourcing row.
- [ ] No category filter pills.
- [ ] No ads on home.
- [ ] No "Load More."
- [ ] Archive link works.
- [ ] `/api/front-page/version` hash changes when `front_page_state` changes.
- [ ] Lighthouse home score ≥ 95.
- [ ] LCP < 1000ms P90.
- [ ] CLS = 0.
- [ ] `FALLBACK_CATEGORIES` removed.

## Dependencies

Ship after `05_EDITOR_SYSTEM.md` (data source), `08_DESIGN_TOKENS.md`.
