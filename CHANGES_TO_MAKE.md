# Changes to make

Running list of UX/admin changes the owner has flagged. Each entry is a self-contained prompt: what to change, source files (with line numbers), and platform coverage (web / iOS / kids iOS — cross-platform consistency rule).

---

## Priority queue (work order)

**Wave 1 — owner-locked, do these first (2026-04-30):**

| # | Item | Status | Notes |
|---|------|--------|-------|
| 13 | Unify username pick → single first-login popup (kill iOS full-screen route + dead web redirect) | ✅ shipped (uncommitted) | Owner approval to push pending; two minor stale comments in `AuthViewModel.swift:613, 677-681` rolled into item 10 |
| 3  | Admin → article: published opens reader, drafts stay in newsroom, separate Edit button | ✅ shipped (commit `08259fe`) | UI-only change; no migrations |
| 10 | Lock username (self-edit off; admins can rename) | ✅ shipped + DB applied (commit `204b31d`, migrations applied 2026-05-01) | Lock is fully live across UI + RPC + trigger |
| 11a | God-mode owner-auto + server bypass + client `isGodMode` (no per-user grant UI) | ✅ shipped + part-1 migration applied (commit `229bc7d`, applied 2026-05-01); ⚠️ part-2 RPC patches file still placeholder | Owner functions today via existing role grant + 5 API route bypasses + client component bypasses. RPC short-circuits (admin permissions console attribution + future 11b grantees) still need owner to paste live RPC bodies |
| 11b | Per-user grant UI (god-mode + `admin.users.edit` + `admin.users.impersonate` toggles) | 🔴 blocked on item 11a | Bundled with item 12; build the toggle infrastructure once, use for all three keys |
| 12 | Admin opens / edits / impersonates any user (with kid PIN reset + COPPA notify) | 🟡 needs 11a + 11b + privacy clause | Reuses 11b's per-user grant UI |

Suggested ship order within Wave 1: **13 ✅ → 10 ✅ → 3 ✅ → 11a → (11b + 12 bundled).** (13 unlocked 10's clean server enforcement; 3 was independent; 11a gives owner full bypass without the per-user grant UI; 11b's toggle infrastructure builds once and serves both god-mode and item 12's two grant keys.)

**Wave 2 — backlog, schedule after Wave 1 is in flight:**

| # | Item | Status |
|---|------|--------|
| 2  | Remove "Pricing" link from top bar | ✅ shipped (commit `f0748ce`) |
| 5  | Avatar initials → 3 alphanumeric chars on web (iOS already correct) | ✅ shipped (commit `f0748ce`); server-side `users.avatar` CHECK constraint shipped 2026-05-01 |
| 9  | Hide password UI for adults (no passwords; OTP-only) | ✅ shipped web + iOS adult (commit `f0748ce`) |
| 7  | Drop streaks + read counts across adult product (kids keeps streaks — kids = funner) | 🟢 ready (locked: strip parent's kid-streak block in FamilyViews; drop the 30-day grid entirely on web; kids iOS untouched) |
| 8  | Profile stat-tile typography redesign — Direction A (sans, bold, tight) | ✅ shipped |
| 4  | Mount AI provider/model picker in admin | 📋 backlogged in OUTSTANDING.md (locked: both global + per-run) |

**Superseded — kept for reference:**

| # | Item | Note |
|---|------|------|
| 1 | Remove date / "Today's edition" / timezone from home | Subsumed by item 7 (read-counter chip) and replaced by stat-tile redesign goals; do not work on independently |
| 6 | Add legend / header / summary to the streak heatmap | Moot — item 7 removes the heatmap entirely |

**Status legend:** 🟢 ready · 🟡 needs decision · 🔴 blocked · ⏳ in flight · ✅ shipped

---

## 1. Home page — remove date / "Today's edition" / timezone

**What to change:** delete the masthead block at the top of the home feed that renders today's date, the line "Today's edition (Eastern Time)", and the timezone disclosure.

**Source:**
- `web/src/app/page.tsx:345-369` — the `<div>` block guarded by the T110 comment. Renders `today.humanDate`, "Today's edition (Eastern Time)", and the "X of Y read today" counter.
  - Remove the entire date/edition `<div>` (lines 349-363).
  - Decide whether to keep the `{readTodayCount} of {totalToday} read today` chip (lines 364-368). Owner only asked to remove date/edition/timezone — leave the read counter unless told otherwise. If the chip becomes the sole child, simplify the wrapping flex container.
- `editorialToday()` helper at `web/src/app/page.tsx:70` is also used elsewhere on the page (filtering, hero pick) — **do not delete the helper**, only stop rendering its `humanDate` field.

**Platforms:**
- Web: yes — the change above.
- iOS (`VerityPost/VerityPost/HomeView.swift`): `humanDate` is computed at line 75/91 but **never rendered**. No visible masthead to remove. Not applicable.
- Kids iOS: no equivalent surface. Not applicable.

---

## 2. Remove "Pricing" link from the global top bar

**What to change:** the top-right "Pricing" link in the fixed top bar appears on most pages and the owner doesn't want it there. Remove it from the global chrome.

**Source:**
- `web/src/app/NavWrapper.tsx:561-579` — the `<div>` containing the `<a href="/pricing">Pricing</a>` link inside the top bar header. Remove the link (and the wrapping inline-flex `<div>` if no other right-side children remain).
- The same file at line 472 lists `{ label: 'Pricing', href: '/pricing' }` inside a footer/secondary nav array (`SECONDARY_LINKS` or similar) — **decide separately** whether the footer Pricing link should also go. Owner only called out the top-right corner; leave the footer entry alone unless asked.
- `/pricing` page itself (`web/src/app/pricing/page.tsx`) stays — it's still reachable directly, just not surfaced in chrome.

**Note on the "I see it on admin too" report:** `NavWrapper`'s `showTopBar` is gated by `!fullyBare`, where `fullyBare` includes `isAdmin(path)` (line 305, 309). The top bar should already be hidden on `/admin/*`. If the owner is still seeing it on admin pages, that's a pre-mount flash or a route mis-detect — investigate `isAdmin()` (line 141, `p.startsWith('/admin')`) and the `mounted` gate before assuming the top bar is rendering. Removing the Pricing link makes this moot, but worth a quick check while there.

**Platforms:**
- Web: yes — the change above.
- iOS: no Pricing link in iOS nav (confirmed: only `SubscriptionView.swift` and `StoreManager.swift` mention pricing internally, no nav entry). Not applicable.
- Kids iOS: no pricing surface. Not applicable.

---

## 3. Admin → article click should open the public reader, not the build view

**What to change:** when an admin clicks an article row from `/admin/stories`, the row currently routes to `/admin/story-manager?article=<id>` (the editor). Published adult articles should open the public reader; drafts and kids articles stay in the admin newsroom.

**Locked decisions (owner, 2026-04-30):**
- **Row click on a `published` adult article → opens public reader at `/${stories.slug}?a=${articleId}`.**
- **Row click on a `draft` (or any non-published status) → stays in the admin newsroom** — current `/admin/story-manager?article=<id>` behavior (or `/admin/kids-story-manager` for kid audience). Drafts never expose a viewer-facing URL.
- **Edit button on every row** routes to `/admin/story-manager?article=<id>` (or `/admin/kids-story-manager` for kid audience). **Note: the Edit button already exists** in the actions column (lines 229-238 of `stories/page.tsx`); it does NOT need to be added — it already does what the locked decision asks. Just verify it stays.

**Pre-impl review corrections (4-agent flow, 2026-05-01):** the doc as originally written had four spec errors. All confirmed by the implementer plan below.

### Source — atomic edit on `/Users/veritypost/Desktop/verity-post/web/src/app/admin/stories/page.tsx`

1. **Schema fix — articles has NO `slug` column.** Slug lives on `stories`. The reader at `/[slug]/page.tsx` (lines 68-72) resolves the URL slug against `stories.slug`, then loads articles via `story_id`. Implementer must JOIN stories on the admin SELECT.
   - **Lines 22-25 (`ArticleRow` type):** add `stories: { slug: string | null } | null;`
   - **Line 93 (SELECT string):** before `'*, categories!fk_articles_category_id(name), users!author_id(username)'`; after `'*, categories!fk_articles_category_id(name), users!author_id(username), stories!articles_story_id_fkey(slug)'`. **FK name is `articles_story_id_fkey` (`_fkey` suffix), NOT `fk_articles_story_id`** — non-standard for this codebase but confirmed in `web/src/types/database.ts:1747`.

2. **Row click branching at lines 280-284.** Replace the always-editor `onRowClick` with:
   - **Published adult article AND has slug AND has story_id AND not deleted** → `router.push(\`/\${row.stories.slug}?a=\${row.id}\`)`. The `?a=<articleId>` is required because a story can have multiple articles; without it, the reader defaults to most-recent-published (`/[slug]/page.tsx:80-82, 87`) and the admin lands on a different article than they clicked.
   - **Otherwise** (draft, archived, kid audience, missing slug, missing story_id, soft-deleted, or non-`'published'` status) → existing editor branching: `r.is_kids_safe ? \`/admin/kids-story-manager?article=\${r.id}\` : \`/admin/story-manager?article=\${r.id}\``.
   - Use **strict positive equality** `r.status === 'published'` (lowercase string), NOT `r.status !== 'draft'` — `archived`, `unpublished`, etc. are also non-`'published'` and must route to admin.
   - **Why kids stay in admin:** `/[slug]/page.tsx:104` has a COPPA `notFound()` for kids/tweens articles. Published kids articles via the public reader → 404. Per `kids_scope` memory (kids = iOS only; kids web is redirect-only), there is no web reader for kid articles.

3. **Quiz pool button (line 240) stays editor-bound** (it's an editing affordance).

4. **New article button (lines 270, 337) stays at `/admin/story-manager?new=1`** (correct as-is).

5. **Existing `e.stopPropagation()` wrapper at line 227** already prevents action-button clicks from firing the row click. No change needed.

### Other admin surfaces — scope strictly to `/admin/stories`

- `web/src/app/admin/newsroom/page.tsx:456` already does `router.push('/${json.slug}')` after publish — pattern is consistent with this item.
- `web/src/app/admin/newsroom/_components/AudienceCard.tsx:402` always opens editor — different surface, leave alone.
- `/admin/top-stories`, `/admin/comments`, `/admin/reports` — none of these route to `/[slug]` or `/admin/story-manager` from a row click today; no bleed-through to fix.

### Soft concerns flagged for item 11 (not this item)

- **View-count pollution:** `incrementViewCount` fires unconditionally at `/[slug]/page.tsx:228`. Admin views will pollute counts. **Coordinate with item 11 god-mode bypass** — anyone with `admin.god_mode` (or admin role) should skip the increment. Don't ship in item 3.
- **Analytics pollution:** `ArticleTracker` analytics fires on view at `/[slug]/page.tsx:251`. Same coordination — item 11 should suppress for god-mode users.

### Optional symmetric polish (skip unless owner asks)

- Add an admin-only "Edit in story-manager" pill on `/[slug]` for round-trip ergonomics (matches item 12's `Open in admin →` overlay pattern). ~5 lines. Defer unless owner says yes.

### Verification (Phase 4)

1. **Web build:** `cd /Users/veritypost/Desktop/verity-post/web && npm run build`. Must pass (the new SELECT join + the `stories` field on `ArticleRow` are type-checked).
2. **Dev-server smoke** (admin role required):
   - Click a published adult row → lands on `/${storySlug}?a=${articleId}` and renders the reader.
   - Click a draft row → lands on `/admin/story-manager?article=<id>` (or `/admin/kids-story-manager` for kid audience).
   - Click a published kid row → stays on `/admin/kids-story-manager` (COPPA notFound prevention).
   - Click an orphan published row (no `story_id`) → falls back to admin (no `/undefined` URL).
   - Click Edit on any row → routes to the correct editor (kids vs adult).
   - Quiz pool / Publish / Delete buttons unchanged.

### Platforms

- Web: yes — the change above.
- iOS: no admin surface. Not applicable.
- Kids iOS: no admin surface. Not applicable.

---

## 4. Surface the AI provider/model picker in admin generation

**What to change:** owner can't pick which AI provider (OpenAI / Anthropic) or model to use when generating articles. The picker component **already exists** but is never mounted anywhere in the admin UI.

**Source:**
- `web/src/components/admin/PipelineRunPicker.tsx` — built component with provider + model dropdowns sourced from `ai_models` table (line 4-22 doc comment). Has zero consumers (`grep -rn PipelineRunPicker` confirms only the file itself).
- The `ai_models` table is the source of truth for available provider/model combos and pricing (`web/src/lib/pipeline/call-model.ts:131-138`). Calls without a row throw `ModelNotSupportedError`.
- Generation triggers (admin UI buttons that kick off pipeline runs) need to pass `provider` + `model` to the run API. Today they presumably use a hardcoded default.

**Decision needed before implementing:**
- Where does the picker mount? Candidates: `/admin/story-manager` (per-article generation), `/admin/pipeline-config` (global default), or both (default + per-run override).
- Confirm the `ai_models` table is populated. Run `select provider, model from ai_models` via Supabase MCP before building UI on top of it — empty table means picker shows nothing.
- Identify the API route(s) that trigger generation and confirm they accept `{ provider, model }` in the body. If not, that's a prerequisite change.
- Decide default behavior when no override is picked (fall back to a config row? hardcoded?).

**Platforms:**
- Web admin: yes — the change above.
- iOS: no admin surface. Not applicable.
- Kids iOS: no admin surface. Not applicable.

---

## 5. Avatar initials — cap at 3 alphanumeric characters (any case)

**What to change:** avatar initials currently allow up to 4 characters on web and don't strictly filter to alphanumeric. Owner wants up to **3 letters or numbers, any case** — matching the iOS rule already in place.

**Source (web — needs change):**
- `web/src/components/Avatar.tsx:46` — `const initials = raw.slice(0, 4).toUpperCase();` → change `4` to `3`. Owner said "any case" so consider whether to keep `.toUpperCase()` (it normalizes the rendered glyph regardless of stored case — probably fine to keep for visual consistency, but flag the choice).
- `web/src/components/Avatar.tsx:49` — font-size ramp keys off `length >= 4` / `>= 3` / else. With max length now 3, drop the `>= 4` branch and recompute the ramp (e.g. `length >= 3 ? 0.30 : length >= 2 ? 0.34 : 0.36`).
- `web/src/app/profile/_components/AvatarEditor.tsx:108, 119, 134` — three `.slice(0, 4)` calls; change to `.slice(0, 3)`.
- `web/src/app/profile/_components/AvatarEditor.tsx:257` — `maxLength={4}` on the `<input>`; change to `3`.
- `web/src/app/profile/_components/AvatarEditor.tsx` — there is **no alphanumeric filter** on input today. Add an `onChange` that strips non-alphanumeric (mirroring iOS `filter { $0.isLetter || $0.isNumber }`). Whitespace, punctuation, emoji should not survive.
- Update the input helper/placeholder copy if it says "4" anywhere — search for "4 character" / "up to 4" inside `AvatarEditor.tsx`.

**Source (iOS — already correct, verify only):**
- `VerityPost/VerityPost/ProfileView.swift:1997` — `String(existingInitials.prefix(3))` ✓
- `VerityPost/VerityPost/ProfileView.swift:2002, 2031` — filter to letters/numbers + cap at 3 ✓
- `VerityPost/VerityPost/ProfileView.swift:2024` — placeholder reads "Up to 3 letters or numbers" ✓
- `VerityPost/VerityPost/SettingsView.swift:1318-1326` — same filter + `.prefix(3)` ✓

**Server validation (do not skip):**
- The avatar shape is persisted as JSON in `user.avatar.initials`. Whatever server endpoint accepts the avatar PATCH must also enforce `length <= 3` and alphanumeric — client caps are bypassable. Find the route that writes `avatar.initials` (likely under `web/src/app/api/`) and add the same constraint there. If a stricter cap exists at the DB layer (check/CHECK constraint on the JSON shape), update it too.

**Platforms:**
- Web: yes — the changes above (Avatar.tsx, AvatarEditor.tsx, server route).
- iOS: already correct, verify the three source locations still match.
- Kids iOS: no initials-based avatar component found (`grep initials` returned no results). Confirm kids uses a different avatar scheme (illustrated picker?) and mark not applicable; if kids ever adopts initials, apply the same 3-char alphanumeric rule.

---

## 6. Reading-streak heatmap — explain what the squares mean

**What to change:** owner likes the heatmap visually but says it's unreadable — there's no header, no legend, no caption explaining that each square is one of the last 30 days and a filled square means "read that day". iOS already does this; web does not.

**Source (web — needs change):**
- `web/src/app/profile/_sections/ActivitySection.tsx:363-404` — `ReadingHeatmap` component renders 30 squares in a grid with no surrounding context, only a title-tooltip date on hover. The streak counter row at lines 398-401 ("Current streak · X days · Best · Y days") sits *below* the grid and never tells the reader the grid IS the streak.
- Add (matching iOS, see below):
  1. **Header above the grid** — e.g. "Last 30 days" (iOS uses this exact phrase).
  2. **Inline summary** to the right of the header — e.g. "X read · Y-day streak" so the number and the visual line up at a glance.
  3. **Legend below the grid** — two dots labeled "Read" and "Missed" (iOS pattern), using the same colors as the squares (`C.accent` for read, `C.surfaceSunken` for missed).
- Keep the existing "Current / Best" row but consider whether it duplicates the new summary. If it does, drop the per-day "Current streak" mention from the row and keep only "Best · N days".

**Source (iOS — already correct, reference for parity):**
- `VerityPost/VerityPost/ProfileView.swift:461-510` — `streakStrip()` function. Renders:
  - Header `Text("Last 30 days")` (line 470)
  - Summary `Text("\(readDaysIn30) read · \(current)-day streak")` (line 474)
  - Grid of 30 squares (lines 484-499) with three colors: `streakActive` (read), `streakMissed` (missed), `streakTrack` (future — N/A on web since web only renders past 30 days)
  - Legend `legendDot(...)` for Read and Missed (lines 506-507)
- Web should match this structure and copy.

**Platforms:**
- Web: yes — add header + summary + legend to `ReadingHeatmap`.
- iOS: already correct, no change.
- Kids iOS: kids product is iOS-only (per scope memory) and likely doesn't show a streak heatmap. Check `VerityPostKids` for any reading streak surface; if absent, mark not applicable.

---

## 7. Remove streaks and "read this many" from the adult product (web + iOS)

**Locked decisions (owner, 2026-05-01):**
- **Kids iOS keeps streaks unchanged** — kids = funner. Adult-side purge only.
- **Strip the parent's kid-streak block** in `VerityPost/VerityPost/FamilyViews.swift:486, 513` (the `statBlock("Streak", value: streak)` row) and drop the supporting `@State private var streak = 0`. Parent is an adult; adults shouldn't see streak language anywhere. Privacy-policy mention at `:742` stays (legal notice).
- **Web profile 30-day grid is dropped entirely** — not kept as a non-streak "activity" grid. Removes both the grid AND the streak counters in `web/src/app/profile/_sections/ActivitySection.tsx:233, 363-404`.
- DB columns (`users.streak_current`, `users.streak_best`, `users.articles_read_count`) stay per launch-hides convention. Achievement rows with `reading_count` / `streak_days` criteria are filtered out client-side; rows stay.


**What to change:** strip every adult-facing surface that shows reading streaks ("X-day streak", "current streak", streak heatmap, streak freezes, streak celebrations) **and** lifetime/period read counts ("Articles read", "X of Y read today", reading-count milestones, "Top Readers" rankings). Applies to web and adult iOS. Kids product is out of scope (kid sees streaks in their own app); adult-facing surfaces *about* a kid (e.g., a parent looking at their kid's stats inside the adult app) are also in scope — see open question below.

> **Note:** this supersedes item 1 (date/edition/timezone removal subsumes the home read counter) and item 6 (improving the streak heatmap legend — moot if the heatmap is removed). Delete items 1 and 6 from the work list once item 7 is scoped, OR keep them as separate phases if the streak removal lands later.

### Web — surfaces to remove

- **Profile → Activity tab — streak heatmap and streak counters**
  - `web/src/app/profile/_sections/ActivitySection.tsx:48-49, 87, 100-119, 233, 363-404` — delete `streakCurrent` / `streakBest` state, the `users.streak_current/streak_best` fetch, the `<ReadingHeatmap>` mount, and the entire `ReadingHeatmap` component (including the "Current streak · N days" / "Best · N days" row). Decide whether the 30-day "read days" grid stays as a *non-streak* activity heatmap or goes entirely; default = remove the whole grid since the user's complaint was that the squares are meaningless without the streak framing.
- **Profile → You tab — Articles-read stat tile**
  - `web/src/app/profile/_sections/YouSection.tsx:65` — remove `<StatTile label="Articles read" value={u.articles_read_count ?? 0} />`. The other tiles (Quizzes, Comments, Followers, Following) stay.
  - `web/src/app/profile/_sections/YouSection.tsx:5, 40, 85` — drop streak-related comments and the unused `articles_read_count` field from the local user prop type once the tile is gone.
- **Profile → Milestones — reading-count and streak-day achievement criteria**
  - `web/src/app/profile/_sections/MilestonesSection.tsx:50, 53, 252-258, 395, 411-418` — remove `reading_count` and `streak_days` from the criteria union, the counter mapping, and the gap-hint switch. Achievements rows in the DB whose `criteria` JSON keys on `reading_count` or `streak_days` won't render gap hints anymore — decide whether to delete those achievement rows in DB, or leave them un-progressable. Default: hide them from the milestones grid entirely (filter them out).
- **Profile palette/keywords copy**
  - `web/src/app/profile/_components/ProfileApp.tsx:235, 236, 308` — strip "streak" from the dashboard `reason` copy and from the keyword arrays so command-palette searches don't surface it.
- **Public profile (`/u/[username]`)**
  - `web/src/app/u/[username]/page.tsx:606-607` — remove the `<b>{articles_read_count}</b> Articles read` stat.
  - `web/src/app/u/[username]/page.tsx:305` — remove "streak" from the "Profiles show reading history, Verity Score, **streak**, comments…" anon teaser copy.
  - `web/src/app/u/[username]/page.tsx:56, 191` — drop `articles_read_count` from the typed columns + the SELECT once unused.
- **Leaderboard**
  - `web/src/app/leaderboard/page.tsx:35` — `'Top Readers'` tab. Remove the tab entirely (it ranks by `articles_read_count`).
  - `web/src/app/leaderboard/page.tsx:78-99, 326-329` — drop the `articles_read_count` ordering branch.
  - `web/src/app/leaderboard/page.tsx:170, 204, 248, 316, 338` — strip `streak_current` and `articles_read_count` from the SELECT column lists.
  - `web/src/app/leaderboard/page.tsx:643, 754, 768, 924-994` — remove the `streak={u.streak_current || 0}` prop wiring and the `{streak} day streak` sub-line in the row component.
- **Home — "X of Y read today" counter** (already flagged as item 1, reinforce here)
  - `web/src/app/page.tsx:322, 364-368` — remove `readTodayCount` and the "X of Y read today" chip.
- **Pricing / help — streak freezes feature line**
  - `web/src/app/pricing/page.tsx:157` — remove `'Streak freezes (2 per week)'` from the plan feature list.
  - `web/src/app/help/page.tsx:116` — remove "and streak freezes" from the plan-description sentence.
- **Editorial guide — leave alone**
  - `web/src/lib/pipeline/editorial-guide.ts:626, 639` — these reference a "win streak" inside *story content* (e.g., a sports article noting a team's win streak). Not a user-reading streak. **Do not touch.** Same for `:179` "today's" — it's about news recency.

### iOS adult (`VerityPost/`) — surfaces to remove

- **ProfileView — streak strip + heatmap + helpers + copy**
  - `VerityPost/VerityPost/ProfileView.swift:108-113, 187, 192, 461-510, 1628-1680, 1693` — delete `streakDays`, `streakLoaded`, `streakGridReveal`, the entire `streakStrip(_:)` view (461-510), `loadStreak`, `streakISO`, `readDaysIn30`, and the related grid helpers/animations.
  - `VerityPost/VerityPost/ProfileView.swift:159` — remove the `streakStrip(user)` mount in the body.
  - `VerityPost/VerityPost/ProfileView.swift:1065` — remove the inline streak stat (`"\(streakCurrent ?? 0)d", label: "streak"`).
  - `VerityPost/VerityPost/ProfileView.swift:289` — drop "streaks" from the anon "Sign in to track reading, quizzes, **streaks**, bookmarks, and achievements." copy.
  - `VerityPost/VerityPost/ProfileView.swift:818, 1451` — remove "or hit your first streak" from the empty badge-state copy.
  - `VerityPost/VerityPost/ProfileView.swift:13, 26, 31, 35, 64, 148` — header comments that describe streak grid; update so future readers don't get misled.
- **Public profile**
  - `VerityPost/VerityPost/PublicProfileView.swift:150` — drop "streak" from "Profiles show reading history, Verity Score, **streak**, comments…" copy.
  - `VerityPost/VerityPost/PublicProfileView.swift:370` — remove `streak_current` and `articles_read_count` from the SELECT.
- **Leaderboard**
  - `VerityPost/VerityPost/LeaderboardView.swift:432` — remove the `StatRowView(label: "Streak", …)` row.
  - `VerityPost/VerityPost/LeaderboardView.swift:548` — remove the `articles_read_count` ordering query branch (and the corresponding tab/segment if "Top Readers" exists; verify around the tab definitions).
  - `VerityPost/VerityPost/LeaderboardView.swift:30-31, 642` — strip `articles_read_count` and `streak_current` from `USER_COLUMNS` and the doc comment.
- **Story detail — post-read streak celebration toast**
  - `VerityPost/VerityPost/StoryDetailView.swift:131-132, 493, 2056-2057` — remove `showStreakCelebration`, `streakCount`, the animation modifier, and the `Text("Streak: \(streakCount) days!")` overlay.
  - Anywhere this celebration is *triggered* after a successful read (search for `showStreakCelebration = true`) — remove the trigger so the toast logic is fully gone.
- **Subscription / paywall**
  - `VerityPost/VerityPost/SubscriptionView.swift:414` — remove `"Streak freezes (2 per week)"` from the plan feature list (mirrors web pricing change).
- **IAP product**
  - `VerityPost/VerityPost/StoreManager.swift:487` — `case "ask_expert", "streak_freeze", "ad_free":` references a `streak_freeze` consumable. **Do not delete the case** until App Store Connect-side product is also retired (orphaned IAP IDs cause review failures). Open question: is `streak_freeze` an active SKU in App Store Connect? If yes, retire the SKU first, then remove this case.
- **Theme palette**
  - `VerityPost/VerityPost/Theme.swift:54-59` — `streakTrack` / `streakMissed` / `streakActive` colors. Once all consumers are removed, delete these tokens. Until then they're dead code referenced by `:769, 771, 774, 813, 1239` in ProfileView (badge skeletons that reuse `streakTrack` as a generic placeholder). After streak removal, rename those usages to a neutral `placeholder` token or inline the color, then delete the streak-named tokens.
- **Models / data**
  - `VerityPost/VerityPost/Models.swift:25-26, 53, 83-86` — `VPUser.streakCurrent`, `streakBest`, the `streak` computed alias, and the CodingKeys entries. Remove **after** all consumers are gone (compiler will catch stragglers). Same for `articlesReadCount`.
  - `VerityPost/VerityPost/AuthViewModel.swift:1230` — drop `articles_read_count, streak_current, streak_best` from the user-fetch SELECT once the model fields are gone.

### Open questions before implementation

1. **Family/parent view of kid stats.** `VerityPost/VerityPost/FamilyViews.swift:486, 513, 742` shows a parent (an adult, in the adult app) their kid's streak via `statBlock("Streak", value: streak)` plus a privacy-policy mention of "responses, and streak activity". Owner said "remove anything from adults that mentions streaks." Two readings:
   - **Strict:** remove the streak stat block from the parent's kid-overview too — adults shouldn't see streak language anywhere. Privacy-policy copy stays (it's a legal notice about kids data).
   - **Looser:** parent-of-kid views are part of the kid product surface even though rendered in the adult app; keep.
   - **Default unless owner says otherwise:** strict reading. Remove `statBlock("Streak", value: streak)` and the `@State private var streak = 0` it depends on.
2. **Database columns.** `users.streak_current`, `users.streak_best`, and `users.articles_read_count` are written by triggers/RPCs on `reading_log` insert. Per the launch-hides memory ("hide via gates/flags, keep state + queries + types alive so unhide is one-line flip"), **do not drop the columns or stop writing them**. Just stop reading them from the UI. This keeps the data warm if the decision reverses and avoids an invasive migration.
3. **Achievements with `reading_count` / `streak_days` criteria.** Likely several rows in the `achievements` table key off these counters. Default: filter them out of the milestones grid client-side (don't render rows whose criteria reference removed counters). Don't delete the rows — same hide-not-rip principle.
4. **Kids iOS / kids web.** Per scope memory, kids = iOS only and kids web is redirect-only. Adult-side change set above does not touch `VerityPostKids/`. **Confirm:** does kids iOS itself still keep streaks? Owner said "from adults" — assumed yes. Verify by checking `VerityPostKids` for streak surfaces; if kids is also dropping streaks, that's a separate item.
5. **Notifications and emails** that mention streaks (e.g., "you're on a 5-day streak — read today to keep it!"). Search `web/src/app/api/` notification templates and `VerityPost/VerityPost/` for any streak-related copy in push/email notification builders. If any exist, retire them.

### Platforms summary
- Web: large change set above.
- iOS adult: large change set above.
- Kids iOS: out of scope for this item; verify nothing in the adult slice reaches into kids code, and confirm separately whether kids should also drop streaks.

---

## 8. Profile stat numbers look bad on web — restyle

**Locked decision (owner, 2026-05-01):** Direction A — sans-serif, bold weight, larger numbers with tighter letter-spacing. "Make it look like a data dashboard you're winning, not an editorial column." Drop the serif at display size; switch `FONT.serif` → `FONT.sans`, weight 600 → 700, ease `letterSpacing` from `-0.02em` to `0`, consider non-uppercase label.


**What to change:** owner's quote: "your numbers at least on web is fucking shit looking." The big numeric values inside the profile stat tiles (Quizzes / Comments / Followers / Following — and Articles read until item 7 lands) read poorly. This is qualitative feedback, so the spec needs to be settled with the owner before implementing; below is the surface and the levers to try.

**Source:**
- `web/src/app/profile/_components/StatTile.tsx:46-57` — the value `<div>` uses `FONT.serif` at `F.display` size with `fontWeight: 600`, `letterSpacing: '-0.02em'`, `lineHeight: 1.05`, color `C.ink`.
- The label sits at `F.sm` muted uppercase above (lines 35-45). The hint, if present, sits below at `F.sm` muted (lines 58-68).
- Resolved values: `F.display` and `FONT.serif` come from `web/src/app/profile/_lib/palette.ts` — open it before tweaking so you know the actual rem value of `F.display` and which serif stack is mounted.

**Likely culprits to interrogate (pick after owner confirms direction):**
1. The serif at very large size with weight 600 reads thin/awkward against muted-grey labels — try `FONT.sans` for numbers, or bump to weight 700.
2. `letterSpacing: '-0.02em'` is aggressive on small numbers like `0` — drop to `0` or `-0.01em`.
3. Label is uppercase at `F.sm` muted — feels heavier than the hero number, inverting the visual hierarchy. Try `F.xs` or non-uppercase.
4. Tile padding (`S[5]`) + min height — numbers may be cramped vertically. Confirm with owner if the issue is the *number* or the *tile*.

**Before implementing, ask owner:** is the issue the typeface, the size, the weight, the alignment, or the whole tile aesthetic? Two reasonable directions:
- **Direction A — "make it less precious":** sans-serif, bold, smaller display size, tighter tile.
- **Direction B — "make the serif actually work":** keep serif but bump weight to 700, ease letter-spacing, raise contrast on the number, mute the label more.

**Platforms:**
- Web: yes — the StatTile change above. Check every consumer of `StatTile` (`grep -rn "StatTile" web/src`) so the restyle lands consistently.
- iOS adult: iOS has its own stat-row styling (`VerityPost/VerityPost/ProfileView.swift` uses `inlineStat` + similar helpers). Owner specifically said "at least on web" — iOS not in scope unless owner opens it. Mark not applicable for now.
- Kids iOS: not applicable (different shell).

---

## 9. Adults don't have passwords — hide the password UI (do not delete)

**What to change:** adult auth is OTP-only (login page header at `web/src/app/login/page.tsx:1-3`: "OTP-only single-door entry point. Single email form → 6-digit code. No tabs, no invite code, no password."). The settings UI still surfaces a "Password" card and "Change password" affordances, which is dead UI for adults. Per launch-hides convention (memory: hide via gates/flags, keep state + queries + types alive), **hide but do not delete** the password surfaces.

**Source — surfaces to hide on web:**
- `web/src/app/profile/settings/_cards/PasswordCard.tsx` — the entire card. Don't delete; instead don't render it. Remove its mount from `web/src/app/profile/_sections/SecuritySection.tsx` (or wherever it is mounted today; grep `PasswordCard` to confirm one consumer).
- Any nav/menu/link copy referencing "Password" or "Change password" inside the profile settings shell — search `Password` in `web/src/app/profile/settings/` and the AppShell sidebar (`web/src/app/profile/_components/AppShell.tsx`). Hide those entries.
- `web/src/app/profile/_sections/SecuritySection.tsx` — verify the section still has substance after removing password (MFA, sessions, etc. should remain; if password was the only item, hide the whole section).

**Source — leave intact (server / kid product):**
- `web/src/app/api/auth/verify-password/route.js` — back-end endpoint. Leave; might be reachable from kid product or from a future password mode. Just nothing in the adult UI calls it.
- `web/src/app/api/kids/reset-pin/route.js:56` — kid PIN reset uses `signInWithPassword` internally (parent provides their *adult* password to authorize the reset). **Open question:** if adults truly have no password, this kid-reset flow is broken. Verify the flow uses OTP / current-session re-auth, not password. If it expects a password that doesn't exist, file a separate fix.
- `web/src/app/profile/settings/_cards/MFACard.tsx` — confirm MFA card doesn't ask for current password as a step factor. If it does, that step is also dead.

**Source — iOS adult:**
- `VerityPost/VerityPost/` — search `password\|Password\|signInWithPassword`. Adult iOS likely already uses OTP (matches web), but any "Change password" UI in `SettingsView.swift` or `AccountView.swift` should be hidden the same way.
- If iOS doesn't currently expose any password UI, mark not applicable and move on.

**Open question for owner:**
- Is this permanent, or is password login a "maybe later" feature? If permanent, after some time we should also rip the back-end endpoints. If "maybe later," keeping them is the right call now (which is what this item says).

**Platforms:**
- Web: yes — hide the card + nav entries.
- iOS adult: confirm whether any password UI exists; hide if so.
- Kids iOS: kids product is a separate flow; out of scope unless the parent-side adult password is required for kid PIN reset (see open question above).

---

## 10. Lock the username — pickable at signup, not editable after

**What to change:** users can currently change their @handle from settings. Owner wants the username to be set once at signup and never editable afterward. The pick-at-signup flow stays (item 13's WelcomeModal/PickUsernameView sheet); the post-signup editor becomes a read-only display.

**Locked decisions (owner, 2026-04-30):**
- **Self-edit:** disabled.
- **Admin override:** YES. Admins can rename via `/admin/users/[id]` (UI lands in item 12; backend bypass lands here).
- **Implementation Option A** (read-only display row + drop `username` from RPC payload).
- **Three-layer server enforcement:** RPC guard + `/api/auth/save-username` route mirror + `users_protect_columns` trigger addition. All three must land in one commit — partial deploys leave bypass surfaces.

**Pre-impl gates (both required before implementer touches code):**
1. Pull live `update_own_profile` source via Supabase MCP: `select pg_get_functiondef(oid) from pg_proc where proname = 'update_own_profile';` — RPC is not in `supabase/migrations/`. **Do not write a CREATE OR REPLACE without the current source in hand.**
2. Confirm `is_admin_or_above()` predicate exists: `select pg_get_functiondef(oid) from pg_proc where proname = 'is_admin_or_above';` — already used by `users_protect_columns:369` in `supabase/migrations/2026-04-29_combined_unapplied.sql`. Reuse it. Do NOT invent `is_admin()`.

### Phase 1 — Server RPC

**Discovery (2026-05-01, post-pre-impl):** the live `update_own_profile` RPC already has a *silent partial lock* in the form of a CASE clause inside the UPDATE:
```sql
username = CASE
             WHEN p_fields ? 'username' AND u.username IS NULL
               THEN NULLIF(p_fields->>'username', '')::varchar
             ELSE u.username
           END,
```
This means today: a logged-in user's rename request returns `{ok: true, updated_at: ...}` but the column is preserved. UI shows success; nothing changed. There is **no admin bypass** in this clause — even owners can't rename via the RPC. The empty-string trap is also live: `u.username = ''` is `NOT NULL`, so even first-pick fails for any user whose row has empty-string.

**New migration `supabase/migrations/<YYYYMMDD>_lock_username_in_update_own_profile.sql`:** `CREATE OR REPLACE` the entire RPC. The full source is in this conversation log under "owner-pasted RPC body 2026-05-01" — pull it from there, then make these two changes:

1. **Add an explicit guard near the top** (after `auth.uid()` resolution, before the UPDATE statement):
   ```sql
   IF (p_fields ? 'username') THEN
     DECLARE
       v_current text;
     BEGIN
       SELECT username INTO v_current FROM public.users WHERE id = v_uid;
       IF coalesce(nullif(v_current, ''), null) IS NOT NULL
          AND NOT public.is_admin_or_above() THEN
         RAISE EXCEPTION 'username locked' USING ERRCODE = '42501';
       END IF;
     END;
   END IF;
   ```
   - **Critical wording: `coalesce(nullif(v_current, ''), null) IS NOT NULL`, NOT `IS NOT NULL`.** Empty-string trap fix.
   - The guard converts the silent no-op into an explicit 42501 error so UI knows the rename failed.
   - Admins and owners pass through (`is_admin_or_above()` returns true).

2. **Simplify the username CASE clause in the UPDATE** since the guard now enforces who can write:
   ```sql
   username = CASE
                WHEN p_fields ? 'username'
                  THEN NULLIF(p_fields->>'username', '')::varchar
                ELSE u.username
              END,
   ```
   (Removed the `AND u.username IS NULL` condition — guard handles it.)

3. **Preserve everything else verbatim.** Don't touch the kid-delegated check, the not-authenticated check, the jsonb-typeof check, the other CASE columns, the `RETURNING`, or the `RETURN` block. The `SECURITY DEFINER`, `SET search_path`, language declarations all stay.

`42501` matches the existing `users_protect_columns` trigger convention.

### Phase 2 — `/api/auth/save-username` route mirror

- File: `web/src/app/api/auth/save-username/route.ts`. After the auth check (~line 51) and before the RPC call (~line 89), add:
  ```ts
  // Defense-in-depth: short-circuit before hitting the RPC so iOS doesn't
  // see 42501 mapped through the P0002 retry loop in AuthViewModel.swift:639.
  const { data: existing } = await service
    .from('users')
    .select('username')
    .eq('id', user.id)
    .maybeSingle();
  if (existing?.username && existing.username !== '') {
    const { data: isAdmin } = await service.rpc('is_admin_or_above');
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Username already set on this account.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }
  ```
- **Critical: explicit 403 (not generic 500).** Cross-device first-pick race (web saves first, iOS hits the route second) currently returns 500 from the route's catch-all. iOS user sees "Couldn't save" with no recovery hint. The 403 with explicit copy lets iOS show "your username is already set on another device" and call `auth.loadUser()` to dismiss the sheet.
- Update header comment (lines 1-18) to document the lock behavior alongside the existing 409 race contract.

### Phase 3 — `users_protect_columns` trigger

- New migration `supabase/migrations/<YYYYMMDD>_protect_users_username.sql` that `CREATE OR REPLACE`s `public.users_protect_columns` (current at `supabase/migrations/2026-04-29_combined_unapplied.sql:792-879+` and `2026-04-29_auth_redesign_consolidated.sql:354-415`). Add a username block before `RETURN NEW`:
  ```sql
  IF OLD.username IS NOT NULL AND OLD.username <> ''
     AND NEW.username IS DISTINCT FROM OLD.username THEN
    RAISE EXCEPTION 'users.username is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  ```
- Existing admin/service-role/auth_sync bypasses at the function top (lines 803-810 / 366-373) already short-circuit before reaching this block. Item 12's admin endpoint uses service-role, so it sails through. The only path that hits the lock is end-user PostgREST/RPC writes — which is exactly the intended scope.
- Defense-in-depth for any future writer that bypasses `update_own_profile`. The trigger only catches non-RPC writers since the RPC uses SECURITY DEFINER and bypasses triggers.

### Phase 4 — `IdentityCard.tsx` (web)

File: `/Users/veritypost/Desktop/verity-post/web/src/app/profile/settings/_cards/IdentityCard.tsx`. **Atomic edit — do all of these in one pass:**

1. Line 30 — drop `const [username, setUsername] = useState(user.username ?? '');`.
2. Lines 35, 39, 44 — drop `username` from `JSON.stringify({ displayName, username, bio })` in initialRef seed, useEffect re-seed, and dirty calc. Dirty becomes `{ displayName, bio }` only.
3. Lines 53-55 — drop `username` from `p_fields`. Payload becomes `{ display_name: displayName, bio }`.
4. Lines 60-63 — drop the `if (/username/i.test(msg)) setErrors({ username: msg })` branch.
5. Line 67 — drop `username` from the optimistic `onUserUpdated` merge.
6. Line 69 — drop from post-save `initialRef.current` reset.
7. Lines 105-125 — replace the `<Field label="Username" hint=... error=...>` block with a static read-only row:
   ```tsx
   <Field label="Username" hint="Usernames are set at signup and can't be changed.">
     {(id) => (
       <div id={id} style={{ ...inputStyle, background: C.surfaceMuted, color: C.text }}>
         <span style={{ color: C.inkMuted }}>@</span>{user.username ?? '—'}
       </div>
     )}
   </Field>
   ```

### Phase 5 — `SettingsView.swift` (iOS)

File: `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/SettingsView.swift`. **Atomic edit — partial removal causes regression:**

1. Lines 1372-1376 — replace `SettingsTextField(label: "Username", ..., text: $username, ...)` with a read-only row:
   ```swift
   HStack {
     Text("Username").font(.caption).foregroundColor(VP.dim)
     Spacer()
     Text("@\(originalUsername)").foregroundColor(VP.text)
   }
   Text("Usernames are set at signup and can't be changed.")
     .font(.caption2).foregroundColor(VP.dim)
   ```
2. **Keep `@State var username` declaration and `onAppear` seeding** (line 1414, 1419) — `originalUsername` is derived from it and the avatar-initials fallback at line 1449 still reads it. Just stop binding it to any input.
3. Line 1402 — change `isDisabled: username.trimmingCharacters(in: .whitespaces).isEmpty` to a hoisted dirty check. Add a computed property:
   ```swift
   private var dirty: Bool {
     bio != originalBio
     || avatarOuter != originalAvatarOuter
     || avatarInner != originalAvatarInner
     || avatarInitials != originalAvatarInitials
   }
   ```
   Then `isDisabled: !dirty || saving`. **Without this, Save button is permanently disabled OR always enabled depending on which half the implementer changes.**
4. Line 1452 — drop `let usernameChanged = username != originalUsername`.
5. Line 1458 — change save guard to `guard bioChanged || avatarChanged else { ... }`.
6. Lines 1441, 1466 — drop `var username: String? = nil` from `ProfilePatch` struct AND `if usernameChanged { patch.username = username }`. **Both must go.** Half-removal causes the "5xx loop on stale baseline" — patch sends stale username, RPC rejects, user sees "Couldn't save" toast on every legitimate bio edit.

### Phase 6 — `AuthViewModel.swift` comment cleanup (rolled in from item 13)

File: `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/AuthViewModel.swift`.

1. Line 613 — replace "mirrors web pick-username page" with "mirrors web WelcomeModal first-pick flow."
2. Lines 677-681 — `needsPickUsername` doc-comment. Current text: "ContentView gates on this to push PickUsernameView before MainTabView so a fresh magic-link signup always lands on the picker first." Update to: "ContentView gates on this to present PickUsernameView as an undismissable sheet over MainTabView when this is true, so a fresh magic-link signup is forced through the picker before interacting with the app."

### Phase 7 — Verification

1. **Supabase MCP smoke checks** (`execute_sql` with role + JWT impersonation per case):
   - Non-admin user with existing username → `update_own_profile('{"username":"newname"}'::jsonb)` → expect `42501 username locked`.
   - Same user → `update_own_profile('{"bio":"hello"}'::jsonb)` → expect success.
   - Admin user → `update_own_profile('{"username":"adminrename"}'::jsonb)` → expect success.
   - Fresh user with `username IS NULL` → `update_own_profile('{"username":"firstpick"}'::jsonb)` → expect success.
   - User with `username = ''` (legacy edge case) → `update_own_profile('{"username":"firstpick"}'::jsonb)` → expect success (proves the `nullif` guard works).
   - Direct UPDATE as `authenticated`: `update users set username = 'x' where id = '<non-admin uuid>'` → expect trigger `42501`.
2. **Route-level smoke**: `curl -X PATCH /api/auth/save-username` with a session whose user already has a username → expect explicit 403 with copy "Username already set on this account." (NOT 500, NOT 409).
3. **Build gates:**
   - `cd /Users/veritypost/Desktop/verity-post/web && npm run build`
   - `xcodebuild -project /Users/veritypost/Desktop/verity-post/VerityPost/VerityPost.xcodeproj -scheme VerityPost -destination "generic/platform=iOS Simulator" build`
4. **Audit grep:** `grep -rn "patch.username\|p_fields.*username" /Users/veritypost/Desktop/verity-post/web/src/app/profile/settings /Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/SettingsView.swift` — expect zero matches in self-edit surfaces.

### Untouched (do not edit)

- `WelcomeModal.tsx`, `WelcomeModalMount.tsx` — item 13 surface; first-pick still allowed by the RPC because `username IS NULL/''`.
- `PickUsernameView.swift` — item 13 surface.
- `pick-categories/page.tsx` — does not write username (verified).
- `AvatarEditor.tsx`, `PublicProfileSection.tsx`, `PrivacyCard.tsx` — `update_own_profile` callers but none send `username` in payload (verified).
- `/api/admin/users/[id]/route.ts` — admin rename UI lands in item 12; the trigger and RPC already admin-bypass via `is_admin_or_above()` and service-role bypass.
- `AuthViewModel.swift:599-653` signup path — first-pick RPC call still allowed by guard.

### Edge cases (locked or noted)

1. **Empty-string username trap** — addressed by `coalesce(nullif(..., ''), null)` in the guard. Critical.
2. **Cross-device first-pick race** — web saves first, iOS hits second. Route mirror returns explicit 403 instead of generic 500; iOS shows "Username already set on this account" and calls `auth.loadUser()` to dismiss the sheet.
3. **Service-role direct writes to `users.username`** — none exist outside `/api/admin/users/[id]/route.ts`. **Rule for future maintainers:** no service-role `users.username` write outside that admin endpoint.
4. **Admin under impersonation (item 12):** `auth.uid()` resolves to the impersonated user, so RPC guard blocks rename. **Admins must use `/admin/users/[id]` PATCH (service-role) for renames, never the impersonation flow.** Item 12 inline-edit username surface must hard-error when impersonating.
5. **Account-takeover / abuse rename** — owner-noted as intended behavior (mention integrity is the win). Not a bug.
6. **iOS retry loop:** `AuthViewModel.swift:639-645` retries on `P0002`-substring; `42501` doesn't match. Safe by accident — document so a future maintainer doesn't "fix" the retry to be more permissive.

### Benefits surfaced (not just side effects)

- **Mention integrity:** `comments.mentions` JSONB stores `{user_id, username}` snapshots. Lock guarantees the snapshot stays valid forever (at least for non-admin renames).
- **Referral link stability:** `/r/<username>` (`web/src/app/api/referrals/me/route.ts:117`) — locked handles mean shared referral links never break.
- **Profile/card URL stability:** `/u/[username]`, `/card/[username]` — no need to build a `previous_usernames` redirect table.

### Platforms summary

- Web: `IdentityCard.tsx` + `/api/auth/save-username/route.ts` + new RPC migration + new trigger migration.
- iOS adult: `SettingsView.swift` (read-only display + save-button gate + patch builder) + `AuthViewModel.swift` (comment refreshes from item 13).
- Kids iOS: not applicable — kids has a different handle scheme; no self-edit surface.

---

## 11a. God-mode — owner auto-bypass + server short-circuit + client `isGodMode` (no per-user UI)

**Scope split (owner-locked, 2026-05-01):** the original item 11 was split into 11a (this item — owner-auto-grant + server bypass + client) and 11b (the per-user grant UI, bundled with item 12). 11a ships standalone; 11b builds the toggle infrastructure once for god-mode + item 12's two grant keys.

**What 11a does:** owner gets full bypass automatically via the existing owner role's permission set. Server RPCs short-circuit when caller has `admin.god_mode`. Client paywall components, Plan card, and iOS paywalls all detect `isGodMode` and bypass. **No per-user grant UI in this item** — until 11b lands, only owner has god-mode, and that's enough for now (owner is the only god-mode user at launch).

**Locked decisions (owner, 2026-04-30 + 2026-05-01):**
- Owner role: full bypass, automatic, always on.
- God-mode is per-user grantable (Option B / RPC short-circuit). 11a ships the owner auto-grant; 11b ships the per-user UI.
- Admin role on its own does NOT get god-mode.
- Editor/moderator/expert roles: no auto-bypass. Owner can grant per-user via 11b later.

**Pre-impl gates (mandatory before any code touches):**

1. Pull live RPC sources via Supabase MCP — RPCs are not in `supabase/migrations/`:
   ```sql
   select pg_get_functiondef(p.oid)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('my_permission_keys','get_my_capabilities','compute_effective_perms','has_permission','has_permission_for');
   ```
2. List actual schema for the permission system:
   ```sql
   \d permissions
   \d permission_sets
   \d permission_set_perms
   \d role_permission_sets
   \d user_permission_sets
   \d permission_scope_overrides
   select * from roles where name = 'owner';
   ```
   **Critical: doc earlier said `permission_set_members` and `user_permissions` — both wrong.** Real tables are `permission_set_perms` (set membership) and `user_permission_sets` (per-user set assignment) + `permission_scope_overrides` (per-key with scope_type='user'). Confirm column names: investigator found permissions catalog uses `key` not `permission_key`. **MCP-verify before writing any SQL.**

If MCP unavailable: stop and request RPC bodies + schema dump from owner inline (same protocol as item 10).

### Phase 1 — Server migration

New migration `supabase/migrations/<YYYYMMDD>_admin_god_mode_owner_auto.sql` — single transaction:

1. **Insert `admin.god_mode` into the permissions catalog.** Use the actual column name from the schema dump (likely `key`, not `permission_key`). Description: "Bypass every plan and permission gate."
2. **Create a singleton system permission set** (e.g., `god_mode`) and link it to `admin.god_mode` via `permission_set_perms`. Mirror an existing system set's row shape.
3. **Auto-grant to owner role:** insert into `role_permission_sets` linking the `god_mode` set to the `owner` role.
4. **Backfill the current owner's `user_permission_sets`** so the AuthContext sees god-mode immediately on first login post-migration without waiting for a click. Avoids chicken-and-egg.
5. **Patch all four resolver RPCs** to short-circuit when caller has `admin.god_mode`:
   - `my_permission_keys` — returns every permission key.
   - `get_my_capabilities` — synthesizes `granted=true, granted_via='god_mode', deny_mode=null` for every section row.
   - `compute_effective_perms` — same short-circuit so the admin permissions console shows correct `granted_via` for god-mode users (otherwise rows say `none` and look broken).
   - `has_permission` and `has_permission_for` (single-key SECURITY DEFINER RPCs) — return true.
   Use the `compute_effective_perms` result (or equivalent) to detect god-mode rather than a raw join, so role/set/plan grants of the key all count uniformly.
6. **Filter on active permissions only** — if the catalog has `is_active=false` rows or soft-deletes, exclude them from the short-circuit return so god-mode doesn't claim tombstoned keys.

### Phase 2 — Direct-tier-read API route bypasses (5 routes)

The RPC short-circuit handles permission-gated endpoints. But several routes read `subscriptions.plans.tier` directly and never go through the permission system. Each needs an explicit god-mode bypass at the top:

- `web/src/app/api/family/seats/route.ts:46-63` — `plans!inner(tier) === 'verity_family'`. Owner with god-mode but no Family sub gets `has_active_family_sub: false` → can't manage seats. Add `await hasPermissionServer('admin.god_mode')` check; if true, treat as if Family sub is active.
- `web/src/app/api/family/add-kid-with-seat/route.ts:306` — same `verity_family` literal. Same bypass.
- `web/src/app/api/kids/route.js:108` — same seat enforcement read. Same bypass.
- `web/src/app/api/cron/send-push/route.js:228` — `plans.tier === 'free'` filter. Cron doesn't run as a user, so god-mode is moot here. Verify and document; no code change.
- `web/src/app/api/account/onboarding/route.js:26` — reads `plans?.tier` for branching. God-mode-but-no-plan owners may hit a free-tier onboarding path. Add bypass.

Stripe webhooks (`/api/stripe/webhook/route.js`, `/api/ios/appstore/notifications/route.js`) — billing reconciliation, NOT access. Leave alone.

### Phase 3 — View-count + analytics suppression (deferred from item 3)

- `web/src/app/[slug]/page.tsx:228` — `incrementViewCount` fires unconditionally in the route handler. Gate behind a server-side `await hasPermissionServer('admin.god_mode')` check. If true, skip.
- `web/src/app/[slug]/page.tsx:251` — `ArticleTracker` runs on the client. Read `auth.isGodMode` from `useAuth()` and return early.

### Phase 4 — AuthContext

- `web/src/app/NavWrapper.tsx:53-77` (AuthContext): add `isGodMode: boolean`. Default `false`. **Do NOT add `isAdmin`** — it would collide with the existing path predicate `isAdmin(p: string)` at `:141`. Reuse the existing `canSeeAdmin` flag at `:166` (already computed from `hasPermission('admin.dashboard.view')`) for "user has admin reach" semantics.
- `:226-233` (inside `loadProfile`): after `await refreshAllPermissions()`, compute `const godMode = hasPermission('admin.god_mode');` and store via a new `setIsGodMode` state slot.
- `:79-97` `deriveTier()`: change signature to `deriveTier(user, isGodMode)`. Add **early return BEFORE the `'unverified'` check**: `if (isGodMode) return 'godmode';` — must take priority over unverified state so an owner mid-email-change doesn't flip to unverified-tier semantics.
- `:411-419` provider value: pass `isGodMode` and `userTier: deriveTier(user, isGodMode)`.

### Phase 5 — Component bypasses (3 paywall surfaces)

1. `web/src/components/LockedFeatureCTA.tsx:109+` — at top of body: `const auth = useAuth(); if (auth.isGodMode) return null;`
2. `web/src/components/LockModal.tsx:78-88` — same pattern, return `null` when god-mode (insert above the `if (!isOpen || !capability) return null` line).
3. `web/src/components/PermissionGate.tsx:30-47` and `:115` (default + inline variants) — return `<>{children}</>` when god-mode.

These are belt-and-suspenders for the first-paint window before the perms cache loads. Server short-circuit covers steady-state.

### Phase 6 — Sentinel sweep (just one site)

- `web/src/app/signup/_FeaturedArticle.tsx:28-30` — branches on tier strings; `'godmode'` falls through to the default branch which may render the wrong featured article for owner. Add an explicit `if (tier === 'godmode') return ...` arm matching the desired behavior (probably mirror `verity_pro`).
- **Doc previously cited `bookmarks/page.tsx`, `ArticleQuiz.tsx`, `useTrack.ts` — all already migrated to permission keys or analytics-only.** Nothing to change there.
- `web/src/lib/useTrack.ts:34` — `userTier` will report as `'godmode'` in analytics. New bucket. Document upstream or filter; non-blocking.

### Phase 7 — Plan card

- `web/src/app/profile/settings/_cards/BillingCard.tsx`: import `useAuth`. At top of `BillingCard` body: `const auth = useAuth();`. Branch immediately after the loading check (~line 173):
  ```tsx
  if (auth.isGodMode) {
    return <Card title="Plan" description="Full access (no subscription required).">{null}</Card>;
  }
  ```
- This replaces both the "free tier" branch (`:175-193`) and the cancel/portal block (`:204-294`) for god-mode users. Hides change-plan link, manage-payment portal, cancel/resume.
- `BillingCard` is currently server-fetched but rendered client-side (it has `useState`/`useEffect`); `useAuth` should work without a refactor. Verify during implementation; if it's a server component, convert to client.
- `web/src/app/profile/_sections/PlanSection.tsx` re-exports `BillingCard` — no change needed.

### Phase 8 — iOS mirrors

- `VerityPost/VerityPost/AuthViewModel.swift`: add `@Published var isGodMode: Bool = false`. After loading permission keys (find via `grep -n "my_permission_keys"`), set `isGodMode = keys.contains("admin.god_mode")`. Refresh on session reload (cold launch is the practical refresh granularity per memory; iOS lacks live cache invalidation today — document).
- `VerityPost/VerityPost/RecapView.swift:18, 41, 153` — no change needed. `isPaid` is server-driven; once Phase 1's server short-circuit ships, the recap endpoint's permission check passes for god-mode users → server returns `paid: true` automatically.
- `VerityPost/VerityPost/FamilyViews.swift:54-55` — `maxKids(for tier:)` first line: `if auth.isGodMode { return Int.max }`. Pass `AuthViewModel` in or read from environment.
- `VerityPost/VerityPost/SubscriptionView.swift` — at top of body, branch on `auth.isGodMode`: render single card "Full access (no subscription required)." and hide upgrade CTA, plan list, restore-purchases.
- General iOS sweep: `grep -rn "verity_pro\|verity_family" VerityPost/VerityPost`. Confirm no client-side equality checks treat `'godmode'` as not-paid. List matches in PR body.

### Phase 9 — Verification

1. **Supabase MCP smoke checks** (post-migration; document for owner to run):
   - Owner JWT → `select * from my_permission_keys();` → returns count = `(select count(*) from permissions where is_active = true)`.
   - Non-owner non-god-mode JWT → returns subset.
   - Owner JWT → `select * from get_my_capabilities('quiz');` → all rows `granted=true, granted_via='god_mode'`.
   - Owner JWT → `select * from compute_effective_perms(auth.uid());` → admin permissions console shows correct attribution.
   - Non-owner JWT → same query → no `admin.god_mode` row.
2. **Web build:** `cd /Users/veritypost/Desktop/verity-post/web && rm -rf .next && npm run build`. Must pass.
3. **iOS build:** `xcodebuild -project /Users/veritypost/Desktop/verity-post/VerityPost/VerityPost.xcodeproj -scheme VerityPost -destination "generic/platform=iOS Simulator" build`.
4. **Web smoke** (owner login, dev server):
   - `/profile/settings` → "Full access" card, no change-plan link.
   - `/expert` (or wherever Ask-an-Expert lives) → no paywall.
   - `/bookmarks` → no upgrade CTA.
   - `/admin/users/<other>/permissions` → console shows correct `granted_via` for any user.
5. **Audit greps** in PR body:
   - `grep -rn "userTier ===\|isPaidTier" web/src` — comments only (one in `bookmarks/page.tsx`).
   - `grep -rn "verity_pro\|verity_family" VerityPost/VerityPost` — list matches.

### Cross-item interactions (carry over to 11b / item 12)

- **vs item 10:** `is_admin_or_above()` is the role-based bypass for username rename. God-mode user without admin role won't pass it. Per spec, this is correct (god-mode ≠ admin role). Document in code comments. If owner ever grants god-mode to a non-admin who needs to rename users, item 10's RPC guard would need a god-mode addition — defer to that case.
- **vs item 12 (impersonation):** when admin impersonates user X, `auth.uid()` resolves to X. `hasPermission('admin.god_mode')` reads X's grant. If X has god-mode, the impersonator inherits it for the duration. Owner should never grant impersonate authority on a god-mode target without auditing. Document for item 12.
- **vs item 11b:** the per-user grant UI lands in 11b. Until then, only owner has god-mode (via the auto-grant in Phase 1 step 4). 11b will add the toggle to `/admin/users/[id]/permissions`, gate the API on `requirePermission('admin.god_mode')`, block self-revoke, hide for kid accounts, add confirmation modal, and call `bump_user_perms_version(target)` + `bump_perms_global_version()` after writes.

### Untouched (do not edit)

- `web/src/lib/roles.js` — role Sets unchanged.
- `web/src/lib/auth.js` `requirePermission` / `hasPermissionServer` — unchanged; god-mode passes through automatically once `my_permission_keys` short-circuits.
- `is_admin_or_above()` and item 10 surfaces — no overlap.
- Owner's `subscriptions` row — do not delete/migrate (launch-hides convention); BillingCard branch hides it from the UI without DB writes.
- `bookmarks/page.tsx`, `ArticleQuiz.tsx`, `useTrack.ts` — already migrated to permission keys or analytics-only.

### Platforms summary

- Web: server migration (catalog + role auto-grant + 4 RPC patches) + 5 API route bypasses + view-count/analytics suppression + AuthContext `isGodMode` + 3 component bypasses + sentinel sweep + Plan card branch.
- iOS adult: AuthViewModel `isGodMode` + `FamilyViews` cap + `SubscriptionView` branch. Server endpoints auto-pass via Phase 1.
- Kids iOS: not applicable — kids product is the kid's own account; god-mode doesn't translate.

---

## 11b. Per-user grant UI for god-mode + item 12's two keys (bundled with item 12)

**Status:** blocked on 11a. Bundled with item 12 because item 12 needs the same grant infrastructure for `admin.users.edit` and `admin.users.impersonate`.

**Scope:**
- Extend `web/src/app/admin/users/[id]/permissions/page.tsx` with a "Sensitive grants" section showing toggles for `admin.god_mode`, `admin.users.edit`, `admin.users.impersonate`. Designed for N keys, not hardcoded.
- Toggle writes to `user_permission_sets` (or `permission_scope_overrides`) via the existing `postToggle` helper at `:262`.
- **API gate:** `/api/admin/users/[id]/permissions` write endpoint must `requirePermission('admin.god_mode')` (NOT admin-role membership). Without this, any admin can grant god-mode to anyone. UI gate alone is not security.
- **Self-revoke block:** the granted user cannot revoke their own god-mode (prevents owner self-lockout requiring DB access to recover).
- **Hide for kid accounts:** `hasPermissionServer` already returns false for `kind === 'kid'`; toggle row should not render for kid rows.
- **Confirmation modal on grant:** "Type @username to confirm granting god-mode" — too dangerous to fat-finger.
- **Cache invalidation:** call `bump_user_perms_version(target_user_id)` AND `bump_perms_global_version()` after write so target's client picks up the change within one 60s poll cycle.
- **Audit log:** action strings `god_mode.grant` / `god_mode.revoke` / `users.edit.grant` / `users.impersonate.grant` (etc.). Lock format upfront for item 12 compatibility.
- **Plan card refinement:** branch the BillingCard "Full access" copy on whether the user has an active `subscriptions` row. Owner: original copy. Grantee with active sub: "You have admin access to all features. Your subscription remains active for billing purposes."

**Platforms:** web admin only.

---

## 12. Admin can open any user's profile and edit anything in place (impersonation included)

**What to change:** owner wants to (a) walk into any user's account/profile from the live site, (b) see everything that user has, (c) edit anything from that view — display name, bio, avatar/banner, email, plan, roles, flags, kid profiles — without bouncing through three different admin screens. Today the site has *some* of this scattered across `/admin/users/[id]` (read-only dossier), `/admin/moderation` (ban/role grants), and `/admin/users/[id]/permissions` (permissions). None of it is reachable from the public `/u/[username]` page, and none of it supports inline editing of basic profile fields.

**Locked decisions (owner, 2026-04-30):**
- **Per-user grantable permission model**, mirroring item 11. Two new permission keys:
  - `admin.users.edit` — open dossier, edit any field, manage kids, etc.
  - `admin.users.impersonate` — write-mode impersonation (post / DM / act as user).
- **Owner has both grants automatically.** Other admins start without them. Owner uses the same per-user grant UI in `/admin/users/[id]` (item 11 toggle) to extend either grant to specific staff.
- **Impersonation session length:**
  - **Owner: forever (until logout).** No idle timeout, no absolute timeout. Owner ends impersonation manually by clicking "Exit" in the banner or by logging out (which also drops the impersonation cookie).
  - **Grantees (non-owner staff with `admin.users.impersonate`): 1 hour idle / 4 hour absolute.** Same as the original draft. Owner-to-confirm if they want grantees to have forever sessions too.
- All other Surface 4 safeguards (audit log, sidecar attribution column, mandatory user-notification email digest, no-impersonate-admins/owners/kids, no financial endpoints under impersonation, banner) apply to **everyone including owner**. The forever session is the only owner-specific override.

### Legality (short answer: yes, with caveats)

Allowed under standard platform-operator legitimate interest. Caveats:

- **Privacy policy disclosure required.** `web/src/app/privacy/page.tsx` mentions "fraud, abuse, ToS violations" and "comply with law / protect safety" but does not explicitly say "Verity Post staff may access and edit your account for support, security, and policy enforcement." Add a clause. (Industry-standard wording — Reddit, Discord, Twitter, Substack all carry this.)
- **GDPR (if you have EU users):** lawful basis = legitimate interest, art. 6(1)(f). Document this in your data processing register; the disclosure clause above plus the existing `admin_audit_log` table satisfies it.
- **CCPA / CPRA:** California users get a "right to know" what's being accessed about them. Standard "your account info may be reviewed for support and policy enforcement" language covers it.
- **COPPA (kids under 13):** stricter. Already in scope because Verity Post Kids exists. Parental consent already covers admin access for moderation, but **kid profile edits should require an extra confirmation step** ("This is a kid account — confirm the parent has been notified" or auto-email the parent on the change). Memory: kids = iOS only; the admin console for kids lives at `/admin/kids-story-manager` and `/admin/kids-dob-corrections`.
- **What's NOT okay** (don't build these):
  - Reading message contents that the user reasonably believes are private (DMs) without a clear support/safety reason. The legal exposure here is wiretapping-style claims; tiny risk in most US states, real risk in EU. If you do need it, gate behind "Reason for access" textarea + audit log.
  - Editing financial/identity fields (legal name on billing, payment method) without explicit support-ticket linkage.
  - Note: write-mode impersonation (posting comments / sending messages as the user) **is** in scope — see Surface 4. The safeguards there (audit log, sidecar attribution column, mandatory user notification, no-impersonate-admins/kids, no financial endpoints under impersonation) are what keeps it on the legal side of the line.
- **Operational must-haves:**
  - Every admin write to another user's record goes through `admin_audit_log` (table referenced at `web/src/app/admin/users/[id]/page.tsx:10-12`). Already in place — extend to cover the new edit endpoints.
  - Two-step confirmation on irreversible writes (delete kid profile, hard-delete account).
  - "View as user" sessions show a persistent banner in the chrome (`You are viewing as @username — exit`).
  - No admin write captures or echoes passwords / OTP codes / 2FA secrets.

### What to build — web

#### Surface 1: admin shortcut on the public profile page (`/u/[username]`)

- `web/src/app/u/[username]/page.tsx` is the user-facing profile. For users with `auth.isAdmin` (from item 11), render an admin overlay/strip at the top — e.g., a single row pinned under the banner with:
  - `Open in admin →` (links to `/admin/users/{id}`)
  - `View as @username` (impersonation start — see Surface 4)
  - `Edit profile` (toggles inline edit mode — see Surface 2)
  - Quick badges: `BANNED` / `SHADOW` / `ROLE: editor` etc., mirroring the dossier.
- Keep this strip out of the document for non-admins (no leakage of admin-only UI). Use the `auth.isAdmin` flag from item 11.

#### Surface 2: inline-editable fields on the public profile (admin-only)

- When admin clicks "Edit profile" on `/u/[username]`, swap each editable field for an inline editor. Fields to support:
  - `display_name` (text)
  - `bio` (textarea, 280 chars)
  - `avatar` (the avatar shape — initials + colors; reuse `web/src/app/profile/_components/AvatarEditor.tsx`)
  - `banner_url` (image upload)
  - `username` (text — even after item 10 lock, admins can still rename per the open question in item 10; this is the place to do it)
- All writes go through a new `/api/admin/users/[id]` PATCH endpoint (or extend the existing route at `web/src/app/api/admin/articles/[id]` pattern). The endpoint:
  - Verifies `requirePermission('admin.users.edit')` (or whatever key already exists; check via Supabase MCP).
  - Writes to `users` row directly (RPC or service-role client).
  - Inserts an `admin_audit_log` row with `actor_user_id`, `target_id`, `action`, `old_value`, `new_value`.
- Reuse existing components where possible: `web/src/app/profile/settings/_cards/IdentityCard.tsx` is the user's own self-edit form; the admin version is structurally the same form pointed at the admin endpoint.

#### Surface 3: extend `/admin/users/[id]` from dossier to full editor

- `web/src/app/admin/users/[id]/page.tsx` is currently read-only (sections survey at lines 244-529). Add edit affordances inline on each section:
  - **Identity** (`PageSection` around 263-302): edit username, display_name, bio, email. Email change should fire a verification flow (new email gets confirm link).
  - **Avatar / banner**: same editor as Surface 2.
  - **Plan**: dropdown to set `plan_id` directly (free / verity / verity_pro / verity_family). Per item 11, admin themselves shows "Admin (full access)" not a plan; but admin editing *other users* should still set their plan freely.
  - **Roles**: already partially covered by `/admin/users/[id]/permissions`. Add a roles dropdown summary on the dossier page so admin doesn't have to drill in for the common case.
  - **Flags**: `is_banned`, `is_shadow_banned`, `is_muted`, `mute_level`, `frozen_at`, `show_on_leaderboard`. Toggleable.
  - **Kid profiles** (lines 325-365): inline edit each kid's name, DOB (with COPPA flow), reading band, banned-on-kids flag, **PIN reset**. Today this is read-only.
    - **PIN reset (owner-locked 2026-04-30):** add a `Reset PIN` button per kid row inline in the dossier. Click → confirmation dialog (`Reset PIN for kid @name?`) → `/api/admin/kids/[id]/reset-pin` POST → clears the kid's PIN to null and forces a re-set on next kid app launch. Logs in `admin_audit_log` and triggers parent notification (see COPPA paragraph below).
    - **Cannot view the existing PIN.** Reset only — PIN is hashed at rest; even admin can't read it. UI exposes "Reset" not "View."
    - **COPPA parent notification (owner-locked 2026-04-30):** every admin write to a kid profile (name change, DOB correction, reading band override, PIN reset, ban) fires an email to the parent's account on the same security-channel as adult impersonation alerts: `Verity Post staff updated your child @name's profile on <date>. Change: <field> <old> → <new>. If unexpected, contact support.` This is a hard requirement — no admin kid-edit endpoint may bypass it. Implement as a server-side trigger / hook on the admin endpoint, not a client-side opt-in checkbox.
  - **Push tokens** (369-406): mostly read-only, but add a "Revoke" button per token (logs the user out of that device).
  - **Warnings/bans** (409-454): add "Lift warning" and "Unban" actions inline. Today the unban path lives in `/admin/moderation`.
- Every edit hits the same `/api/admin/users/[id]` PATCH endpoint with field-level granularity, every write writes to `admin_audit_log`.

#### Surface 4: "View as user" session-scoped impersonation (read AND write — owner-locked 2026-04-30)

> **Locked decision:** owner wants write-mode impersonation, not just read-only. Admin can post comments, send messages, take any action as the user from inside an impersonation session. The safeguards below are non-negotiable to keep the legal/audit story clean.

- New endpoint `POST /api/admin/users/[id]/impersonate` that:
  - Verifies the caller has `admin.users.impersonate` permission (key created as part of this item; auto-granted to owner role; per-user grantable to other staff via the `/admin/users/[id]` toggle from item 11's grant UI).
  - Issues a session token marked `impersonating: true, original_admin_id: <admin>, started_at: <ts>`.
    - **If caller has owner role: no expiry.** Token lives until the admin manually exits or logs out. Validate on each request that the original admin is still authenticated.
    - **If caller is a non-owner grantee: 1-hour idle, 4-hour absolute.** Refresh-on-activity within the idle window.
  - Sets a separate cookie (e.g., `vp_impersonation`) so the admin's real session cookie stays intact — exiting impersonation drops the impersonation cookie and the original admin session resumes immediately.
  - Logs `impersonation_start` and `impersonation_end` in `admin_audit_log`.
- Client gets a persistent banner (above the existing `AccountStateBanner` in `web/src/components/AccountStateBanner.tsx`) reading `Posting as @username — Exit impersonation`. Banner is unmissable: full-width, accent color, sticky to top, sits above all other chrome including the admin "Back to site" banner.
- **Write attribution — required for every write made under impersonation:**
  - Every mutation API the user could trigger (post comment, send message, react, follow, edit own profile, etc.) checks the impersonation cookie. If present:
    - The DB write goes through with `user_id = <impersonated user>` (so the row appears as theirs).
    - A parallel column / sidecar table (`posted_via_admin` boolean + `acting_admin_id` UUID + `impersonation_session_id` UUID) is written so post-hoc audit can identify every admin-posted artifact.
    - Public UI does NOT badge these posts — they look exactly like the user posted them. (Owner asked for this; staff-byline tag was the read-only-mode alternative and is being skipped.)
    - `admin_audit_log` gets a row per write with `action`, `target_type`, `target_id`, `payload_summary` (first 200 chars of any text content). This means if a comment was posted, both `comments.id` and the audit log capture it.
- **User notification — required to keep takeover/defamation exposure low:**
  - When an admin write happens during an impersonation session, queue a notification to the impersonated user: `Verity Post staff acted on your account on <date>. Actions: posted 1 comment, sent 1 message. If this wasn't expected, contact support.` Sent via email (use the security-notification channel, not the engagement channel — see project memory `email notifications — security-only`).
  - One digest email per impersonation session, not per action, so the user isn't spammed.
  - User cannot opt out of this notification (it's a security/compliance signal, like password-change emails).
- **Hard guards (server enforces, do not rely on UI):**
  - Cannot impersonate another admin/owner (block by role check at the impersonate endpoint). Prevents lateral admin takeover.
  - Cannot impersonate a kid (block by `is_kid` / kid_profile linkage). Kid actions go through a different parent-or-admin flow with its own COPPA-compliant audit; impersonation creates legal risk that isn't worth the support gain.
  - Cannot read or change passwords/PINs/2FA secrets while impersonating. (Adults have no password per item 9; kid PIN reset goes through Surface 6 below, which is non-impersonating.)
  - Cannot delete the user's account, change their email, or trigger billing actions under impersonation. Those flows have to be done by the admin from `/admin/users/[id]` so the actor is recorded as the admin, not as the user.
  - All financial endpoints (Stripe, IAP) refuse to operate under impersonation — return 403.
- **Privacy policy clause must land first.** Add to `web/src/app/privacy/page.tsx`: "Verity Post staff may, in connection with support, security, or policy enforcement, access your account and act on your behalf. Any actions taken by staff while accessing your account are logged and you will be notified by email." Without this, write-mode impersonation has real exposure under EU/CA privacy law.

#### Surface 5: deep-link from anywhere to the user dossier

- Comment row, story byline, message thread, report card — every place that surfaces a user should expose an admin-only `Open in admin →` shortcut for users with `auth.isAdmin`. One pattern: a small `<AdminUserShortcut userId={u.id} />` component (admins see it, others see nothing).
- Targets to wire: `web/src/components/CommentRow.tsx`, `web/src/components/CommentThread.tsx`, story author byline (`web/src/app/[slug]/page.tsx` or wherever it lives), `web/src/app/messages/page.tsx` thread headers, `web/src/app/admin/reports/...`, `web/src/app/admin/support/page.tsx`.

### What to build — iOS

- `VerityPost/VerityPost/PublicProfileView.swift` — same admin-only strip as web Surface 1: `Open in admin` (deep links to web `/admin/users/<id>` since admin UI is web-only), `View as user` (issues an impersonation session and reloads the app under that token), `Edit profile` (presents a sheet that mirrors `SettingsView.swift` Identity card but writes to the admin endpoint).
- iOS doesn't ship its own admin console; the deep link to the web admin is fine for the dossier and audit trail.
- COPPA caveat: in `VerityPostKids/`, kid profiles should never get "Open in admin" or "View as user" — even for admins on iOS. All kid management goes through web.

### Locked decisions (owner, 2026-04-30)

1. **Per-user grantable permissions.** `admin.users.edit` + `admin.users.impersonate` keys, auto-granted to owner role, per-user grantable to other staff via the same toggle UI as item 11's `admin.god_mode`.
2. **Impersonation session length:** owner = forever (until logout); grantees = 1h idle / 4h absolute (default; owner to confirm if grantees should also be forever).
3. **Impersonation write mode = YES.** Admin can post / DM / act as user. Safeguards in Surface 4 are non-negotiable: audit log, sidecar attribution column, user-notification email digest, no-impersonate-admins-or-kids, no financial endpoints, no public staff badge on posts.
4. **COPPA parent notification on kid edits = YES.** Every admin write to a kid profile triggers a parent email. Server-side enforcement (trigger / hook on the endpoint), not a client checkbox. Detail in Surface 3, Kid profiles section.
5. **Kid PIN reset from kid's profile = YES.** Reset only, never view. Detail in Surface 3, Kid profiles section.

### Locked answers (owner, 2026-05-01)

1. **Email change notifies BOTH old + new addresses.** Standard takeover-prevention.
2. **Privacy-policy clause = future improvement.** Logged in `OUTSTANDING.md`. Owner writes/approves the clause before write-impersonation endpoints ship. Item 12 read-only surfaces (Surface 1, 2, 3, 5) can ship without it; only Surface 4 (impersonation) is gated.
3. **Audit-log retention = 1 year, env-var driven.** Add `ADMIN_AUDIT_LOG_RETENTION_DAYS=365` so it's easy to flip later. Implement as a daily cron that prunes rows older than the env value.
4. **Grantee impersonation session: 1hr default, owner-configurable + force-eject.** Owner can change the default via a setting + has a "Force exit impersonation" button on `/admin/users/[id]` to kick any active grantee session immediately. Owner's own impersonation stays forever-until-logout per item 12 lock.
5. **Impersonation suppression of first-login modal.** Add an `isImpersonating` check to both `WelcomeModalMount` (web) and the iOS `PickUsernameView` sheet predicate so admins impersonating a user with `username IS NULL` don't get force-prompted to set a handle for them.

### Platforms summary

- Web: Surfaces 1–5 + new `/api/admin/users/[id]` PATCH + impersonation endpoint + privacy-policy clause.
- iOS adult: deep-link strip on PublicProfileView, share the same admin endpoints, share impersonation tokens.
- Kids iOS: do not surface admin-write affordances inside the kids app. All kid admin flows stay on web with COPPA notification side-effects.

---

## 13. Unify username pick to a single first-login popup

**What to change:** owner spec, locked 2026-04-30: "When someone first signs in for the first time they can create a username and that's a popup only the first time they first login after clicking the email. That's it. The other thing should be gone if that's not it."

One first-pick surface per platform:
- **Web:** an undismissable modal that fires on the user's first authenticated session if `users.username` is null. (`WelcomeModal` already does this.)
- **iOS:** the same — an undismissable modal/sheet over MainTabView, NOT a full-screen route between login and the app shell. (`PickUsernameView` is currently a screen replacement; needs to become a sheet.)

This is a **prerequisite for item 10**. The username lock's server check whitelists "user has no username yet → allow first pick." If there are multiple first-pick paths, the whitelist becomes a bypass surface. Collapse to one path per platform first.

### Locked decisions (owner, 2026-04-30)

1. **First-pick UX = popup/modal, undismissable until saved.** Web is already this shape; iOS needs to switch.
2. **Trigger = first authenticated session where `users.username` is null.** Both platforms read the user row on session load and mount the modal if the field is empty. No separate "needs-onboarding" gating — the popup fires for any user without a username, regardless of where in the app they land.
3. **No dedicated `/signup/pick-username` page on web.** The directory exists but is empty; any redirect that points there is dead code and should be removed.
4. **No standalone `PickUsernameView` screen on iOS.** It becomes a sheet presented over MainTabView. The view itself can be kept as the modal's content; only the mounting strategy changes.

### What to change — web

- **Status: ~95% already correct.** Only cleanup needed.
- `web/src/components/welcome/WelcomeModal.tsx` — keep as-is. This is the popup. Owner has already approved this shape.
- `web/src/components/welcome/WelcomeModalMount.tsx:32-46` — gating logic is correct: fires when `username == null/undefined/'' && !onboardingCompletedAt`. Leave as-is. **Keep `/welcome` in SKIP_PATHS** (the kids graduation-token claim flow lives there).
- `web/src/app/welcome/page.tsx` — **DO NOT delete the entire file.** Pre-impl review surfaced that this file actively serves the kids graduation-token claim flow (`GraduationClaim` component at lines 54-72) and is the redirect target of `web/src/app/api/kids/[id]/advance-band/route.ts:167`. Coming-soon middleware also redirects here (`web/src/middleware.js:222, 262, 320`, `web/src/app/preview/route.ts:22`). Required surgical edits only:
  - Delete the dead `WelcomePageOnboarding` function (roughly lines 75-346) including its child components `ScreenOne` / `ScreenTwo` / `ScreenThree` / `Step` / `Arrow` (roughly lines 350-593).
  - Delete the `/signup/pick-username` redirect at line 117.
  - Delete `forwardNextQs()` helper (lines 19-24) once its only caller is gone.
  - Remove now-unused imports (`createClient`, `useTrack`, `getValidatedNextPath`).
  - **Keep:** the file itself, the default export, `GraduationClaim` component, the `?graduation_token=` handler.
- `web/src/app/signup/pick-username/` — empty directory. Delete it. (Empty dirs aren't git-tracked, so `rm -rf` may be a git no-op; document that no commit will result from this step alone.)
- `web/src/app/api/auth/save-username/route.ts` — keep. This is the endpoint `WelcomeModal` POSTs to. Item 10 will add a server-side guard mirroring the RPC lock; this item doesn't change the route. Comment update only at line 10: replace "Why this endpoint when the web pick-username page already calls" with reference to `WelcomeModal`.
- `web/src/lib/rateLimits.ts:51` — comment update from "post-signin pick-username flow" → "post-signin first-login modal."
- `web/src/app/api/auth/check-username/route.js:12` — comment update: "in the post-signin /welcome/pick-username step (Q2-e)" → "in the post-signin first-login WelcomeModal."
- `web/src/app/api/auth/callback/route.js:89` — comment update: "no server redirect to pick-username needed" → "no server redirect needed; WelcomeModal will mount client-side if username is null."
- `web/src/app/signup/pick-categories/page.tsx:245` — comment update: "Match pick-username's loading-while-redirecting silence" → "Match WelcomeModal's loading-while-redirecting silence."
- Audit grep before commit: `grep -rn "/signup/pick-username" web/src` → expected zero matches after cleanup.

### What to change — iOS

- **Status: wrong shape, needs conversion from screen → sheet.**
- **Mount the sheet at the ContentView level, NOT inside MainTabView.** MainTabView already presents `.sheet(item: $deepLinkStory)` (`ContentView.swift:310`); two sheets on the same view tree fight each other and only one wins. The username sheet must live at the outer ContentView layer to take precedence.
- `VerityPost/VerityPost/ContentView.swift:140-146` — currently:
  ```swift
  } else if auth.needsPickUsername {
      PickUsernameView()
  }
  ```
  Delete the `else if auth.needsPickUsername` branch entirely so the conditional flow continues to `WelcomeView` / `MainTabView` (lines 147-160).
- `VerityPost/VerityPost/ContentView.swift` — at the end of the outer `Group { ... }` body (after line 161, before existing `.fullScreenCover` at line 162) attach:
  ```swift
  .sheet(isPresented: Binding(
      get: { auth.needsPickUsername },
      set: { _ in }
  )) {
      PickUsernameView()
          .environmentObject(auth)
          .interactiveDismissDisabled(true)
          .presentationDragIndicator(.hidden)
  }
  ```
  - **Critical binding pattern:** `auth.needsPickUsername` is a *computed* `var` (`AuthViewModel.swift:681-685`), not `@Published`. Direct `$auth.needsPickUsername` will fail to compile. Must use `Binding(get: ..., set: { _ in })`. The setter is a no-op because the user can't dismiss; the sheet closes automatically when `loadUser()` (called by `PickUsernameView.save()` at line 266) flips `currentUser` (the underlying `@Published` property), causing SwiftUI to re-evaluate the binding's `get` and dismiss.
  - `.interactiveDismissDisabled(true)` blocks swipe-down dismissal.
  - `.presentationDragIndicator(.hidden)` hides the visual drag bar so the user isn't visually invited to dismiss.
- **Suppress deep-link sheet while username sheet is up.** `MainTabView`'s `articleRouter.pendingSlug` consumer (`ContentView.swift:301-313`) will try to present `StoryDetailView` even with the username sheet open, and may silently drop the deep link. In MainTabView (or wherever `pendingSlug` is consumed), guard: `if !auth.needsPickUsername { /* consume pendingSlug */ } else { /* hold pendingSlug until username sheet dismisses */ }`. Flag exact file/line during implementation.
- **Sequence with WelcomeView (onboarding carousel).** Today: pick username → onboarding carousel → MainTabView. After conversion: pick username (sheet) → ContentView re-evaluates → WelcomeView → MainTabView. Risk of one-frame MainTabView flash between sheet dismiss and WelcomeView mount. Acceptable; if it visibly flashes during testing, swap to `withAnimation` on the state flip or convert WelcomeView to also be a sheet.
- `VerityPost/VerityPost/PickUsernameView.swift` — keep the view body unchanged (no back/cancel button exists today, verified). All sheet behavior lives at the presentation site.
- `VerityPost/VerityPost/AuthViewModel.swift:681-685` (`needsPickUsername` computed var) — keep as-is. Only the mounting changes.
- `VerityPost/VerityPost/SignupView.swift:10-12` — comment update: "ContentView routes to PickUsernameView" → "ContentView presents PickUsernameView as an undismissable sheet over MainTabView."
- `VerityPost/VerityPost/PickUsernameView.swift:50` — current text reads "This is how other readers will see you. You can change it once." Change to "This is how other readers will see you. Usernames can't be changed later." (Item 13 owns this copy edit; item 10 should not double-touch it.)
- `VerityPost/VerityPost/PickUsernameView.swift:247` posts to `/api/auth/save-username` — leave alone.

### Known acceptable trade-offs (do not address in this item)

- **iPad form-sheet:** on iPad, `.sheet` presents as a centered card; `MainTabView` content behind the sheet is technically tappable. Mitigation comes from item 10's server-side username lock (any rename attempt rejects); for now the cosmetic gap is acceptable on iPad. Document; do not block.
- **Save-flow 401 / network failure:** if the save call fails, the user is stuck on a retry loop with no escape. Existing UX. Out of scope for item 13.
- **Two-tab race on web:** if user opens WelcomeModal in two tabs and saves both, the second sees a "taken" error. Existing UX, out of scope.

### Cross-item dependencies surfaced by review (flag for owner)

- **Item 10 ship sequence:** `SettingsView.swift:1466` (`patch.username = username`) and `IdentityCard.tsx:53` (`p_fields: { username, ... }`) remain live username-write surfaces until item 10 lands. **Ship items 13 and 10 in the same release window** — between 13 and 10, the lock invariant ("only one first-pick path") is technically intact (settings rename is post-pick, not first-pick) but a user could still rename. Acceptable gap, but worth knowing.
- **Item 12 admin impersonation:** when an admin impersonates a user with `username IS NULL` (e.g. a freshly graduated kid), both web `WelcomeModalMount` and iOS sheet will fire, forcing the admin to set a handle for the impersonated user. **Item 12 must add an "is impersonating" suppression** to both gating predicates. Add to item 12's open questions.

### Audit (do not skip)

After web + iOS changes land, **grep for any remaining username-write surface other than the modal** to make sure "the other thing should be gone" is actually true:

```
grep -rn "update_own_profile" web/src VerityPost
grep -rn "/api/auth/save-username" web/src VerityPost
grep -rn "username" web/src/app/signup VerityPost/VerityPost/SignupView.swift
```

Confirm every hit is either:
- The first-login modal (`WelcomeModal.tsx` or `PickUsernameView.swift`)
- The IdentityCard self-edit surface that item 10 will lock down to read-only
- The `update_own_profile` RPC payload for non-username fields (display_name, bio, avatar, categories metadata)

Anything else (a hidden settings page that still allows rename, an onboarding step that re-prompts for a handle) gets killed in this item.

### Platforms summary

- Web: cleanup only — delete `/welcome/page.tsx` redirect line + `/signup/pick-username/` empty dir + stale comment.
- iOS adult: convert `PickUsernameView` from full-screen route to undismissable sheet over MainTabView; update the stale "you can change it once" header.
- Kids iOS: not applicable — kids product has no username scheme (verified earlier).

---

## How to use this doc

Each section above is a stand-alone prompt. To work an item, paste the section into a fresh session — it has the file paths, line numbers, decision points, and cross-platform coverage call-outs needed to start without re-investigation. Verify file paths/line numbers are still current before editing (memory of code drifts fast).
