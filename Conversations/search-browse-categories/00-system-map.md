# 00 — System Map

**Date:** 2026-04-29
**Status:** Foundation reference. Read on every session before slice work.
**Source:** Code-only investigation across web, iOS adult, iOS kids, Supabase migrations. No design decisions in this document — only what exists today.

---

## What "discovery" means in this product

Discovery is how a reader finds a story they weren't already looking for, and how they navigate to a category or topic they care about. The product has four surfaces: the **home feed** (default entry point), the **browse page** (category grid), **category detail pages** (what you reach from browse — exists on iOS, missing on web), and **search** (explicit intent, free vs. paid). These share data but are built independently with inconsistent patterns and several dead features that were started and abandoned.

---

## Surface overview

```
         ┌──────────────────────────────────────────────────────────┐
         │  HOME FEED                                               │
         │  Web: /  →  page.tsx + _homeShared.ts                   │
         │  iOS: HomeView.swift                                     │
         │  Hero pick: hero_pick_for_date (editorial, per-day)      │
         │  Feed: 20 articles by published_at DESC                  │
         │  Breaking strip: is_breaking=true AND published today    │
         │  Read-state: reading_log dims read articles (web only)   │
         │  New badge: last-visit cookie (web only)                 │
         └─────────────────────┬────────────────────────────────────┘
                               │ user clicks "Browse"
                               ▼
         ┌──────────────────────────────────────────────────────────┐
         │  BROWSE PAGE                                             │
         │  Web: /browse  →  browse/page.tsx                       │
         │  iOS: BrowseLanding in HomeView.swift                    │
         │  Category grid with article counts + 2–3 previews       │
         │  Featured strip at top (is_featured DESC)               │
         │  Client-side text filter by category name               │
         │  Dead filter pills: Most Recent / Most Verified /        │
         │    Trending (T111 — commented out, never wired)          │
         │  Pagination: none (500-article hard cap)                 │
         └─────────────────────┬────────────────────────────────────┘
                               │ user clicks a category
                               ▼
         ┌──────────────────────────────────────────────────────────┐
         │  CATEGORY DETAIL                                         │
         │  Web: /category/<slug>  →  category/[id]/page.js        │
         │    (handles UUID + slug lookup; 3 bugs: articles.slug    │
         │    href, no visibility filter, dead sidebar — Wave 1b)   │
         │  iOS: CategoryDetailView in HomeView.swift               │
         │  50-article feed filtered by category_id, published      │
         │  No pagination on iOS either (50-article limit)         │
         └──────────────────────────────────────────────────────────┘

         ┌──────────────────────────────────────────────────────────┐
         │  SEARCH                                                  │
         │  Web: /search  →  search/page.tsx + api/search/route.js  │
         │  iOS: FindView (accessed via home magnifier)             │
         │  Free: title ILIKE only                                  │
         │  Paid: full-text on search_tsv (title+excerpt+body)      │
         │  Advanced filters (paid): category, date, source        │
         │  Limit 50, no pagination                                 │
         └──────────────────────────────────────────────────────────┘
```

---

## Slice 1 — HOME FEED

**Entry points.** Web `web/src/app/page.tsx:106` (server component). iOS `VerityPost/VerityPost/HomeView.swift` (loaded on tab appear).

**What's shown.** One hero article + up to 7 supporting. `page.tsx:42-43` hard-caps at 8 total visible on load. Articles fetched via service client (20 articles, `published_at DESC`): `page.tsx:186-191`.

**Hero selection.** Two-step: look for an article with `hero_pick_for_date = today` in editorial timezone (America/New_York, `page.tsx:72-88`). If none found, fall back to `published_at DESC` (most recent). Only one article can be hero per calendar day. `hero_pick_for_date` is a `text` column (YYYY-MM-DD format). `hero_pick_set_at` and `hero_pick_set_by` track who set it and when. No automatic selection — editorial sets it manually. When it was set is not investigated; the admin mechanism is not fully surfaced.

**Breaking strip.** Separate query: `is_breaking=true` AND published same day (editorial TZ): `page.tsx:192-199`. Renders as a dismissable strip at the top of the feed. Gated on client-side by `home.breaking_banner.view` permission (paid feature on the reader side, per comment). Sending breaking news is admin-only via `/api/admin/broadcasts/alert`.

**Read-state dimming (web only).** Signed-in users: queries `reading_log` for their last 200 log entries within 30 days (`page.tsx:161-215`). Articles with a matching row are visually dimmed. Anon: no dimming. iOS: not found — no equivalent read-state tracking in HomeView.

**"New" badge (web only).** Cookie stores last visit timestamp (`_HomeVisitTimestamp.tsx`). Articles published after last visit get a "New" badge: `page.tsx:251-257`. iOS: not found.

**iOS home.** `HomeView.swift:457-497`. Same 20-article query, same hero-pick logic. Handles breaking strip at `HomeView.swift:138-143`. No read-state dimming. No "new" badge. Refreshes on `onAppear` and on Supabase realtime `articles` channel change.

**Known gaps and fragilities.**
- No personalization. `user_preferred_categories` table exists but is never read or written anywhere in the home feed path.
- Editorial hero selection has no fallback UI feedback — if no article is hero-picked today, the most recent article becomes hero silently.
- `is_featured` is not used in the home feed. It is used in the browse featured strip. The distinction between `is_featured` and `hero_pick_for_date` is not clearly documented — two separate editorial signals with different surfaces.
- Web and iOS diverge in read-state, new badge, and potentially in how the editorial TZ affects hero selection (iOS doesn't show the TZ calculation explicitly).
- No trending or algorithmic ranking — pure recency after the hero pick.

**Open questions for Slice 01.**
- How does an admin set `hero_pick_for_date` today? Is there a UI, or is it a direct DB write?
- Should web and iOS be more consistent (read-state, new badge)?
- Should the home feed ever use `user_preferred_categories` or a reading-history signal?
- Is one hero per day the right model, or should there be a hero per session/per-user?

---

## Slice 2 — BROWSE

**Entry points.** Web `web/src/app/browse/page.tsx` (client component — full page is CSR). iOS `HomeView.swift` BrowseLanding section.

**Web browse.** Categories query on mount: `from('categories').select('id, name, slug').not('slug', 'like', 'kids-%').order('name')`: `page.tsx:118-121`. Articles bulk query: 500 most-recent published articles with `id, title, stories(slug), category_id, published_at, is_featured`: `page.tsx:124-128`. Featured strip query (separate): 3 articles, `is_featured DESC, published_at DESC`: `page.tsx:130-136`. All three fire in parallel on mount.

**Client-side enrichment.** The 500-article bulk fetch is sliced client-side per category to produce `count` (total in category) and `trending` (3 most-recent titles). This means trending = recency, not engagement: `page.tsx:165-182`.

**Featured strip.** Top of page, shows 3 `is_featured=true` articles (or recent if none flagged). `hasEditorPick` boolean is computed but the "Featured by editors" label is never rendered (S7-A107 comment): `page.tsx:306-315`. The flag exists; the label was planned and dropped.

**Client-side search.** Text input filters the category list by name (case-insensitive, `page.tsx:93, 220`). Not article search — this is a category-name filter within the browse view.

**Dead filter pills.** T111: Most Recent / Most Verified / Trending pills were built in the state layer (`page.tsx:49-53`) then commented out. The state variables remain; the render was removed. No pill is currently active. If re-activated, they have no data backing — `view_count` is never in the browse query.

**iOS browse.** `HomeView.swift:767-809`. Per-category parallel fan-out: one 7-day count query + one 2-article preview query per category. More expensive query pattern than web (N+1 per category) but gives fresher data. Category list from `HomeView.swift:480-485`: active categories, `sort_order ASC`.

**Known gaps and fragilities.**
- Web has a 500-article hard limit with no pagination. A category with 600 articles will silently show fewer than all of them in the count.
- iOS uses N+1 parallel queries; web uses one bulk fetch sliced client-side. Different data freshness, different performance characteristics.
- Filter pills were abandoned mid-build. The state machinery exists; the UI doesn't. Re-activating requires backing the pills with real data (trending = `view_count`? Most Recent = `published_at`? Most Verified = what?).
- No linking from web browse into a category page (because the page doesn't exist). The category card href at `page.tsx:580` resolves to `/category/<slug>` which 404s.
- Kids categories excluded from web browse (`not('slug', 'like', 'kids-%')`). iOS presumably handles this differently — not confirmed.

**Open questions for Slice 02.**
- What does clicking a category on web do? Build the category page first (Slice 03) or add a fallback meanwhile?
- Are the dead filter pills worth resurrecting? Trending requires a signal — is `view_count` sufficient, or do we need something else?
- Should web browse switch to a paginated or infinite-scroll model?
- Is "featured" distinct from "hero" in any meaningful way to readers, or is it editorial duplication?

---

## Slice 3 — CATEGORIES

**Schema.** `categories` table (from `database.ts`):
- `id` (UUID), `name`, `slug` (required for category pages), `description`
- `parent_id` (UUID | null) — two-level hierarchy, NULL for top-level
- `color_hex`, `icon_name`, `icon_url` — display fields, partially used
- `is_active`, `is_kids_safe`, `is_premium`, `sort_order`
- `article_count` (computed), `category_density` (JSON, never read)
- `metadata` (JSON)

**Hierarchy.** `parent_id` enables one level of nesting (parent → child). Nothing in the product surfaces subcategories. Search's category filter fetches top-level only (`.is('parent_id', null)`): `search/page.tsx:81`. Browse doesn't render subcategories. iOS doesn't show them. The hierarchy exists entirely in the schema with zero UI exposure.

**Category assignment to articles.** `articles.category_id` FK. Single category per article. After the stories-as-containers migration, articles have `story_id` but stories do not have `category_id` — category is at the article level, not the story level. For a multi-article story (e.g., "Trump Tariffs" with adult + kids articles), each article might have the same category, or different ones if the topics diverge.

**Admin CRUD.** `POST /api/admin/categories` at `web/src/app/api/admin/categories/route.ts:49-100`. Create confirmed. Update and delete not investigated.

**Web category pages.** `web/src/app/browse/page.tsx:580` renders `<Link href={/category/${cat.slug}}>`. The route resolves to `web/src/app/category/[id]/page.js` — a client component that tries UUID lookup first, then slug fallback. Browse links work. The page shows: category header (name, description, first-letter icon), sort controls (Latest/Trending), article cards with bookmarking, load more (+3/click). Three bugs in current code: article links use `articles.slug` not `stories.slug` (broken post-migration), no visibility filter on articles query, dead "Top Contributors" sidebar. iOS has `CategoryDetailView` (`HomeView.swift:823-923`) which is a full functioning category feed: `category_id=X, status='published', visibility='public', limit(50)`.

**iOS category flow.** Home → Browse tab → category card → `CategoryDetailView`. Full working flow. Category articles ordered by `published_at DESC`. No subcategory display. No filtering by date/tags.

**`is_kids_safe` on categories.** Column exists; browse excludes kids-slug categories from the adult browse. Kids app presumably filters to `is_kids_safe=true` categories — not confirmed.

**`is_premium` on categories.** Column exists; nothing in the code gates on it. Dead field.

**`category_density`.** JSON column. Never read anywhere. Purpose unknown — possibly a planned feature for showing category-level engagement statistics.

**Known gaps and fragilities.**
- Web category pages don't exist. Every category link on web 404s. This is the single biggest user-visible gap in the whole browse surface.
- Subcategory hierarchy is orphaned — built in schema, surfaced nowhere.
- `is_premium`, `category_density` are dead schema fields with no consumers.
- After stories migration: category is still on articles, not stories. For multi-article stories, the category relationship is ambiguous.

**Open questions for Slice 03.**
- Build web `/category/[slug]` page — obviously yes, but what does it contain? Just an article list? Subcategories? A description header?
- Should subcategories be surfaced anywhere — in browse, in the category page header, in search filters?
- Does the stories migration change where `category_id` should live?
- Is `is_premium` ever going to gate category access, or should it be dropped?

---

## Slice 4 — SEARCH

**Entry points.** Web `web/src/app/search/page.tsx` + API `web/src/app/api/search/route.js`. iOS via FindView (magnifier icon in HomeView top bar: `HomeView.swift:232-244`). FindView internals not surfaced in investigation.

**Two-tier model.**
- **Free / basic:** `articles.title ILIKE '%query%'`: `search/route.js:123`. No filters beyond query string and kids flag.
- **Paid / advanced:** `articles.search_tsv` via PostgREST `textSearch()` with `type: 'websearch', config: 'english'`: `route.js:76`. The `search_tsv` column is a `tsvector` generated from `title + ' ' + excerpt + ' ' + body`.

**Permission gating.** Page checks `search.view` or `search.basic` or `search.articles.free` to render at all. `search.advanced` gates the filter panel. Individual filters are gated by their own keys: `search.advanced.category`, `search.advanced.date`, `search.advanced.source`. Each filter is independently gated — a user could theoretically have date filtering but not source filtering.

**Advanced filters (paid only).**
- Category: `category_id` equality: `route.js:79-85`.
- Subcategory: `subcategory_id` equality: `route.js:86-92`. Note: `subcategory_id` is not in the categories schema as inspected — this may be an alias for `parent_id` or a different field. Needs verification.
- Date range: `published_at gte/lte`: `route.js:93-100`.
- Source publisher: join through `sources` table, `publisher ILIKE '%q%'`: `route.js:101-121`. This is a cross-table filter that isn't standard PostgREST — implementation details warrant investigation in the slice session.

**`ignored_filters` tracking.** H6: filters that were requested but the user didn't have permission for are returned in `response.ignored_filters` as an array: `route.js:65-131`. This is an analytics/observability feature, not user-visible.

**Kids search.** If `?kids=1` or `?kid_profile_id=...` is present: `is_kids_safe=true` filter applied: `route.js:58-63`. Presumably called from the kids app. iOS kids app search was not found.

**Results shape.** `id, title, stories(slug), excerpt, published_at, category_id, is_kids_safe, categories!fk_articles_category_id(name)`: `route.js:48-50`. Ordered `published_at DESC`. Limit 50.

**No pagination.** Hard 50-result cap. No cursor or page param. A query matching 500 articles returns the 50 most recent.

**iOS FindView.** Accessible via magnifier icon from HomeView. Internals not read — the slice session should investigate this in detail.

**Known gaps and fragilities.**
- Title-ILIKE for free users is weak — any typo, synonym, or capitalization difference breaks results. Full-text is entirely behind the paywall.
- Hard 50-result cap with no pagination means long-tail queries silently drop results.
- `subcategory_id` filter references a field not obviously in the schema — needs verification.
- Source publisher filter does a join through `sources` — this means the filter only works for articles that have source records. AI-generated articles with no sourced attribution would be invisible to this filter.
- iOS FindView investigation deferred — could be very different from web search.
- Kids search: not found. Kids can navigate browse and category pages but cannot search in the kids app.

**Open questions for Slice 04.**
- Is title-ILIKE-for-free a long-term monetization gate or a placeholder to relax later?
- Should search results be ordered by relevance for paid users (full-text rank) rather than `published_at DESC`?
- Is 50 results enough, or does it need pagination?
- What does iOS FindView actually do — is it calling the same API or a different endpoint?
- Should kids get any search capability?

---

## Cross-cutting infrastructure relevant to discovery

### `articles.view_count`
Incremented by `increment_view_count` RPC on every story page load (wired in Slice 03 D4). The column is never read in browse, search, or home. It exists as a populated signal with no consumer. If trending is ever built, this is the natural input.

### `articles.hero_pick_for_date`
Text column (YYYY-MM-DD). Set by admin to mark today's hero story. No cron resets it — yesterday's hero pick stays set on that article row forever, but the home feed ignores it (only matches today's date). If the same article is re-run across days (unlikely but possible), no collision logic was found.

### `articles.is_featured`
Boolean. Set by admin to pin articles to the browse featured strip. No UI for setting it was found (direct DB or admin stories page). Browse uses it for the top-3 strip. Home feed does not use it.

### `articles.is_breaking`
Boolean. Set via `/api/admin/broadcasts/alert`. Used in both home feed breaking strip and iOS breaking banner. Not relevant to browse/search.

### `articles.tags`
String array. Populated by the generation pipeline (tags extracted from article content). Never queried in browse, search, or home. No tag filter, no tag pages, no tag cloud. Entirely unused from a reader perspective.

### `user_preferred_categories`
Table exists (`database.ts`). Presumably stores per-user category preferences. Never written (no API endpoint found that inserts into it). Never read (no home feed, browse, or search query joins it). Dead schema.

### `categories.article_count`
Computed field on the categories table. Not confirmed whether it's a trigger-maintained counter or a computed column. Browse doesn't use it — it derives counts from the 500-article bulk fetch instead. Could be stale relative to actual published article counts.

### `reading_log`
Used by the home feed for read-state dimming (web only). Could theoretically be used for "you've read all articles in this category" state in category pages, or for personalizing the home feed order. Not used for anything beyond dimming today.

### Editorial timezone
`America/New_York` hardcoded in `page.tsx:72` and `_homeShared.ts:29`. Used for hero-pick date matching and breaking-news same-day detection. iOS presumably uses device timezone — not confirmed. A divergence here would cause a hero mismatch between web and iOS for users in non-ET timezones.

---

## Cross-surface seams

| From → To | Field / check | Notes |
|---|---|---|
| Home → Browse | User navigates | No state passed — browse re-fetches independently |
| Browse → Category page | `categories.slug` → `/category/<slug>` | Web destination doesn't exist. iOS works. |
| Category page → Article | `stories.slug` via `articles.story_id` | After Slice 05 migration: slug on stories, not articles |
| Search → Article | `stories.slug` via `stories(slug)` join | Already updated for Slice 05 |
| Article → Home | `hero_pick_for_date` | Editorial, manual. No automation. |
| Article → Browse featured | `is_featured` | Admin-set, no UI found |
| Article → Search index | `search_tsv` tsvector | Generated column — updates automatically on article write |

---

## Known dead features (ghost schema / ghost UI)

| Feature | Evidence | Status |
|---|---|---|
| Filter pills (browse) | T111 comment, state vars present, JSX removed | Started and abandoned |
| Tags surface | `articles.tags` populated, never queried | Schema with no consumer |
| view_count ranking | Column populated by Slice 03 D4, never queried | Signal with no surface |
| user_preferred_categories | Table exists, never written or read | Entirely dead |
| Subcategory hierarchy | `categories.parent_id`, never surfaced | Schema only |
| `categories.category_density` | Column, never read | Unknown purpose |
| `categories.is_premium` | Column, never read or gated | Dead field |
| Featured label in browse | `hasEditorPick` computed, label not rendered | Half-built (S7-A107) |
| Web category pages | Page exists at `category/[id]/page.js` — article link bug, no visibility filter, dead sidebar | Bugs, not missing |
| Kids search | No search UI in kids app | Gap |
| Up Next on web | iOS has full "Up Next" at 95% scroll | Platform divergence |

---

This map will get amended (not rewritten) as slice sessions surface new findings. Sessions write their slice doc to `slices/<NN>-<name>.md`; only the cross-cutting sections update here as new ones emerge.
