# TODO-SEARCH

Unification of `/directory` + `/search` + `/category/[id]` into a single `/search` surface.

Mock source-of-truth: `redesign-preview.html` — `mock-search-desktop` (L2225) + `mock-search-mobile` (L2616).

---

## Locked decisions (2026-05-15)

1. **Sources dropped entirely.** No Source result type, no Source filter, no "Used in N stories" backref. Stories + Articles only.
2. **"Quiet important" dropped** from chip row and Status filter.
3. **"Background" dropped** from Status filter. Status values = Developing + Updated only.
4. **Empty state = curated browse.** Start-here guides + Recently updated timelines as the main feed when no query is typed. Filters work on this view (e.g., click Politics with no query → active Politics stories).
5. **Mobile filters via "Filters" button → bottom sheet** containing Topic + Date + Status. Content type stays as a tab row above the grid. Sheet has Reset (top-left) + live-count Apply (top-right, e.g. "Apply (24 results)"). Swipe-down dismisses without applying. iOS reuses `FindView.swift:195-293` sheet pattern.
6. **iOS stays at 3 tabs** (Today / Browse / Profile). Rebuild Browse contents to be the new unified search surface; no nav restructure.
7. **No boosted "Start here" card** in v1. Flat ranked list.
8. **`/category/<slug>` → 301 redirect to `/search?topic=<slug>`.** Preserves SEO equity. Sitemap updates to emit the new URLs.
9. **Mixed Story + Article feed is free for everyone.** Verity+ continues to gate advanced filters (Topic / Date / Source) as today. `search.unified` permission key becomes a no-op.
10. **Sections menu inline search killed** (`web/src/app/_home/SectionsMenu.tsx` debounced /api/search caller). Sections becomes a pure topic list with a link out to `/search`.
11. **Masthead active state = underlined nav item.** "Browse" gets the underline on `/search`; the "Search" utility pill stays neutral. Consistent across home, category, search.
12. **iOS Sections topic tap = deep-link into Browse tab with Topic filter pre-applied.** `CategoryFeedView` (`HomeSectionsSheet.swift:367-423`) gets deleted.

---

## Surface spec — final shape after locked decisions

### Desktop (≥1100px)
- Masthead unchanged. "Browse" in left nav gets the underline-from-below `.cur` treatment when on `/search`. "Search" utility pill stays neutral.
- Page-head zone: kicker "Browse Verity Post" + H1 "Find a story or source" + sub + search bar + quick-chip row.
- Quick chips: All results · Today · This week · Developing · Updated recently. (Quiet important removed.)
- 3-col grid: 220px left filters / flex results / 300px right rail.
- Left filters (4 groups): Content type (All / Stories / Articles), Topic (Business / Politics / World / Science / Climate / Health), Date (Today / This week / This month / This year / Custom range), Status (Developing / Updated).
- Result feed: flat ranked list. Two row types — Story and Article. Article carries "Part of: <story>" backref.
- Sort dropdown: Most relevant · Recently updated · Newest article · Most sourced.
- Right rail: Start-here guides card + Recently updated timelines card + Sponsored slot (sponsor slot per existing ads track, separate from TODO-ADS.md).
- Empty state: same layout, results column becomes "Stories with active coverage" + "Recently updated timelines" curated lists.

### Tablet (840–1100px)
- Left filter rail hides via existing CSS rule.
- "Filters" button appears at end of quick-chip row → opens bottom sheet (same as mobile pattern).
- Right rail stays at 300px. Results column flex-fills.

### Mobile (<840px)
- Masthead replaced by sticky search bar (no nav, no logo on this surface).
- Quick-chip row + type-tab row (All / Stories / Articles with mono counts).
- "Filters" pill at end of chip row → bottom sheet (Topic + Date + Status), count badge when filters active.
- Result rows: 20px titles, no explicit CTA row, full row tappable.
- Right rail collapsed to one inline "Recently updated" sug-card below results.
- Fixed 5-slot bottom-nav: Home / Discuss / Browse (active) / Timelines / Profile.

### iOS (main app, Browse tab only)
- 3-tab bar unchanged.
- Browse tab rebuilt as native SwiftUI search-first surface. Hits new `/api/search` `results[]` endpoint (not PostgREST direct).
- `.searchable` sticky search bar at navigation stack root.
- Horizontal scrolling chip row + type-tab row beneath.
- Filter sheet reuses `FindView.swift:195-293` pattern.
- Standard result rows = plain `VStack` divided by hairline. No card chrome.
- "Part of: <story>" line is new — doesn't exist on iOS today.
- iPad split-view: `NavigationStack`-only at `.regular` width with `HStack` right column for rail content.

### Kids iOS
- Exempt. No Browse, no search surface. No changes.

---

## Build sequencing (proposed)

Per session-based cleanup pattern. Build-passes-only between sessions; env-flag bridges keep old surfaces live.

**Session A — backend foundation (no UI)**
- Migration: `stories.search_tsv` generated tsvector + GIN index.
- Migration: index on `comments(story_id, created_at) WHERE deleted_at IS NULL AND status='visible'` for "Discussion active" signal.
- No code changes outside migrations.

**Session B — `/api/search` extension**
- Add `results[]` parallel array with discriminated Story / Article rows (keep `articles[]` legacy contract for iOS/SectionsMenu/ArticlePicker).
- Add `facets` object with content_type / topic / date / status count buckets.
- Add `?sort=`, `?type=`, `?topic=`, `?status=`, `?chip=` params with sane defaults.
- Story-result query path: SELECT stories with denormalized aggregates (article_count, latest_article_at, source_count, timeline_event_count, has_recent_comments).
- Backward-compat: existing callers reading `body.articles` keep working.

**Session C — web `/search` rebuild**
- New desktop layout (3-col grid, page-head zone, result rows).
- Tablet + mobile breakpoints with Filters bottom sheet.
- Sort dropdown wired.
- Empty-state curated browse rendered via the new facets + Start-here-guides data.
- Feature-flag the new UI behind env var; old `/directory` still works.

**Session D — inbound rewires + redirects**
- `_home/SectionsMenu.tsx:863` "Browse all" → `/search`.
- Kill inline /api/search caller in SectionsMenu (decision 10); Sections becomes pure topic list with a link to `/search`.
- `sitemap.js:91` category URL generator → `/search?topic=<slug>`.
- `next.config.js:49-62` `/category/:slug` redirect rule → 301 to `/search?topic=:slug`.
- Admin copy updates: `admin/page.tsx:25`, `admin/editors-edge/page.tsx:234`.
- `revalidatePath('/directory')` → `revalidatePath('/search')` in editors-edge admin routes (2 lines).
- Drop env flag.

**Session E — directory + category retirement**
- Delete `web/src/app/directory/**` (5 files).
- Delete `web/src/app/category/[id]/**` (2 files).
- Delete `web/src/components/directory/**` (10 files).
- Delete unused permission keys: `directory.advanced_filters`, `directory.alerts_subcategory` (DB rows + lib constants).
- Keep `/api/directory/editors-edge` + `/api/directory/expert-coverage` alive at current URLs (iOS still calls them until Session F).
- Drop `/api/directory/articles`, `/api/directory/categories`, `/api/directory/trending`.
- ~2,357 LOC deleted.

**Session F — iOS Browse rebuild**
- Native SwiftUI rewrite per the iOS spec above.
- Switch `BrowseState.swift` from PostgREST direct → `/api/search` `results[]` consumption.
- Delete `CategoryFeedView` (decision 12).
- Wire home Sections topic-tap → Browse tab deep-link with Topic pre-applied.
- Magnifier glyph in `HomeView.swift:385-396` → deep-link Browse, not push FindView.
- Decide: collapse FindView entirely into Browse, or keep as a thin wrapper that opens Browse pre-focused.
- Move iOS Browse off `/api/directory/editors-edge` if we want to retire that endpoint; otherwise keep call site.

**Session G — verification**
- End-to-end on web desktop, web tablet, web mobile, iPad split, iOS phone, iOS pad.
- Confirm cross-platform consistency (per `feedback_cross_platform_consistency`).
- Smoke: `/category/<slug>` legacy URLs 301 to right place; Google Search Console refresh.

---

## Files-to-touch summary

**Inbound link / SEO / redirect rewrites (web)**
- `web/src/app/_home/SectionsMenu.tsx` — kill inline search caller, repoint "Browse all" to `/search`, drop CategoryFeedView nav target on iOS-side counterpart
- `web/src/app/sitemap.js:91` — emit `/search?topic=<slug>` instead of `/category/<slug>`
- `web/src/components/JsonLd.tsx:62` — already correct (`/search?q={search_term_string}`)
- `web/next.config.js:49-62` — 301 `/category/:slug` → `/search?topic=:slug`
- `web/src/middleware.js:484,501` — clean references
- `web/src/app/admin/page.tsx:25`, `web/src/app/admin/editors-edge/page.tsx:234` — copy
- `web/src/app/api/admin/editors-edge/route.ts:264`, `[id]/route.ts:88` — revalidatePath rewires
- `web/public/.well-known/apple-app-site-association` — leave excludes in place
- `web/tests/e2e/leaderboard-search.spec.ts` — keeps passing (URL stable)

**iOS rewrites**
- 9 Browse files (`Browse/*.swift`) — full rebuild
- `FindView.swift` — collapse into Browse OR thin wrapper
- `HomeView.swift:385-396` — magnifier deep-links Browse
- `HomeSectionsSheet.swift` — kill inline search, delete CategoryFeedView, topic tap → Browse deep-link
- `BrowseState.swift` — PostgREST → `/api/search` results endpoint
- `VerityPostApp.swift:19` — `nonArticlePrefixes` keep `"directory"` for AASA safety

**Backend**
- New migration: `stories.search_tsv` + GIN.
- New migration: comments(story_id, created_at) partial index.
- New: extend `/api/search/route.js` to return `results[]` + `facets` + new params.
- New: `runSearchUnified.ts` (or extend `runArticleSearch.ts`) with story-result path.

**Permissions**
- Keep `search.view`, `search.basic`, `search.articles.free`, `search.advanced`, `search.advanced.category`, `search.advanced.date_range`, `search.advanced.source` exactly as today.
- `search.unified` → no-op (mixed feed free for everyone).
- `directory.sort_trending` + `directory.expert_depth` → keep names, relocate gating to new search components. Avoids permission_group_permissions reseed.
- Drop `directory.advanced_filters`, `directory.alerts_subcategory` — zero call sites, never shipped.

---

## Open / deferred items

- **iOS Source result tap destination** — N/A (Sources dropped in decision 1).
- **iOS FindView fate** — keep as thin wrapper pre-focusing Browse, OR delete entirely. Defer to Session F.
- **Right-rail Sponsored slot** — separate from this track; lives under TODO-ADS.md scope.
- **`/api/directory/editors-edge` endpoint URL** — kept alive for iOS in Session E; rename in Session F or later if desired.
- **`/api/directory/trending`** — currently zero callers; built for redesign. Either fold into `/api/search` sort=recent or drop in Session E.
