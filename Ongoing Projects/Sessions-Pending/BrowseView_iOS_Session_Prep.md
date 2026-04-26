# Session prep — iOS Browse tab + bottom-bar IA shift

**Created:** 2026-04-26
**Owner-locked decisions this session implements:**
- OwnersAudit Search Task 6 — add iOS Browse tab
- IA shift — replace "Most Informed" tab with "Browse" tab
- Move Leaderboard out of the bottom bar; expose it via Profile (already prepped — Profile QuickLink shipped)

**Why this is its own session:** The new `BrowseView.swift` is ~200 lines of fresh SwiftUI. Bundling it with the bottom-bar swap and the Profile relocation means one coherent IA push to TestFlight rather than three half-states.

---

## Prompt

> Build `BrowseView.swift` for the adult iOS app and execute the full IA shift agreed 2026-04-26: replace the "Most Informed" (Leaderboard) tab with a "Browse" tab, position 3 in the bottom bar. Mirror the structure and behavior of the web `/browse` page (`web/src/app/browse/page.tsx`). The Leaderboard QuickLink in `ProfileView.OverviewTab` already shipped — confirm it's still there before removing the leaderboard tab so the entry point is never absent. The DB migration `Ongoing Projects/migrations/2026-04-26_profile_categories_canonical_binding.sql` should be applied at the same time as this push if it hasn't been already (related Profile Task 5 fix).

---

## Files to read before starting

- `web/src/app/browse/page.tsx` — canonical reference for layout, data shape, category-card-with-expand-row pattern
- `VerityPost/VerityPost/FindView.swift` — closest existing iOS pattern (search results list); use its style/spacing as the baseline
- `VerityPost/VerityPost/ContentView.swift:139-260` — `MainTabView` + `TextTabBar` (where the tab swap happens)
- `VerityPost/VerityPost/ProfileView.swift` (the `OverviewTab` "My stuff" section already has a `Leaderboards` QuickLink — verify before removing the bottom-bar entry)
- `VerityPost/VerityPost/Theme.swift` — `VP.*` palette constants to use
- `VerityPost/VerityPost/HomeView.swift` — for the existing list-of-articles pattern

---

## What to build

### 1. `BrowseView.swift`

Mirror `web/src/app/browse/page.tsx` structure:

- **Featured section ("Latest")** — top of view, 3 most-recently-published articles. Horizontal scroll of cards, each with category eyebrow + headline + relative time.
- **Category grid** — `LazyVStack` (or `LazyVGrid` 2-column) of category cards. Each card shows category name + article count. Tap-to-expand inline shows 3 latest articles in that category as `NavigationLink` rows pushing `StoryDetailView`. Bottom of expanded card has "View all {category} articles →" pushing `CategoryFeedView` (use existing or build new).
- **Loading state** — skeleton placeholders matching the loaded card shape (mirror the web `BrowseSkeleton` component pattern — `vp-pulse`-style opacity animation on `RoundedRectangle.fill(VP.streakTrack)`).
- **Error state** — distinct from empty: "Couldn't load content" + 44pt "Retry" button (mirror the web `loadFailed` branch in `browse/page.tsx` and the iOS pattern from `LeaderboardView.swift`/`ExpertSessionsView.swift`).

**Data path:** Direct Supabase queries via `SupabaseManager.shared.client` (same pattern as `FindView`). Two parallel queries — categories (filter `not('slug', 'like', 'kids-%')`, equivalent to web) + recent articles (limit 500, `order('published_at', desc)`, `eq('status', 'published')`). Build the same enriched-category shape inline. **Do not** introduce a new API endpoint — direct queries are the established iOS pattern.

**Filter behavior:** keyword filter on category name (matches web `search` state). Pre-search-state question deferred — iOS Browse is rich enough as-is per the web parity decision; the topic-chip pattern from OwnersAudit Browse Task 7 still belongs in `FindView`/Search (separate task).

### 2. Tab bar swap (`ContentView.swift`)

```swift
// Before
enum Tab: Hashable { case home, find, notifications, leaderboard, profile }

// After
enum Tab: Hashable { case home, find, browse, notifications, profile }
```

In `adultTabView`'s switch:
```swift
case .browse: NavigationStack { BrowseView() }.environmentObject(auth)
```
Remove `case .leaderboard:` block.

In `TextTabBar.items`:
```swift
[
    Item(id: .home, label: "Home"),
    Item(id: .find, label: "Find"),
    Item(id: .browse, label: "Browse"),
    Item(id: .notifications, label: "Notifications"),
    Item(id: .profile, label: isLoggedIn ? "Profile" : "Sign in"),
]
```
Drop the `.leaderboard` entry.

### 3. Verify the Profile entry point still exists

Before removing the bottom-bar leaderboard tab:
```bash
grep -n 'Leaderboards' VerityPost/VerityPost/ProfileView.swift
```
Expected: The web side has `<QuickLink href="/leaderboard" label="Leaderboards" ... />` in `web/src/app/profile/page.tsx` `OverviewTab` "My stuff" section. **iOS does not yet have a parallel QuickLink** — adding one to `ProfileView.swift` `overviewTab(_:)` "My stuff" list belongs in this session (otherwise iOS users have no path to LeaderboardView after the tab is gone).

iOS pattern to mirror (from existing rows in the same list):
```swift
NavigationLink {
    LeaderboardView()
} label: {
    HStack { /* same row structure as Expert Queue / Bookmarks rows */ }
}
```
Description copy: "See where you rank by topic and overall" — plain factual, no rank number, no streak boast.

### 4. DB migration coordination

The DB migration at `Ongoing Projects/migrations/2026-04-26_profile_categories_canonical_binding.sql` and the iOS short-form perm-key change (already applied to `ProfileView.swift:191-193`) should be live before this session pushes. If the migration hasn't been applied yet, apply it at the same time as the push — otherwise iOS users with the old long-form keys will lose Categories tab access for a brief window.

Order:
1. Apply DB migration
2. Bump `users.perms_version` (per migration footer notes)
3. Push the iOS code (this session's BrowseView + tab swap + Profile QuickLink)

---

## Acceptance criteria

- [ ] `BrowseView.swift` compiles + passes Swift lints
- [ ] Bottom tab bar shows: Home / Find / Browse / Notifications / Profile (5 tabs, no overflow)
- [ ] Tapping Browse loads category grid + featured row; tap-to-expand shows 3 latest in-category
- [ ] Loading state is skeletons, not bare `ProgressView()`
- [ ] Error state is "Couldn't load content" + 44pt Retry, not silent empty
- [ ] Tapping a category card row pushes `StoryDetailView` correctly (no broken nav)
- [ ] "View all" pushes a category-filtered list view
- [ ] `ProfileView` has a `LeaderboardView` entry point in "My stuff" section before the leaderboard tab is removed
- [ ] No references to `case .leaderboard` remain in `ContentView.swift`
- [ ] Web `/profile` Leaderboards QuickLink still renders (already shipped — just verify nothing regressed)

---

## What NOT to do

- **No leaderboard nudges or rank-changed surfaces on Home.** Owner explicitly said "don't gamify too much" 2026-04-26 — the rank-changed contextual home tile is dropped from scope. Profile entry point only.
- **No 6-tab bottom bar.** Apple HIG guidance + every comparable news app — 5 visible, no More overflow.
- **No new API endpoint.** Direct Supabase via existing `SupabaseManager.shared.client`.
- **No keyboard shortcuts.** Product rule.
- **Do not extract a shared `VP_PALETTE` constant** as part of this session — that's the OwnersAudit Browse Task 8 + Home Task 3 deferred global token sweep, separate scope.

---

## Risk + rollback

- **Risk:** iOS TestFlight users were used to "Most Informed" tab. Sudden removal could surface confusion. Mitigation: the Profile QuickLink lands first (web side already has it), so the entry point exists before the tab vanishes.
- **Rollback:** Revert the `ContentView.swift` enum + items list change; the `BrowseView.swift` file can stay (unused) or be deleted. The Profile QuickLink stays either way — it's net-positive even with the tab in place.
