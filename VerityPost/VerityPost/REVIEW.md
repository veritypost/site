# VerityPost iOS — UI/UX Findings Report

_Reviewed 2026-04-19 · 37 Swift files · Read-only analysis_

---

## 1. Corner Radius Inventory

The codebase uses **13 distinct cornerRadius values** across ~200 call sites. This is too many. A well-defined system would use 4–5.

| Radius | Count | Where |
|--------|-------|-------|
| **2** | 2 | StatRowView progress bar (Theme.swift:177–178) |
| **4** | 4 | VerifiedBadgeView (Theme.swift:147), activity type badges (ProfileView:326, HomeView:709), ProfileSubViews:45 |
| **6** | 4 | Session-expired banner button (ContentView:195), ExpertQueueView buttons (155, 163, 170), SubscriptionView badge (133), ProfileView bookmark note border (701) |
| **8** | 28 | Text fields across auth (LoginView:43–59, SignupView:58–72, ForgotPasswordView:61–62, ResetPasswordView:122–123), ProfileView stat cells (179, 189, 203–204, 425–426, 626, 673, 718, 866), HomeView search fields (254, 442, 482–483), StoryDetailView source cards (339, 351, 368, 421–422), mention autocomplete bg (921), AlertsView toggles (309, 335, 374, 400, 454–455), MessagesView (152), PublicProfileView follow button (86–87), SubscriptionView (68, 102, 247) |
| **9** | 3 | Quiz option buttons (StoryDetailView:582, 685, 698) |
| **10** | 40 | General cards: HomeView story cards (341–342), BookmarksView (189–190, 209, 239–240), ProfileView nav rows (599–600, 678–679, 705–706, 724–725, 812–813, 845, 874, 947), FamilyViews all cards (61, 82, 101, 142, 219), AlertsView notification cards (142, 502, 528–531), StoryDetailView comment cards (755–756, 779–780, 895–896, 1104–1105), HomeFeedSlots ad slot (135–136), PublicProfileView (151–152), RecapView (154–155, 418), SubscriptionView toggle container (90–91), ExpertQueueView (232, 372), LeaderboardView rank card (219–220), WelcomeView CTA (95) |
| **12** | 16 | Primary action buttons: LoginView (101, 133, 155–156), SignupView (171, 204, 226–227), VerifyEmailView (72), ForgotPasswordView (48, 86), ResetPasswordView (84), PushPromptSheet (62), HomeView story card outer (234, 738–739), HomeFeedSlots recap card (63–64), StoryDetailView mute banner (862–863), comment section (1133–1134), LeaderboardView your-rank card (177–178), ProfileView milestones (467–468, 513–514), ProfileSubViews category cards (193–194), MessagesView (248), StoryDetailView timeline card (1763) |
| **14** | 18 | Section containers: ProfileView identity card (208–209), StoryDetailView quiz container (592–593, 707–708, 934–935), SubscriptionView plan cards (213, 217, 263, 267), KidViews settings rows (1120, 1131, 1142, 1193–1194, 1209), LeaderboardView filter pills (89, 91, 238, 240, 257–258) |
| **16** | 3 | HomeView reg wall (243), AlertsView subscription card (439–440), KidViews search bar (225, 227), KidViews badge empty (886) |
| **18** | 10 | KidViews only: leaderboard rows (753–754), stat bubbles (981–982), expert session cards (1056–1057), profile nav rows (919–920), chat bubbles (MessagesView:676) |
| **20** | 3 | LeaderboardView scope pills (66), MessagesView input field (706–707) |
| **22** | 5 | KidViews only: category tiles (265, 446), story cards (495, 498), streak strip (265) |
| **99 / Capsule** | 7 | PillButton (Theme:206–209), BookmarksView collection pills (129, 132), StoryDetailView TTS controls (389) |

**Recommendation:** Standardize to 5 tokens:
- `VP.radiusXS` = 4 (badges, tiny labels)
- `VP.radiusSM` = 8 (text fields, small buttons, stat cells)
- `VP.radiusMD` = 12 (cards, action buttons, list rows)
- `VP.radiusLG` = 16 (sections, overlays, kid search bar)
- `VP.radiusFull` = 99 (pills, capsule elements)

Kid mode would add `VP.kidRadius` = 22 for tiles and `VP.kidCardRadius` = 18 for kid cards.

The stray **9** on quiz buttons (StoryDetailView:582, 685, 698) should become 8. The **6** on session-banner and ExpertQueue buttons should become 8. The **20** on leaderboard pills should become 99 (they're pills).

**Severity:** Medium · **Effort:** ~2 hours (find-and-replace with design token constants)

---

## 2. Touch Targets Below 44×44pt

Apple HIG minimum: 44×44pt. The following interactive elements fall short.

| # | File : Line | Component | Actual Size | Fix |
|---|-------------|-----------|-------------|-----|
| 1 | ContentView:196–199 | Session-expired dismiss ✕ button | ~24×24pt (Image 10pt + padding) | Wrap in `.frame(minWidth: 44, minHeight: 44)` |
| 2 | ContentView:243–248 | Notification red dot area (not tappable, but parent button has no explicit minimum) | Varies | Add `.contentShape(Rectangle())` to parent |
| 3 | HomeView:709 | "BREAKING" badge tap area | ~32×18pt (text only) | Not interactive — OK if not a button |
| 4 | StoryDetailView:582,685,698 | Quiz option A/B/C/D buttons | padding(12) ≈ ~38×38pt | Increase to `.padding(14)` or add `.frame(minHeight: 44)` |
| 5 | StoryDetailView:1049–1062 | Upvote/downvote buttons | ~24×24pt (icon + minimal padding) | Add `.frame(minWidth: 44, minHeight: 44)` |
| 6 | ExpertQueueView:155,163 | Claim/Decline buttons | `.padding(.horizontal, 12).padding(.vertical, 6)` ≈ ~48×28pt | Bump vertical to 10pt |
| 7 | BookmarksView:129–132 | Collection filter pills (short labels like "All") | ~36×28pt | Add `.frame(minHeight: 44)` |
| 8 | LeaderboardView:66 | Scope pill buttons | `.padding(.horizontal, 14).padding(.vertical, 7)` ≈ ~42×28pt | Bump vertical to 10pt |
| 9 | LeaderboardView:238–240 | Category filter pills | `.padding(.horizontal, 12).padding(.vertical, 5)` ≈ ~40×24pt | Bump to `.padding(.vertical, 10)` |
| 10 | AlertsView:454–455 | Alert action buttons (small) | `.padding(.horizontal, 8).padding(.vertical, 4)` ≈ ~36×22pt | Bump to `.padding(.vertical, 10)` |
| 11 | MessagesView:676 | Chat bubble (tap area on small messages) | Varies; short messages ~50×30pt | Add `.frame(minHeight: 44)` |
| 12 | ProfileView:326 | Activity type badge (if tappable) | ~28×18pt | Not tappable — verify |
| 13 | KidViews:1142 | "Exit kid mode" text button | Full width, but `.padding(.vertical, 14)` = 42pt | Bump to 16pt |

**Severity:** High (accessibility compliance) · **Effort:** ~1 hour

---

## 3. Terminology Inconsistencies

The app mixes "Log In" and "Sign in" — two instances use "Log In/in", everything else uses "Sign in".

| File : Line | Current | Should Be |
|-------------|---------|-----------|
| ContentView:227 | `"Log In"` (profile tab label when logged out) | `"Sign In"` |
| StoryDetailView:773 | `"Log in to join the discussion."` | `"Sign in to join the discussion."` |

All other instances already use "Sign in" (ContentView:126, 185, 189, 282; BookmarksView:269; LoginView:26, 126, 148; SignupView:197, 238; AlertsView:131, 136; ProfileView:127, 132; MessagesView:62; VerifyEmailView:91; StoryDetailView:1503, 1550). The standard is clearly "Sign in" — fix the two outliers.

**Severity:** Medium (brand consistency) · **Effort:** 5 minutes

---

## 4. Empty States Missing CTAs

Every "No X yet" message should guide the user to a next action. These don't:

| # | File | Current Copy | Problem | Proposed Fix |
|---|------|-------------|---------|--------------|
| 1 | HomeView ~148 | "No stories found" | No CTA | "No stories match this filter" + "Reset filters" button |
| 2 | ProfileView (Activity tab) | "No activity yet." | No CTA | "No activity yet — read an article to get started." + "Browse articles" button |
| 3 | ProfileView (Categories tab) | "No categories yet." | No CTA | "No category stats yet — start reading to see your breakdown." |
| 4 | ProfileView (Achievements tab) | "No achievements yet." | No CTA | "No achievements unlocked yet — keep reading and quizzing to earn your first." |
| 5 | LeaderboardView ~132 | "No results." | Too terse, no CTA | "No results for this filter — try a different category or time range." |
| 6 | FamilyViews:36 | "No kid profiles set up yet." | No CTA | "No kid profiles yet" + "Add a child profile" button (or link to web if native create is deferred) |
| 7 | KidViews:316 | "No articles yet. Try another one!" | Voice is good but vague about what "another one" means | "No articles in this category yet — try a different one!" |
| 8 | KidViews:340–341 | "No matches. Try a different word!" | OK for kids but could add more guidance | Acceptable as-is (kid-friendly voice) |
| 9 | RecapView (loadMissed failure) | Silent — nothing shown | No feedback at all | Show "Couldn't load missed articles" inline |

**Already good:** BookmarksView has "Browse articles" CTA. MessagesView has "New Message" CTA. AlertsView "You're all caught up" directs to Manage. KidViews badge empty state is encouraging ("Take quizzes and build streaks to earn your first badge!").

**Severity:** Medium · **Effort:** ~1 hour

---

## 5. Error Message Voice

The briefing asks for warmer, user-centered copy. These messages use system-voice or passive construction:

| # | File : Line | Current | Proposed |
|---|-------------|---------|----------|
| 1 | HomeView ~128 | "Couldn't load stories" | "We couldn't load the feed right now — check your connection and try again." |
| 2 | HomeView ~594 | "Couldn't load more stories. Tap to retry." | "We couldn't load more — tap to try again." |
| 3 | HomeView ~652 | "Search failed. Check your connection and try again." | "Search didn't work — check your connection and try again." |
| 4 | StoryDetailView:111 | "Couldn't load this story" | "We couldn't load this article — check your connection." |
| 5 | StoryDetailView:1503 | "Please sign in." | "Sign in to take quizzes." |
| 6 | StoryDetailView:1508 | "Couldn't start quiz." | "We couldn't start the quiz — try again." |
| 7 | StoryDetailView:1540 | "Network issue." | "Connection issue — check your internet and try again." |
| 8 | StoryDetailView:1681 | "Couldn't update vote. Try again." | "We couldn't record your vote — try again." |
| 9 | BookmarksView:260 | "Couldn't load bookmarks." | "We couldn't load your bookmarks — check your connection." |
| 10 | ProfileSubViews:275,285 | "Couldn't remove." | "We couldn't remove that bookmark — try again." |
| 11 | RecapView:268 | "Could not submit." | "We couldn't submit your answers — try again." |
| 12 | VerifyEmailView:83 | "Couldn't send. Try again in a moment." | "We couldn't send the link — try again in a moment." |
| 13 | ExpertQueueView | "Network issue." (for all errors) | Differentiate: "Connection issue — check your internet." vs. "Something went wrong — try again." |
| 14 | AlertsView:162 | "Your account doesn't have access to the notifications inbox right now." | "Notifications aren't available on your current plan." |

**Pattern:** Add "We" as the subject to make errors feel like the app is taking responsibility. Replace "Couldn't" with "We couldn't". Replace vague "Network issue" with actionable "Connection issue — check your internet."

**Severity:** Medium · **Effort:** ~45 minutes

---

## 6. Accessibility

### 6a. Icon-Only Buttons Without Labels (Critical)

Zero `.accessibilityLabel` modifiers exist in the entire codebase. These icon-only buttons are invisible to VoiceOver:

| # | File : Line | Icon | Needs Label |
|---|-------------|------|-------------|
| 1 | ContentView:196–199 | `xmark` (dismiss session banner) | "Dismiss" |
| 2 | HomeView (toolbar) | `magnifyingglass` (open search) | "Search" |
| 3 | HomeView (search overlay) | `xmark` (close search) | "Close search" |
| 4 | ProfileView ~175 | `square.and.arrow.up` (share profile) | "Share profile" |
| 5 | ProfileView ~189 | `gearshape` (settings) | "Settings" |
| 6 | MessagesView ~111 | `square.and.pencil` (compose) | "New message" |
| 7 | StoryDetailView ~199 | `xmark` (close) | "Close" |
| 8 | AlertsView ~155 | `bell.slash` (denied state icon) | Decorative — hide with `.accessibilityHidden(true)` |
| 9 | FamilyViews:76,97 | `chevron.right` (nav indicators) | Decorative — the parent row is the accessible element |
| 10 | KidViews:291–293 | `chevron.left` + "Back" (back button) | Has text — OK |
| 11 | KidViews:219 | `xmark.circle.fill` (clear search) | "Clear search" |
| 12 | BookmarksView ~169 | `xmark` or "Remove" text link | Has text — OK |

**Severity:** Critical (VoiceOver users cannot use these controls) · **Effort:** ~30 minutes

### 6b. No `@ScaledMetric` or Dynamic Type Support

Every font in the app uses `.system(size: N)` with hardcoded sizes. This means the app ignores the user's preferred text size. This is acknowledged in the briefing as known debt.

**Quick win:** Convert the 5 most-read text sizes to `@ScaledMetric`:
- Article body (17pt) — this is the one that matters most for readability
- Story card title (15pt)
- Story card summary (13pt)
- Navigation bar titles
- Button labels

**Severity:** High (accessibility compliance, App Store review risk) · **Effort:** ~2 hours for the top 5

### 6c. No Reduce Motion Checks

7 animations in the codebase never check `@Environment(\.accessibilityReduceMotion)`:

| File | Animation | Risk |
|------|-----------|------|
| StoryDetailView ~192 | Achievement toast `.easeInOut(0.3)` | Low (short, subtle) |
| StoryDetailView ~193 | Streak celebration `.easeInOut(0.3)` | Low |
| ProfileView ~480,542 | Chevron rotation `.easeOut(0.2)` | Low |
| LeaderboardView ~272 | Row expansion `.easeInOut(0.15)` | Low |
| WelcomeView ~63 | Onboarding page swipe `.easeInOut` | Medium (full-screen transition) |
| KidViews:508 | `KidPressStyle` spring scale (0.96, response 0.25) | Medium (constant, every tap) |

All are short-duration and low-amplitude, so risk is low. But best practice is to wrap them:

```swift
@Environment(\.accessibilityReduceMotion) var reduceMotion
.animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: isExpanded)
```

**Severity:** Low · **Effort:** ~20 minutes

---

## 7. Haptic Feedback

Zero haptics in the entire codebase. Key moments that would benefit:

| Moment | Feedback Type | File |
|--------|--------------|------|
| Quiz passed | `UINotificationFeedbackGenerator.success` | StoryDetailView (quiz result) |
| Quiz failed | `UINotificationFeedbackGenerator.error` | StoryDetailView (quiz result) |
| Bookmark saved/removed | `UIImpactFeedbackGenerator.light` | StoryDetailView, BookmarksView |
| Comment posted | `UINotificationFeedbackGenerator.success` | StoryDetailView |
| Vote cast (up/down) | `UISelectionFeedbackGenerator` | StoryDetailView |
| Achievement unlocked | `UINotificationFeedbackGenerator.success` | StoryDetailView (toast) |
| Streak milestone (7, 30, 90) | `UINotificationFeedbackGenerator.success` | StoryDetailView (celebration) |
| Pull-to-refresh triggered | `UIImpactFeedbackGenerator.medium` | HomeView |
| Kid mode entered/exited | `UIImpactFeedbackGenerator.medium` | FamilyViews, KidExitPinSheet |

**Severity:** Low (polish) · **Effort:** ~1 hour

---

## 8. Typography Scale

The codebase uses **16 distinct font sizes**: 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28, 30, 34. Plus 5 weight variants (regular, medium, semibold, bold, heavy/black). This creates ~47 unique font combinations.

**Proposed 7-step scale (replacing all 16 sizes):**

| Token | Size | Weight | Replaces | Usage |
|-------|------|--------|----------|-------|
| `VP.caption` | 10pt | regular/medium | 9, 10, 11 | Badges, timestamps, tiny metadata |
| `VP.footnote` | 12pt | regular/semibold | 12 | Field labels, secondary text, quiz explanations |
| `VP.body` | 14pt | regular/semibold | 13, 14 | Card titles, list items, body copy |
| `VP.callout` | 16pt | semibold/bold | 15, 16 | Section headers, button text, stat values |
| `VP.headline` | 18pt | bold | 17, 18 | Profile name, modal titles |
| `VP.title` | 22pt | bold | 20, 22, 24 | Page titles, article title |
| `VP.largeTitle` | 28pt | bold | 26, 28, 30 | Splash, login header, onboarding |

Kid mode adds `.rounded` design to every token.

The article body stays at **17pt** as a special case (reading-optimized, matches web).

**Severity:** Medium (maintainability, consistency) · **Effort:** ~3 hours

---

## 9. Spacing & Padding Inconsistencies

### Card padding — 5 different values for the same component type

| Card Type | Padding | File |
|-----------|---------|------|
| Story card | `.padding(.horizontal, 16).padding(.vertical, 14)` | HomeView |
| Bookmark card | `.padding(16)` | BookmarksView |
| Notification card | `.padding(12)` | AlertsView |
| Identity card | `.padding(14)` | ProfileView |
| Family kid card | `.padding(14)` | FamilyViews |
| Leaderboard row | `.padding(.horizontal, 20).padding(.vertical, 12)` | LeaderboardView |
| Kid story card | `.padding(18)` | KidViews |
| Kid leaderboard row | `.padding(16)` | KidViews |

**Recommendation:** Standardize adult cards to `.padding(16)` symmetric. Kid cards to `.padding(18)`.

### Button padding — 6+ different patterns

| Button Type | Horizontal | Vertical | File |
|-------------|-----------|----------|------|
| Session banner CTA | 10 | 5 | ContentView:190 |
| PillButton | 12 | 8 | Theme:206 |
| Kid "Open" button | 14 | 10 | FamilyViews:58 |
| Auth primary CTA | 26 | 11 | LoginView:101 |
| Profile nav CTA | — | 12 | ProfileView |
| ExpertQueue buttons | 12 | 6 | ExpertQueueView:155 |

**Recommendation:** Two button sizes:
- Standard: `.padding(.horizontal, 16).padding(.vertical, 10)` (guarantees 44pt height with 14pt text)
- Compact: `.padding(.horizontal, 12).padding(.vertical, 8)` (for pills only)

### Section padding — mostly consistent but one outlier

Most content areas use `.padding(20)` horizontal. StoryDetailView uses `.padding(16)`. Should be 20 for consistency, or 16 everywhere if the narrower feel is preferred. Pick one.

**Severity:** Medium · **Effort:** ~2 hours

---

## 10. Visual Hierarchy Issues

### Home feed — primary action not obvious enough

The home feed's story cards are all the same visual weight. There's no differentiation between the top story and the rest. The "BREAKING" badge exists but is just colored text, not a visually distinct card treatment.

**Suggestion:** Give the first story card (or any breaking story) a slightly larger title (18pt vs 15pt) or a subtle accent-tinted left border to create visual hierarchy in the feed.

### StoryDetailView Discussion tab — quiz gate is too subtle

The quiz gate ("Unlock discussion — Answer 5 questions") blends into the card background (VP.card). For a feature that's the core engagement loop, it should be more prominent.

**Suggestion:** Add a subtle accent border or a slightly heavier card treatment. The progress dots are 7pt and nearly invisible — bump to 10pt.

### Profile stats — all equal weight

The 4-stat row (Verity Score, Streak, Articles, Comments) treats all metrics equally. Verity Score is the platform's signature metric and should be visually primary.

**Suggestion:** Make the Verity Score cell slightly larger or give it an accent-tinted background, similar to how the kid profile stat bubbles use theme-colored borders.

**Severity:** Low (design polish) · **Effort:** ~1 hour

---

## 11. Safe Areas

Safe area handling is generally correct. The `.safeAreaInset(edge: .bottom, spacing: 0)` pattern for both tab bars is best practice.

One concern: **KidViews greeting band** (line 161–192) uses `.ignoresSafeArea(edges: .top)` on the color fill, then applies manual `.padding(.top, 50)` for content. This hardcoded 50pt works on current devices but will break if the status bar height changes (it's 54pt on Dynamic Island devices, 47pt on notch devices, 20pt on SE). Should use `GeometryReader` with `safeAreaInsets.top` or a `safeAreaInset` modifier instead.

Similarly, **KidLeaderboardView** (line 569) and **KidProfileView** (line 841) use the same `.ignoresSafeArea(edges: .top)` + hardcoded padding pattern.

**Severity:** Medium (device compatibility) · **Effort:** ~30 minutes

---

## 12. Forced Light Mode

The app forces `.preferredColorScheme(.light)` globally (ContentView:74). This is intentional and matches the editorial design language. However:

- Users with system-wide dark mode get a jarring white flash when launching the app or switching to it.
- The `Info.plist` should set `UIUserInterfaceStyle = Light` to prevent the flash (if not already set).

**Severity:** Low · **Effort:** 5 minutes (plist check)

---

## 13. Missing Loading Skeletons

Most views show a bare `ProgressView()` spinner while loading. This is acceptable for fast loads but causes layout jump when content appears.

Views that would benefit from skeleton/placeholder states:

| View | Current | Recommended |
|------|---------|-------------|
| HomeView (initial load) | Spinner | 3–4 skeleton story cards (gray rectangles matching card layout) |
| StoryDetailView (article load) | Spinner | Title placeholder + body line placeholders |
| ProfileView (tab content) | Spinner | Skeleton stat blocks + list rows |
| BookmarksView | Spinner | Skeleton bookmark cards |

This is a larger effort and could be a Phase 2 item. The spinner is functional; skeletons are polish.

**Severity:** Low (UX polish) · **Effort:** ~4 hours

---

## 14. Miscellaneous Findings

### 14a. Deprecated `.cornerRadius()` modifier

Many call sites use the deprecated `.cornerRadius(N)` modifier (deprecated in iOS 17.0 in favor of `.clipShape(RoundedRectangle(cornerRadius: N))`). Some files use both on the same element (`.cornerRadius(10)` + `.overlay(RoundedRectangle(cornerRadius: 10).stroke(...))`). The modern pattern should be:

```swift
.clipShape(RoundedRectangle(cornerRadius: 10))
.overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
```

Kid views already use this pattern consistently. Adult views mostly use the old `.cornerRadius()`.

**Severity:** Low (API hygiene) · **Effort:** ~1 hour

### 14b. KidPressStyle used inconsistently in kid mode

`KidPressStyle` (bouncy scale on press) is applied to most kid-mode buttons but not all. `KidSettingsView`'s "Exit kid mode" button (line 1134) and some `NavigationLink` rows don't use it, breaking the tactile consistency of kid mode.

**Severity:** Low · **Effort:** 10 minutes

### 14c. Color hardcoding outside Theme.swift

A few colors are hardcoded outside the design system:

| File : Line | Color | Should Be |
|-------------|-------|-----------|
| ContentView:245 | `Color(hex: "dc2626")` (notification dot) | `VP.wrong` or `VP.danger` |
| StoryDetailView:862 | `Color(hex: "fecaca")` (mute banner border) | Already have `VP.failBorder` |
| HomeView:709 | `Color(hex: "ef4444")` (breaking badge) | `VP.wrong` |
| BookmarksView warning banner | Inline hex colors for amber warning | Extract to `VP.warnBg`, `VP.warnBorder` |

**Severity:** Low · **Effort:** 15 minutes

---

## Priority Summary

| Priority | Finding | Effort |
|----------|---------|--------|
| **P0 — Critical** | Add `.accessibilityLabel` to 11 icon-only buttons (#6a) | 30 min |
| **P0 — Critical** | Fix touch targets below 44pt (#2) | 1 hr |
| **P1 — High** | Fix "Log In" → "Sign in" (2 instances) (#3) | 5 min |
| **P1 — High** | Add CTAs to 7 empty states (#4) | 1 hr |
| **P1 — High** | Fix hardcoded safe-area padding in kid greeting bands (#11) | 30 min |
| **P2 — Medium** | Warm up 14 error messages (#5) | 45 min |
| **P2 — Medium** | Standardize corner radii to 5 tokens (#1) | 2 hr |
| **P2 — Medium** | Standardize card/button padding (#9) | 2 hr |
| **P2 — Medium** | Introduce typographic scale (#8) | 3 hr |
| **P3 — Low** | Add haptic feedback at 9 key moments (#7) | 1 hr |
| **P3 — Low** | Add reduce-motion checks to 7 animations (#6c) | 20 min |
| **P3 — Low** | Migrate deprecated `.cornerRadius()` calls (#14a) | 1 hr |
| **P3 — Low** | Loading skeletons for 4 main views (#13) | 4 hr |
| **P3 — Low** | Extract hardcoded colors to Theme.swift (#14c) | 15 min |
| **P3 — Low** | Visual hierarchy improvements (#10) | 1 hr |
| **P3 — Low** | Dynamic Type support for top 5 text sizes (#6b) | 2 hr |

**Total estimated effort:** ~20 hours across all items.

P0 items (accessibility compliance) should ship immediately — they're 90 minutes of work and eliminate the most severe usability gaps.
