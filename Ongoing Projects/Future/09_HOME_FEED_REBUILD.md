# 09 — Home Feed Rebuild

**Owner:** Drudge (primary — his moat was a chosen, dated front page), Thompson (editorial weighting), Vinh (typography and rhythm), Wroblewski (mobile reading posture).
**Depends on:** `00_CHARTER.md` (commitment 2), `05_EDITOR_SYSTEM.md`, `08_DESIGN_TOKENS.md`, `10_SUMMARY_FORMAT.md`.
**Affects:** `web/src/app/page.tsx`, adult iOS `HomeView.swift`, new `front_page_state` data source, category and subcategory read flow.

> **Bridge note (2026-04-23 staged ship):** the Phase-1 implementation reads
> the hero pick from `articles.hero_pick_for_date` (DATE column added in
> `schema/144_articles_hero_pick.sql`), not from `front_page_state`. Owner
> stripped: editor names, sourcing-strength row, corrections badge,
> totals — those sections of this spec are deferred. The visual
> architecture (masthead, hero, 7 supporting, page ends), the breaking
> strip, and the date prominence ARE shipped. **Do not build new features
> against `hero_pick_for_date` directly** — when the editor system
> (`05_EDITOR_SYSTEM.md`) ships, migrate the hero query to
> `front_page_state` and drop the three columns. Audit trail
> (`hero_pick_set_by`, `hero_pick_set_at`) is preserved so the migration
> can backfill cleanly.

---

## Current state (verified 2026-04-21)

Web home (`web/src/app/page.tsx`, component `HomePage`):

- Pulls articles from `articles` joined with `categories` and `sources`.
- Renders a flat feed of cards with category/subcategory filter pills.
- Search overlay (hidden behind a button).
- Anonymous users see a breaking news banner gated by permission.
- Hardcoded `FALLBACK_CATEGORIES` constant still present (CLAUDE.md flags this as T-017, DB migration to `categories` already supports replacing this).

Adult iOS home (`VerityPost/VerityPost/HomeView.swift`):

- Streak header at top.
- Category/subcategory pill filter (subcategories only shown to logged-in users).
- Story feed with pagination.
- Recap card inline.
- Ad slots every 6 items for free/verity tiers (suppressed for pro+).
- Search overlay.

Both surfaces treat every card as equally weighted. There's no lead story, no rhythm, no editorial hand visible to the reader.

## What the Charter requires

Commitment 2: "The front page is chosen by a human and dated. No algorithmic feed. No infinite scroll. No engagement-optimized ranking."

That means the home is no longer `SELECT * FROM articles ORDER BY published_at DESC`. It's:

- **8 slots** chosen and ranked by the on-shift editor, persisted in the `front_page_state` table (see `05_EDITOR_SYSTEM.md` and `db/04_editorial_charter_table.md`).
- **1 hero, 7 supporting.** The hero is typographically dominant. The rest have consistent but smaller treatment.
- **Dated.** The current date is visible at the top of the page.
- **Bottom.** The page ends. A final block: "That's today's front page. See [yesterday's archive] or [all recent articles]."
- **Named editor on shift.** "Editor on shift: [Name]" at the top, next to the date.
- **Archive-accessible.** Every previous day's front page is browsable via `/archive/[date]`.

## The visual architecture

### Masthead (top of page)

One persistent strip at the top. Three elements:

- **Wordmark** — "Verity" in the body serif or a dedicated masthead type. Bigger than the rest.
- **Date** — today's date, formatted consistently ("Tuesday, April 21, 2026").
- **Editor on shift** — "Curated today by Elena Martinez" (clickable → masthead page).

This is the thing that says "this is a publication." Not a logo. A masthead.

### Hero (slot 0)

One story, given full treatment:

- **Eyebrow** — category · subcategory in 11pt semibold tracking
- **Headline** — 28pt bold, tight line-height, short as the headline permits
- **Deck** — 20pt regular, 2-3 lines max, reads like the opening of the summary
- **Meta line** — reporter name · read time · time published
- **Corrections indicator** — "Corrections: 0" or "Corrections: 1" link if applicable

No image unless we have a genuinely good one. Most hero stories will be pure typography. This is the Verity signature — restraint over decoration. Stratechery, The Browser, Harper's do this well. We do it too.

### Supporting stories (slots 1–7)

Consistent treatment. Smaller than hero, equal to each other:

- Eyebrow (category)
- Headline at 20pt bold
- One-line deck at 15pt
- Meta line (reporter · read time)
- **Sourcing-strength row:** "4 named · 2 documents · 0 anonymous" rendered in `typography.meta` under meta line
- Corrections flag (if any): "Corrections: 1" inline with meta
- Thin hairline divider (`border.subtle`) between stories

No card backgrounds. No shadows. No chrome. The stories sit on the page. Whitespace does the containment.

The sourcing-strength row on every feed card is the load-bearing trust signal — per `10_SUMMARY_FORMAT.md`, it is the un-copyable moat.

### Breaking strip (when active)

If there's an active breaking story, a single narrow strip appears above the hero:

- "BREAKING" in 11pt bold white on `neutral.900`
- Story headline
- Time since breaking
- Click → story detail

Only the Senior Editor can place a breaking story. Rate-limited. Not a habit.

### The bottom

After the 7 supporting stories, a clear "end of front page" block:

- Small type: "That's today's front page."
- Link: "See yesterday's archive →"
- Link: "Browse all recent articles →"

The archive view (`/archive/[date]`) is a read-only rendering of the front page that was live on that date. Every dated front page is preserved.

"All recent articles" is the chronological-order full feed — for readers who want exhaustive coverage. Not front-page. Not hero-treated. Browsable, not editorialized.

### What's NOT on the home page

- No category nav pills. Categories live on a dedicated `/sections` page.
- No search bar on home. Search is `/search` (keyboard shortcut on desktop: `/`).
- No algorithmic "for you" section.
- No social-sharing counts, "most read" ranking, or engagement metrics.
- No ads on the front page. Ads appear inside articles (for free/verity tier). See `views/web_welcome_marketing.md` for the ad strategy.
- No newsletter signup modal. Newsletter signup is on the footer, or on a dedicated page.
- No infinite scroll. The page ends.

## Adult iOS variant

The same architecture, adapted for mobile scale:

- Masthead: wordmark, date, editor name on a single line at top of the HomeView.
- Hero: full-width, 24pt headline (Dynamic Type scales up for accessibility).
- Supporting: list with hairline separators, 17pt headlines.
- Breaking strip: same pattern, narrow.
- Bottom: "That's today's front page" with archive link and recent articles link.

No pill filters. No search on home. Same as web.

iOS has one extra affordance: the streak card at the top (current behavior) moves to `/profile` where it belongs. The home page is journalism, not gamification.

## Rendering architecture

### Data flow

The home page reads from:

- `front_page_state` — 8 rows, sorted by `slot_index`. Each row has `article_id`, `editor_user_id`, `placed_at`.
- `articles` — joined for the actual content.
- `corrections` — counted per article_id, displayed as "Corrections: N".
- `editor_shifts` — joined to find the on-shift editor at the current time.

A single query reads all of this. No N+1 queries. Cached for ~30 seconds (trade-off: freshness vs load). Cache invalidated when an editor changes the front page (via SSR webhook or a small pub/sub).

### Performance

- Home page total payload: <100KB gzipped.
- First contentful paint: <600ms on 4G.
- Interactive: <900ms.
- No CLS (cumulative layout shift): all typography pre-sized, no late-loading images.
- Keyboard-accessible: `j`/`k` move between stories, `Enter` opens, `Esc` goes back (arrows are too small a hotkey surface to train users on).

### Caching

Cache the rendered HTML at the CDN edge for ~30 seconds. Bypass cache for authenticated users if they have any personalized elements. The current implementation has auth-sensitive logic (breaking banner permissions, plan-based ads) that requires per-user rendering; consider whether to split into a static framework shell + client-hydrated auth elements for better cacheability.

### Refresh

Client polls `/api/front-page/version` every 60 seconds. Gets back a hash. If hash changed, refresh. This is cheap: the endpoint returns a single integer.

No WebSocket for this. The editorial cadence doesn't warrant real-time.

## Editorial integration

This home feed *only works* if `05_EDITOR_SYSTEM.md` is shipped. Specifically:

- `front_page_state` table must exist and be populated by an editor before the new home page can render.
- `/admin/editorial/curate` must be functional for an editor to set slots.
- The editor shift concept must be implemented so the "on-shift editor" display is accurate.

Ship order: editor system → home feed rebuild. Never the reverse.

## What to delete

### Web

- `FALLBACK_CATEGORIES` constant in `web/src/app/page.tsx` — replaced by DB-driven categories (the pill filter is moved off the home page anyway).
- Category/subcategory filter logic in `HomePage` — moved to `/sections/page.tsx`.
- The ad slot every 6 items — ads move to inside articles only.
- The inline search — moved to `/search`.

### Adult iOS

- Streak header on `HomeView` — moved to `ProfileView`.
- Category/subcategory pill filter — removed.
- Ad slots every 6 items — removed.
- Inline search — still accessible via the tab bar or a top-nav button, but not on the home surface itself.

## What stays the same

- The underlying `articles` table and its schema.
- The story detail page (`/story/[slug]` and `StoryDetailView.swift`) — separate work (see `views/web_story_detail.md` and `views/ios_adult_story.md`).
- The categories table and the category page (`/category/[slug]` if it exists).
- The recap (`/recap` page on web, `RecapView` on iOS) — lives on its own route, not the home.

## Acceptance criteria

- [ ] `/` (web) renders exactly 8 slots from `front_page_state`.
- [ ] Masthead shows wordmark, current date, and on-shift editor name with bio link.
- [ ] Hero slot is visually dominant (28pt headline, larger deck, more whitespace).
- [ ] Supporting slots render identically to each other.
- [ ] Each article shows `Corrections: N` under meta line.
- [ ] Page ends with archive link and recent-articles link. No infinite scroll.
- [ ] `/archive/[date]` serves a read-only rendering of that date's front page.
- [ ] HomeView (iOS) mirrors the same architecture.
- [ ] FALLBACK_CATEGORIES removed from `web/src/app/page.tsx`.
- [ ] Category pill filter removed from home; moved to `/sections` (new route).
- [ ] Streak card removed from iOS HomeView; present on ProfileView.
- [ ] Performance budgets met (see `15_PERFORMANCE_BUDGET.md`).

## Risk register

- **Editor can't fill 8 slots consistently.** Mitigation: fallback to "6 slots filled + 2 slot ghosts" with clear copy ("Editor on shift hasn't filled all slots today"). Better than showing stale or irrelevant filler.
- **Breaking strip becomes a habit.** Mitigation: Senior Editor sign-off required; weekly review of breaking usage. If >3 breakings in a week, team retrospective.
- **Readers miss the category filter being on home.** Mitigation: /sections is one tap away. Most readers will not notice.
- **Archive view gets big fast.** Mitigation: archive is one-per-day, max 365 rows/year. Trivial at any realistic scale.

## What this does NOT include

- The category / subcategory browse experience — separate doc.
- Editor-facing tooling (that's in `05_EDITOR_SYSTEM.md`).
- Search — separate (see `views/web_search.md`).
- Recap — separate route, untouched.
- Mobile web (responsive). Use the iOS architecture as the mobile-web target — same hierarchy, responsive typography.

## Sequencing

Ship after: `05_EDITOR_SYSTEM.md` (the data source must exist).
Ship before: any home-page marketing. The home is the product pitch; need the real thing to pitch.
Pairs with: `10_SUMMARY_FORMAT.md` (summaries are rendered on this surface; the format is the reason the page works without images).
