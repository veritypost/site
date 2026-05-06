# Changelog

Entries are brief — enough for another agent to know what changed and why, and to spot if something went wrong.

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
