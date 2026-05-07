# Changelog

Entries are brief — enough for another agent to know what changed and why, and to spot if something went wrong.

---

## 2026-05-07 (continued)

### Ad-unit performance panel
**Files:** `web/src/app/admin/ad-units/[id]/page.tsx`, new `web/src/app/api/admin/ad-units/[id]/performance/route.js`. Commit: `b4da9f6e`. **DB:** `ad_unit_performance` RPC via `mcp__supabase__apply_migration`.
- Closes the asymmetry the targeting work created — operators could configure deeply but never see what happened. Performance is now the first section on `/admin/ad-units/<id>`.
- New `ad_unit_performance(p_unit_id uuid, p_days int)` RPC aggregates `ad_impressions` directly (`is_clicked` + `revenue_cents` are on the row — no join with `ad_clicks` needed). Excludes `is_bot=true` rows. Returns impressions / clicks / CTR / revenue, per-category breakdown, and a per-day series. Admin-only.
- New GET `/api/admin/ad-units/[id]/performance?days=N` (admin.ads.view, 60/min limit, days clamped 1–365 default 30).
- UI: 7 / 30 / 90 day selector in the section header, four headline tiles, top-8 category table with per-category CTR, daily impressions sparkline. Auto-loads on mount and on period change with race-cancel; empty-state copy when there are no impressions yet.

### TODO 11 cleanup — drop dead targeting jsonb columns
**Files:** `web/src/types/database.ts`, `web/src/app/api/admin/ad-units/[id]/route.js`. Commit: `7dc30203`. **DB migration:** `drop_dead_targeting_columns_on_ad_units` via `mcp__supabase__apply_migration`.
- Dropped five jsonb columns from `ad_units` that had been read-and-write dead since the unified `ad_targets` ship in `fcf52c70`: `targeting_categories`, `targeting_subcategories`, `targeting_platforms`, `targeting_countries`, `targeting_cohorts`. Verified zero references across `web/src`, `VerityPost`, `VerityPostKids` before dropping.
- Regenerated `database.ts`. Stale comment in the PATCH route trimmed.
- **TODO 11 closed.**

### TODO 11 polish — schedule, tri-state exclusion, reach estimator, category logging
**Files:** `web/src/app/admin/ad-units/[id]/page.tsx`, `web/src/components/admin/TextInput.jsx`, `web/types/admin-components.d.ts`, new `web/src/app/api/admin/ad-units/[id]/estimate-reach/route.js`. Commit: `91fc2933`. **DB migrations:** `ad_impressions_category_id` (new column + `log_ad_impression` rewrite) and `estimate_targeting_reach_rpc` (new function), both applied via `mcp__supabase__apply_migration`.
- **Schedule fields** — `start_date` / `end_date` columns now render in the admin form as native date inputs in a new "Schedule" PageSection between Creative and Targeting. `null` = no bound. `TextInput` accepts `date` / `datetime-local` (JSDoc + `.d.ts` widened).
- **Tri-state UI for exclusion** — wires the existing `mode='exclude'` schema into the category tree. Under a checked parent, sub checkboxes render checked unless explicitly excluded; clicking a sub there adds a `subcategory exclude` row instead of an `include`. New `TriStateCheckbox` component sets `el.indeterminate = bool` via ref-callback (DOM property can't be set through React's `checked` prop alone). Parent indeterminate when any child is excluded. Removing parent strips child excludes (no orphan rows). Banner text updated to explain the model.
- **Check reach estimator** — new `estimate_targeting_reach(p_targets jsonb, p_days int)` RPC mirrors `serve_ad`'s include / exclude / wildcard predicate against the last N days of articles. New `/api/admin/ad-units/[id]/estimate-reach` POST endpoint runs it against the form's *unsaved* targeting array (admin auth + 60/min rate limit). New "Check reach" button under the Targeting section reports "Eligible on N of M articles published in the last 7 days" and flags zero-match in danger color. Predicate verified end-to-end via MCP (World-targeted matches Europe article via parent; Politics-targeted matches UK two-party).
- **`category_id` on `ad_impressions`** — new column + partial index, `log_ad_impression` rewrite derives `category_id` from `articles` for each impression. Click rows inherit via the impression-id join (no separate column). Reporting can now split targeted-by-category vs run-of-site performance.
- **Cross-platform:** web admin only. iOS / iOS Kids consume `serve_ad` output unchanged.

### TODO 11 — Targeting goes live via unified `ad_targets` table
**Files:** `web/src/app/admin/ad-units/[id]/page.tsx` (rewrite), `web/src/app/api/admin/ad-units/[id]/route.js`, `web/src/app/api/admin/ad-units/route.js`, `web/src/types/database.ts` (regenerated). Commit: `fcf52c70`. **DB:** new `ad_targets` table + `replace_ad_targets` RPC + `serve_ad` rewrite (applied via `mcp__supabase__apply_migration`).
- **Schema (forward-compatible):** `ad_targets(ad_unit_id, target_type CHECK ('category','subcategory','article'), target_id, mode CHECK ('include','exclude') DEFAULT 'include', created_at)`. PK = `(ad_unit_id, target_type, target_id)`. FK CASCADE on `ad_unit_id`. Indexes on `(ad_unit_id, mode)` and `(target_type, target_id)`. RLS enabled, no policies — RPCs read/write via `SECURITY DEFINER`. Future target types (platform, country, cohort, story-collection) plug in by extending the CHECK constraint and the `serve_ad` resolver — zero new DDL on this table.
- **`serve_ad` rewrite:** resolves article context once (`v_cat`, `v_sub`, `v_cat_parent`, `v_sub_parent`) via two `LEFT JOIN`s on `categories`. INCLUDE branch: untargeted ad (no include rows) serves anywhere; targeted ad must match at least one include row. EXCLUDE branch: any match kills the ad. Wildcard parent semantics handle BOTH article shapes — `category_id` as a top-level (Politics) AND `category_id` as a subcategory (Europe with `parent_id=World`). The IN-list direction `t.target_id IN (v_cat, v_cat_parent, v_sub_parent)` is null-safe.
- **`replace_ad_targets` RPC:** admin auth via `is_admin_or_above()`, 500-target cap, atomic delete-all-then-insert for one ad unit. Called from the PATCH route after the main row update.
- **Admin form rewrite:** unified `adTargets` array sourced from `ad_targets`. Categories tree: parent check adds a `category` target row, child check adds a `subcategory` target row. Parent-checked + expanded shows wildcard caption (preserves the prior `toggleCat` fix in `9315a310`). New "Specific articles" section with 300ms debounced `ilike` search on `articles.title` (limit 25, ordered by `published_at DESC NULLS LAST, created_at DESC`); selected articles render with title + Remove. Empty-targeting banner. Categories fetch filters `deleted_at IS NULL` (1 tombstone exists).
- **Form fields dropped this session:** `targeting_subcategories`, `targeting_platforms`, `targeting_countries`, `targeting_cohorts` UI removed. `serve_ad` never read these columns; per adversary review, shipping UI for unwireable dimensions is the silent-lie failure mode. The dead jsonb columns on `ad_units` are NOT dropped this session (left harmless to avoid a deploy window where running code references columns that no longer exist) — a future cleanup migration drops them.
- **`PLAN_OPTIONS` fixed:** the form's `verity_plus` value matched no row in `plans.tier`. Real values are `free` / `verity` / `verity_pro` / `verity_family`.
- **PATCH route:** `ALLOWED` list trimmed to drop the 5 dead jsonb fields. Validates incoming `ad_targets` array (silently drops malformed rows at the boundary; RPC enforces auth + cap). Audit-log includes the targeting payload.
- **POST route:** drops the lone `targeting_categories` create-time write. New ad units start with zero targets; admin sets them via PATCH after create.
- **End-to-end serve test (run via `mcp__supabase__execute_sql` before commit):** untargeted ad serves on both Politics and Europe articles. Targeted to World matches Europe (parent lookup) and does NOT match Politics. Article-level include matches only the targeted article. Predicate null-safe.
- **Cross-platform:** web admin only. iOS / iOS Kids consume `serve_ad` JSON output unchanged (no targeting fields surface client-side).

### TODO 11 Wave 1 — Parent-check is wildcard, not snapshot
**File:** `web/src/app/admin/ad-units/[id]/page.tsx`. Commit: `9315a310`.
- `toggleCat` no longer writes a snapshot of current child subcategory IDs into `targeting_subcategories` when a parent is checked. Parent membership in `targeting_categories` now means "this category and all current and future children" — wildcard semantics.
- Sub-list render: when a checked parent is expanded, the per-child checkboxes are replaced by an italic caption *"All {cat.name} subcategories targeted (current and future)."* Children remain individually toggleable when the parent is unchecked.
- Load-time normalization drops any `targeting_subcategories` entries whose parent is already in `targeting_categories`. Legacy rows (parent + child snapshot from the bug) self-heal into the wildcard model on first save.
- **Wave 1 collapsed to this single fix.** Pre-impl panel discovered the live `serve_ad` Postgres function does not filter on `targeting_categories` / `targeting_subcategories` (or any other `targeting_*` column) — the admin form has been writing to columns the runtime ignores. 4/4 fresh independent reviewers agreed: shipping the JSON→uuid[] migration + GIN indexes, tri-state UX, and "empty=all" banner ahead of the RPC rewrite would be premature. Those items belong in a future "targeting goes live" session that ships column-type change + `serve_ad` RPC rewrite + UI semantics atomically.
- Cross-platform: web admin only. iOS / iOS Kids n/a.

### TODO 3 + TODO 38 — Sources inline + drop the desktop side rail
**Files:** `web/src/components/article/SourcesSection.tsx`, `web/src/app/[slug]/page.tsx`, `web/src/app/globals.css`. Commit: `a9c53cf5`.
- **TODO 3 — sources moved into the article body.** SourcesSection rewritten as logo-driven rows. Each row is a button showing publisher favicon (Google s2 favicons API at `sz=32`, 16px rendered) + hostname (`bbc.co.uk`, `congress.gov`). Click toggles a panel below with the source's raw headline. Click the headline → opens URL in a new tab with `rel="noopener noreferrer"`. Anon-tease branch unchanged. Component moved out of `timelineSlot` in `[slug]/page.tsx` into `articleSlot`, right after `ArticleActions` — readers see provenance in the same scroll as the body, not in a side rail they often miss.
- **TODO 38 — desktop layout flattened to single column.** The 75/25 flex split with a sticky 25% right rail forced the body (capped at 680px) to sit left-heavy on wide screens, leaving dead space outside the rail. Killed in `globals.css [data-reader-body]`: now `display: block` with `max-width: 760px` centered. `[data-reader-panel="timeline"]` no longer flex/sticky — flows below the article body on desktop. **Mobile 3-tab UI (Article / Timeline / Quiz & Discussion) preserved** per owner skip on TODO-1.
- **Ad slot adjustment.** `article_rail` ad was a sticky right-rail position; with the rail dropped it now flows below the timeline on desktop, inside the Timeline tab on mobile (where it already lived). Same component, same impressions/click tracking.

### TODO 50 piece B — Firsthand context on comments
**Files:** `web/src/components/CommentComposer.tsx`, `CommentRow.tsx`, `CommentThread.tsx`, `web/src/app/api/comments/route.js`, `VerityPost/VerityPost/StoryDetailView.swift`, `Models.swift`. **DB:** `comments.real_world_experience text` (≤80 char CHECK); `post_comment` RPC extended with `p_real_world_experience` (old 5-arg overload dropped); `database.ts` regenerated.
- Composer: italic-serif "I know this firsthand" toggle. When checked, expands a 80-char `How do you know?` input. Pre-fills from `users.background_oneline` if set + composer field is empty.
- Render: em-dash byline below comment body. Same italic-serif treatment on web + iOS.
- Single-column model: presence of trimmed text IS the firsthand claim. Empty + checked → not persisted.
- "Verified Expert" chrome on comments hidden behind `SHOW_EXPERT_CHROME_ON_COMMENTS = false` flag (per locked decision #16 — kept alive in code, single-line flip to restore). Expert filter toggle + dead `{false &&}` gate stripped from CommentThread.

### TODO 48 — Author follow-ups on comments (was deferred, shipped anyway)
**Files:** `CommentRow.tsx`, `CommentThread.tsx`, new `web/src/app/api/comments/[id]/followups/route.js`, `StoryDetailView.swift`, `Models.swift`. **DB:** new `comment_followups` table with cap-of-2 trigger + UNIQUE (comment_id, sort_order) + `_enforce_comment_followup_invariants` raises SQLSTATE `VP001` on cap-hit for stable error-code detection; new `can_view_comment(uuid)` SECURITY DEFINER helper that mirrors `comments_select`; new `create_comment_followup` RPC (locks parent FOR UPDATE + re-counts).
- Italic-serif "Update" pinned beneath parent comment, OP-only composer, immutable. Cap of 2 enforced at trigger + RPC + UNIQUE constraint.
- API route maps RPC errors: SQLSTATE VP001 → 409, author mismatch → 403, parent missing → 404. Author-only DELETE.
- Realtime channel subscribes to INSERT + DELETE on `comment_followups`; refetches the affected comment's followups via the user's authed client (RLS defense-in-depth) and merges into state. Other viewers see updates within ~1s.
- **`supabase_realtime` publication updated to include `comments` AND `comment_followups`** (the existing iOS + web comments realtime had been silently failing because the publication was never extended).

### TODO 50 piece A — Profile background system
**Files:** `web/src/app/profile/_components/ProfileApp.tsx`, new `web/src/app/profile/_sections/BackgroundSection.tsx`, new `web/src/app/profile/settings/_cards/BackgroundCard.tsx` (~1000 lines), `u/[username]/page.tsx`, new `VerityPost/VerityPost/SettingsBackgroundView.swift` (~860 lines), `PublicProfileView.swift`, `SettingsView.swift`, `Models.swift`. **DB:** 7 new `users.background_*` columns (oneline, profession, years, where, lived, languages — varchar with CHECK; `lived_public` boolean default false); 3 new tables (`user_education`, `user_links`, `user_topics_known`); RLS gates SELECT on `profile_visibility` (private profiles hide background everywhere, including future expert-search via topics_known); `update_own_profile` extended to allowlist new fields; new `set_own_education` / `set_own_links` / `set_own_topics_known` replace-set RPCs; `public_profiles_v` view extended.
- Web `/profile` BackgroundCard: progressive-disclosure questionnaire — primary 80-char "In one line, who's writing?" + chip tray of optional sections (profession, years, education multi-entry, lived experience with privacy toggle, where, topics multi-select from `categories` table, languages, links with quick-preset chips for LinkedIn/Personal site/GitHub/Research/Resume).
- iOS `SettingsBackgroundView` mirrors web — chip tray, multi-entry editors, NSDataDetector-style URL handling, 80-char counters, save toolbar button. New row added to Settings → Account.
- Public profile read render on `/u/[username]` (web) and `PublicProfileView` (iOS): italic-serif `— {oneLine}` byline, optional sections only render when populated. `background_lived` gated on `lived_public`. Topic chips. Links auto-link with `rel="nofollow noopener noreferrer ugc"`. Empty-state hint on own profile invites fill-in.

### TODO 51 Part A — Article-gen prompt edits (libel hardening)
**Files:** `web/src/lib/pipeline/editorial-guide.ts`, `web/src/app/api/admin/pipeline/generate/route.ts:1732`. All 9 prompt edits from the 4-adversary panel review:
- **Allegation Mode carve-out** in rule 11: required hedges (`alleged` / `reportedly` / `according to [filing/official]`) for uncharged conduct against named persons. Restores fair-report privilege the prior strip-outlet rule destroyed.
- **BAD/GOOD example** in rule 11 (CBS News / Biden) showing primary-source attribution form.
- **Anti-hallucinated-attribution rule** added to FACTS ONLY: ban inventing `according to` / `sources said` / `a person familiar with the matter` unless those phrasings appear in the corpus. Closes St. Amant "purposeful avoidance" exposure.
- **Wikipedia-as-research-aid rule**: don't paraphrase Wikipedia prose — use it to find primary sources, attribute to those. Closes CC-BY-SA exposure.
- **Conditional length-band ladder dropped** in all 3 summary prompts (HEADLINE / KIDS / TWEENS), replaced with fixed 30–50 word target. Honest about parallel-execution constraint.
- **`route.ts:1732` 250-400 → 250-450** word-count sync between user-turn and `EDITORIAL_GUIDE`.
- **"so what" tightened** to attributable mechanism only (named source or quantitative causal claim, or omit). Removes contradiction with FACTS ONLY rules.
- **Cadence + scale comparisons + on-record statements** protected as carve-outs under EVERY SENTENCE A FACT — prevents over-cutting Jay Jones-class statements and collapsing to monotone declaratives.

### Misc cleanup (same commit)
- `ExpertApplyForm.tsx`: removed `"We review within 5 business days"` toast string (no-user-facing-timelines).
- TODO.md duplicate `#51` (comment-load error) removed — recon confirmed underlying issue already fixed in code.
- iOS xcodebuild + web typecheck clean throughout.

**Commit:** `8110a917` — 19 files, +4,473 / −79.

### TODO 39 (web half) — Tag-row redesign in CommentRow
**File:** `web/src/components/CommentRow.tsx`. Commit: `dd73c1ec` (part of the larger WYSIWYG-composer ship — full commit also covers composer, collapsible replies, permalink, quote reply).
- `helpful` tag promoted to a heart icon in the primary action row (Substack-style, with count). Filled heart when cast, outlined when not.
- `context` / `cite_needed` / `off_topic` rendered as always-visible inline buttons in the action row — no hidden picker, no `+ Tag` opener, no two-step reveal. Buttons gate on `comments.context_tag` permission + `quizPassed !== false`.
- Cast state shows count + colored border; uncast shows label + neutral border. Single source of UX truth — no separate "active list" vs "picker list" split.
- **iOS parity not shipped in this commit** — `StoryDetailView.swift` still uses the old `+ Tag` opens-picker pattern. Tracked in TODO 39 (now iOS-parity-only).

---

## 2026-05-06 (continued × 4)

### TODO 48 — iOS login activity: active sessions + per-session revoke
**File:** `VerityPost/VerityPost/SettingsView.swift` (`LoginActivityView`)
- Added `SessionRow` decodable struct (id, user_agent, ip, last_seen_at, is_current)
- New "Active sessions" section loads above the audit log via `GET /api/account/sessions`; device label parsed from user_agent (platform + browser detection); IP + last-seen shown as caption; current session gets a "This device" badge
- Per-row `Revoke` button in VP.danger color → `DELETE /api/account/sessions/[id]`; removes row from local state immediately on 200
- "Revoke all other sessions" button → `DELETE /api/account/sessions`; clears non-current rows on 200
- Both revoke actions gated on `settings.account.sessions.revoke` / `settings.account.sessions.revoke_all_other` permissions; in-flight state prevents concurrent taps
- Error banner on network/API failure; audit log section unchanged
- **iOS Kids:** not applicable. **Web:** already existed.

---

## 2026-05-06 (continued × 3)

### TODO 49 — iOS theme toggle
**Files:** `VerityPost/VerityPost/Theme.swift`, `VerityPostApp.swift`, `SettingsView.swift`
- `Theme.swift`: all ink/surface/border/text static tokens swapped from hardcoded hex to `UIKit` adaptive colors (`Color(UIColor.label)`, `.systemBackground`, `.secondarySystemBackground`, `.separator`, `.tertiaryLabel`, etc.); fixed colors (brand, success, danger, warn, tag chips) unchanged; `SkeletonBar` → `Color(.systemGray5)`; `PillButton` → `Color(.systemBackground)`. Added `import UIKit`.
- `VerityPostApp.swift`: `@AppStorage("vp_theme")` + `preferredColorScheme` computed property (`"light"` → `.light`, `"dark"` → `.dark`, anything else → `nil`); `.preferredColorScheme(preferredScheme)` applied to `ContentView()`.
- `SettingsView.swift`: `AppearanceSettingsView` — three-option Light / System / Dark checkmark picker using `SettingsPageShell + SettingsCard`; Appearance `HubRowSpec` added to `preferencesRows` (always visible, no permission gate) with current-value preview text.
- **iOS Kids:** shares root `preferredColorScheme` — applies automatically.
- **Web:** already existed via `AppearanceSection.tsx`.

---

## 2026-05-06 (continued again)

### TODOs 1+2 — Dark mode: chrome + article text
**Files:** `web/src/app/NavWrapper.tsx`, `web/src/components/article/ArticleSurface.tsx`, `ArticleReaderTabs.tsx`, `SourcesSection.tsx`, `MidBodyQuizTeaser.tsx`, `TimelineSection.tsx`, `UpNextSheet.tsx`, `AnonArticleCtaBanner.tsx`, `StoryArticlePicker.tsx`, `web/src/components/CommentRow.tsx`
- **Chrome fix:** `rgba(var(--bg-rgb, 255, 255, 255), 0.97)` → `rgba(var(--bg-rgb), 0.97)` on top bar + bottom nav (NavWrapper lines 398, 431). `--bg-rgb` already had correct dark overrides; the hardcoded white fallback was the entire problem.
- **Article text fix:** Swept 9 files from legacy CSS vars to `--p-*` tokens:
  - `--text-primary` / `--text` → `--p-ink`
  - `--dim` (dark shades #888/#666/#555) → `--p-ink-muted`
  - `--dim` (light shades #bbb/#999/#aaa) → `--p-ink-faint`
  - `--bg` → `--p-bg`
  - `--border` → `--p-border`
  - `--accent` (#0070f3/#2563eb, blue uses) → `--p-accent`
  - `--accent` (#111, dark ink uses) → `--p-ink`
- **iOS / iOS Kids:** not applicable (native theme system)

---

## 2026-05-06 (continued)

### TODO 28 — Inline plan cards in BillingCard
**Files:** `web/src/app/profile/settings/_cards/BillingCard.tsx`, `web/src/app/pricing/_CheckoutButton.tsx` (reused)
- Free-tier users now see Verity + Family plan cards inline in the Plan section — no redirect to /pricing
- Fetches DB pricing via Supabase client; falls back to `pricingCopy.ts` constants if fetch fails
- Verity card: shows live price + `CheckoutButton` (or "Subscribe via iOS App" disabled state when `stripe_price_id` is null)
- Family card: shows price + "Available on iOS →" link to /kids-app
- **iOS / iOS Kids:** not applicable (native subscription flow unchanged)

### TODO 25 — CommentRow bold cleanup
**File:** `web/src/components/CommentRow.tsx`
- "Helpful" chip: `fontWeight: 700` → `600`
- "VS score" chip: `fontWeight: 700` → `600`
- Active tag chip: `fontWeight: active ? 700 : 500` → `active ? 600 : 500`
- Intentional bolds kept: "Pinned as Article Context" label, Expert chrome label, Save button
- **iOS / iOS Kids:** not applicable

### TODO 37 — AvatarEditor responsive grid
**File:** `web/src/app/profile/_components/AvatarEditor.tsx`
- Grid column changed from `auto 1fr` to `min(160px, 40vw) 1fr` — preview column now shrinks on narrow viewports instead of forcing a fixed 160px minimum
- Removed `minWidth: 160` from preview panel (was redundant and overrode the column width)
- **Verify:** open /profile → Avatar on a phone; if overflow persists check `InviteLinkCard` (`minWidth: 96`) via DevTools
- **iOS / iOS Kids:** not applicable (native avatar editor)

### TODO 43 — Bookmark → Follow copy sweep
**Files:** `web/src/components/BookmarkButton.tsx`, `web/src/app/bookmarks/page.tsx`, `web/src/app/profile/_components/ProfileApp.tsx`, `web/src/app/profile/_sections/BookmarksSection.tsx`, `VerityPost/VerityPost/ProfileView.swift`, `VerityPost/VerityPost/StoryDetailView.swift`, `VerityPost/VerityPost/SubscriptionView.swift`
- Web: button label "Bookmark"/"Saved" → "Follow"/"Following"; page title → "Following"; empty state copy updated; toast → "Removed from Following"; rail label → "Following"; Download copy updated
- iOS: quick action chip "Saved" → "Following"; quick link "Bookmarks" → "Following"; article button "Save"/"Saved" → "Follow"/"Following"; upgrade alert updated; plan feature list updated
- Schema untouched — `bookmarks` table, permissions, collections all unchanged
- **Remaining:** story-update surfacing (notify on new articles in followed stories) — awaiting owner decision on channel (Activity badge / push / both)
- **iOS Kids:** not applicable

### TODO 46 — "New since last visit" pill on iOS home feed
- Shipped as part of the iOS nav restructure (commit 925104eb)
- `HomeView.swift`: reads/writes `vp_last_home_visit_at` in UserDefaults; story cards show "New" badge when `publishedAt > lastVisitDate`
- **Web:** already existed via `_HomeVisitTimestamp.tsx`
- **iOS Kids:** not applicable

---

## 2026-05-06

### TODO 41 — iOS comment thread depth capped at 2
**Files:** `VerityPost/VerityPost/SettingsService.swift`, `StoryDetailView.swift`
- `SettingsService.swift:72` — `max_depth` default changed from `1` → `2` (was capping to 1 reply level instead of 2)
- `StoryDetailView.swift:1549` — `maxThreadDepth` changed from `3` → `2` (visual indent cap)
- `StoryDetailView.swift:2160` — Reply button now gates on `depth < SettingsService.shared.commentNumber("max_depth")`; previously had no depth check so reply button showed at any depth
- **iOS Kids:** not applicable (no comments)
- **Web:** already correct; `CommentRow.tsx` gates on `depth < commentMaxDepth` with default 2

### TODO 13 — iOS push notification tap-through
**Files:** `VerityPost/VerityPost/PushRegistration.swift`
- Added `userNotificationCenter(_:didReceive:withCompletionHandler:)` delegate method — previously missing, so tapping a push notification did nothing
- Handler extracts `story_slug` or `article_slug` from `userInfo`, posts `NotificationCenter.default.post(name: .vpOpenStory, ...)` so the app can navigate to the article
- Added `extension Notification.Name { static let vpOpenStory = Notification.Name("VPOpenStory") }`
- **Web / iOS Kids:** not applicable (push is iOS only)

### TODO 30 — Bookmarks removed from Activity feed
**Files:** `web/src/app/profile/_sections/ActivitySection.tsx`, `VerityPost/VerityPost/ProfileView.swift`, `VerityPost/VerityPost/Models.swift`
- Bookmarks already have a dedicated Bookmarks section in the rail — showing them in Activity too was duplicate noise
- **Web:** Dropped `BookmarkJoined` type, `bookmarks` state + query, `'bookmarks'` filter tab option, bookmark merge block, and bookmark render branch
- **iOS:** Dropped `ActivityFilter.bookmarks`, `bookmarkItems` state, `canViewBookmarks`, bookmark fetch, merge, and render branches from `ProfileView.swift`; removed `case bookmark` from `ActivityType` in `Models.swift`
- **iOS Kids:** not applicable (no activity feed)

---

### TODO 35 — Score tier UI removed
**Files:** `web/src/lib/scoreTiers.ts` (deleted), `web/src/app/profile/_components/TierProgress.tsx` (deleted), `ProfileApp.tsx`, `AppShell.tsx`, `YouSection.tsx`, `PublicProfileSection.tsx`, `CommentRow.tsx`, `CommentThread.tsx`, `CommentComposer.tsx`, `admin/users/page.tsx`, `admin/users/[id]/page.tsx`, `u/[username]/page.tsx`, `VerityPost/ProfileView.swift`
- All newcomer/reader/informed/analyst/scholar/luminary labels, the TierProgress bar, and scoreTiers loading logic removed everywhere
- Plan tier (free/pro/family) untouched — only score tier removed
- **iOS Kids:** not applicable

### TODO 42 — Timeline sticky rail overflow fixed
**File:** `web/src/components/article/ArticleReaderTabs.tsx`
- Added `align-self: flex-start` to `[data-reader-panel="timeline"]` — the rail now stops at the article container's bottom edge instead of floating over the footer
- **iOS:** timeline is a separate tab on mobile, not a sticky rail — not applicable
- **iOS Kids:** no timeline — not applicable

### TODO 40 — @mentions paid-gating copy (iOS)
- Swept iOS codebase — no paid-gating mention copy exists in Swift; web was already cleaned last commit
- Item fully done, no code change needed on iOS

---

## Earlier this session (2026-05-06)

### Bold / weight cleanup — article surface
- `TimelineSection.tsx` — removed `fontWeight: 600` from `LABEL_STYLE` (unintentional bold on timeline labels)
- `MidBodyQuizTeaser.tsx` — removed `fontWeight: 600` from `HEADLINE_STYLE`; kept button bold intentionally

### Tag quiz gate — web
- `CommentRow.tsx:642` — tag block now only renders when `quizPassed !== false`; previously showed tag UI before quiz was attempted

### Ad centering — home page bottom ad
- `Ad.jsx` — added `maxWidth: 728, margin: '12px auto'` to `wrapStyle` and `margin: '0 auto'` to img so the ad card self-centers
- `page.tsx` — removed inner redundant `maxWidth` wrapper that was conflicting

### "Better than X% of readers" copy removed
- `ArticleQuiz.tsx` — removed percentile copy from both pass state (lines 535-550) and fail state (lines 581-597); the stat was not meaningful and was distracting

### @mentions paid-gating copy removed
- `CommentComposer.tsx` — removed paid-mentions banner and footer line "@mentions are available on paid plans."
- `copy.ts` — removed `mentionPaid` and `mentionPaidComposerHint` keys
- **iOS:** not applicable (no paid-gating copy existed in Swift)
