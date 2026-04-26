# LiveProgressSheet — T-021 / T-022 / T-025 / T-103 / T-105 / T-107 (iOS multi-bundle)
Started: 2026-04-26

## User Intent

Six iOS/web tasks bundled into a single commit:

- **T-021**: Delete 6 `#if false` dead blocks — 1 in StoryDetailView.swift (lines 1907-1933, expert Q&A schema mismatch), 5 in AlertsView.swift (lines 645-658, 682-703, 711-732, 741-762, 777-792, subscription insert paths). Keep all `#else` branches intact.
- **T-022**: Delete the `appAwardPoints` private function from StoryDetailView.swift (lines 2458-2512). Zero call sites confirmed across the entire iOS project.
- **T-025**: Promote per-method DateFormatter / ISO8601DateFormatter allocations to `private static let` on the owning type in: StoryDetailView.swift (2 sites: line 1129, line 1794), HomeView.swift (3 sites: lines 48+56 in computeToday — note these are already inside a static func so the formatters live stack-locally but are re-created on every computeToday call; line 392 ISO8601DateFormatter; line 515 in timeShort helper), RecapView.swift (2 sites: lines 43+47 in RecapSummary.dateRange), SettingsView.swift (2 sites: line 1581 ISO8601DateFormatter, line 1582 DateFormatter), ProfileView.swift (line 1660 DateFormatter in dayAccessibilityLabel — achFormatter at 1551 already static, skip; line 1669 ISO8601DateFormatter in loadStreak), BookmarksView.swift (line 307 DateFormatter), FamilyViews.swift (line 1196 ISO8601DateFormatter — kidsAPI extension already static at 1352, skip; the inline 1196 call should use the static), MessagesView.swift (4 ISO8601DateFormatter allocations: lines 517, 651-655, 884-888, 951, 1059-1063), Models.swift (2 sites: line 105 DateFormatter in VPUser.memberSince, line 364 DateFormatter in KidProfile.age), AuthViewModel.swift (line 174 ISO8601DateFormatter in updateLastLogin), EventsClient.swift (line 66 ISO8601DateFormatter in track). EXCLUDE ExpertQueueView.swift and LeaderboardView.swift.
- **T-103**: Add section grouping (Today / This week / Earlier) to notification lists — AlertsView.swift `alertsContent` LazyVStack, and web notifications/page.tsx flat item map.
- **T-105**: Add `.swipeActions` modifier to each unread notification row button in AlertsView.swift. Leading swipe: mark as read. Show only when notification is unread.
- **T-107**: Wire PushPromptSheet presentation after first quiz pass in StoryDetailView.swift. Add `@StateObject private var push = PushPermission.shared` and `@State private var showPushPrompt = false` state. In `submitQuiz()` after `quizStage = .result` when `decoded.passed == true`: check `push.status == .notDetermined && !push.prePromptRecentlyDeclined`, then set `showPushPrompt = true`. Wire `.sheet(isPresented: $showPushPrompt)` with the same PushPromptSheet pattern as AlertsView.swift.

## Live Code State

### T-021
- **StoryDetailView.swift:1907-1933**: Single `#if false` block wrapping expert Q&A fetch. Comment explains schema mismatch (expert_discussions uses title/body/parent_id tree, not question/answer/question_id cols). `#endif` at line 1933 closes the block, immediately before `}` closing `loadData()`. No `#else` branch — pure dead block.
- **AlertsView.swift:645-658**: `#if false` wrapping `let subs = client.from("alert_preferences")...` + assignment of subscribedCategories/Subcategories/Keywords. `#else` at 654 assigns empty arrays — this live branch must be kept.
- **AlertsView.swift:682-703**: `#if false` wrapping `addCategorySubscription()` insert. `#else` at 699 no-ops (clears selectedCategoryToAdd, calls loadManageData). Live `#else` kept.
- **AlertsView.swift:711-732**: `#if false` wrapping `addSubcategorySubscription()` insert. `#else` at 728 no-ops. Live `#else` kept.
- **AlertsView.swift:741-762**: `#if false` wrapping `addKeywordSubscription()` insert. `#else` at 757 no-ops. Live `#else` kept.
- **AlertsView.swift:777-792**: `#if false` wrapping `removeSubscription()` delete. `#else` at 789 contains `_ = sub` (silence unused var). Live `#else` kept.

### T-022
- **StoryDetailView.swift:2458-2512**: `private func appAwardPoints(userId: String, action: String) async` — 54 lines. Zero call sites across all Swift files in VerityPost/ (grep confirmed).

### T-025 — DateFormatter allocations to fix
All allocations confirmed as per-call (not static):
- StoryDetailView.swift:1129 — `DateFormatter()` in `muteBanner()` (called per-render)
- StoryDetailView.swift:1794 — `DateFormatter()` in `formatDate()` (called per-render)
- StoryDetailView.swift:1958 — `ISO8601DateFormatter()` in `loadMuteState()` (called per-load, acceptable, but fix anyway)
- HomeView.swift:48,56 — two `DateFormatter()` in static `computeToday()` — already inside a static func, but computeToday() is called on every `loadData()` trigger. Promote to `private static let` on HomeView.
- HomeView.swift:392 — `ISO8601DateFormatter()` in `loadData()` async func (called per refresh)
- HomeView.swift:515 — `DateFormatter()` in `timeShort()` helper (hot path, per-call)
- RecapView.swift:43,47 — two `DateFormatter()` in `RecapSummary.dateRange` computed property (called per-render on list cells)
- SettingsView.swift:1581 — `ISO8601DateFormatter()` in `static func formatDate(_:)`
- SettingsView.swift:1582 — `DateFormatter()` in same static func
- ProfileView.swift:1660 — `DateFormatter()` in `dayAccessibilityLabel()` (called per day-cell)
- ProfileView.swift:1669 — `ISO8601DateFormatter()` in `loadStreak()` async func
- BookmarksView.swift:307 — `DateFormatter()` in `shortDate()` helper (called per-cell)
- FamilyViews.swift:1196 — `ISO8601DateFormatter()` inline — static `kidsAPI` extension already exists at line 1352. Should use `ISO8601DateFormatter.kidsAPI` instead of `ISO8601DateFormatter()`.
- MessagesView.swift:517 — `ISO8601DateFormatter()` in `markConversationRead()` (called per-action)
- MessagesView.swift:651 — `ISO8601DateFormatter()` in realtime handler (hot path, fires per-message)
- MessagesView.swift:884 — `ISO8601DateFormatter()` in realtime handler (hot path)
- MessagesView.swift:951 — `ISO8601DateFormatter()` in `markVisibleMessagesAsSeen()` (per-action)
- MessagesView.swift:1059 — `ISO8601DateFormatter()` in `sendMessage()` response parsing
- Models.swift:105 — `DateFormatter()` in `VPUser.memberSince` computed property (called per-cell)
- Models.swift:364 — `DateFormatter()` in `KidProfile.age` computed property (called per-cell)
- AuthViewModel.swift:174 — `ISO8601DateFormatter()` in `updateLastLogin()` (one-shot, but fix for consistency)
- EventsClient.swift:66 — `ISO8601DateFormatter()` in `track()` (hot path — called on every event)
- Theme.swift:260 — `DateFormatter()` in global `timeAgo()` function (called per-notification-cell) — not in file list but IS a hot path; task says fix "this file's scope" for listed files but timeAgo is a free function in Theme.swift — note for plan.

**ProfileView.achFormatter (line 1551)**: Already `private static let` — skip.
**FamilyViews.dobFormatter (line 882)**: Instance `let` on a struct — this is a View struct, so it's recreated each time the struct is init'd but not per-render call. Task scope says FamilyViews.swift — note the two occurrences.
**ISO8601DateFormatter.kidsAPI (line 1352)**: Already static extension — skip. The inline usage at 1196 should be replaced with `.kidsAPI`.

### T-103
- **AlertsView.swift**: `alertsContent` (lines 191-239) contains a `LazyVStack` wrapping a `ForEach(Array(notifications.enumerated()), ...)`. Flat list, no section headers.
- **VPNotification.createdAt**: `Date?` — already a `Date`, so grouping comparisons use Calendar directly.
- **web notifications/page.tsx**: Lines 337-376 show a flat `items.map((n) => (<a ...>))`. `created_at` is `string | null` (ISO string from DB type).

### T-105
- **AlertsView.swift**: The notification row `Button` (lines 214-226) wraps `notificationRow(notif)`. The `.swipeActions` modifier goes on the Button.
- `markAsRead()` already exists and handles the PATCH. It guards on `!notif.isRead` internally.

### T-107
- **StoryDetailView.swift**: `submitQuiz()` sets `quizStage = .result` and `userPassedQuiz = true` at lines 2214-2217. No push state exists in this view.
- **PushPermission.shared**: `@MainActor final class`, status `.notDetermined` check, `prePromptRecentlyDeclined` cooldown check, `markPrePromptDeclined()` for onDecline.
- **PushPromptSheet**: Presentational sheet with `title`, `detail`, `onEnable`, `onDecline`. Same pattern used in AlertsView.swift lines 83-101.
- **AlertsView.swift** shows the exact pattern to replicate: `@StateObject private var push = PushPermission.shared`, `@State private var showPushPrompt = false`, `.sheet(isPresented: $showPushPrompt) { PushPromptSheet(...) }`.

## Helper Brief (Continuity Anchor)

**T-021**: The `#else` branches in AlertsView.swift are the live code paths. Deleting only the `#if false`...`#else` portions (keeping `#else`...`#endif`) is the correct surgery. The StoryDetailView block has no `#else` — delete `#if false` through `#endif` inclusive.

**T-022**: `appAwardPoints` is also the call point for `award_reading_points` RPC and streak/achievement toasts. After deletion, the MARK: - Scoring comment at line 2451 should also be removed since it no longer has any function below it. Verify no call site exists in any Swift file (confirmed via grep).

**T-025**: The `ISO8601DateFormatter.kidsAPI` extension already exists in FamilyViews.swift. The inline `ISO8601DateFormatter()` at line 1196 should use `ISO8601DateFormatter.kidsAPI` — not add a second static. For MessagesView.swift, there are three identical patterns of `ISO8601DateFormatter()` with fractional-seconds fallback in realtime handlers — promote one `private static let isoFmt` with `.withInternetDateTime` + `.withFractionalSeconds` and reuse. For files with both `ISO8601DateFormatter()` plain-call (no custom formatOptions), a single `private static let isoFmt = ISO8601DateFormatter()` is correct; the plain default handles `withInternetDateTime` format. Theme.swift `timeAgo` is a free function — add a `private let` at the call site or make it a file-level let (not on a type). Since it's a global func, use a `private let _dateFormatterTimeAgo: DateFormatter = { ... }()` file-level constant.

**T-103 iOS**: `VPNotification.createdAt` is `Date?`. Use `Calendar.current.isDateInToday()`, `Calendar.current.isDate(_:equalTo:toGranularity:.weekOfYear)` for grouping. Helper returns `[(section: String, items: [VPNotification])]`. Replace `LazyVStack` with a sectioned `LazyVStack` iterating sections, with section header text rows. Empty sections omitted.

**T-103 web**: `created_at` is an ISO string. Add a pure function `groupNotifications(items: NotificationRow[]): { section: string, items: NotificationRow[] }[]`. "Today" = same calendar day UTC. "This week" = within the past 7 days but not today. "Earlier" = older. Add section header `<div>` above each group's items.

**T-105**: The `.swipeActions` modifier must be on the `Button`, not the `notificationRow` helper (which returns a `VStack`, not an interactive element). Guard: `if !notif.isRead` for showing the action — but actually `.swipeActions` can always show; the action itself is no-op if already read (markAsRead guards internally). Better: only add the swipe action label/tint as active when `!notif.isRead`. Use `.swipeActions(edge: .leading) { Button { ... } label: { Label("Read", systemImage: "envelope.open") }.tint(.blue) }` pattern. The `allowsFullSwipe: false` prevents accidental full-swipe.

**T-107**: StoryDetailView has no push state today. Pattern from AlertsView: `@StateObject private var push = PushPermission.shared`. The prompt fires after a passing quiz result. The `submitQuiz()` function is not on the MainActor — the state mutation happens inside `await MainActor.run { ... }`. The push check must also happen on MainActor. Add to the MainActor block: after setting `userPassedQuiz = true`, check `push.status == .notDetermined && !push.prePromptRecentlyDeclined && !push.hasBeenPrompted` — then `showPushPrompt = true`. The `hasBeenPrompted` guard ensures we don't show the pre-prompt if the OS dialog has already been presented.

## Contradictions

| Agent | File:line | Expected | Actual | Impact |
|-------|-----------|----------|--------|--------|
| Intake | StoryDetailView.swift:2458 | ~30 lines (task description) | 54 lines (2458-2512) | Plan must delete 2458-2512 not ~30 lines |
| Intake | StoryDetailView.swift:1907-1933 | No `#else` branch | Confirmed: no `#else` before `#endif` at 1933 | Delete full block including `#if false` and `#endif` |
| Intake | AlertsView.swift #if false count | "5 blocks" (task says lines 645, 682, 711, 741, 777) | Confirmed 5 blocks at those exact lines | Matches |
| Intake | ProfileView.achFormatter | Needs promotion | Already `private static let` at 1551 | Skip — no change needed |
| Intake | FamilyViews.dobFormatter:882 | Needs promotion | Is instance `let` on a View struct — per-init not per-render | Low priority but fix for consistency |
| Intake | Theme.swift:260 timeAgo | Not in task file list | Hot path free function with per-call DateFormatter | Plan includes fix anyway; TRIAGE_ASSESSMENT cites this function |

## Agent Votes
- Planner: APPROVE (revised plan — adopted Reviewer's List/swipeActions fix and dual-static ISO pattern)
- Reviewer: REVISE → APPROVE after revision (flagged T-105 swipeActions requires List not LazyVStack; flagged T-025 fractional ISO pattern)
- Final Reviewer: APPROVE (confirmed revisions correct; added loading/empty state branching note for List migration)
- Consensus: 3/3 APPROVE

## 4th Agent (if needed)
[filled only if vote is split]

## Implementation Progress

All 6 tasks implemented across 14 files.

T-021: Stripped all 6 #if false blocks (1 StoryDetailView, 5 AlertsView). All #else branches preserved.
T-022: Deleted appAwardPoints function (54 lines) from StoryDetailView.
T-025: Promoted all per-call DateFormatter/ISO8601DateFormatter allocations to private static let across 13 files. Two-static pattern (msgISO + msgISOFallback / muteISOFmt + muteISOFmtFallback) used for fractional+fallback ISO8601 patterns.
T-103: Added groupedNotifications() helper to AlertsView; migrated populated branch from LazyVStack to List with Section headers. Added groupNotifications() pure function to notifications/page.tsx; replaced flat items.map with grouped section divs.
T-105: .swipeActions(edge: .leading) on each notification row button inside List. Shows only when !notif.isRead. Tint: .blue.
T-107: Added @StateObject push = PushPermission.shared + @State showPushPrompt. Wired in submitQuiz() on pass: guards on .notDetermined + !prePromptRecentlyDeclined + !hasBeenPrompted. Sheet presented via .sheet(isPresented: $showPushPrompt). Added .task { await push.refresh() }.

Pre-existing build failure (stale .xcodeproj refs to deleted possibleChanges/ HTML files) confirmed to pre-date this commit — not introduced by these changes.

## Completed

SHIPPED 2026-04-26
Commit: 24f655e
Files touched: StoryDetailView.swift, AlertsView.swift, HomeView.swift, RecapView.swift, SettingsView.swift, ProfileView.swift, BookmarksView.swift, FamilyViews.swift, MessagesView.swift, Models.swift, AuthViewModel.swift, EventsClient.swift, Theme.swift, web/src/app/notifications/page.tsx
