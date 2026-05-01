# Changes to make

Running list of UX/admin changes the owner has flagged. Each entry is a self-contained prompt: what to change, source files (with line numbers), and platform coverage (web / iOS / kids iOS — cross-platform consistency rule).

---

## Priority queue (work order)

**Wave 1 — owner-locked, do these first (2026-04-30):**

| # | Item | Status | Notes |
|---|------|--------|-------|
| 13 | Unify username pick → single first-login popup (kill iOS full-screen route + dead web redirect) | ✅ shipped (uncommitted) | Owner approval to push pending; two minor stale comments in `AuthViewModel.swift:613, 677-681` rolled into item 10 |
| 3  | Admin → article: published opens reader, drafts stay in newsroom, separate Edit button | 🟢 ready | Independent — can ship alongside others |
| 10 | Lock username (self-edit off; admins can rename) | 🟢 ready | Depends on 13 landing first |
| 11 | God-mode (per-user `admin.god_mode` grant; owner auto, others opt-in) | 🟢 ready | **Prerequisite for item 12** — server RPC short-circuit + AuthContext `isGodMode` |
| 12 | Admin opens / edits / impersonates any user (with kid PIN reset + COPPA notify) | 🟡 1 blocker | Privacy-policy clause must land before write/impersonation endpoints ship; reuses item 11's per-user grant UI |

Suggested ship order within Wave 1: **13 → 10 → 3 → 11 → 12.** (13 unlocks 10's clean server enforcement; 3 is independent; 11 unlocks 12; 12 closes the legal loop after the privacy clause is in place.)

**Wave 2 — backlog, schedule after Wave 1 is in flight:**

| # | Item | Status |
|---|------|--------|
| 2  | Remove "Pricing" link from top bar | 🟢 ready |
| 5  | Avatar initials → 3 alphanumeric chars on web (iOS already correct) | 🟢 ready |
| 9  | Hide password UI for adults (no passwords; OTP-only) | 🟢 ready |
| 7  | Drop streaks + read counts across web + iOS adult | 🟡 needs decisions on kid-streak scope |
| 8  | Profile stat-tile typography redesign | 🟡 needs design direction (A vs B) |
| 4  | Mount AI provider/model picker in admin | 🟡 needs decision on mount location |

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

**What to change:** when an admin clicks an article from `/admin/stories`, the row currently routes to `/admin/story-manager?article=<id>` (the editor/build view). Owner wants published articles to open the public reader; drafts stay in the admin newsroom.

**Locked decisions (owner, 2026-04-30):**
- **Row click on a `published` article → opens public reader at `/[slug]`.** The reader is what a real user would see.
- **Row click on a `draft` (or any non-published status) → stays in the admin newsroom** — current `/admin/story-manager?article=<id>` behavior. No public preview route, no fallback to a draft slug. Drafts never expose a viewer-facing URL until they're published.
- **Separate "Edit" button on every row** (regardless of status) routes to `/admin/story-manager?article=<id>`. So an admin reading a published article in the reader still has a one-click path back into the editor via this button (or via the admin shortcut from item 12, whichever lands first).

**Source:**
- `web/src/app/admin/stories/page.tsx:228-240` — row click handler. Branch on `row.status`: published → push `/${row.slug}`; otherwise → push `/admin/story-manager?article=${row.id}` (existing behavior).
- `web/src/app/admin/stories/page.tsx:240` — "Quiz pool" button stays as-is (always editor-bound; it's an editing affordance, not a reader affordance).
- `web/src/app/admin/stories/page.tsx:281-283` — second click target. Same branching as above.
- `web/src/app/admin/stories/page.tsx:270, 337` — "New article" stays at `/admin/story-manager?new=1` (correct; nothing to do).
- **Add an "Edit" button on each row** next to the existing actions, routing to `/admin/story-manager?article=${row.id}` regardless of status. Keep the button visible for both published and draft rows so the editor is always one click from the list.
- Confirm `slug` is on the `ArticleRow` type returned by the stories query at `web/src/app/admin/stories/page.tsx:90+`. Add it to the select if missing — required for the published branch.

**Platforms:**
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

## 11. God-mode — owner has full bypass; owner can grant it per user

**What to change:** owner reports they can't access Ask-an-Expert, can't access other tier-gated features, and see themselves displayed as being "on a plan." Owner shouldn't be on any plan; owner should have unrestricted access to every user-facing feature regardless of tier or permission grants. **Other admins do NOT get god-mode by default** — owner explicitly grants it per-user from a new admin UI. This is two problems sitting on top of each other (server grants + client UI gates), with a third cosmetic problem (the Plan card in profile showing "Free"). All three need to land together.

**Locked decisions (owner, 2026-04-30):**
- **Owner role: full bypass, automatic, always on.** Every permission key, every plan-tier check, every paywall — owner sails through.
- **God-mode is per-user grantable, not role-based.** Default: only owner has it. Owner can grant `admin.god_mode` (or whatever the key ends up named) to any individual user — not tied to role membership. Revoke is symmetric and immediate.
- **Admin role on its own does NOT get god-mode.** An admin without an explicit god-mode grant goes through normal permission checks. This keeps admin-as-test-user workflows clean (admins can hit paywalls / role gates by default; god-mode is opt-in).
- **Server-side root-cause fix is Option B (RPC short-circuit)** — see Server section below. Cheaper to maintain than auditing every permission set forever.

### Architecture — per-user grant, not role bypass

- Add a permission key, e.g., `admin.god_mode`, in the `permissions` catalog.
- Owner role auto-grants `admin.god_mode` (one row in whatever table maps role → permission set, set membership includes the new key).
- Every other user starts without it. Owner uses a new UI section under `/admin/users/[id]` (or extends item 12's inline editor) to toggle the grant.
- Server-side, `my_permission_keys` short-circuits when the caller has `admin.god_mode` granted, returning every permission key in the catalog. Same for tier checks: server endpoints that gate on plan tier check god-mode first.
- Client-side, `auth.isGodMode` (renamed from `auth.isAdmin` in the original draft to keep it precise) drives every UI bypass. `auth.isAdmin` stays as a separate signal for "user has the admin role" — still used for routing into `/admin`, banner copy, etc.

### Diagnosis

- **Roles exist** — `web/src/lib/roles.js:18-23` defines `OWNER_ROLES`, `ADMIN_ROLES`, `EDITOR_ROLES`, `MOD_ROLES`. The owner role is `'owner'`; admin is `'admin'`.
- **Permission system is set-centric** — `web/src/lib/permissions.js:152, 174` shows the RPCs `get_my_capabilities` and `my_permission_keys`. The cache (`allPermsCache`) is a `Set` of permission keys the user has been granted. UI components check this cache via `hasPermission(key)`.
- **Owner doesn't get every key automatically** — per memory ("admin account has owner + admin permission sets"), owner has whatever permission sets are attached to the owner role. If a permission key (like `expert.queue.view` or `messages.send`) isn't in any of those sets, the owner won't get it. **This is the most likely root cause for "I don't have access to expert stuff."**
- **UI gates check the cache, not the role** — `web/src/components/LockedFeatureCTA.tsx`, `LockModal.tsx`, `PermissionGate.tsx` all assume the permission set is the source of truth. They have no concept of "owner bypass."
- **Tier comes from `plans.tier` join** — `web/src/app/NavWrapper.tsx:79-97` `deriveTier()` returns `'free_verified'` for users with no paid plan. Owner shows up as `free_verified`, which makes `userTier`-based code paths treat them as free.
- **Plan display reads from `subscriptions` / `plans`** — `web/src/app/profile/settings/_cards/BillingCard.tsx:51, 84` fetches a `PlanRow` and shows it as "Plan." For admins this should display "Admin (full access)" or be hidden.

### What to change — server (root-cause fix)

**Locked: Option B (RPC short-circuit).** Cheaper to maintain, single DB change vs auditing every permission set forever.

- **1. Add the permission key.** Insert a new row in `permissions` for `admin.god_mode` (description: "Bypass every plan and permission gate"). Verify the catalog table name first via Supabase MCP — likely `permissions` per the existing `my_permission_keys` RPC.
- **2. Auto-grant to owner role.** Add `admin.god_mode` to whichever permission set is attached to the `owner` role. SQL pattern:
  ```sql
  insert into permission_set_members (set_id, permission_id)
  select ps.id, p.id
  from permission_sets ps
  join role_permission_sets rps on rps.set_id = ps.id
  join roles r on r.id = rps.role_id and r.name = 'owner'
  cross join permissions p
  where p.permission_key = 'admin.god_mode';
  ```
  (Confirm the table/column names against the actual schema before running.)
- **3. Patch `my_permission_keys` and `get_my_capabilities`** to short-circuit when caller has `admin.god_mode`. First branch in the function:
  ```sql
  if exists (
    select 1 from user_permissions up
    join permissions p on p.id = up.permission_id
    where up.user_id = auth.uid() and p.permission_key = 'admin.god_mode'
  ) then
    return query select permission_key from permissions;
  end if;
  ```
  Same short-circuit added to `get_my_capabilities` so cached section-fetches also pass.
- **4. Patch tier-gated server endpoints.** Anything that today reads `subscription.plan.tier` to gate access (recap, expert queue, etc.) should also check `has_permission('admin.god_mode', auth.uid())` first and bypass.
- **5. Per-user grant UI.** Inside `/admin/users/[id]` (extending item 12's editor), add a single toggle: `God-mode access` — on/off. Writes a row in `user_permissions` for that user with `permission_key = 'admin.god_mode'`. Owner-only UI; grant action audited in `admin_audit_log`.
- **The RPC source isn't in `supabase/migrations/`** (memory: "MCP-verify schema, never trust supabase_migrations log" — pull `pg_get_functiondef(oid)` for both RPCs first to know what you're patching).

### What to change — client (UI bypass for god-mode users)

Even after server grants are correct, several UI surfaces still gate on `userTier` (which is plan-derived, not role-derived). Add a god-mode-aware shortcut so paywall UI never shows for users with the `admin.god_mode` grant.

- **Add `isGodMode` and `isAdmin` to `AuthContext`** at `web/src/app/NavWrapper.tsx:60-77`. `isGodMode` is true when the user's permission cache contains `admin.god_mode` (read from `hasPermission('admin.god_mode')`). `isAdmin` stays as "user has the admin or owner role" (used for routing into `/admin`, banner copy). They're separate signals — admin role doesn't automatically imply god-mode.
- **Update `deriveTier()`** at `web/src/app/NavWrapper.tsx:79-97` to return a sentinel like `'godmode'` when god-mode is present. This makes every legacy `userTier === 'verity_pro'` / `userTier === 'verity_family'` check pass. Document the sentinel in the function header.
- **Short-circuit `<LockedFeatureCTA>`** at `web/src/components/LockedFeatureCTA.tsx:109+` — at the top of the component, `if (auth.isGodMode) return null` (no upsell strip).
- **Short-circuit `<LockModal>`** at `web/src/components/LockModal.tsx` — if god-mode, render `null`.
- **Short-circuit `<PermissionGate>`** at `web/src/components/PermissionGate.tsx` — if god-mode, render `children` directly without checking the cache. (For most users this is a no-op because the cache already has the key once the server short-circuit lands; the client check is belt-and-suspenders for first-paint before the perms cache loads.)
- **Search for direct tier checks** — `grep -rn "userTier ===" web/src` and `grep -rn "isPaidTier" web/src`. Each gets the god-mode escape: `if (isGodMode) return <unlocked path>`. Known sites today: `web/src/app/bookmarks/page.tsx:69, 119`, `web/src/components/ArticleQuiz.tsx:56`, `web/src/lib/useTrack.ts:34, 41`.

### What to change — Plan card display

- `web/src/app/profile/settings/_cards/BillingCard.tsx:178-206` (the `PageSection title="Plan"` blocks) — branch on `auth.isGodMode`:
  - If god-mode: render a single line — `Full access (no subscription required).` Hide the change-plan link, the manage-payment portal, and the cancel/resume controls.
  - Else: existing UI.
- `web/src/app/profile/_sections/PlanSection.tsx` is a thin re-export of `BillingCard` — no change needed if BillingCard handles the branching.
- `web/src/app/profile/_components/ProfileApp.tsx:415` ("Plan" sidebar item) — keep visible (god-mode users might still want to see what plans exist), but make sure clicking it lands on the god-mode-aware Plan view above.

### iOS

- `VerityPost/VerityPost/RecapView.swift:18, 41, 153` — `isPaid` boolean fetched from a server endpoint that returns `paid: bool`. Server-side, the recap endpoint should return `paid: true` for god-mode users. Once the `my_permission_keys` short-circuit lands, the endpoint's existing gate becomes permission-driven and god-mode passes through automatically.
- `VerityPost/VerityPost/FamilyViews.swift:54-55` — `maxKids(for tier)` reads a per-tier cap. God-mode users should bypass; check `auth.hasPermission("admin.god_mode")` and return `Int.max`.
- `VerityPost/VerityPost/SubscriptionView.swift` (paywall list) — for god-mode users, hide the upgrade CTA and show "Full access (no subscription required)" instead.
- General iOS pattern: fetch permission keys on session load (mirroring web's `refreshAllPermissions`), surface as `AuthViewModel.isGodMode`, then short-circuit every paywall/locked-feature view.

### Open questions still pending

1. **Editor/moderator/expert roles.** Locked: no auto-bypass. They go through normal permission set checks. Owner can grant `admin.god_mode` to specific individuals if needed.
2. **"View as anon" / paywall QA mode.** Not blocking this item — covered by the impersonation flow in item 12 (admin can impersonate a free-tier user to see the paywall as they would). Defer.
3. **Server-side billing rows.** Owner currently has either a `subscriptions` row pointing at a tier or no row at all. After this lands, the Plan card hides for them — but the underlying row stays untouched (per launch-hides convention). Confirm this is fine and don't write a migration to delete the owner's plan row.

### Platforms summary

- Web: add `admin.god_mode` permission + auto-grant to owner role + RPC short-circuit + AuthContext `isGodMode` + bypass in 3 components + grep-and-add bypasses + Plan card branch + per-user grant toggle in `/admin/users/[id]`.
- iOS adult: server endpoints honor god-mode automatically (via the `my_permission_keys` change) + AuthViewModel `isGodMode` + bypass in `RecapView`, `FamilyViews`, `SubscriptionView`.
- Kids iOS: not applicable — kids product is the kid's own account; god-mode doesn't translate.

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

### Open questions still pending

1. **Email change on adult accounts.** When admin changes a user's email, does the user get notified at both old and new address? Recommended default: yes — standard takeover-prevention pattern. Confirm and lock.
2. **Privacy policy update timing.** Add the admin-access clause to `web/src/app/privacy/page.tsx` *before* shipping the write/impersonation endpoints. Suggested ship order: privacy clause → admin_audit_log + sidecar attribution table → endpoints → UI. Confirm sequencing (and confirm you'll write/approve the clause yourself, not agent-drafted).
3. **Audit-log retention.** Confirm `admin_audit_log` retention policy (90d? forever?). For COPPA + GDPR DSARs, 1 year minimum is sensible; pull current partition/archive setup via Supabase MCP before changing.
4. **Grantee impersonation session timeout.** Locked: owner = forever. Open: should non-owner staff with the `admin.users.impersonate` grant also get forever sessions? Default proposal: no — they get 1h idle / 4h absolute, since longer sessions amplify the takeover risk if a grantee's session is hijacked. Confirm or override.
5. **Impersonation suppression of the first-login modal (surfaced from item 13 review).** When admin impersonates a user with `username IS NULL` (e.g. a freshly graduated kid), the web `WelcomeModalMount` (`web/src/components/welcome/WelcomeModalMount.tsx:32-46`) and iOS PickUsernameView sheet (`VerityPost/VerityPost/ContentView.swift`) will both fire, forcing the admin to set a handle for the impersonated user. Add an `isImpersonating` check to both gating predicates so the modal/sheet is suppressed during impersonation sessions. Cheap fix; mandatory for item 12 to be safe to use on incomplete user accounts.

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
