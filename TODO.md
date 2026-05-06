# TODO

---

## URL restructure — /{category}/{slug}

- 44: Change article URLs from `/{slug}` to `/{category-slug}/{story-slug}` (e.g. `/politics/us-tariffs-2026`). Complexity 4/5 — do as a dedicated session.

  **What's already in place (don't rebuild):**
  - `categories.slug` is non-null in DB, already fetched by `[slug]/page.tsx` on every load
  - Story slug is globally unique — category segment is SEO-only; server resolves by slug alone
  - `/story/{slug}` redirect already exists (`web/src/app/story/[slug]/page.tsx`) — same pattern needed for old `/{slug}` URLs

  **Implementation sequence:**
  1. **NavWrapper blocker first** — `NavWrapper.tsx` detects article pages via `pathname.startsWith('/story')` to suppress bottom nav/footer. Must replace with a layout-level signal (e.g. `<html data-page="article">` in the article layout, or maintain a known list of non-article top-level segments) before any URL changes ship.
  2. Create new route `web/src/app/[category]/[slug]/page.tsx` — copy of current `[slug]/page.tsx` with `params: { category: string; slug: string }`, resolves by `slug` only (category segment validated but not used for lookup).
  3. Keep `web/src/app/[slug]/page.tsx` as redirect-only: resolves slug → joins category → 301s to `/{category}/{slug}`.
  4. Update all 13 link-construction sites (each needs category slug alongside story slug — requires upstream query changes):
     - `_HomeBreakingStrip.tsx:91`, `_HomeSectionsMenu.tsx:528`, `page.tsx:609+836`, `signup/_FeaturedArticle.tsx:236`, `admin/newsroom/_components/ArticlesTable.tsx:460`, `search/page.tsx:414`, `bookmarks/page.tsx:617`, `profile/_sections/BookmarksSection.tsx:129`, `profile/_sections/ActivitySection.tsx:278`, `following/page.tsx:179`, `NextStoryFooter.tsx:36`, `article/UpNextSheet.tsx:139`, internal `redirect()` calls in `[slug]/page.tsx:138+254`
  5. Update `web/src/app/sitemap.js` — extend article query to join `categories(slug)`, update URL construction.
  6. Update `generateMetadata` in new route file — `params` type changes.
  7. Clean up `web/src/app/story/[slug]/layout.js` — currently emits its own OG metadata with canonical pointing at `/story/{slug}` instead of deferring to the destination. Fix canonical to point at `/{category}/{slug}`.

  **iOS:** No changes needed if `/story/{slug}` redirect stays alive. iOS share URL is `veritypost.com/story/{slug}` which redirects through. No AASA update, no App Store review.

  **API:** `web/src/app/api/articles/by-slug/[slug]/route.ts` takes slug as URL param — keep as-is (internal API, not public-facing).

---

## Needs your decision before anything can move

**Article reader**
- 3: Move Sources block out of `timelineSlot` and into the main article body, after `ArticleActions`. Redesign the display: show publisher favicon/logo instead of text title. Interaction: clicking a logo expands/reveals the raw source headline (`s.title`); clicking that headline opens the source URL in a new tab (`target="_blank" rel="noopener noreferrer"`). Do not navigate inside the app — user must land outside so they can return cleanly.
  - Move: `web/src/app/[slug]/page.tsx:355` — remove `<SourcesSection>` from `timelineSlot`, add it after `<ArticleActions>` (line 347)
  - Favicon: fetch via `https://www.google.com/s2/favicons?domain={hostname}&sz=32` using `hostFromUrl(s.url)` already in `SourcesSection.tsx:114`
  - Expand/collapse: each source row is a button showing the logo; click toggles a visible raw headline below it; click the headline → new tab
  - Tease state (no subscription) and anon state remain as-is — just re-skin the layout
  - Note: "Unknown" display bug (TODO 26) is a data issue — backfill migration (TODO 19) must run first; code fallback logic is already correct
- 4: "Back to home" button is buried at the bottom, undersized. Decision: keep it, kill it, or relocate it (e.g. breadcrumb at top of article)?

**iOS**
- 5: RecapListView hub exists but nothing navigates to it. Decision: wire it up (HomeView "See all recaps" entry) or mark as launch-hide?
- 6: Profile Followers/Following count tiles are display-only, tapping does nothing. Decision: make them tappable (drill into list view) or keep display-only?

**Security / RBAC — fix these before granting owner-mode to any second user**
- 7: Any admin with scope_override permission can self-grant admin.owner_mode through the permissions UI. Decision: hard-deny that key on grant (a), introduce a separate assign permission (b), or restrict the whole permissions surface to owner-mode holders only (c)?
- 8: Client-side permissions.js short-circuit bypasses kid-protective UI gates when owner is in a kid session. Decision: check for active_kid context inside the short-circuit (a), or invalidate the cache on kid-session enter/exit (b)?
- 9: Owner-mode bypass writes have no audit-log marker. Decision: which table to write to, and which writes to cover (all, or only high-blast-radius ones)?
- 10: BillingCard owner-mode branch hides the cancel button even when owner has a real Stripe subscription. Decision: show a minimal "manage in Stripe portal" card when a real subscription exists?

**Data cleanup**
- 11: Two ad placement rows (category_top, category_in_feed_1) are active but unreachable — the category page was folded into home. Decision: soft-deactivate (is_active=false) or hard-delete?

---

## Ready to fix — no decision needed, just needs doing

- 12: Migration `_210000_grant_feed_clusters_browse_access.sql` is not idempotent — CREATE POLICY lines need DROP IF EXISTS guards. **Note:** file not found in repo — migrations appear to be managed directly in Supabase Studio. Owner to locate or skip.

---

## Needs runtime diagnosis — can't move from code alone

- 14: Web logs user out overnight — symptom confirmed, root cause unresolved. Needs browser-side cookie capture (name, Max-Age, Expires) immediately after sign-in and again after 2+ hours

---

## Pending your prod smoke on veritypost.com

These are shipped and on Vercel but you haven't confirmed them on production yet:

- 15: /admin/feeds rebuild
- 16: Discovery scraper Phase A
- 17: Discovery scraper Phase B — also needs NEWSAPI_KEY / NEWSDATA_KEY / MEDIASTACK_KEY / GNEWS_KEY set in Vercel env vars
- 18: Discovery scraper Phase C

---

## Profile / Cleanup (owner to explain)

- 29: Appearance section is a standalone nav rail item containing only a single Light/System/Dark toggle (`AppearanceSection.tsx`). Decision: collapse it into another Settings section, or keep it standalone?
- 31: Categories section exists and is wired in (`CategoriesSection.tsx`, profile rail → Library group). Has parent/subcategory pills + scope card. Needs cleanup — details TBD from owner.
- 32: Milestones section exists and is wired in (`MilestonesSection.tsx`, profile rail → Library group). Shows earned + still-ahead milestones. Decision: (a) replace with dynamic progress bars tied to category scoring (e.g. "Read 10 articles in World"), or (b) remove entirely. Owner leaning toward dynamic or removal — no static list.
- 33: "You" section exists and is the top profile rail item (`YouSection.tsx`). Shows stats grid (Verity Score, Quizzes, Comments, Followers, Following) + profile polish CTAs. Needs cleanup — details TBD from owner.

---

## Category leaderboard

- 36: Category leaderboard + scoring — scoring events and subcategory data exist but the UI is generally broken/incomplete. Users currently have no clear way to see their standing.

  **Already wired (do not rebuild):**
  - `score_on_reading_complete` — `api/stories/read/route.js` + `api/events/batch/route.ts`
  - `score_on_quiz_submit` — `api/quiz/submit/route.js`
  - `scoreReceiveHelpfulTag` on helpful tag — `context-tag/route.js:101-113`
  - `category_scores` table with `subcategory_id` rollup rows
  - `/leaderboard` has parent + sub pill drilldown, "Your rank" card, sticky rank bar
  - `CategoriesSection` in profile shows per-category scores with sub-pills + 2×2 stat grid

  **UI gaps to fix:**
  - No entry point from articles or profile to the category leaderboard — user reads an article in Politics but can't jump to "See Politics leaderboard"
  - Profile `CategoriesSection` shows the user's own score but never shows their rank within that category (no "Your rank: #12 in Politics")
  - Leaderboard sticky rank bar shows rank + score but no category label (shows "#5" not "Politics #5")
  - `context` tag does not award points — only `helpful` does; decide if `context` should score
  - Subcategory deselect-on-click in profile is inconsistent with leaderboard pill behavior

  **New: percentile display**
  - Show the user's percentile rank among all users in that category/subcategory — e.g. "Top 8% of readers in Politics" or "Top 3% of taggers in World"
  - No max-possible ceiling needed — purely rank the user's score against all other users in that node
  - Show in both the profile `CategoriesSection` score card and on the leaderboard when drilling into a category

---

## Article surface — sources

- 26: Sources still showing "Unknown" for some articles — `SourcesSection.tsx:88` renders `s.title || s.publisher || hostFromUrl(s.url) || 'Source'`. The backfill migration `20260503000007_backfill_unknown_sources_to_null.sql` has not been applied yet (see TODO 19), so rows with literal `'Unknown'` in the `title` column pass the `s.title` check and render "Unknown" instead of falling through to `hostFromUrl`. Fix: apply the backfill migration (owner action, TODO 19) — no code change needed.

---

## Comments / tagging

- 39: Tag button UI after passing quiz is messy — clicking tags on another user's comment has poor UX (button states, picker, feedback). Needs investigation and redesign of the tag interaction in `CommentRow.tsx` and iOS `StoryDetailView.swift`.

---

## Layout / visual

- 38: Article page desktop layout feels off-center — `ArticleReaderTabs.tsx` uses a 75/25 flex split (`flex: 75` article column + `flex: 25` sticky timeline rail, `max-width: 1280px` container). The article body is capped at 680px inside the left column, so on a wide screen the text sits left-heavy with the timeline rail on the right and dead space outside. Decision needed: (a) keep 75/25 sidebar but tighten max-width so dead space shrinks, (b) move timeline above/below the article body and drop the rail, (c) make timeline a slide-in drawer/overlay on desktop instead of a persistent column. This is connected to TODO 3 (sources moving out of the timeline slot into the article body) — layout decision should be made together.

---

## Bookmarks → Follow (story subscription)

- 43: Copy sweep done — "Bookmark" → "Follow" shipped across web + iOS. Schema untouched.

  **Still needs your decision — story-update surfacing:**
  - When a new article is published on a story the user follows, surface it. Options: (a) badge/entry in the Activity feed, (b) push notification (iOS), (c) both.
  - Underlying data: `bookmarks` stores `article_id`; notify on story updates by joining `articles.story_id`. The `/following` page already does this join via `reading_log → articles → stories`.

---

## iOS parity — bring iOS up to web mobile standard

Web mobile is the product standard. These items bring iOS in line.

- 45: **Ads on iOS** — `HomeAdSlot` struct exists in `HomeFeedSlots.swift` but decodes the wrong response shape (missing fields) and is not wired into `HomeView.swift`. Article page has zero ad slots. Complexity: M.
  - Fix `AdPayload` decode in `HomeFeedSlots.swift` to match the `/api/ads/serve` response shape (check `web/src/app/api/ads/serve/route.ts` for exact fields)
  - Wire `HomeAdSlot` into `HomeView.swift` at the same positions as web: after the hero card (`home_top`), between cards 4–5 (`home_in_feed_1`), between cards 8–9 (`home_in_feed_2`), and below the last card (`home_below_fold`)
  - Add article-level ad slots in `StoryDetailView.swift` — check web `[slug]/page.tsx` for placement positions
  - Register impressions via `/api/ads/impression` and clicks via `/api/ads/click`
  - iOS Kids: not applicable

- 47: **Advanced search filters on iOS** — `FindView.swift` is keyword-only. Web `/search` supports category, date range, and source publisher filters for `search.advanced` users. Complexity: M.
  - Add a filter panel / sheet to `FindView.swift` with category picker, date range picker, source field — gated by `search.advanced` permission
  - The existing `/api/search` route already accepts the filter params (same API web uses)
  - Permission keys: `search.advanced`, `search.advanced.category`, `search.advanced.date_range`, `search.advanced.source`
  - iOS Kids: not applicable (kids has no search)

- 48: **Login activity / session revocation on iOS** — web `SessionsSection` shows active sessions with device/browser/IP and a per-session Revoke button. iOS `LoginActivityView` in `SettingsView.swift` shows an audit log only — no live session list, no revoke. Complexity: M.
  - Expand `LoginActivityView` in `SettingsView.swift` to add a "Active sessions" section above the audit log
  - Fetch from `/api/account/sessions` (GET) — same endpoint web uses
  - Each session row shows device, browser, IP, last-seen timestamp + a Revoke button → DELETE `/api/account/sessions/[id]`
  - "Revoke all other sessions" button at the bottom
  - Permission keys: `settings.account.sessions.revoke`, `settings.account.sessions.revoke_all_other`
  - iOS Kids: not applicable


- 19: Apply `supabase/migrations/20260503000007_backfill_unknown_sources_to_null.sql` — 4 "Unknown" source rows in prod still render legacy values until it runs
- 20: Verity Monthly Stripe price: plans.verity_monthly has stripe_price_id=NULL — owner must click Mint at /admin/plans
