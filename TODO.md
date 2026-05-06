# TODO

---

## Needs your decision before anything can move

**Dark mode — bundle 1 + 2 together**
- 1: Chrome (top bar + bottom nav) stays white in dark mode — need to pick token strategy: new --chrome-bg/--chrome-text tokens, or reuse existing --p-surface/--p-ink tokens
- 2: Article body text stays dark in dark mode — fix path A (redefine full legacy palette in CSS, bigger QA surface) or path B (sweep article components to --p-ink only, smaller blast)

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

- 12: Migration `_210000_grant_feed_clusters_browse_access.sql` is not idempotent — CREATE POLICY lines need DROP IF EXISTS guards
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

- 31: Categories section in profile — needs cleanup. Details TBD.
- 32: Milestones section in profile — decision needed. Options: (a) replace static milestones with progress bars tied to the subcategory/category scoring system from TODO 36 (e.g. "Read 10 articles in World"), (b) remove the section entirely. Owner leaning toward either dynamic progress or removal — no static/fixed milestone list.
- 33: "You" area of the profile — needs cleanup. Details TBD.

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
  - Leaderboard sticky rank bar says "#5" without clarifying if that's global, category, or subcategory context
  - `context` tag does not award points — only `helpful` does; decide if `context` should score
  - Subcategory deselect-on-click in profile is inconsistent with leaderboard pill behavior

  **New: percentile display**
  - Show the user's percentile rank among all users in that category/subcategory — e.g. "Top 8% of readers in Politics" or "Top 3% of taggers in World"
  - No max-possible ceiling needed — purely rank the user's score against all other users in that node
  - Show in both the profile `CategoriesSection` score card and on the leaderboard when drilling into a category

---

## Profile / Activity

---

## Profile / Plan

- 28: Clicking Plan in profile takes free users to a "See plans →" button that links to `/pricing` — a separate page. User wants the plan options to open immediately when they land on the Plan section. `BillingCard.tsx:330-346` renders the "See plans" → `/pricing` link for users with no subscription. Fix: replace the link with inline plan cards (or pull `/pricing` content into a modal/inline component) so upgrade is one step, not two. `AppShell.tsx:614` also links locked sections to `/profile?section=plan` which then hits the same two-hop problem.

- 29: Appearance section may not need to be its own nav rail item — it only contains a single Light/System/Dark toggle (`AppearanceSection.tsx`). Decision: collapse it into another section (e.g. Settings/General), or keep it standalone?

---

## Notifications

- 27: "Mobile push" toggle shows in Notifications settings on desktop web (`NotificationsCard.tsx:41-44`). The row reads "Time-sensitive notifications on the iOS app. Web is in-app and email only." — the toggle is meaningless on web since push is iOS-only. Decision needed: hide the row entirely on web, or show it read-only/greyed with an explanation that it's controlled from the iOS app.

---

## Article surface — bold + sources

- 25: Comment/tag UI has multiple bold elements — `CommentRow.tsx` has `fontWeight: 700/600` on tag labels, usernames, and action buttons throughout. Needs a pass to identify which are intentional vs incorrect.
- 26: Sources still showing "Unknown" for some articles — `SourcesSection.tsx:88` renders `s.title || s.publisher || hostFromUrl(s.url) || 'Source'`. The backfill migration `20260503000007_backfill_unknown_sources_to_null.sql` has not been applied yet (see TODO 19), so rows with literal `'Unknown'` in the `title` column pass the `s.title` check and render "Unknown" instead of falling through to `hostFromUrl`. Fix: apply the backfill migration (owner action, TODO 19) — no code change needed.

---

## Comments / tagging

- 39: Tag button UI after passing quiz is messy — clicking tags on another user's comment has poor UX (button states, picker, feedback). Needs investigation and redesign of the tag interaction in `CommentRow.tsx` and iOS `StoryDetailView.swift`.
- 40: Never show "@mentions are a paid feature" or any mention-gating message anywhere. Find and remove all such copy across web and iOS.

---

## Layout / visual

- 42: Timeline sticky rail must not scroll past the end of the article. On desktop the timeline panel is `position: sticky` with `max-height: calc(100vh - 100px)` and `overflow-y: auto` (`ArticleReaderTabs.tsx`). When the article is short or the user scrolls to the bottom, the timeline rail keeps sticking beyond the article's natural end and floats over the footer/engagement zone. Fix: constrain the sticky rail so it stops when the article column ends — likely via a wrapping element with `align-items: flex-start` already in place, but the rail needs `align-self: flex-start` or the parent needs `align-items: stretch` removed so the sticky container doesn't stretch taller than the article content.
  - Web: `ArticleReaderTabs.tsx` — `[data-reader-panel="timeline"]` sticky styles
  - iOS: Timeline is a separate tab on mobile, not a sticky rail — not applicable
  - iOS Kids: No timeline — not applicable

- 38: Article page desktop layout feels off-center — `ArticleReaderTabs.tsx` uses a 75/25 flex split (`flex: 75` article column + `flex: 25` sticky timeline rail, `max-width: 1280px` container). The article body is capped at 680px inside the left column, so on a wide screen the text sits left-heavy with the timeline rail on the right and dead space outside. Decision needed: (a) keep 75/25 sidebar but tighten max-width so dead space shrinks, (b) move timeline above/below the article body and drop the rail, (c) make timeline a slide-in drawer/overlay on desktop instead of a persistent column. This is connected to TODO 3 (sources moving out of the timeline slot into the article body) — layout decision should be made together.

- 37: Mobile web profile renders poorly — zooms in and doesn't give a clean view. Viewport meta is correct (`device-width`, `initialScale: 1`). AppShell rail is properly hidden off-screen on mobile (<860px). Most likely cause: a fixed-width element inside one of the profile sections is causing horizontal overflow, which makes the browser shrink the page to fit. Needs browser-side diagnosis — open `/profile` on mobile, open DevTools, look for any element wider than the viewport in the Elements panel. Suspect candidates: `AvatarEditor` (`minWidth: 160`), `InviteLinkCard` (`minWidth: 96`), or a grid that doesn't collapse properly. Fix will depend on what's overflowing.

---

## Score tier / Newcomer removal

- 35: Remove all score tier (newcomer/reader/informed/analyst/scholar/luminary) UI across web and iOS. Plan tier (free/pro/family) in `Models.swift` is subscription gating — do NOT touch.
  - `web/src/lib/scoreTiers.ts` — delete entire file
  - `web/src/app/profile/_components/TierProgress.tsx` — delete entire component
  - `web/src/app/profile/_sections/YouSection.tsx` — remove `TierProgress` render (line 48) and `ScoreTier` props (`tier`, `next`)
  - `web/src/app/profile/_sections/MilestonesSection.tsx` — remove tier references
  - `web/src/components/CommentRow.tsx` — remove `currentUserTier` prop (line 72, 189, 944) and all downstream uses
  - `web/src/components/CommentThread.tsx` — remove `currentUserTier` prop (lines 60, 99, 926, 1022) and all downstream uses
  - `VerityPost/VerityPost/ProfileView.swift:956` — remove `tierFor(score:)?.displayName ?? "Newcomer"` display; drop `scoreTiers` state loaded at lines 105-106 and 193

---

## Bookmarks → Follow (story subscription)

- 43: Rename "Bookmark" to "Follow" everywhere and wire up story-update surfacing.

  **Concept shift:** Bookmarking saves an article. Following subscribes to a story — you want to know when new articles drop on that story. The `/following` page framework already shows stories you've read from; make it the canonical "stories you're following" page.

  **Rename (copy + UI only, no schema change):**
  - `web/src/components/BookmarkButton.tsx` — button label "Bookmark"/"Saved" → "Follow"/"Following"; icon can stay or swap to a bell/pin
  - `web/src/app/bookmarks/page.tsx` — page title + empty state copy → "Following" / "Stories you're following"
  - Rail nav label "Bookmarks" → "Following" (wherever the rail item is defined in `ProfileApp.tsx` or `AppShell.tsx`)
  - `web/src/app/following/page.tsx` — currently shows reading-history stories; merge or redirect so there's one canonical Following page, not two
  - iOS: `BookmarkButton` equivalent label + Bookmarks tab in profile rail → "Following"
  - iOS Kids: not applicable (no bookmarks/following)

  **Story-update surfacing (new behavior):**
  - When a new article is published on a story the user follows, surface it. Options: (a) badge/entry in the Activity feed ("New article in a story you follow: [title]"), (b) push notification (iOS), (c) both. Decision needed from owner before implementing this part.
  - Underlying data: `bookmarks` table already stores `article_id`; to notify on story updates need to know `story_id` — either join through `articles.story_id` or add a `story_id` column to `bookmarks`. The `/following` page already does this join via `reading_log → articles → stories`.

  **Note:** `bookmark_collections`, `bookmarks.note.add`, `bookmarks.export` permissions exist — keep them alive, just rename the UI label. Do not drop the schema.

- 19: Apply `supabase/migrations/20260503000007_backfill_unknown_sources_to_null.sql` — 4 "Unknown" source rows in prod still render legacy values until it runs
- 20: Verity Monthly Stripe price: plans.verity_monthly has stripe_price_id=NULL — owner must click Mint at /admin/plans
