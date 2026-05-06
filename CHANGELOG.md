# Changelog

Entries are brief — enough for another agent to know what changed and why, and to spot if something went wrong.

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
