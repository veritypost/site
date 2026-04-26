# Change Log

Every change made during audit execution sessions. Format per entry:
- **What** — the specific change
- **Files** — files touched
- **Why** — the reason; OwnersAudit task reference where applicable

---

## 2026-04-26 (continued)

### Bookmarks — OwnersAudit Tasks 1, 2, 3, 5, 6 + extra

**Loading skeleton**
- **What** — Replaced `'Loading bookmarks…'` centered div with 4 skeleton card rows. Each skeleton matches the live card shape (`background: '#f7f7f7', border: '1px solid #e5e5e5', borderRadius: 10, padding: 16`) with two placeholder bars (14px title-height, 11px meta-height) animated via `@keyframes vp-pulse`. Skeleton `<main>` wrapper uses identical padding/background to the loaded state to avoid layout jump.
- **Files** — `web/src/app/bookmarks/page.tsx`
- **Why** — OwnersAudit Bookmarks Task 1.

**Undo toast on bookmark remove**
- **What** — Replaced immediate-DELETE `removeBookmark(id: string)` with an optimistic-remove + 5-second undo pattern. Item is removed from state instantly; a persistent toast shows "Bookmark removed" + inline Undo button. Undo restores the item at its original index. After 5 s the DELETE fires; on failure the item is restored and `setError` is called. Timer Map (`useRef<Map<string, timeout>>`) keyed by bookmark ID prevents timer collision when multiple items are removed before any window closes. Added `useEffect` cleanup to clear all pending timers on unmount.
- **Files** — `web/src/app/bookmarks/page.tsx`
- **Why** — OwnersAudit Bookmarks Task 2.

**Touch targets**
- **What** — Added `minHeight: 44` to Remove button, collection × delete button, and + Add note button. Added `minHeight: 36` to collection filter pills, `btnSolid`, and `btnGhost` (fixing Export, New collection, Create, Cancel, Save, Load more in one edit).
- **Files** — `web/src/app/bookmarks/page.tsx`
- **Why** — OwnersAudit Bookmarks Task 3.

**Button label renames**
- **What** — `'Export JSON'` → `'Download my bookmarks'`; `'+ Collection'` → `'New collection'`.
- **Files** — `web/src/app/bookmarks/page.tsx`
- **Why** — OwnersAudit Bookmarks Task 5.

**iOS "Please sign in" copy**
- **What** — `errorText = "Please sign in."` → `"Sign in to manage your bookmarks."` in the auth-session-missing branch of `removeBookmark`.
- **Files** — `VerityPost/VerityPost/BookmarksView.swift`
- **Why** — OwnersAudit Bookmarks Task 6.

**Article title `<a>` → `<Link>` (extra)**
- **What** — Replaced `<a href={`/story/${b.articles?.slug}`}>` with `<Link href={...} prefetch={false}>`. Slug guard (`b.articles?.slug ? \`/story/...\` : '#'`) prevents broken href when join returns null. `prefetch={false}` avoids mass prefetch on long bookmark lists.
- **Files** — `web/src/app/bookmarks/page.tsx`
- **Why** — Internal nav must use Next.js Link; raw `<a>` skips client-side routing. `prefetch={false}` is standard for list items.

---

## 2026-04-26 (messages)

### Messages — OwnersAudit Tasks 1–7, 9–10

**Loading skeletons**
- **What** — Replaced `'Loading...'` full-viewport div with a 4-row conversation list skeleton (header bar + avatar circle + name/preview bars, staggered `vp-pulse` animation). Replaced `{msgsLoading && 'Loading...'}` in the thread pane with 5 alternating left/right bubble skeletons. `vp-pulse` keyframe injected once in the primary `<main>` return so it persists for both skeleton contexts.
- **Files** — `web/src/app/messages/page.tsx`
- **Why** — OwnersAudit Messages Task 1.

**Search modal backdrop dismiss**
- **What** — Added `onClick` to outer backdrop div to reset `showSearch`, `searchQuery`, `searchResults`, `roleFilter`. Added `onClick={(e) => e.stopPropagation()}` to inner `role="dialog"` div. Matches the report dialog pattern already in the same file.
- **Files** — `web/src/app/messages/page.tsx`
- **Why** — OwnersAudit Messages Task 2.

**iOS "Sign in to message" → sign-in button**
- **What** — Replaced bare `Text("Sign in to message")` with a full unauthenticated state: title + descriptor copy + "Sign in" button presenting `LoginView` as a sheet. `@State private var showLogin = false` added; `.sheet(isPresented: $showLogin)` attached to the inner `VStack` (not the outer `Group`) to avoid SwiftUI's single-sheet-per-view constraint.
- **Files** — `VerityPost/VerityPost/MessagesView.swift`
- **Why** — OwnersAudit Messages Task 3.

**Touch targets — web**
- **What** — Added `minHeight: 44` to "New" compose button, "← Back" button, "Cancel" in search modal. Changed "..." overflow button from `padding: '4px 10px'` to `padding: '10px'` + `minHeight: 44`. Changed role filter pills from `padding: '4px 10px'` to `padding: '6px 10px'` + `minHeight: 36`.
- **Files** — `web/src/app/messages/page.tsx`
- **Why** — OwnersAudit Messages Task 4.

**Touch targets — iOS role filter pills**
- **What** — Added `.frame(minHeight: 36)` to role filter pill label block in the search sheet.
- **Files** — `VerityPost/VerityPost/MessagesView.swift`
- **Why** — OwnersAudit Messages Task 5.

**Sentence case**
- **What** — Search modal title `New Message` → `New message`.
- **Files** — `web/src/app/messages/page.tsx`
- **Why** — OwnersAudit Messages Task 6.

**"Please try again" copy**
- **What** — `'Could not unblock this user. Please try again.'` → `"Couldn't unblock. Try again."`; `'Could not block this user. Please try again.'` → `"Couldn't block. Try again."`; `'Could not submit report. Please try again.'` → `"Couldn't send report. Try again."`.
- **Files** — `web/src/app/messages/page.tsx`
- **Why** — OwnersAudit Messages Task 7.

**iOS empty state copy**
- **What** — `"Start a conversation with another user."` → `"Message an expert, author, or another reader to get started."`.
- **Files** — `VerityPost/VerityPost/MessagesView.swift`
- **Why** — OwnersAudit Messages Task 9.

**Kids ExpertSessionsView accessibility**
- **What** — Added `.accessibilityHidden(true)` to 4 standalone decorative `Image` calls (lines 98, 133, 178, 195) and to `Image(systemName: icon)` inside the `metaLabel` helper (fixes all 4 calendar/clock call sites at once).
- **Files** — `VerityPostKids/VerityPostKids/ExpertSessionsView.swift`
- **Why** — OwnersAudit Messages Task 10.

---

## 2026-04-26 (auth)

### Auth — OwnersAudit Tasks 1–5

**"Invalid credentials" copy**
- **What** — All three `setError('Invalid credentials')` branches in `login/page.tsx` (username-not-found × 2 + Supabase auth failure) changed to `'That email or password is incorrect. Check the spelling or reset your password.'` The user-enumeration protection is unchanged — all failure branches still collapse to the same copy.
- **Files** — `web/src/app/login/page.tsx`
- **Why** — OwnersAudit Auth Task 1.

**"Please try again" copy sweep**
- **What** — Catch-block copy `'Network error. Please try again.'` in `login/page.tsx` → `'Network error — check your connection and try again.'`. `'Failed to resend email. Please try again.'` in `verify-email/page.tsx` (throw fallback + catch fallback) → `"Couldn't send the email. Try again in a moment."`. `'Failed to update email. Please try again.'` (2 occurrences) → `"Couldn't update email. Try again in a moment."`. `'Failed to update password. Please try again.'` in `reset-password/page.tsx` → `"Couldn't update password. Try again in a moment."`.
- **Files** — `web/src/app/login/page.tsx`, `web/src/app/verify-email/page.tsx`, `web/src/app/reset-password/page.tsx`
- **Why** — OwnersAudit Auth Task 2. Product voice: no "Please", active voice, specific next step.

**Triple header removal**
- **What** — Removed `<p>` subhead from `/login` ("Sign in to your account to keep reading."), `/forgot-password` ("Enter your email and we'll send a link to set a new password."), and `/reset-password` ("Pick something strong — you won't need the old one anymore."). In each case the h1 margin-bottom was bumped 6px → 24px to preserve the gap to the next element. `/signup` subhead kept ("Read an article, pass the comprehension check, then join the conversation." earns its keep as a product differentiator on the sign-up decision screen).
- **Files** — `web/src/app/login/page.tsx`, `web/src/app/forgot-password/page.tsx`, `web/src/app/reset-password/page.tsx`
- **Why** — OwnersAudit Auth Task 3.

**iOS "Forgot password?" touch target**
- **What** — Added `.frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())` to the "Forgot password?" `Button` in `LoginView`. Previously rendered at ~20px tall with `.font(.footnote)` and no minimum frame.
- **Files** — `VerityPost/VerityPost/LoginView.swift`
- **Why** — OwnersAudit Auth Task 4.

**iOS VoiceOver error announcements**
- **What** — Added `.onChange(of: auth.authError) { _, newValue in UIAccessibility.post(...) }` to the `NavigationStack` level (not the conditionally rendered error `Text`) in both `LoginView` and `SignupView`. `SignupView` also watches `localError` independently with a second `.onChange`. Uses iOS 17 two-parameter closure form `{ _, newValue in }`.
- **Files** — `VerityPost/VerityPost/LoginView.swift`, `VerityPost/VerityPost/SignupView.swift`
- **Why** — OwnersAudit Auth Task 5. VoiceOver users previously got no announcement when errors appeared; they had to manually navigate to the error text.

---

## 2026-04-26 (story)

### Story — OwnersAudit Tasks 1–5, 7–13, 15–17

**Loading skeleton**
- **What** — Replaced plain `'Loading…'` spinner with a skeleton layout: title bar (32px / 80% width), subtitle bar (18px / 55%), and 5 body bars (14px, varying widths). Bars use `var(--rule)` background + `vp-pulse` keyframe animation. Wrapper matches the loaded-state `maxWidth: 720` and padding so there's no layout jump.
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 1.

**404 panel**
- **What** — Replaced raw `'Story not found'` text with a centered panel: "Article not found" h1, context copy, and two CTAs ("Go to home" + "Browse stories").
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 2.

**Quiz teaser before article body**
- **What** — Added a one-line teaser `"Pass the quiz at the end to unlock comments."` above the article body when `quizPoolSize >= 10 && !userPassedQuiz`. Uses `fontSize: 12, color: 'var(--dim)'`. Hidden after the user has passed.
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 3.

**Quiz pass ceremony**
- **What** — Added `justPassedCeremony` state. `onPass` sets it true; after 1500 ms it clears the flag and triggers `setJustRevealedThisSession(true)` (auto-scroll). While `justPassedCeremony` is true, renders `"You're in."` centered above the newly revealed comment thread.
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 4.

**Pool-size gate on discussion section**
- **What** — Added `quizPoolSize < 10 ? null` branch at the top of the `discussionSection` ternary (before the `userPassedQuiz` branch) so articles with fewer than 10 quiz questions show no discussion panel at all.
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 5.

**Discussion lock copy**
- **What** — `"Discussion is locked until you pass the quiz above."` → `"Pass the quiz to join the discussion."`. Rubric copy: `"You need 3 out of 5 correct…"` → `"5 questions about what you just read. Get 3 right and the conversation opens."`.
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 7.

**Anon quiz CTA**
- **What** — Replaced placeholder anon-quiz block with: header `"Every article has a comprehension quiz."`, body `"Pass it and the discussion opens — your comment shows you actually read the story."`, CTA `"Create free account"`.
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 8.

**Bookmark toast feedback**
- **What** — Added `show('Saved to bookmarks')` / `show('Removed from bookmarks')` calls on successful `toggleBookmark`. Error copy updated: `"Bookmark not removed — try again."` / `"Bookmark not saved — try again."`.
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 9.

**Regwall backdrop dismiss**
- **What** — Added `onClick={dismissRegWall}` to the backdrop div; added `onClick={(e) => e.stopPropagation()}` to the inner dialog so clicks inside don't bubble to the backdrop.
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 10.

**Regwall signup `?next=` param**
- **What** — Changed signup href from `/signup` to `/signup?next=${encodeURIComponent('/story/' + story.slug)}` so the user lands back on the article after account creation.
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 11.

**Report button touch target**
- **What** — Added `minHeight: 36, paddingTop: 6, paddingBottom: 6` to the inline report button style.
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 12.

**Report category sentence case**
- **What** — `'Hate Speech'` → `'Hate speech'`; `'Off Topic'` → `'Off topic'` in `REPORT_CATEGORIES`.
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 13.

**iOS bookmark limit copy**
- **What** — `"Free accounts can save up to 10 bookmarks. Unlimited bookmarks and collections are available on paid plans."` → `"You've hit the bookmark limit for free accounts. Upgrade to save unlimited bookmarks."` in `StoryDetailView`.
- **Files** — `VerityPost/VerityPost/StoryDetailView.swift`
- **Why** — OwnersAudit Story Task 15.

**Kids article header accessibility**
- **What** — Added `.accessibilityHidden(true)` to `Image(systemName: "newspaper.fill")` in the article header and `Image(systemName: "clock")` in the reading-time row so VoiceOver skips purely decorative icons.
- **Files** — `VerityPostKids/VerityPostKids/KidReaderView.swift`
- **Why** — OwnersAudit Story Task 16.

**Kids "Take the quiz" button accessibility**
- **What** — Added `.accessibilityHidden(true)` to `Image(systemName: "questionmark.circle.fill")` inside the `takeQuizButton` label so VoiceOver reads only the button text, not the redundant icon name.
- **Files** — `VerityPostKids/VerityPostKids/KidReaderView.swift`
- **Why** — OwnersAudit Story Task 17.

---

## 2026-04-26

### Leaderboard — OwnersAudit Tasks 1, 2, 3, 4

**Removed Weekly tab**
- **What** — Removed `'Weekly'` from the `TABS` constant and its corresponding data-fetch branch from the second `useEffect`. Weekly was a duplicate of Top Verifiers + This Week — identical RPC call, same cutoff, same results.
- **Files** — `web/src/app/leaderboard/page.tsx`
- **Why** — OwnersAudit Leaderboard Task 2. IA cleanup: tabs should answer "rank by what," not mix ranking mode with time window.

**Removed expand drawer; streak shown inline**
- **What** — Removed the tap-to-expand row drawer (5 `StatRow` bars: Score, Articles Read, Quizzes Passed, Comments, Streak). Rows are now static. Streak is surfaced inline below the username as `"{n} day streak"` when non-zero. Cleaned up all associated state (`expanded`, `setExpanded`), props (`onToggle`, `expanded`, `topScore`, `topReads`, `topQuizzes`, `topComments`, `topStreak`), the `StatRow` import, and the row-level ARIA button attributes (`role`, `tabIndex`, `onKeyDown`, `aria-expanded`).
- **Files** — `web/src/app/leaderboard/page.tsx`
- **Why** — OwnersAudit Leaderboard Task 1. Reduce chrome between page load and list content. The expand drawer added interaction overhead for stats that weren't the ranking criterion.

**Period filter pill touch target**
- **What** — Added `minHeight: 36` to period filter pill button style.
- **Files** — `web/src/app/leaderboard/page.tsx`
- **Why** — OwnersAudit Leaderboard Task 3. Pills rendered at ~26px with no minimum; 36px is the audit-specified floor for secondary filter pills inline with other controls.

**Period labels sentence case (web + iOS)**
- **What** — Changed `PERIOD_LABELS` from `['This Week', 'This Month', 'All Time']` to `['This week', 'This month', 'All time']`. Updated `WINDOW_DAYS` object keys to match. Updated all four string comparisons/references in `page.tsx`. Updated Swift enum `rawValue` strings to match.
- **Files** — `web/src/lib/leaderboardPeriod.ts`, `web/src/app/leaderboard/page.tsx`, `VerityPost/VerityPost/LeaderboardPeriod.swift`
- **Why** — OwnersAudit Leaderboard Task 4. Product standard is sentence case for all UI labels.
