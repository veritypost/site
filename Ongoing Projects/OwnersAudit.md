# OwnersAudit

## Prompt

Walk through UI_IMPROVEMENTS.md and Pre-Launch UI items surface by surface. For each item, diagnose whether it still has legs against the current code, document the finding, and propose a fix. No code changes in this file — this is the decision and planning layer only.

---

## Leaderboard

All items sourced from `Archived/Unconfirmed-Projects-2026-04-26/UI_IMPROVEMENTS.md` and direct code review of `web/src/app/leaderboard/page.tsx`.

---

### Leaderboard Task 1 — Filter stack is too busy ✓ DONE

**File:** `web/src/app/leaderboard/page.tsx`
**Source:** Direct owner feedback + code review

**Problem:**
Up to 4 filter rows stack above the user list before a single name appears:
1. Tabs (Top Verifiers / Top Readers / Rising Stars / Weekly)
2. Period pills (All Time / This Week / This Month / This Year) — Top Verifiers only
3. Category pills — `flexWrap: 'wrap'`, can become 2–3 lines depending on category count
4. Subcategory pills — appear below category row when a category is active

Research-backed reason this hurts: the hook on a leaderboard is social comparison ("I'm #12, I can beat #11"). Every row of chrome between page load and the list bleeds that hook. Minimal controls = more engagement.

**Proposed fix:**
- Tabs stay as row 1 (unchanged)
- Everything below tabs collapses into one compact filter bar (row 2): period pills inline left, category as a dropdown select (not a pill wall), subcategory as a second dropdown that appears only when a category is active
- Max 2 rows of chrome before content, always
- Expand drawer + 5 stat bars removed — streak shown inline on each row, no tap required
- Top 3 rank numbers get subtle gold / silver / bronze color treatment (recognition hierarchy, not gamification)
- All data fetching untouched

**Status:** Done 2026-04-26

---

### Leaderboard Task 2 — "Weekly" tab is a time window masquerading as a ranking mode ✓ DONE

**File:** `web/src/app/leaderboard/page.tsx`
**Source:** UI_IMPROVEMENTS.md, Browse section [2/4]

**Problem:**
Tabs are: Top Verifiers / Top Readers / Rising Stars / Weekly. The first three answer "rank by what." Weekly answers "rank over when." Mixing modes in the same tab bar is confusing IA. In the code, the Weekly tab is hardcoded to `periodSince('This Week')` — it is literally identical to selecting Top Verifiers + This Week on the period picker. It's a duplicate of existing functionality with a misleading label.

**Proposed fix:**
Remove the Weekly tab. "This Week" already exists as a period pill on Top Verifiers. Net result: 3 tabs instead of 4, no functionality lost, IA is clean.

**Status:** Done 2026-04-26

---

### Leaderboard Task 3 — Period filter pills fail 44px touch target ✓ DONE

**File:** `web/src/app/leaderboard/page.tsx`
**Source:** UI_IMPROVEMENTS.md, Top 20 #8 [4/4 Critical]

**Problem:**
Tab buttons pass — they have `minHeight: 44`. Period pills do not — they are `padding: '5px 12px'` with no minHeight, rendering at roughly 26–28px tall. Fails WCAG 44×44 minimum. This is especially bad on mobile where the period row is the first thing you tap after choosing a tab.

**Proposed fix:**
Add `minHeight: 36` to period pills. 36px is acceptable for secondary filter pills that sit inline with other controls. If pills ever become standalone row items, bump to 44px.

**Status:** Done 2026-04-26

---

### Leaderboard Task 4 — Period labels are Title Case ✓ DONE

**File:** `web/src/lib/leaderboardPeriod.ts`
**Source:** UI_IMPROVEMENTS.md, Browse section [1/4]

**Problem:**
`PERIOD_LABELS` exports: "All Time", "This Week", "This Month", "This Year". Product standard is sentence case for all UI labels. These show up directly as pill text.

**Proposed fix:**
Change to: "All time", "This week", "This month", "This year". One line in `leaderboardPeriod.ts`.

**Status:** Done 2026-04-26

---

### Leaderboard Note — Content width mismatch (not standalone, part of broader fix)

**File:** `web/src/app/leaderboard/page.tsx`
**Source:** UI_IMPROVEMENTS.md, Top 20 #4 [3/4 Critical]

**Note:**
Leaderboard is `maxWidth: 800`. Home feed is `maxWidth: 680`. Navigating between them causes a visible 120px content-width jump. This is part of the broader responsive overhaul item (#4 in Top 20) — fix it there, not in isolation. Flagged here so it doesn't get missed when the responsive pass runs.

**Status:** Deferred to responsive overhaul

---

## Home `/`

All items cross-referenced against current code at `web/src/app/page.tsx`.

Items from UI_IMPROVEMENTS.md that no longer apply:
- **Double header (Top #5)** — no second nav exists in the current code. Already resolved.
- **Category pill horizontal scroll** — home has no category pills. Page redesigned to newspaper front-page format since the audit. Not applicable.
- **Breaking banner not a link** — `BreakingStrip` already renders as a `<Link href={/story/${story.slug}}>`. Already fixed.
- **Empty state copy** — current is "No new stories yet today." with a browse CTA for logged-in users. Already better than what the audit flagged.
- **Day N streak line** — not on this page. Not applicable.
- **Load-more button** — no pagination. Page is a curated 8-story front page by design. Not applicable.

---

### Home Task 1 — Loading state is italic text, should be skeleton

**File:** `web/src/app/page.tsx:252–264`
**Source:** UI_IMPROVEMENTS.md, Home section [3/4]

**Problem:**
Loading state renders as italic serif text: "Loading today's front page…". The audit standard is skeleton cards that match the shape of the content they replace. Text loading states feel unpolished and give no sense of what's coming.

**Proposed fix:**
Replace the text with a skeleton — one large block for the hero (mimicking the 36px serif headline + excerpt shape) and 3–4 narrow blocks for supporting cards. One `Skeleton` component, reused across surfaces.

**Status:** Pending execution

---

### Home Task 2 — Anon user hits end of page with no sign-up prompt

**File:** `web/src/app/page.tsx:567–607`
**Source:** UI_IMPROVEMENTS.md, Home section [1/4] + direct code review

**Problem:**
`EndOfFrontPage` for anon users renders only "That's today's front page." — no CTA, no pitch, no next step. An anon reader who makes it through the whole front page is a warm lead. Currently they hit a dead end. Logged-in users get a "Browse all categories →" link; anon gets nothing.

**Has legs:** Yes. The end of the front page is the highest-intent moment for an anon visitor. A single line — "Create a free account to unlock comments and track your reading streak." with a sign-up link — captures that intent without disrupting the reading experience.

**Proposed fix:**
In the `EndOfFrontPage` component, add an anon branch (mirror of the `loggedIn` branch) with a brief pitch and a "Create free account" link to `/signup`.

**Status:** Pending execution

---

### Home Task 3 — Inline `const C` palette duplicated from global tokens

**File:** `web/src/app/page.tsx:21–29`
**Source:** UI_IMPROVEMENTS.md, Top 20 #12 [4/4]

**Problem:**
The home page declares its own `const C = { bg, text, soft, dim, muted, rule, accent }` inline at line 21. This pattern is duplicated 20+ times across public web pages per the audit. Single source of truth for color should be `@/lib/tokens` — not re-declared per file. Also: `C.dim` is `#666666` here, but the global token standard is `#5a5a5a` — they've already drifted.

**Has legs:** Yes, but this is a global sweep (every public page), not just home. Flag here, execute as one pass across all pages.

**Status:** Deferred to global token sweep

---

### Home Note — maxWidth 720 on desktop (part of global responsive fix)

**File:** `web/src/app/page.tsx:244`
**Source:** UI_IMPROVEMENTS.md, Top 20 #4 [3/4 Critical]

**Note:**
Home feed is `maxWidth: 720`. On a 1440px screen this is a narrow column with large empty gutters. Part of the broader responsive overhaul (Top #4) — at ≥1024px either widen the column or add a sidebar. Fix in the responsive pass, not in isolation.

**Status:** Deferred to responsive overhaul

---

## Story `/story/[slug]`

All items cross-referenced against `web/src/app/story/[slug]/page.tsx`, `VerityPost/VerityPost/StoryDetailView.swift`, and `VerityPostKids/VerityPostKids/KidReaderView.swift`.

Items from UI_IMPROVEMENTS.md that no longer apply:
- **Reduce motion (iOS)** — `@Environment(\.accessibilityReduceMotion)` is already wired in `StoryDetailView.swift:137`. Already fixed.
- **44px touch target on more-options button (iOS)** — `.frame(minWidth: 44, minHeight: 44)` is already on the button at `StoryDetailView.swift:260`. Already fixed.
- **CSS variable drift / inline `const C`** — story page uses CSS variables throughout, not a local palette. Already migrated. No action needed.
- **Regwall missing CTA** — regwall already has "Create free account" wording and links to `/signup`. Already fixed.
- **Regwall missing focus trap** — `useFocusTrap` is wired and Escape closes the modal. Already fixed.

---

### Story Task 1 — Loading state is text, not skeleton ✓ DONE

**Files:** `web/src/app/story/[slug]/page.tsx:line ~early return`, `VerityPost/VerityPost/StoryDetailView.swift`
**Source:** UI_IMPROVEMENTS.md, Reading section [1/4]

**Problem:**
Web loading state is `<div role="status" aria-live="polite">Loading article…</div>` — plain italic text. iOS equivalent is a spinner with no structural skeleton. The audit standard is skeleton cards that match the content shape: hero headline block, deck, byline, body paragraphs. Text/spinner loading gives no sense of what's coming and looks unpolished.

**Proposed fix:**
Web: replace the text loading div with a skeleton — one large block (36px serif headline shape) + a deck line + byline line + 4–5 body paragraph bars. Reuse the same `Skeleton` component proposed for the home page (Home Task 1). iOS: replace the spinner with a `VStack` of `RoundedRectangle` shimmer views matching headline + body shape.

**Status:** Done 2026-04-26 (web only — iOS ProgressView is system-native and acceptable per audit scope)

---

### Story Task 2 — 404 is a dead end ✓ DONE

**File:** `web/src/app/story/[slug]/page.tsx`
**Source:** UI_IMPROVEMENTS.md, Reading section [2/4]

**Problem:**
When an article is not found, the page renders `"Article not found."` with no heading, no escape hatch, no navigation forward or back. A reader who lands on a dead link has nowhere to go.

**Proposed fix:**
Replace with a proper 404 state: headline "Article not found", one line of context ("This story may have been removed or the link may be broken."), and two CTAs — "Go to home" (`/`) and "Browse stories" (`/browse`). Match the visual weight of the article layout so it doesn't feel like a crash.

**Status:** Done 2026-04-26

---

### Story Task 3 — Report button fails touch target ✓ DONE

**File:** `web/src/app/story/[slug]/page.tsx:line ~1640` (report button inside comments section)
**Source:** UI_IMPROVEMENTS.md, Top 20 #8 [4/4 Critical]

**Problem:**
The report button on comments is `fontSize: 11` with no `minHeight` and no meaningful padding — renders at approximately 20–22px tall. Fails WCAG 44×44 minimum. This is a tap target on mobile where precision is lowest.

**Proposed fix:**
Add `minHeight: 36, paddingTop: 6, paddingBottom: 6` to the report button. 36px is acceptable for an inline secondary action. Matches the approach taken for period pills (Leaderboard Task 3).

**Status:** Done 2026-04-26

---

### Story Task 4 — Report categories are Title Case ✓ DONE

**File:** `web/src/app/story/[slug]/page.tsx:83–89`
**Source:** UI_IMPROVEMENTS.md, Browse section [3/4]

**Problem:**
`REPORT_CATEGORIES` at line 83–89: `'Hate Speech'`, `'Misinformation'`, `'Off Topic'`, `'Spam'`, `'Other'`. Product standard is sentence case. These render directly as radio label text in the report modal.

**Proposed fix:**
Change to: `'Hate speech'`, `'Misinformation'`, `'Off topic'`, `'Spam'`, `'Other'`. One object literal, five values.

**Status:** Done 2026-04-26 ('Hate speech', 'Off topic' fixed; others were already sentence case; current code has 6 categories — Impersonation also already correct)

---

### Story Task 5 — Regwall missing backdrop-click dismiss ✓ DONE

**File:** `web/src/app/story/[slug]/page.tsx` (regwall/LockModal component)
**Source:** UI_IMPROVEMENTS.md, Reading section [3/4]

**Problem:**
The regwall modal closes on Escape and has an explicit close button with `aria-label="Close"`. It does not close on backdrop click. Every other modal in the product closes on backdrop click — this one is inconsistent and traps users who instinctively click outside.

**Proposed fix:**
Add an `onClick` handler to the backdrop overlay div that calls the same close function as the Escape key handler. The focus trap stays intact — clicking outside just triggers dismiss, same as Escape. One line.

**Status:** Done 2026-04-26 (added `onClick={dismissRegWall}` to backdrop; `onClick={(e) => e.stopPropagation()}` to inner dialog div to prevent bubbling)

---

### Story Task 6 — Paywall CTA uses anchor URL that breaks post-settings-split

**Files:** `web/src/app/story/[slug]/page.tsx:1480`, `web/src/app/story/[slug]/page.tsx:1421`
**Source:** Pre-Launch Tasks T-077, T-076

**Problem:**
Two places in the story page link to `/profile/settings#billing`: the paywall upgrade CTA (line 1480) and the bookmark cap notice (line 1421). T-073 (settings split) will turn `/profile/settings` into a redirect or sidebar landing — all `#anchor` URLs break on that deploy. These must be updated when T-073 ships.

**Note:** This is not a standalone fix — it's a dependency on T-073. Flag here so it's not missed when the settings split runs. Audit all `/profile/settings#billing` occurrences at T-073 time per T-076/T-077 sequencing.

**Status:** Dependent on T-073 (settings split) — execute in same deploy window

---

### Story Task 7 — Bookmark success is silent ✓ DONE

**File:** `web/src/app/story/[slug]/page.tsx:~770–810`
**Source:** UI_IMPROVEMENTS.md, Reading section [4/4]

**Problem:**
When a user saves or removes a bookmark, the icon state updates but there is no toast confirmation. Every other mutation in the product (quiz submit, comment post, report submit) shows a toast. Bookmark is the only silent one — ambiguous whether the action succeeded.

**Proposed fix:**
On successful bookmark add: show toast "Saved to bookmarks". On successful bookmark remove: show toast "Removed from bookmarks". Both use the existing toast infrastructure. Failures already have copy (covered in Task 8).

**Status:** Done 2026-04-26

---

### Story Task 8 — Bookmark error copy uses "Please" and passive voice ✓ DONE

**File:** `web/src/app/story/[slug]/page.tsx:783,805`
**Source:** UI_IMPROVEMENTS.md, Top 20 #15 [2/4]

**Problem:**
Line 783: `'Could not remove bookmark. Please try again.'`
Line 805: `'Could not save bookmark. Please try again.'`
Product voice standard: no "Please", no passive constructions. These are the only two places in the story page that use this pattern.

**Proposed fix:**
Line 783: `'Bookmark not removed — try again.'`
Line 805: `'Bookmark not saved — try again.'`

**Status:** Done 2026-04-26

---

### Story Task 9 — No quiz teaser for anon readers ✓ DONE

**File:** `web/src/app/story/[slug]/page.tsx`
**Source:** UI_IMPROVEMENTS.md, Reading section [2/4] + direct code review

**Problem:**
Anon readers see the full article, then hit the regwall when they reach comments. There is no signal earlier in the experience that a quiz exists and that passing it unlocks discussion. The quiz is the product's core differentiator — anon users have no idea it exists until they've already read the whole article and hit a gate.

**Has legs:** Yes. A one-line teaser above the article body ("Read and pass the quiz to join the discussion") sets expectations, surfaces the differentiator, and makes the gate feel earned rather than surprising. Logged-in users who haven't taken the quiz get the same teaser. Users who've passed get nothing.

**Proposed fix:**
Render a small inline callout above the article body for anon users and logged-in users who haven't passed the quiz. Copy: "Pass the quiz at the end to unlock comments." One conditional, one line of UI. No paywall, no lock icon — just context.

**Status:** Done 2026-04-26 (renders when `quizPoolSize >= 10 && !userPassedQuiz`; gated on quiz availability so articles with no quiz don't show it)

---

### Story Task 10 — iOS bookmark alert hardcodes "10" and uses generic copy ✓ DONE

**File:** `VerityPost/VerityPost/StoryDetailView.swift:270`
**Source:** Direct code review

**Problem:**
Line 270: `"Free accounts can save up to 10 bookmarks."` — hardcodes the limit to 10. If the DB setting changes, this copy is wrong without a code update. The copy is also generic — doesn't tell the user what to do about it (upgrade or manage bookmarks).

**Proposed fix:**
Either drive the number from the API response (the bookmark endpoint already knows the cap from DB) or make the copy limit-agnostic: "You've hit the bookmark limit for free accounts." Then append the action: "Upgrade to save unlimited bookmarks." Two sentences, no hardcoded number, clear path forward.

**Status:** Done 2026-04-26 (limit-agnostic copy: "You've hit the bookmark limit for free accounts. Upgrade to save unlimited bookmarks.")

---

### Story Task 11 — Kids iOS decorative icons missing accessibilityHidden ✓ DONE

**File:** `VerityPostKids/VerityPostKids/KidReaderView.swift`
**Source:** UI_IMPROVEMENTS.md, iOS section [2/4]

**Problem:**
`Image(systemName: "newspaper.fill")` in the empty state (line ~30) and `Image(systemName: "clock")` in the reading time row (line ~180) are decorative — adjacent `Text` views provide all the semantic content. Neither has `.accessibilityHidden(true)`. VoiceOver reads both icon names aloud, creating redundant announcements.

**Proposed fix:**
Add `.accessibilityHidden(true)` to both `Image` calls. One modifier each, zero behavior change for sighted users.

**Status:** Done 2026-04-26

---

### Story Task 12 — Silent pool-size gate: articles under 10 questions show locked discussion with no quiz ✓ DONE

**File:** `web/src/app/story/[slug]/page.tsx:912`
**Source:** Panel review — Trust Auditor, Seam Inspector

**Problem:**
`if (quizPoolSize >= 10)` hides the entire quiz block when an article has fewer than 10 questions. The discussion panel still renders below it, still locked, still showing "Discussion is locked until you pass the quiz above." There is no quiz above. No explanation is given. A reader who finishes the article and scrolls down expecting the quiz finds a locked door and no path forward. This is the most visible trust failure in the quiz system — the mechanism that is supposed to prove reading can silently not appear.

**Proposed fix:**
When `quizPoolSize < 10`, suppress the discussion lock panel entirely — don't show a locked discussion for an unquizzable article. Alternatively, render a placeholder in the quiz block position: "The quiz for this article isn't ready yet — check back later." Either the quiz and discussion both appear or neither does.

**Status:** Done 2026-04-26 (added `quizPoolSize < 10 ? null` branch to discussionSection ternary — suppresses lock panel when no quiz exists)

---

### Story Task 13 — Web quiz pass has no ceremony; iOS and kids both mark the moment ✓ DONE

**Files:** `web/src/app/story/[slug]/page.tsx:920–922`, `VerityPost/VerityPost/StoryDetailView.swift:248–251`
**Source:** Panel review — Trust Auditor

**Problem:**
On pass, `setUserPassedQuiz(true)` triggers a mechanical scroll into the discussion section with no affirmative moment. iOS calls `triggerQuizPassMoment(scrollProxy: proxy)` which drives `showPassBurst` and `pointsDeltaVisible`. The kids app has a dedicated `QuizPassScene`. Web readers get comments appearing silently — the transition communicates "the lock was removed," not "you earned access."

**Proposed fix:**
On pass, briefly show an affirmative state inside the quiz result card before the auto-scroll. One line — "You're in." — for 1.5 seconds, then scroll. A `setTimeout` + state flag achieves it with no animation library. This is the minimum change that creates an earned-access moment.

**Status:** Done 2026-04-26 (added `justPassedCeremony` state; onPass shows "You're in." for 1500ms before triggering scroll via `setJustRevealedThisSession(true)`)

---

### Story Task 14 — Attempt count shown in iOS quiz idle card before reader starts

**File:** `VerityPost/VerityPost/StoryDetailView.swift:889–892`
**Source:** Panel review — Trust Auditor

**Problem:**
The idle card shows "Free accounts get 2 attempts; each pulls a fresh set of questions." before the reader has answered a single question. This frames the quiz as something you can run out of, priming anxiety before engagement. The information is useful — but belongs after a failed attempt, not as the entry state. A first-time reader should feel invited to try, not warned about scarcity.

**Proposed fix:**
Remove the attempt count from the idle card. After a failed attempt, show "1 attempt remaining." After the last attempt fails, show "No more attempts on this quiz." The idle card retains only the "BEFORE YOU DISCUSS" header and the threshold line.

**Status:** Pending execution

---

### Story Task 15 — Web discussion lock copy uses obstacle framing; iOS uses earned-access framing ✓ DONE

**Files:** `web/src/app/story/[slug]/page.tsx:1028–1034`, `VerityPost/VerityPost/StoryDetailView.swift:887`
**Source:** Panel review — Trust Auditor

**Problem:**
Web: "Discussion is locked until you pass the quiz above." / "You need 3 out of 5 correct to join the comment thread for this article."
iOS: "Pass to comment." / "5 questions about what you just read. Get 3 right and the conversation opens."

"Locked until you pass" positions the quiz as an obstacle to remove. "The conversation opens" communicates something being earned. Same mechanic, two different mental models depending on which surface the reader uses.

**Proposed fix:**
Replace web lines 1028–1034:
- "Pass the quiz to join the discussion."
- "5 questions about what you just read. Get 3 right and the conversation opens."

Match iOS copy exactly.

**Status:** Done 2026-04-26

---

### Story Task 16 — Anon quiz CTA leads with signup, buries the quiz concept ✓ DONE

**File:** `web/src/app/story/[slug]/page.tsx:937–973`
**Source:** Panel review — Trust Auditor

**Problem:**
The anon quiz CTA card reads "Take the quiz to join the discussion" (header), then "Comments on every article are gated by a short comprehension quiz. Sign up to take this one..." then a Sign Up button. The quiz — the product's core mechanic — is the supporting copy. The signup is the CTA. An anon reader sees a registration prompt, not an invitation to prove they read. Story Task 9 adds a pre-article teaser; this task fixes the quiz card framing itself.

**Proposed fix:**
Invert the hierarchy — lead with the mechanic, then the call to act:
- "Every article has a comprehension quiz."
- "Pass it and the discussion opens — your comment shows you actually read the story."
- [Create free account] [Already have an account? Sign in]

The sign-up button stays; the framing flips to put the differentiator first.

**Status:** Done 2026-04-26 (CTA button also renamed from "Sign up" to "Create free account")

---

### Story Task 17 — Regwall drops the article URL when redirecting to signup ✓ DONE

**File:** `web/src/app/story/[slug]/page.tsx:1186–1201`
**Source:** Panel review — Seam Inspector

**Problem:**
The regwall "Create free account" link routes to `/signup` with no `?next=` parameter. After signup the user lands at the auth flow's default destination, not back at the article. The quiz CTA at line 926–960 correctly passes `?next=${pathname}`. A reader who hits the view count gate mid-article, creates an account, and returns is dropped at home with no path back.

**Proposed fix:**
```tsx
href={`/signup?next=${encodeURIComponent(window.location.pathname)}`}
```
One parameter. Mirror the pattern already used by the quiz CTA at line 926.

**Status:** Done 2026-04-26 (used `story.slug` directly — cleaner and avoids window.location dependency)

---

### Story Task 18 — Discussion tab hidden from anonymous iOS users; desktop web shows it locked

**File:** `VerityPost/VerityPost/StoryDetailView.swift:407–410`
**Source:** Panel review — Seam Inspector

**Problem:**
`visibleTabs` filters out the Discussion tab entirely for non-logged-in users (`if tab == .discussion { return auth.isLoggedIn }`). An anonymous iOS user sees Article and Timeline only — no Discussion tab, no sign-up prompt, no signal that comments exist. On desktop web, the discussion section renders inline for all users including anon. The product's core proposition (earn your comments) is invisible to anonymous iOS readers.

**Proposed fix:**
Show the Discussion tab for anon users. When tapped, render an auth gate prompt instead of comments:
```swift
case .discussion:
    if auth.isLoggedIn { discussionContent }
    else { anonDiscussionPrompt }
```
`anonDiscussionPrompt`: "Create a free account, pass the quiz, and join the discussion." + Sign up + Sign in buttons. Mirror the existing pattern from `MessagesView.swift:68–101`.

**Status:** Pending execution

---

### Story Task 19 — Mobile web article tab bar is hardcoded off

**File:** `web/src/app/story/[slug]/page.tsx:1209`
**Source:** Panel review — Seam Inspector

**Problem:**
`{false && !isDesktop && (<three-tab bar>)}` — the hardcoded `false` means the Article / Timeline / Discussion tab structure never renders on mobile web. iOS adult shows these three tabs as the article's primary navigation. The content exists on both surfaces; the navigation model differs because the mobile web version is disabled.

**Note:** This appears to be a deliberate prelaunch state rather than an accidental omission. The question is whether this ships at launch or is a post-launch drop.

**Status:** Owner decision needed — confirm intentional vs. scheduled prelaunch lift. If staying off, replace `{false && ...}` with a comment naming the deferral so it is not read as dead code.

---

## Auth cluster `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password`

All items cross-referenced against web auth pages and `VerityPost/VerityPost/LoginView.swift`, `SignupView.swift`, `ForgotPasswordView.swift`.

Items from UI_IMPROVEMENTS.md that no longer apply:
- **`/login` button "Sign In" Title Case** — current code: `'Sign in'`. Already sentence case. Fixed.
- **`/signup` confirm-password double-signal** — no confirm-password field exists. Simplified to strength meter. Not applicable.
- **`/verify-email` "Resend Email" Title Case button** — current code: `'Resend email'`. Already sentence case. Fixed.
- **`/reset-password` success "Password updated!"** — current code: `'Password updated.'` — no exclamation. Fixed.
- **SIWA placement on login + signup** — Apple button is first on both. HIG complied. Fixed.

---

### Auth Task 1 — "Invalid credentials" is cold, accusatory error copy ✓ DONE

**File:** `web/src/app/login/page.tsx:220`
**Source:** UI_IMPROVEMENTS.md, Top 20 #7 [3/4 Critical], Copy audit table

**Problem:**
`setError('Invalid credentials')` fires for every failed login: wrong password, unknown user, malformed input. Cold, accusatory, and gives the user nothing to act on. The copy audit (3/4 agreement) standard: tell the user what happened and offer a path forward.

**Proposed fix:**
`'That email or password is incorrect. Check the spelling or reset your password.'` One string, one line.

**Status:** Done 2026-04-26

---

### Auth Task 2 — "Please try again" copy in auth error paths ✓ DONE

**Files:** `web/src/app/login/page.tsx:251`, `web/src/app/verify-email/page.tsx:120,135`
**Source:** UI_IMPROVEMENTS.md, Copy audit — global sweep

**Problem:**
Login line 251: `'Network error. Please try again.'`
Verify-email lines 120 + 135: `'Failed to resend email. Please try again.'`
Both use "Please" + passive voice. Product standard: no "Please", active voice, specific next step.

**Proposed fix:**
Login line 251: `'Network error — check your connection and try again.'`
Verify-email lines 120 + 135: `'Couldn't send the email. Try again in a moment.'`

**Status:** Done 2026-04-26

---

### Auth Task 3 — Triple header on every auth card ✓ DONE

**Files:** `web/src/app/login/page.tsx:283–301`, `web/src/app/signup/page.tsx:293–326`, `web/src/app/forgot-password/page.tsx`, `web/src/app/reset-password/page.tsx`
**Source:** UI_IMPROVEMENTS.md, Auth cluster [3/4], Top 20 #11 [4/4]

**Problem:**
Every auth card has three header lines before the first interactive element: (1) "Verity Post" wordmark, (2) h1, (3) subhead paragraph. Three lines of orientation overhead before a form field. The wordmark earns its place — NavWrapper is hidden on auth pages, brand needs to be present. The subhead is almost always filler ("Sign in to your account to keep reading" says nothing the form label doesn't already say).

**Proposed fix:**
Keep the wordmark. Tighten or drop the subhead per card:
- Login: drop the subhead. Form is self-explanatory.
- Signup: keep the subhead ("Read, pass the quiz, join the conversation") — it earns its keep by explaining the product differentiator on the one page where anon users choose to sign up.
- Forgot-password: drop the subhead. The form label is the instruction.
- Reset-password: drop the subhead.

**Status:** Done 2026-04-26

---

### Auth Task 4 — iOS "Forgot password?" button fails 44pt touch target ✓ DONE

**File:** `VerityPost/VerityPost/LoginView.swift:160`
**Source:** UI_IMPROVEMENTS.md, Top 20 #9 [3/4 Critical], iOS section

**Problem:**
`Button("Forgot password?") { showForgot = true }` with `.font(.footnote)` — no `.frame(minHeight: 44)`. Renders at ~20px tall. The show/hide password button on the same view has `.frame(minHeight: 44)` at line 143; the forgot-password link does not.

**Proposed fix:**
Add `.frame(minWidth: 44, minHeight: 44)` and `.contentShape(Rectangle())` to extend the tap region beyond the text glyph bounds.

**Status:** Done 2026-04-26

---

### Auth Task 5 — iOS login error has no VoiceOver announcement ✓ DONE

**File:** `VerityPost/VerityPost/LoginView.swift:167–174`
**Source:** UI_IMPROVEMENTS.md, iOS section [1/4]

**Problem:**
`if let err = auth.authError { Text(err) }` — when an error appears, VoiceOver users get no announcement. Sighted users see the red text; screen reader users must navigate to it manually.

**Proposed fix:**
Trigger a VoiceOver announcement when the error changes: `.onChange(of: auth.authError) { if let msg = $0 { UIAccessibility.post(notification: .announcement, argument: msg) } }`. Same fix applies to `SignupView` — same pattern.

**Status:** Done 2026-04-26 (iOS 17 two-parameter form `{ _, newValue in }`; applied to both `auth.authError` and `localError` in SignupView; `.onChange` attached to NavigationStack level, not the conditionally rendered error Text)

---

## Bookmarks `/bookmarks`

All items cross-referenced against `web/src/app/bookmarks/page.tsx` and `VerityPost/VerityPost/BookmarksView.swift`.

Items from UI_IMPROVEMENTS.md that no longer apply:
- **H1 "Saved Stories" concept mismatch** — current h1 is `Bookmarks ·` (line 329). Already fixed.
- **Empty CTA "Browse articles" goes to `/`** — current code: `href="/browse"` (line 604). Already points to `/browse`. Fixed.
- **Double header (wordmark)** — no "Verity Post" wordmark in this page. NavWrapper provides it at layout level. Already clean.

---

### Bookmarks Task 1 — Loading state is text, not skeleton ✓ DONE

**File:** `web/src/app/bookmarks/page.tsx:299–313`
**Source:** UI_IMPROVEMENTS.md, Feature section [2/4]

**Problem:**
`'Loading bookmarks…'` text in a centered div. Identical pattern to home and story — no structural hint of what's coming. On a slow connection this looks like a broken page.

**Proposed fix:**
Replace with skeleton rows matching the bookmark card shape: title bar (~60% width), meta line (~30% width), repeated 4–5 times. Reuse the same `Skeleton` component from Home Task 1.

**Status:** Done 2026-04-26

---

### Bookmarks Task 2 — Individual bookmark remove fires with no confirm and no undo ✓ DONE

**File:** `web/src/app/bookmarks/page.tsx:510–521`
**Source:** UI_IMPROVEMENTS.md, Feature section [2/4]

**Problem:**
`onClick={() => removeBookmark(b.id)}` fires immediately — no confirm, no undo. Collection deletion already has a `ConfirmDialog` (line 649). The individual remove has nothing. If someone mis-taps Remove on a saved article, it's gone with no recovery path. This is especially painful on mobile where taps are less precise.

**Proposed fix:**
Add a 5-second undo toast on remove: optimistically remove the item from the list, show "Bookmark removed — Undo" toast with a countdown. If the user taps Undo within 5 seconds, re-add the item client-side and cancel the DELETE. If not, fire the DELETE. Same pattern used by Gmail, Notion, and every other tool where silent deletion is a frustration driver. iOS (`BookmarksView.swift:167`) needs the same treatment.

**Status:** Done 2026-04-26 (web only — iOS has optimistic remove + error rollback already; undo toast is web-specific per pattern decision)

---

### Bookmarks Task 3 — Touch targets below minimum across the page ✓ DONE

**File:** `web/src/app/bookmarks/page.tsx`
**Source:** UI_IMPROVEMENTS.md, Top 20 #8 [4/4 Critical]

**Problem:**
Five interactive elements fail the 44px minimum:
- Per-row Remove button (line 510): `fontSize: 12`, no `minHeight` — ~22px tall
- Collection delete "×" (line 428): `fontSize: 12`, no `minHeight` — ~22px tall
- "+ Add note" button (line 575): `fontSize: 11`, no `minHeight` — ~18px tall
- Collection filter pills (line 411): `padding: '6px 14px'`, no `minHeight` — ~26px tall
- `btnSolid` / `btnGhost` shared styles (lines 688–707): `padding: '8px 14px'`, no `minHeight` — ~33px tall; used on Export, Create, Cancel, Load more

**Proposed fix:**
- Remove button: add `minHeight: 36, padding: '6px 8px'`
- Collection "×": add `minHeight: 36, minWidth: 36`
- "+ Add note": add `minHeight: 36, padding: '6px 0'`
- Collection pills: add `minHeight: 36`
- `btnSolid` / `btnGhost`: add `minHeight: 36` to both shared style objects — fixes every button that uses them in one edit

**Status:** Done 2026-04-26 (Remove + × + Add note → `minHeight: 44`; pills + btnSolid + btnGhost → `minHeight: 36`)

---

### Bookmarks Task 4 — Cap banner links to anchor that breaks post-settings-split

**File:** `web/src/app/bookmarks/page.tsx:362`
**Source:** Pre-Launch Tasks T-077

**Problem:**
Line 362: `href="/profile/settings#billing"` — same T-073 dependency as Story Task 6. When the settings split ships, this anchor breaks.

**Note:** Flag-and-fix in the same deploy window as T-073. Not a standalone fix.

**Status:** Dependent on T-073 — execute in same deploy window

---

### Bookmarks Task 5 — Button label copy ✓ DONE

**File:** `web/src/app/bookmarks/page.tsx:344,349`
**Source:** UI_IMPROVEMENTS.md, Feature section [2/4]

**Problem:**
- Line 344: `Export JSON` — technical jargon, not user-facing language
- Line 349: `+ Collection` — implicit, not a clear action label

**Proposed fix:**
- `Export JSON` → `Download my bookmarks`
- `+ Collection` → `New collection`

**Status:** Done 2026-04-26

---

### Bookmarks Task 6 — iOS "Please sign in" error copy ✓ DONE

**File:** `VerityPost/VerityPost/BookmarksView.swift:270`
**Source:** UI_IMPROVEMENTS.md, Copy audit — global sweep

**Problem:**
Line 270: `errorText = "Please sign in."` — "Please" in an error message. Not a blocking UX issue but inconsistent with product voice standard.

**Proposed fix:**
`"Sign in to manage your bookmarks."`

**Status:** Done 2026-04-26

---

## Messages `/messages`

All items cross-referenced against `web/src/app/messages/page.tsx`, `VerityPost/VerityPost/MessagesView.swift`, and `VerityPostKids/VerityPostKids/ExpertSessionsView.swift`.

Items from UI_IMPROVEMENTS.md that no longer apply:
- **Web empty state copy** — current: "No conversations yet. Message an expert, author, or friend to get started." + "New message" CTA. Already the right copy. Fixed.
- **Thread empty state** — current: "Say hi. They'll see your first message when they open the chat." Already good. Fixed.
- **iOS empty CTA touch target** — iOS "New message" button already has `.frame(minHeight: 44)`. Fixed.

---

### Messages Task 1 — Loading state is text/spinner, not skeleton ✓ DONE

**Files:** `web/src/app/messages/page.tsx:709–723,1294–1298`, `VerityPost/VerityPost/MessagesView.swift:221`
**Source:** UI_IMPROVEMENTS.md, Feature section

**Problem:**
Web full-page load renders `'Loading...'` text centered in a full viewport div (line 720). Thread load renders another `'Loading...'` inside the message pane (line 1295). iOS shows a bare `ProgressView()` spinner with no structural context. Same pattern flagged across home, story, and bookmarks — no sense of what's coming, looks broken on slow connections.

**Proposed fix:**
Web conversation list: skeleton rows matching the avatar circle + name + preview shape, repeated 3–4 times. Web thread: skeleton message bubbles alternating left/right alignment. iOS: same `ProgressView` is acceptable on iOS as system-native loading indicator — no change needed there.

**Status:** Done 2026-04-26 (`vp-pulse` keyframe injected once in primary `<main>` return so it's available for both list and thread skeletons)

---

### Messages Task 2 — Web search modal missing backdrop-click dismiss ✓ DONE

**File:** `web/src/app/messages/page.tsx:1443–1607`
**Source:** Direct code review

**Problem:**
The "New message" search modal has a full-screen fixed backdrop (`position: fixed, inset: 0`) with no `onClick` handler. Clicking outside the modal card does nothing. Every other modal in the product (regwall, report dialog, DM paywall) dismisses on backdrop click. The report dialog inside Messages itself already has backdrop-click dismiss (line 1196). The search modal is the only one that doesn't.

**Proposed fix:**
Add `onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); setRoleFilter('all'); }}` to the outer backdrop div, with `onClick={(e) => e.stopPropagation()}` on the inner modal card to prevent bubbling. Matches the report dialog pattern on line 1196/1204.

**Status:** Done 2026-04-26

---

### Messages Task 3 — iOS "Sign in to message" is a dead end ✓ DONE

**File:** `VerityPost/VerityPost/MessagesView.swift:68–75`
**Source:** Direct code review

**Problem:**
Lines 68–75: when a logged-out user opens Messages, they see `Text("Sign in to message")` — no button, no link, nothing tappable. Any unauthenticated user who taps the Messages tab hits a wall. This is a sign-up opportunity being wasted.

**Proposed fix:**
Replace the bare text with a proper unauthenticated state: the message text plus a "Sign in" button that triggers the auth flow (navigate to `LoginView`). Mirror the pattern used by the DM paywall lock screen (lines 76–101) which already has a proper button + action.

**Status:** Done 2026-04-26 (`.sheet(isPresented: $showLogin)` attached to inner VStack, not outer Group, to avoid SwiftUI single-sheet-per-view constraint)

---

### Messages Task 4 — Touch targets below minimum across web Messages ✓ DONE

**File:** `web/src/app/messages/page.tsx`
**Source:** UI_IMPROVEMENTS.md, Top 20 #8 [4/4 Critical]

**Problem:**
Five elements fail the 44px minimum:
- "New" compose button (line 893): `padding: '6px 12px'`, `fontSize: 12`, no `minHeight` — ~26px
- "← Back" button (line 1041): `padding: 0`, `fontSize: 14`, no `minHeight` — ~20px
- "..." overflow button (line 1083): `padding: '4px 10px'`, no `minHeight` — ~22px
- Role filter pills in search modal (line 1536): `padding: '4px 10px'`, `fontSize: 11`, no `minHeight` — ~20px
- "Cancel" button in search modal (line 1487): `fontSize: 14`, no `minHeight` — ~22px

**Proposed fix:**
- "New", "← Back", "Cancel": add `minHeight: 44` to each
- "..." overflow: add `minHeight: 44, padding: '10px'`
- Role filter pills: add `minHeight: 36, padding: '6px 12px'` — secondary filter pills, 36px acceptable

**Status:** Done 2026-04-26

---

### Messages Task 5 — iOS role filter pills fail touch target ✓ DONE

**File:** `VerityPost/VerityPost/MessagesView.swift:333`
**Source:** UI_IMPROVEMENTS.md, Top 20 #8

**Problem:**
Search sheet role filter pills: `.padding(.horizontal, 10).padding(.vertical, 5)` with `.font(.system(.caption))` — renders at approximately 25px tall. Fails 44pt HIG minimum. Same issue as leaderboard period pills and web messages pills.

**Proposed fix:**
Add `.frame(minHeight: 36)` to each filter pill button. Secondary filter, 36pt acceptable.

**Status:** Done 2026-04-26

---

### Messages Task 6 — "New Message" modal title is Title Case ✓ DONE

**File:** `web/src/app/messages/page.tsx:1485`
**Source:** UI_IMPROVEMENTS.md, Copy audit

**Problem:**
Line 1485: `'New Message'` — Title Case. Product standard is sentence case throughout.

**Proposed fix:**
`'New message'`

**Status:** Done 2026-04-26

---

### Messages Task 7 — "Please try again" in block and report error copy ✓ DONE

**Files:** `web/src/app/messages/page.tsx:638–641,685`
**Source:** UI_IMPROVEMENTS.md, Copy audit — global sweep

**Problem:**
Line 638: `'Could not unblock this user. Please try again.'`
Line 641: `'Could not block this user. Please try again.'`
Line 685: `'Could not submit report. Please try again.'`
All three use "Please" + passive voice. Same pattern being swept globally.

**Proposed fix:**
Line 638: `'Couldn't unblock. Try again.'`
Line 641: `'Couldn't block. Try again.'`
Line 685: `'Couldn't send report. Try again.'`

**Status:** Done 2026-04-26

---

### Messages Task 8 — DM paywall links to anchor that breaks post-settings-split

**File:** `web/src/app/messages/page.tsx:828`
**Source:** Pre-Launch Tasks T-077

**Problem:**
Line 828: `href="/profile/settings#billing"` — same T-073 dependency as Story Task 6 and Bookmarks Task 4. Breaks when settings split ships.

**Status:** Dependent on T-073 — execute in same deploy window

---

### Messages Task 9 — iOS empty conversation list copy is weaker than web ✓ DONE

**File:** `VerityPost/VerityPost/MessagesView.swift:227`
**Source:** Direct code review — parity gap

**Problem:**
Line 227: `"Start a conversation with another user."` — generic. Web reads "Message an expert, author, or friend to get started." — specific, tells the user who they can talk to, which is the whole value proposition of the feature (especially expert access as a paid perk).

**Proposed fix:**
`"Message an expert, author, or another reader to get started."` — matches web copy, surfaces the feature's value.

**Status:** Done 2026-04-26

---

### Messages Task 10 — Kids ExpertSessionsView decorative icons missing accessibilityHidden ✓ DONE

**File:** `VerityPostKids/VerityPostKids/ExpertSessionsView.swift`
**Source:** UI_IMPROVEMENTS.md, iOS section — accessibility pattern

**Problem:**
Multiple `Image(systemName:)` calls are decorative — adjacent text provides all semantic content — but lack `.accessibilityHidden(true)`:
- `Image(systemName: "person.2.badge.key")` (line 133): decorative, title "Parent check needed" follows
- `Image(systemName: "person.2")` (line 178): decorative, text follows
- `Image(systemName: "dot.radiowaves.left.and.right")` in card and detail (lines 195, 98): decorative, status `Text` follows immediately
- `Image(systemName: "calendar")` and `Image(systemName: "clock")` in `metaLabel` (line 236): decorative, text label follows

VoiceOver reads all of these aloud as icon names, creating redundant announcements.

**Proposed fix:**
Add `.accessibilityHidden(true)` to each. One modifier per call, zero visual change.

**Status:** Done 2026-04-26 (4 standalone Images + `metaLabel` helper Image; covers all calendar/clock call sites via the shared function)

---

## Notifications `/notifications`

All items cross-referenced against `web/src/app/notifications/page.tsx` and `VerityPost/VerityPost/AlertsView.swift`. No kids surface for notifications.

Items from UI_IMPROVEMENTS.md that no longer apply:
- **Loading state is text** — web notifications already has a proper skeleton (header placeholder + 4 row placeholders, lines 119–138). Only page audited so far that has this right. Fixed.
- **Anon empty state is a dead end** — current anon state is "Keep track of what matters" + sign-up CTA + sign-in link. The audit called this the gold standard. Fixed.
- **"You're all caught up" empty state** — copy is correct and already present. Fixed.
- **iOS anon state has no CTA** — iOS `anonHero` already has "Sign in" + "Create free account" buttons, both with `minHeight: 44`. Fixed.
- **iOS empty state icons missing accessibilityHidden** — `bell.slash` icon in both `inboxDeniedHero` (line 165) and `alertsContent` empty state (line 202) already have `.accessibilityHidden(true)`. Fixed.

---

### Notifications Task 1 — `[!]` monospace icon reads as error, not notification ✓ DONE

**File:** `web/src/app/notifications/page.tsx:163–167`
**Source:** UI_IMPROVEMENTS.md, Social section [2/4]

**Problem:**
The anon empty state uses a `[!]` character in a monospace font as the notification icon. The bell is the universal notification icon across every major platform. A new user landing on this tab for the first time sees `[!]` and the immediate read is "something is wrong" — friction at exactly the moment the page is trying to convert them into a signed-up user. The copy below it is excellent; the icon undercuts it.

**Proposed fix:**
Replace the `[!]` div with a simple SVG bell icon — same 64px circle container, same `aria-hidden="true"`, just a bell path inside. No other changes to the state.

**Status:** Done 2026-04-26

---

### Notifications Task 2 — Badge renders raw DB enum ✓ DONE

**Files:** `web/src/app/notifications/page.tsx:366`, `VerityPost/VerityPost/AlertsView.swift:508`
**Source:** UI_IMPROVEMENTS.md, Social section [2/4]

**Problem:**
Web line 366: `{n.type as NotificationType}` — renders the raw DB value directly (`BREAKING_NEWS`, `COMMENT_REPLY`, `MENTION`, etc.) into the badge. iOS line 508: `Text(type.uppercased())` — same raw string in all caps. Users see technical enum names, not readable labels.

**Proposed fix:**
Add a small mapping object on both platforms:

Web:
```ts
const TYPE_LABELS: Record<string, string> = {
  BREAKING_NEWS: 'Breaking news',
  COMMENT_REPLY: 'Reply',
  MENTION: '@mention',
  EXPERT_ANSWER: 'Expert answer',
};
const typeLabel = TYPE_LABELS[n.type as string] ?? n.type;
```

iOS: same mapping in a `typeLabel(_ type: String) -> String` helper. Unknown types fall back to the raw value capitalized so nothing breaks if a new type is added.

**Status:** Done 2026-04-26 (`typeLabel` as private member of AlertsView, not file-scope)

---

### Notifications Task 3 — null action_url causes scroll-to-top on click ✓ DONE

**File:** `web/src/app/notifications/page.tsx:341`
**Source:** UI_IMPROVEMENTS.md, Social section [1/4]

**Problem:**
Line 341: `href={n.action_url || '#'}` — when `action_url` is null, the link renders as `href="#"`. Clicking it marks the notification read but also scrolls the page to the top. Reads as a bug. Disorienting on a long list.

**Proposed fix:**
When `action_url` is null, render a `<div>` with an `onClick` instead of an `<a>`. Or use `href={n.action_url ?? undefined}` and conditionally suppress the `href` attribute so no navigation occurs. Either way: mark read on click, no scroll jump.

**Status:** Done 2026-04-26 (kept `href="#"` fallback; added `e.preventDefault()` when `!n.action_url` — preserves keyboard focus while stopping scroll)

---

### Notifications Task 4 — Touch targets below minimum on filter row and actions ✓ DONE

**File:** `web/src/app/notifications/page.tsx:218–271`
**Source:** UI_IMPROVEMENTS.md, Top 20 #8 [4/4 Critical]

**Problem:**
Three elements fail the 44px minimum:
- Filter pills (`pillBase`, line 218): `padding: '5px 12px'`, no `minHeight` — ~26px
- "Mark all read" button (line 258): `padding: '6px 14px'`, no `minHeight` — ~28px
- "Preferences" link (line 243): `padding: '6px 10px'`, no `minHeight` — ~28px

**Proposed fix:**
Add `minHeight: 36` to all three. Secondary controls, 36px acceptable.

**Status:** Done 2026-04-26 (Preferences `<a>` also gets `display: 'flex', alignItems: 'center'` so minHeight takes effect on inline element)

---

### Notifications Task 5 — "Preferences" link is a T-073 anchor dependency

**File:** `web/src/app/notifications/page.tsx:244`
**Source:** Pre-Launch Tasks T-077

**Problem:**
Line 244: `href="/profile/settings#alerts"` — same T-073 dependency as Story Task 6, Bookmarks Task 4, and Messages Task 8. Breaks when settings split ships.

**Status:** Dependent on T-073 — execute in same deploy window

---

### Notifications Task 6 — Error message surfaces HTTP status code ✓ DONE

**File:** `web/src/app/notifications/page.tsx:57`
**Source:** Pre-Launch Tasks T-013

**Problem:**
Line 57: `` `Couldn’t load notifications (${res.status}).` `` — the HTTP status code leaks into the UI. Users see "Couldn't load notifications (403)." or "(500)." Status codes are developer context, not user context.

**Proposed fix:**
Drop the status interpolation: `'Couldn\'t load notifications. Try again.'` Log the status server-side where it belongs.

**Status:** Done 2026-04-26

---

### Notifications Task 7 — iOS "Read All" label doesn't match web ✓ DONE

**File:** `VerityPost/VerityPost/AlertsView.swift:106`
**Source:** Direct code review — parity gap

**Problem:**
Line 106: toolbar button label is `"Read All"` — Title Case, different from web which says "Mark all read". Minor but inconsistent across platforms.

**Proposed fix:**
`"Mark all read"` — matches web label, sentence case. iOS toolbar truncates long labels gracefully if needed.

**Status:** Done 2026-04-26

---

## Profile — `/profile`, `ProfileView.swift` (adult iOS), `ProfileView.swift` (kids iOS)

**Files read:**
- `web/src/app/profile/page.tsx` (1714 lines)
- `web/src/app/profile/[id]/page.tsx` (16 lines — kill-switched)
- `VerityPost/VerityPost/ProfileView.swift`
- `VerityPostKids/VerityPostKids/ProfileView.swift`
- Cross-referenced: `Archived/Unconfirmed-Projects-2026-04-26/UI_IMPROVEMENTS.md` profile section

---

### Profile Task 1 — LockedTab shows "Verify email" CTA even when email is already verified

**File:** `web/src/app/profile/page.tsx:1700–1714`
**Source:** Direct code review — logic bug

**Problem:**
`LockedTab` (line 1700-1714) is shown when a user lacks permission for Activity, Categories, or Milestones tabs. It always renders the same state regardless of why the tab is locked:

```tsx
function LockedTab({ name }: { name: string }) {
  return (
    <PageSection>
      <EmptyState
        title={`${name} is unavailable`}
        description="Verify your email or upgrade your plan to unlock this tab."
        cta={
          <Button variant="primary" onClick={() => window.location.assign('/verify-email')}>
            Verify email
          </Button>
        }
      />
    </PageSection>
  );
}
```

If the user's email IS already verified (they're plan-gated, not email-gated), the CTA sends them to `/verify-email` which tells them their email is already confirmed. Dead end.

**Proposed fix:**
Thread `emailVerified: boolean` into `LockedTab` and branch:

```tsx
function LockedTab({ name, emailVerified }: { name: string; emailVerified: boolean }) {
  if (!emailVerified) {
    return (
      <EmptyState
        title={`${name} is unavailable`}
        description="Confirm your email to unlock this tab."
        cta={<Button variant="primary" onClick={() => window.location.assign('/verify-email')}>Verify email</Button>}
      />
    );
  }
  return (
    <EmptyState
      title={`${name} is unavailable`}
      description="This tab is part of paid plans."
      cta={<Button variant="primary" onClick={() => window.location.assign('/browse/plans')}>View plans</Button>}
    />
  );
}
```

Pass `emailVerified={!!user.email_verified}` at each `<LockedTab>` callsite (lines 502, 515, 528).

**Status:** Pending execution

---

### Profile Task 2 — iOS has no locked state for permission-gated tabs

**File:** `VerityPost/VerityPost/ProfileView.swift:957–966`
**Source:** Direct code review — web/iOS parity gap

**Problem:**
On web, users who lack `profile.activity`, `profile.categories`, or `profile.achievements` perms see `LockedTab` with an upgrade/verify CTA. On iOS, `tabContent()` dispatches to all four tab views unconditionally:

```swift
switch tab {
case .overview:   overviewTab(user)
case .activity:   activityTab       // renders for all users
case .categories: categoriesTab     // renders for all users
case .milestones: milestonesTab(user) // renders for all users
}
```

A user who lacks `canViewActivity` sees the activity tab, triggers a data load, and receives an empty list with "No activity yet" — giving no signal that the tab is locked or that upgrading would populate it. Same for categories and milestones.

**Proposed fix:**
Gate each tab in the switch before rendering content. When locked, show a brief inline prompt:

```swift
case .activity:
    if canViewActivity { activityTab }
    else { lockedTabView(reason: "upgrade") }
case .categories:
    if canViewCategories { categoriesTab }
    else { lockedTabView(reason: "upgrade") }
case .milestones:
    if canViewAchievements { milestonesTab(user) }
    else { lockedTabView(reason: "upgrade") }
```

`lockedTabView` is a small private func:
```swift
private func lockedTabView(reason: String) -> some View {
    VStack(spacing: 12) {
        Spacer().frame(height: 40)
        Text("This tab is part of paid plans.")
            .font(.subheadline).foregroundColor(VP.dim)
            .multilineTextAlignment(.center)
        Button("View plans") { showSubscription = true }
            .font(.system(.subheadline, design: .default, weight: .semibold))
            .foregroundColor(.white)
            .padding(.horizontal, 20).padding(.vertical, 10)
            .frame(minHeight: 44)
            .background(VP.accent).cornerRadius(10)
        Spacer()
    }
    .padding(.horizontal, 24)
}
```

Also skip the data fetch in `loadTabData()` when the corresponding `canView*` flag is false.

**Status:** Pending execution

---

### Profile Task 3 — Web load-error description is off-voice

**File:** `web/src/app/profile/page.tsx:422–433`
**Source:** UI_IMPROVEMENTS.md profile section [2/4]

**Problem:**
Line 427-429:
```tsx
title="We couldn't load your profile"
description="Something went wrong retrieving your account. Try refreshing, or head back home."
```

"Something went wrong retrieving your account" is vague and passive. Title is already correct.

**Proposed fix:**
```tsx
description="Refresh the page, or head back home."
```

**Status:** Pending execution

---

### Profile Task 4 — Kids "Unpair this device" button touch target too small

**File:** `VerityPostKids/VerityPostKids/ProfileView.swift:132–141`
**Source:** Direct code review — WCAG 44pt minimum

**Problem:**
Line 135-140:
```swift
Text("Unpair this device")
    .padding(.horizontal, 14)
    .padding(.vertical, 7)
```

Font (~12pt) + 7+7 vertical = ~26pt. Below 44pt minimum.

**Proposed fix:**
Add `.frame(minHeight: 44)` before `.background(K.card)`:

```swift
Text("Unpair this device")
    .font(.scaledSystem(size: 12, weight: .semibold, design: .rounded))
    .foregroundStyle(K.dim)
    .padding(.horizontal, 14)
    .padding(.vertical, 7)
    .frame(minHeight: 44)
    .background(K.card)
    .clipShape(Capsule())
    .overlay(Capsule().strokeBorder(K.border, lineWidth: 1))
```

**Status:** Pending execution

---

### Profile Note A — T-073 dependencies in profile page

**Files:** `web/src/app/profile/page.tsx:847, 1286, 1304`

Three `window.location.assign` callsites point to settings sub-routes that break when T-073 ships:

- Line 847: `window.location.assign('/profile/settings/profile')` — "Set username" CTA in profile card section
- Line 1286: `window.location.assign('/profile/settings/feed')` — "Pick categories" CTA in categories empty state
- Line 1304: `window.location.assign('/profile/settings/feed')` — "Edit preferences" button in categories tab

All three must be updated to the real destination URLs in the same deploy as T-073. Add to T-073 audit checklist alongside T-076/T-077/T-078/T-079/T-080.

Additionally, these `window.location.assign` calls should be migrated to `router.push` (same T-052 pattern). Line 1153 also: `window.location.assign('/browse')` in activity empty state. Four additional T-052 callsites in profile/page.tsx not in the original T-052 scope.

**Status:** Execute in T-073 deploy window; add to T-052 sweep

---

### Profile Note B — T-166/MASTER-9 is moot while `/profile/[id]` is kill-switched

**File:** `web/src/app/profile/[id]/page.tsx`

Pre-Launch Tasks T-166 describes tab links hardcoded to viewer's own profile. But the file currently renders `<UnderConstruction surface="public profile" />`. The bug doesn't exist on the live surface. When the kill switch is removed and the real `/profile/[id]` is restored (from git history commit `ccffa86`), the tab hardcode fix must be applied before that restore goes live. Flag when un-hiding is scheduled.

---

### Profile Note C — Correction to Profile Task 1: `/browse/plans` route does not exist

**File:** `OwnersAudit.md:Profile Task 1`

The proposed locked-tab fix in Task 1 uses `window.location.assign('/browse/plans')` for the "View plans" CTA. `/browse/plans` does not exist — `web/src/app/browse/` contains only `loading.js` and `page.tsx`.

Correct URL pre-T-073: `window.location.assign('/profile/settings#billing')`
Correct URL post-T-073: `window.location.assign('/profile/settings/billing')`

When implementing Task 1, use the pre-T-073 URL and add a T-073 update note alongside it.

---

### Profile Task 5 — iOS checks wrong permission keys for Activity, Categories, Milestones tabs

**Files:** `VerityPost/VerityPost/ProfileView.swift:200–202`
**Source:** Direct code review — cross-platform perm key drift

**Problem:**
iOS checks three long-form keys that are not the canonical DB keys:

```swift
canViewActivity     = await PermissionService.shared.has("profile.activity.view.own")
canViewCategories   = await PermissionService.shared.has("profile.score.view.own.categories")
canViewAchievements = await PermissionService.shared.has("profile.achievements.view.own")
```

Web checks the canonical short-form keys:
```ts
activity:   hasPermission('profile.activity'),
categories: hasPermission('profile.categories'),
milestones: hasPermission('profile.achievements'),
```

The `profile/page.tsx` file comment (lines 9-11) explicitly states: "`profile.activity`, `profile.categories`, `profile.achievements` are the DB-backed keys — no `.view.own` suffix exists in the seeds."

`schema/reset_and_rebuild_v2.sql:5191` confirms `profile.activity`, `profile.categories`, `profile.achievements` are assigned to the `verified_base` permission set (all email-verified users). The long-form iOS keys were introduced alongside migration 142 and an aliasing scheme that migration 143 rolled back. After that rollback, `profile.score.view.own.categories` and the others are independent keys whose plan set assignments may not match what's in `verified_base`.

**Why this matters per role:**
- Verified free user on web: sees Activity, Categories, Milestones tabs (has `verified_base` → has all 3 short-form keys)
- Same verified free user on iOS: depends entirely on whether the long-form keys are assigned to the `free` plan set — if they're not, iOS always shows empty/locked tabs even for fully verified users
- `profile.activity.view.own` was separately bound to all plan sets in migration 090 and may still work
- `profile.score.view.own.categories` has no evidence of active plan-set binding after the 143 rollback — iOS Categories tab may be permanently broken for all users

**Proposed fix:**
Update iOS to use the canonical keys:

```swift
// ProfileView.swift:200–202
canViewActivity     = await PermissionService.shared.has("profile.activity")
canViewCategories   = await PermissionService.shared.has("profile.categories")
canViewAchievements = await PermissionService.shared.has("profile.achievements")
```

Also verify live DB state before and after: `SELECT p.key, COUNT(psp.id) FROM permissions p LEFT JOIN permission_set_perms psp ON psp.permission_id = p.id WHERE p.key IN ('profile.activity','profile.categories','profile.achievements','profile.activity.view.own','profile.score.view.own.categories','profile.achievements.view.own') GROUP BY p.key;`

**Status:** Pending execution — verify DB state first

---

### Profile Task 6 — Expert queue has no entry point from web profile hub

**Files:** `web/src/app/profile/page.tsx:594–608`, `VerityPost/VerityPost/ProfileView.swift:688–694, 1040–1044`
**Source:** Direct code review — role parity gap

**Problem:**
iOS surfaces the expert queue from two spots in ProfileView:
- Quick actions row (line 688-694): shows "Expert" chip when `canViewExpertQueue` is true and the user lacks a family plan
- "My stuff" list (line 1040-1044): shows "Expert Queue" entry linking to `ExpertQueueView`

Web `OverviewTab` (line 594-608) only receives `messagesInbox`, `bookmarksList`, and `family` as props. There is no `expertQueue` prop and no Expert Queue entry in "My stuff":

```ts
function OverviewTab({
  user, tierInfo, scoreTiers,
  cardShare, messagesInbox, bookmarksList, family,  // <-- no expertQueue
})
```

An expert who opens their web profile has no visible path from the profile hub to `/expert-queue`. They have to know the URL or navigate from admin-adjacent surfaces.

**Proposed fix:**
1. Add `expertQueue: hasPermission('expert.queue.view')` to the `perms` state object at line 233
2. Pass it to `OverviewTab`: `expertQueue={perms.expertQueue}`
3. Add prop to the component signature and render a QuickLink inside the "My stuff" section:

```tsx
{expertQueue && (
  <QuickLink
    href="/expert-queue"
    label="Expert queue"
    description="Questions waiting for your answer"
  />
)}
```

**Status:** Pending execution

---

### Profile Task 7 — Web Quick Stats shows Followers/Following without permission gate

**Files:** `web/src/app/profile/page.tsx:622–628`
**Source:** Direct code review — iOS parity gap

**Problem:**
The web stats array is built unconditionally for all users (lines 622-628):

```ts
const stats = [
  { label: 'Articles read', ... },
  { label: 'Quizzes passed', ... },
  { label: 'Comments', ... },
  { label: 'Followers', ... },     // no gate
  { label: 'Following', ... },     // no gate
];
```

iOS gates followers/following separately via `canViewFollowers` (`profile.followers.view.own`) and `canViewFollowing` (`profile.following.view.own`) in `socialRow()`.

Since this is the user viewing their own profile, showing these counts is low-risk — they're their own numbers. But the inconsistency means a web user who for some reason lacks `profile.followers.view.own` still sees the stat, while on iOS they wouldn't.

**Proposed fix:**
Add `followersView: hasPermission('profile.followers.view.own')` and `followingView: hasPermission('profile.following.view.own')` to the `perms` object. Filter the stats array:

```ts
const stats = [
  { label: 'Articles read', ... },
  { label: 'Quizzes passed', ... },
  { label: 'Comments', ... },
  ...(perms.followersView ? [{ label: 'Followers', ... }] : []),
  ...(perms.followingView ? [{ label: 'Following', ... }] : []),
];
```

**Status:** Pending execution

---

### Profile Task 8 — Milestones empty-state CTA routes to home, not a reading surface

**File:** `web/src/app/profile/page.tsx:1604`
**Source:** Direct code review — dead end

**Problem:**
Line 1604: `window.location.assign('/')` — "Take a quiz" button sends the user to the home feed. Home doesn't directly present a quiz. The user has to pick an article, read it, then find the quiz — no guidance.

**Proposed fix:**
Route to `/browse` (the category/article browser) which is the most direct surface for finding something to read and quiz on. Also migrate to `router.push`:

```tsx
<Button variant="primary" onClick={() => router.push('/browse')}>
  Find an article
</Button>
```

Label change from "Take a quiz" to "Find an article" — more honest about the action since the quiz is downstream of finding and reading an article.

**Status:** Pending execution

---

### Profile Task 9 — iOS activity and categories tabs use spinner, not skeleton loader

**Files:** `VerityPost/VerityPost/ProfileView.swift:1167–1168, 1263–1264`
**Source:** Direct code review — in-app loading state inconsistency

**Problem:**
When the activity or categories tab loads, iOS shows `ProgressView()`:

```swift
// Activity tab (line 1167):
if !activityLoaded {
    ProgressView().padding(.top, 40)
}

// Categories tab (line 1263):
if !categoriesLoaded {
    ProgressView().padding(.top, 40)
}
```

The same ProfileView already has skeleton loaders for the activity preview in the overview section (`compactSkeletonRow()` at line 811-825). The milestones tab has skeleton tiles in web (lines 1586-1596). iOS uses `ProgressView()` instead of skeletons in the full-tab context, which is jarring after a smooth skeleton reveal in the overview.

**Proposed fix:**
Replace both `ProgressView()` instances with 6-row skeleton placeholders using the same `compactSkeletonRow()` helper already in the file:

```swift
// Activity tab
if !activityLoaded {
    VStack(spacing: 0) {
        ForEach(0..<6, id: \.self) { _ in compactSkeletonRow() }
    }
    .background(VP.card).cornerRadius(12)
    .padding(.horizontal, 16)
}

// Categories tab — use placeholder card tiles
if !categoriesLoaded {
    VStack(spacing: 8) {
        ForEach(0..<4, id: \.self) { i in
            RoundedRectangle(cornerRadius: 10).fill(VP.streakTrack).frame(height: 48)
        }
    }
    .padding(.horizontal, 16)
}
```

**Status:** Pending execution

---

## Kids Management — `/profile/kids`, `FamilyViews.swift`

**Files reviewed:**
- `web/src/app/profile/kids/page.tsx`
- `VerityPost/VerityPost/FamilyViews.swift`
- Cross-referenced: Panel review findings, direct code review

---

### Kids Mgmt Task 1 — "Parent PIN" web label misdescribes who types the PIN

**Files:** `web/src/app/profile/kids/page.tsx:939`, `VerityPost/VerityPost/FamilyViews.swift:1226`
**Source:** Panel review — The Parent

**Problem:**
The web setup form labels the PIN field "Parent PIN (4 digits, optional but recommended)." `FamilyViews.swift:1226` correctly describes it as "a 4-digit PIN that [kid's name] types when switching profiles in the kids app." These describe the same PIN differently. "Parent PIN" implies the parent uses it to authenticate or lock something. A parent who creates the PIN on web with that understanding, then discovers in iOS that their child is the one typing it, has lost confidence in the product's security model. This is one PIN; the labels disagree on who holds it.

**Proposed fix:**
Change the web label at line 939 to: "Kid PIN (4 digits, optional) — your child types this to open the app." Matches iOS semantics, no ambiguity about who the PIN belongs to.

**Status:** Pending execution

---

### Kids Mgmt Task 2 — Parent web setup flow has no CTA to download the kids app

**Files:** `web/src/app/profile/kids/page.tsx`, `VerityPost/VerityPost/FamilyViews.swift:1080–1098`
**Source:** Panel review — The Parent

**Problem:**
After creating a kid profile on web, the parent receives no instruction to download Verity Kids. The kid card, the per-kid dashboard (`/profile/kids/${id}`), and the main kids management page have no "Download the Verity Kids app" banner, no App Store link, no QR code. The product lives in a separate iOS app. A parent who sets up from web alone has a configured kid profile and no next step. The pair code flow (clear code, countdown, explicit copy at `FamilyViews.swift:1080–1098`) is only reachable after independently discovering and downloading the adult iOS app.

**Proposed fix:**
After successful kid profile creation, display a persistent "Get the Verity Kids app" callout on the web kids management page:
```tsx
<div style={{ border: '1px solid ...', borderRadius: 8, padding: 16, marginTop: 16 }}>
  <strong>Next step:</strong> Download Verity Kids on your child's device.
  {/* App Store badge — URL from Apple Console session */}
  <p style={{ fontSize: 12, color: C.muted }}>
    Then open the app and enter a pair code from this page to link the account.
  </p>
</div>
```
Show it persistently (not just post-creation) so parents who return later can still find the download path.

**Note:** App Store URL is an Apple Console dependency — use a placeholder until that session runs.

**Status:** Pending execution — Apple Console dependency for App Store link

---

### Kids Mgmt Task 3 — Web and iOS parent dashboards show different metrics for the same child

**Files:** `web/src/app/profile/kids/page.tsx:772–774`, `VerityPost/VerityPost/FamilyViews.swift:443–533`
**Source:** Panel review — The Parent, Seam Inspector

**Problem:**
Web `MiniStat` shows: Read, Streak, Score. iOS `KidDashboardView` shows: Articles, Quizzes, Streak. "Score" is on web, absent from iOS. "Quizzes" is on iOS, absent from web. "Read" (web) and "Articles" (iOS) appear to be the same metric with different labels. A parent checking both surfaces sees different numbers with different names and no indication whether they are looking at the same data through different lenses or whether one platform is missing information.

**Proposed fix:**
Align on a canonical three-stat set for both surfaces: Articles Read, Quizzes Passed, Streak. Rename web "Read" → "Articles" to match iOS. Add "Quizzes Passed" to web (or add Score to iOS — owner decision). Ensure both surfaces query identical fields from `kid_profiles` or the KPI endpoint.

**Status:** Pending execution — owner to confirm preferred stat set

---

### Kids Mgmt Task 4 — Pause kid profile exists on web but has no iOS counterpart

**Files:** `web/src/app/profile/kids/page.tsx:270–296`, `VerityPost/VerityPost/FamilyViews.swift:280–324`
**Source:** Panel review — Seam Inspector

**Problem:**
`togglePause()` at lines 270–296 calls `PATCH /api/kids/:id` with `{ paused: true/false }`. The web kid card surfaces Pause/Resume controls. The iOS ellipsis menu (lines 280–324) has: Get pair code, Set PIN, Reset PIN, Open Kids App, Remove kid — no Pause. A parent who pauses a profile on web has no visual indicator of that state in iOS (`kidCard` at lines 328–352 shows name, age, and chevron only) and no way to resume from iOS.

**Proposed fix:**
1. Add Pause/Resume to the iOS ellipsis menu. Check `k.pausedAt != nil` to determine label. The `PATCH /api/kids/:id` endpoint already handles the toggle.
2. Add a visual indicator to the iOS `kidCard` when `pausedAt != nil` — a "Paused" caption below the kid's name, or reduced-opacity treatment on the avatar.

**Status:** Pending execution

---

## Settings — `/profile/settings`, `SettingsView.swift` (adult iOS)

**Files read:**
- `web/src/app/profile/settings/page.tsx` (5292 lines)
- `VerityPost/VerityPost/SettingsView.swift` (2873 lines)
- `web/src/app/api/auth/verify-password/route.js`
- Cross-referenced: Pre-Launch Tasks, UI_IMPROVEMENTS.md

**Section tree comparison (web vs iOS):**

| Section | Web | iOS |
|---|---|---|
| Account | Profile, Emails, Password, Sign-in activity | Profile, Email, Password, Sign-in activity, **MFA** |
| Preferences | Feed, Alerts, Accessibility | Alerts, Feed (**no Accessibility**) |
| Privacy | Blocked users, Data & export, Supervisor | DM read receipts (inline), Blocked accounts, Data & privacy (**no Supervisor**) |
| Billing | Plan, Payment method, Invoices, Promo codes | Subscription (StoreKit) |
| Expert | Expertise & credentials, Vacation mode, Category watchlist | Verification application, Expert settings |
| About | — | Send feedback, Privacy link, Terms link |
| Danger zone | Delete account, Sign out, Sign out everywhere | Implied via Data & privacy |

---

### Settings Task 1 — MFA missing from web settings

**Files:** `web/src/app/profile/settings/page.tsx:300–422`, `VerityPost/VerityPost/SettingsView.swift:897–907`
**Source:** Direct code review — platform parity gap

**Problem:**
iOS settings hub has a full Two-factor authentication row (`MFASettingsView`, line 897-907). Web SECTIONS has no MFA entry. A user who enables 2FA on iOS has no web path to view TOTP status, add a second factor, or disable it. If they lose their authenticator app, web is a dead end.

**Proposed fix:**
Add MFA as a new subsection in the Account group of web SECTIONS:

```ts
// web/src/app/profile/settings/page.tsx — SECTIONS, account subsections (~line 321)
{
  id: 'mfa',
  label: 'Two-factor authentication',
  keywords: 'two factor 2fa mfa totp authenticator security',
},
```

Add a new `MFACard` component that:
1. Calls `supabase.auth.mfa.listFactors()` to show enrolled TOTP factors with their status
2. Shows an enroll button if no factor is active → guided TOTP QR code + verify flow using `supabase.auth.mfa.enroll()` + `supabase.auth.mfa.challengeAndVerify()`
3. Shows an unenroll button on active factors (confirm dialog before removing)

Wire the new card into the Account section renderer alongside `PasswordCard`.

**Status:** Pending execution

---

### Settings Task 2 — Accessibility section missing from iOS settings

**Files:** `VerityPost/VerityPost/SettingsView.swift`, `web/src/app/profile/settings/page.tsx:3200–3260`
**Source:** Direct code review — platform parity gap

**Problem:**
Web settings has an Accessibility section with four user preferences (lines 86-90):
- `settings.a11y.tts_per_article` — show the TTS listen button on articles
- `settings.a11y.text_size` — reading text size preference
- `settings.a11y.reduce_motion` — reduce animations
- `settings.a11y.high_contrast` — high contrast reading mode

iOS already handles text size, motion, and contrast via system-level Dynamic Type, Reduce Motion, and Increase Contrast — those three don't need in-app toggles on iOS. But `tts_per_article` is directly relevant: iOS has a `TTSPlayer.swift` and the subscription view already lists "Listen to articles (TTS)" as a feature. There is no iOS settings row to toggle whether TTS appears in the reader.

These preferences are stored in `users.metadata` by the web settings save path. iOS reads the same DB row but has no write path for the TTS preference — the iOS user is stuck with whatever web last set, or the default.

**Proposed fix:**
Add a single `tts_per_article` toggle to the iOS Preferences section. It reads and writes `users.metadata.tts_per_article` via `update_own_profile` RPC, mirroring the web save path. Gate it on `settings.a11y.tts_per_article` permission (same key web uses).

In SettingsView.swift `preferencesRows` (currently only Alerts and Feed):

```swift
if canViewTTSSetting {
    out.append(HubRowSpec(id: "tts",
                          keywords: ["tts", "listen", "audio", "read aloud", "text to speech"]) { isLast, onTap in
        AnyView(HubRow(icon: "speaker.wave.2.fill",
                       title: "Article audio",
                       subtitle: "Show listen button in articles",
                       showDivider: !isLast,
                       kind: .toggle(ttsPrefBinding, isDisabled: false)))
    })
}
```

`canViewTTSSetting = await PermissionService.shared.has("settings.a11y.tts_per_article")`

**Status:** Pending execution

---

### Settings Task 3 — MASTER-6 (password verification) appears already shipped

**Files:** `web/src/app/profile/settings/page.tsx:2325–2367`, `web/src/app/api/auth/verify-password/route.js`
**Source:** Pre-Launch Tasks MASTER-6 cross-check

**Problem:**
Pre-Launch Tasks MASTER-6 says: "Settings password card verifies current password via `signInWithPassword` in the browser — bypasses login rate limit, clobbers session cookie."

**Observed state:**
The settings `PasswordCard.handleSubmit` (line 2334) now calls:
```ts
const verifyRes = await fetch('/api/auth/verify-password', {
  method: 'POST',
  body: JSON.stringify({ password: current }),
});
```

The `/api/auth/verify-password/route.js` endpoint exists and implements: `requireAuth`, per-user rate limit (5/hour), ephemeral Supabase client (no cookie rotation), and `record_failed_login_by_email` to feed the shared lockout counter. The comment at line 2328-2333 explicitly states this replaces the prior `signInWithPassword` approach.

**Action:** Owner should mark MASTER-6 SHIPPED in Pre-Launch Tasks and record the commit SHA. Verify with `git log --oneline --all | head -30` to find the commit that added `verify-password/route.js`.

**Status:** Likely shipped — owner verification needed to close

---

### Settings Task 4 — `upErr.message` raw Supabase error in password card

**File:** `web/src/app/profile/settings/page.tsx:2351`
**Source:** Pre-Launch Tasks T-013 (raw error.message sweep)

**Problem:**
Line 2351: `pushToast({ message: upErr.message, variant: 'danger' })` — after verifying the current password via the secure `/api/auth/verify-password` endpoint, the actual password update uses `supabase.auth.updateUser({ password: next })`. If `updateUser` fails (network error, Supabase Auth policy, etc.), the raw error message is sent to the user toast. Supabase Auth messages can include policy detail like "Password should be different from the old password" or stack-trace substrings on edge errors.

**Proposed fix:**
```ts
// line 2349–2352
const { error: upErr } = await supabase.auth.updateUser({ password: next });
if (upErr) {
  setBusy(false);
  pushToast({ message: 'Password could not be updated. Try again.', variant: 'danger' });
  return;
}
```

**Status:** Pending execution

---

### Settings Task 5 — Alerts channel checkboxes have 32px label height

**File:** `web/src/app/profile/settings/page.tsx:3070`
**Source:** Direct code review — touch target

**Problem:**
Line 3070: `minHeight: 32` on the `<label>` elements wrapping each notification channel checkbox (email / push toggles in the Alerts card). At 32px these are below the WCAG 44px minimum for interactive targets.

**Proposed fix:**
Change `minHeight: 32` to `minHeight: 44` on the label style.

**Status:** Pending execution

---

### Settings Task 6 — DM read receipts lives in different sections on web vs iOS

**Files:** `web/src/app/profile/settings/page.tsx:2042–2043`, `VerityPost/VerityPost/SettingsView.swift:945–960`
**Source:** Direct code review — placement inconsistency

**Problem:**
- **Web:** DM read receipts toggle is inside the Profile card (Account → Profile section), grouped with `show_activity`, `show_on_leaderboard`, and `allow_messages` under a "Privacy" sub-header
- **iOS:** DM read receipts is a dedicated top-level row in the Privacy hub section

Both placements are defensible — iOS Privacy placement is more discoverable (one tap from the hub). The web placement buries it two levels deep: Account → Profile → scroll to Privacy sub-header. A user who knows the toggle exists from iOS will look for it in Privacy on web and not find it.

**Proposed fix:**
Move `dmReadReceipts` toggle out of `ProfileCard` and into the web privacy/data section. Create a small `PrivacyCard` (or append to an existing Privacy card if one is nearby) that groups it alongside the existing `showActivity`, `showOnLeaderboard`, `allowMessages` switches — same group, but surfaced at the Privacy & Safety section level rather than buried in the Profile card.

Update `SECTIONS` to add a `privacy-prefs` subsection:
```ts
{ id: 'privacy-prefs', label: 'Privacy preferences', keywords: 'activity leaderboard messages dm read receipts' },
```

**Status:** Pending execution

---

### Settings Note A — "Please try again" sweep: settings is the largest cluster

**File:** `web/src/app/profile/settings/page.tsx` (17+ instances)

17 toast messages in settings end with "Please try again." — the highest concentration anywhere in the codebase. This tracks under T-013 and the global copy sweep already documented across previous surfaces. All 17 need to drop "Please":

Key lines: 587, 1537, 1599, 1623, 2171, 2510, 2526, 2768, 3235, 3327, 3448, 3927, 4025, 4041, 4737, 4893, 5258.

Pattern: replace `'. Please try again.'` → `'. Try again.'` throughout the file.

**Status:** Execute as part of global T-013 copy sweep

---

### Settings Note B — T-073 (settings split) gates all sub-route work

T-073 flips 11 settings sub-routes (`/profile/settings/alerts`, `/profile/settings/billing`, etc.) to real page destinations. All T-073 dependencies (T-076 email templates, T-077 push action_url, T-078 cron hardcodes, T-079 e2e tests, T-080 robots.js) must land in the same deploy window. Do not implement any individual settings sub-route before T-073 is scheduled. The sub-route directories already exist (`/profile/settings/alerts/`, etc.) — they are stubs waiting for T-073.

**Status:** Deferred to T-073 deploy window

---

## Browse & Search

**Files reviewed:**
- `web/src/app/browse/page.tsx` (552 lines)
- `web/src/app/search/page.tsx` (299 lines)
- `VerityPost/VerityPost/FindView.swift` (229 lines)

No kids surface — kids app has no browse or search UI.

---

### Browse Task 1 — Three internal links use raw `<a>` instead of `<Link>`

**File:** `web/src/app/browse/page.tsx:283, 510, 521`
**Source:** Direct code review — navigation pattern

**Problem:**
Three internal navigation links bypass Next.js client-side routing:
- Line 283: `<a href="/story/${story.slug}">` — featured story card
- Line 510: `<a href="/story/${story.slug}">` — category-expanded story row
- Line 521: `<a href="/category/${cat.slug}">` — "View all" category link

Using raw `<a>` forces a full page reload on each navigation, discards the React tree, and loses scroll position.

**Proposed fix:**
```tsx
import Link from 'next/link';
// line 283
<Link href={`/story/${story.slug}`} style={...}>
// line 510
<Link href={`/story/${story.slug}`} style={...}>
// line 521
<Link href={`/category/${cat.slug}`} style={...}>
```

**Status:** Pending execution

---

### Browse Task 2 — Search input touch target is 42px

**File:** `web/src/app/browse/page.tsx:218`
**Source:** Direct code review — touch target

**Problem:**
Line 218: `height: 42` on the keyword search input inside the Browse filter area. Below the 44px WCAG minimum for interactive elements.

**Proposed fix:**
Change `height: 42` to `minHeight: 44`.

**Status:** Pending execution

---

### Browse Task 3 — Loading state shows plain text instead of skeleton

**File:** `web/src/app/browse/page.tsx:242`
**Source:** Direct code review — loading UX

**Problem:**
Line 242: when data is loading, the page renders a plain `'Loading...'` string. Every other audited surface (Profile, Settings) that loads async data uses skeleton loaders. This creates a jarring flash of empty layout.

**Proposed fix:**
Replace the loading branch with a skeleton that mirrors the page structure: a featured hero skeleton card + 3-4 category card skeletons in a grid. Match the visual weight of the loaded state so the layout shift is minimal when data arrives.

```tsx
// Replace:
if (loading) return <div>Loading...</div>;
// With skeleton rows that match the page grid layout
```

**Status:** Pending execution

---

### Browse Task 4 — No error state when `fetchData()` fails

**File:** `web/src/app/browse/page.tsx`
**Source:** Direct code review — error handling

**Problem:**
The `useEffect` calls `fetchData()` which queries categories and featured articles. If either query errors, the state variables remain empty arrays and the page renders silently blank — no message, no retry CTA. User sees an empty layout with no explanation.

**Proposed fix:**
Add an `error` state. If `fetchData()` throws or returns a Supabase error, set `error = true` and render:

```tsx
<div style={{ textAlign: 'center', padding: '60px 16px' }}>
  <p style={{ fontWeight: 700, fontSize: 15 }}>Could not load content</p>
  <p style={{ fontSize: 13, color: '#666' }}>Check your connection and try again.</p>
  <button onClick={fetchData}>Retry</button>
</div>
```

**Status:** Pending execution

---

### Browse Task 5 — "Trending in {cat.name}" label is wrong — data is recency-based

**File:** `web/src/app/browse/page.tsx:471`
**Source:** Direct code review — copy accuracy

**Problem:**
Line 471 renders `Trending in {cat.name}` when a category card expands. The query that populates these rows fetches the 3 most-recently-published articles in that category — ordered by `published_at` descending, not by view count, engagement, or any trending signal. The label makes a false claim.

**Proposed fix:**
Change the label to `Latest in {cat.name}`. Matches the actual data. When a real trending signal (view count / engagement) is built, revert to "Trending."

**Status:** Pending execution

---

### Browse Task 6 — Featured section empty state copy is time-bound and wrong

**File:** `web/src/app/browse/page.tsx:270`
**Source:** Direct code review — copy

**Problem:**
Line 270: `"No new stories yet today. Check back later."` — this is the empty state for the featured articles section. "Today" is time-specific and breaks any time the editorial team simply hasn't pinned a featured article (which could be for days or weeks, not just "today"). "Check back later" is passive and unhelpful.

**Proposed fix:**
Change to: `"No featured articles right now."` — accurate regardless of timing, no false urgency.

**Status:** Pending execution

---

### Browse Task 7 — Pre-search state: passive placeholder misses discovery

**File:** `web/src/app/browse/page.tsx`, `web/src/app/search/page.tsx`, `VerityPost/VerityPost/FindView.swift`
**Source:** Direct code review — engagement

**Problem:**
- Browse (web): the keyword search input has no pre-search state beyond an empty box with a placeholder
- Search (web): pre-search state is empty — user lands on a blank page until they type
- Find (iOS): pre-search state at lines 110–115 shows italic "Search for articles" — passive and unhelpful

None of these surfaces help users who don't have a specific query in mind. The result is that users who want to explore but don't have a keyword bounce out rather than discover content.

**Proposed fix:**
Show 4–6 tappable topic chips below the search bar in all three pre-search states. Chips source from the top-level active categories (already fetched on Browse; needs one DB call on Search and Find). A chip tap pre-fills the query and fires the search immediately — no extra input step.

On web Search and iOS Find, also show "3 recent searches" below the chips if the user has prior search history (stored in localStorage on web, in-memory on iOS for the session).

Chip design:
- Web: `<button>` pills with `background: #f0f0f0`, `borderRadius: 20`, `fontSize: 12`, `padding: '5px 12px'`, `minHeight: 30` (chip-scale, not interactive-target-scale — they're additive shortcuts)
- iOS: `ScrollView(.horizontal)` of `Capsule`-shaped chips with `VP.subtle` background

This converts the empty state from a blank prompt into an active discovery surface.

**Status:** Pending execution

---

### Browse Task 8 — Inline `PALETTE` constant is an anti-pattern

**File:** `web/src/app/browse/page.tsx:7–17`
**Source:** Direct code review — pattern consistency

**Problem:**
Browse defines `const PALETTE = { bg: '#ffffff', card: '#f7f7f7', ... }` inline at the top of the file. Settings imports `ADMIN_C_LIGHT` from a shared palette. Browse being a public (non-admin) page means it doesn't use `ADMIN_C`, but the inline definition still violates the single-source-of-truth rule — if a brand color changes, Browse doesn't pick it up.

**Proposed fix:**
Export a `VP_PALETTE` (or similar) from a shared `web/src/lib/theme.ts` covering the non-admin public surface colors. Browse, Search, and any other public page imports from there. This is low-urgency (no breakage today) but should land before any color-system work to avoid a double-touch.

**Status:** Pending execution (low priority — no breakage)

---

### Search Task 1 — Two internal links use raw `<a>` instead of `<Link>`

**File:** `web/src/app/search/page.tsx:246, 279`
**Source:** Direct code review — navigation pattern

**Problem:**
- Line 246: `<a href="/story/${a.slug}">` — each search result card
- Line 279: `<a href="/browse">` — "Browse categories" CTA in the no-results empty state

Same issue as Browse Task 1 — full-page reload on internal navigation.

**Proposed fix:**
```tsx
import Link from 'next/link';
// line 246
<Link href={`/story/${a.slug}`} style={...}>
// line 279
<Link href="/browse" style={...}>
```

**Status:** Pending execution

---

### Search Task 2 — Search button has no explicit `minHeight`

**File:** `web/src/app/search/page.tsx:152–166`
**Source:** Direct code review — touch target

**Problem:**
Line 152–166: the Search button uses `padding: '10px 18px'` and `fontSize: 14`. With default line-height this produces approximately 41px total height — below the 44px minimum. No `minHeight` is set.

**Proposed fix:**
Add `minHeight: 44` to the button style object.

**Status:** Pending execution

---

### Search Task 3 — Mode label exposes developer detail to users

**File:** `web/src/app/search/page.tsx:240`
**Source:** Direct code review — copy / information hygiene

**Problem:**
Line 240: `${results.length} result${results.length === 1 ? '' : 's'} · ${mode}` — the `mode` value is the raw API string `"basic"` or `"advanced"`. Users see "12 results · basic" or "12 results · advanced" in the results count line. "basic" and "advanced" are internal API mode tokens, not user-facing labels.

**Proposed fix:**
Remove `· ${mode}` entirely. The result count is sufficient. If a paid filter is active and worth surfacing, show an explicit badge (e.g. "Filtered") on the filter panel — not in the count line.

```tsx
// line 240
{results.length > 0 ? `${results.length} result${results.length === 1 ? '' : 's'}` : null}
```

**Status:** Pending execution

---

### Search Task 4 — Error display may expose raw API error strings

**File:** `web/src/app/search/page.tsx:100, 103–105, 236`
**Source:** Direct code review — information hygiene

**Problem:**
Line 100: `throw new Error(data?.error || 'Search failed')` — if the `/api/search` endpoint returns a JSON `error` field, that string becomes the thrown error message. Line 103–105: `const msg = err instanceof Error ? err.message : 'Search failed'` then sets `setError(msg)`. Line 236 renders `msg` directly in the UI. If the API ever returns a specific error string (e.g. "rate limit exceeded for key X" or a Supabase message), it surfaces verbatim.

**Proposed fix:**
Sanitize in the catch block — only pass the generic fallback to the state:
```tsx
} catch {
  setError('Search failed. Try again.');
}
```
The existing `console.error` on the server side already captures the real detail.

**Status:** Pending execution

---

### Search Task 5 — iOS Find story rows are missing category name and published date

**File:** `VerityPost/VerityPost/FindView.swift:138–155`
**Source:** Direct code review — parity with web

**Problem:**
`storyRow()` at lines 138–155 renders only `story.title` and `story.excerpt`. The web search results card (line 263–267 of `search/page.tsx`) renders `a.categories?.name`, a separator dot, and `formatDate(a.published_at)` below the excerpt. iOS users have no temporal or topical context for a result.

The `Story` model already carries `categories` and `published_at` — these are available.

**Proposed fix:**
Add a metadata line below the excerpt in `storyRow()`:
```swift
if story.publishedAt != nil || story.categoryName != nil {
    HStack(spacing: 4) {
        if let cat = story.categoryName {
            Text(cat)
                .font(.system(.caption2))
                .foregroundColor(VP.dim)
        }
        if story.publishedAt != nil && story.categoryName != nil {
            Text("·")
                .font(.system(.caption2))
                .foregroundColor(VP.dim)
        }
        if let date = story.publishedAt {
            Text(date, style: .date)
                .font(.system(.caption2))
                .foregroundColor(VP.dim)
        }
    }
}
```

Verify `Story.categoryName` field name against `Models.swift` before implementing — the field may be `categories?.name` from a nested join.

**Status:** Pending execution

---

### Search Task 6 — iOS has no Browse equivalent — users cannot explore by topic

**File:** `VerityPost/VerityPost/FindView.swift`, `VerityPost/VerityPost/` (no BrowseView.swift exists)
**Source:** Gap analysis — discovery surface

**Problem:**
The iOS app has five tabs but no Browse or Explore tab. Users who want to find articles by topic — rather than by keyword — have no path on iOS. Web's Browse page provides category cards, expand-in-place article previews, and a featured section. iOS provides none of this. The gap means:
- Topic-first discovery is web-only
- Users who don't know what to search for have no fallback on iOS
- New users exploring the product have no guided entry point

**Proposed fix:**
Add a Browse tab to the iOS adult app — a `BrowseView.swift` that mirrors the web category directory:
- `LazyVStack` of category cards (name + article count), tapping expands inline to show 3 latest article rows with `NavigationLink` to `StoryDetailView`
- "View all" row at the bottom of each expanded section navigates to a `CategoryFeedView`
- Data: same `/api/browse` or direct Supabase query that the web page uses

Tab order: Home | Find | **Browse** | Messages | Profile (or replace one of the lower-traffic tabs if 5 is the ceiling). Owner decision on tab order — do not adjust autonomously.

**Status:** Pending execution — owner to confirm tab placement before implementation

---

### Search Note A — `href="/profile/settings#billing"` at line 230 is a T-073 dependency

**File:** `web/src/app/search/page.tsx:230`
**Source:** T-073 dependency tracking

The advanced filters upsell banner ("View plans →") links to `/profile/settings#billing` — an anchor on the monolithic settings page. When T-073 ships and settings is split into sub-routes, this anchor target disappears. Update to `/profile/settings/billing` in the same T-073 deploy window.

**Status:** Deferred to T-073 deploy window (same as Settings Note B)

---

## Static & Marketing Pages

**Files reviewed:**
- `web/src/app/page.tsx` — home feed (reader surface, not marketing)
- `web/src/app/kids-app/page.tsx` — Verity Kids launch waitlist landing
- `web/src/app/how-it-works/page.tsx` — four-step explainer
- `web/src/app/about/page.tsx` — company / contact / policies index
- `web/src/app/privacy/page.tsx` — Privacy Policy
- `web/src/app/terms/page.tsx` — Terms of Service

Pages not re-audited (exist, confirmed clean): `cookies/`, `accessibility/`, `dmca/`.

**Home feed (`page.tsx`):** clean — uses `Link` throughout, has proper skeleton loading, distinct error (`FetchFailed`) and empty (`EmptyDay`) states, retry mechanism via `reloadKey`. No items.

---

### Static Task 1 — Kids-app: two navigation links use raw `<a>`

**File:** `web/src/app/kids-app/page.tsx:239, 253`
**Source:** Direct code review — navigation pattern

**Problem:**
- Line 239: `<a href="/">` "Back to home" — full-page reload on internal navigation
- Line 253: `<a href="/login">` "Parent account sign-in" — same

**Proposed fix:**
```tsx
import Link from 'next/link';
// line 239
<Link href="/" style={...}>Back to home</Link>
// line 253
<Link href="/login" style={...}>Parent account sign-in</Link>
```

**Status:** Pending execution

---

### Static Task 2 — Kids-app: email input and submit button below 44px touch target

**File:** `web/src/app/kids-app/page.tsx:165–203`
**Source:** Direct code review — touch target

**Problem:**
- Email input (line 165): `padding: '10px 12px'` with no explicit `minHeight` — renders at approximately 41px
- Submit button (line 187): `padding: '10px 18px'` with no explicit `minHeight` — same

Both are below the 44px WCAG minimum for interactive elements. This is particularly notable on a marketing page where converting new sign-ups is the entire purpose.

**Proposed fix:**
Add `minHeight: '44px'` to both the `<input>` and `<button>` style objects.

**Status:** Pending execution

---

### Static Task 3 — Kids-app: API error string surfaces in error toast

**File:** `web/src/app/kids-app/page.tsx:59–66`
**Source:** Direct code review — information hygiene

**Problem:**
Lines 59–66: when `/api/kids-waitlist` returns a non-ok response with a JSON `error` field, that string is shown directly to the user:
```ts
const j = (await res.json().catch(() => ({}))) as { error?: string };
if (j?.error) msg = j.error;
```
If the API returns a Supabase message or a rate-limit string with internal detail, it surfaces. The generic fallback `"Couldn't save. Try again in a moment."` is already the right copy.

**Proposed fix:**
Remove the `j?.error` branch — always use the generic fallback for non-ok responses:
```ts
// Don't parse j.error — keep the safe generic
setErrorMsg("Couldn't save. Try again in a moment.");
setStatus('error');
```

**Status:** Pending execution

---

### Static Task 4 — How-it-works: "Get Started" uses raw `<a>`

**File:** `web/src/app/how-it-works/page.tsx:142`
**Source:** Direct code review — navigation pattern

**Problem:**
Line 142: `<a href="/signup">` for the "Get Started" CTA. The page is a server component, but `Link` from `next/link` works fine in server components and should be used for internal navigation.

**Proposed fix:**
```tsx
import Link from 'next/link';
// line 142
<Link href="/signup" style={...}>Get Started</Link>
```

**Status:** Pending execution

---

### Static Task 5 — How-it-works: Step 4 copy says scores unlock expert features — they don't

**File:** `web/src/app/how-it-works/page.tsx:33–40`
**Source:** Direct code review — copy accuracy

**Problem:**
Step 4 description: "Build your Verity Score by reading thoroughly, acing quizzes, contributing quality discussions, and verifying sources. Higher scores unlock expert features and community recognition."

"Higher scores unlock expert features" is inaccurate. Experts apply and are vetted (including background checks for journalists). The path is application → review → badge grant, not score threshold. A new user reading this could expect to automatically gain expert status by scoring well, then be confused when nothing happens.

**Proposed fix:**
Change Step 4 description to:
"Build your Verity Score by reading thoroughly, acing quizzes, and contributing quality discussions. Higher scores earn community recognition and open the door to applying for expert and journalist roles."

**Status:** Pending execution — owner should confirm the expert path description is accurate before implementation

---

### Static Task 6 — About: five internal policy links use raw `<a>`

**File:** `web/src/app/about/page.tsx:112–131`
**Source:** Direct code review — navigation pattern

**Problem:**
The Policies section contains five internal `<a>` tags:
- Line 112: `<a href="/terms">`
- Line 116: `<a href="/privacy">`
- Line 122: `<a href="/cookies">`
- Line 127: `<a href="/accessibility">`
- Line 131: `<a href="/dmca">`

All five confirmed to have existing `page.tsx` routes. The `mailto:` links in the Contact section are correctly left as `<a>`.

**Proposed fix:**
```tsx
import Link from 'next/link';
// Each of the five href-only links becomes <Link href="...">
```

**Status:** Pending execution

---

### Static Task 7 — Privacy and Terms both say "Kids Mode" — product was renamed

**Files:** `web/src/app/privacy/page.tsx:164`, `web/src/app/terms/page.tsx:111`
**Source:** Direct code review — branding accuracy

**Problem:**
- Privacy line 164: "Kids Mode collects minimal data and does not enable social features or public profile creation."
- Terms line 111: "Users aged 13 to 17 may use Verity Post with parental consent. A dedicated Kids Mode provides age-appropriate content."

"Kids Mode" was the old feature inside the adult iOS app — it was removed when the adult and kids apps were unified/split (2026-04-19). The current product is the **Verity Kids app** — a separate iOS application, not a "mode" inside the adult app. Using "Kids Mode" in legal documents is inaccurate and could create confusion with regulators or App Review.

**Proposed fix:**
- Privacy line 164: "Verity Kids collects minimal data and does not enable social features or public profile creation."
- Terms line 111: "Users aged 13 to 17 may use Verity Post with parental consent. A dedicated Verity Kids app provides age-appropriate content."

**Status:** Pending execution

---

### Static Task 8 — Terms: "Family Dashboard" may not match the product term

**File:** `web/src/app/terms/page.tsx:116`
**Source:** Direct code review — terminology consistency

**Problem:**
Line 116: "Parents and guardians may manage child accounts, including content filters and usage limits, through the Family Dashboard."

The parent management surface lives at `/profile/kids` on web and in `FamilyViews.swift` on iOS, and is referred to as "Family" in the navigation. There is no UI surface or nav label called "Family Dashboard." A parent reading the terms and then looking for the "Family Dashboard" won't find it.

**Proposed fix:**
Change to: "Parents and guardians may manage child accounts, including content filters and usage limits, through the Family section of their account."

**Status:** Pending execution

---

### Static Note A — About: press inquiries route to general support address

**File:** `web/src/app/about/page.tsx:94`
**Source:** Direct code review — contact accuracy

Line 94: "Press inquiries" links to `support@veritypost.com` — same address as general support and general questions. If this is intentional (no dedicated press inbox yet), it's fine. If a press@ or media@ address exists or is planned, this should be updated before launch when press coverage is most likely to come in.

**Status:** Owner to confirm — no change needed if support@ is the intended press contact

---

## Kids iOS

**Files reviewed:**
- `VerityPostKids/VerityPostKids/KidsAppRoot.swift` — tab shell, scene queue, JWT refresh
- `VerityPostKids/VerityPostKids/GreetingScene.swift` — home / category entry
- `VerityPostKids/VerityPostKids/ArticleListView.swift` — article list per category
- `VerityPostKids/VerityPostKids/KidReaderView.swift` — full article reader
- `VerityPostKids/VerityPostKids/KidQuizEngineView.swift` — quiz engine + result
- `VerityPostKids/VerityPostKids/LeaderboardView.swift` — family / global / category ranks
- `VerityPostKids/VerityPostKids/ExpertSessionsView.swift` — upcoming expert sessions
- `VerityPostKids/VerityPostKids/PairCodeView.swift` — pair code auth entry
- `VerityPostKids/VerityPostKids/ParentalGateModal.swift` — math-challenge gate
- `VerityPostKids/VerityPostKids/ProfileView.swift` — already audited (Profile section above)

**General:** The kids app is the most carefully built surface in the entire codebase. Touch targets, COPPA parental gates, write-failure guards, accessibility `reduceMotion` support, and retry patterns are all present. The issues below are targeted; there is nothing structurally wrong.

---

### Kids Task 1 — `closeChrome` button duplicates ArticleListView's own toolbar close button

**File:** `VerityPostKids/VerityPostKids/KidsAppRoot.swift:94–101, 235–249`
**Source:** Direct code review — UI duplication

**Problem:**
`KidsAppRoot` wraps every `fullScreenCover` scene in a `ZStack` that overlays `closeChrome` — a material-background xmark circle positioned at `padding(.leading, 20).padding(.top, 60)`. This is the right approach for `StreakScene` and `BadgeUnlockScene` (which have no toolbar).

However, `ArticleListView` is a `NavigationStack` with its own `ToolbarItem(placement: .topBarLeading)` xmark button at the same visual position. On devices where the safe-area top is ~59pt (Dynamic Island), the two circles sit at the same coordinates. The kid sees two overlapping close buttons — one from the NavigationStack toolbar (card background, border) and one from `closeChrome` (thinMaterial). Tapping either works correctly (both set `activeSheet = nil`), so this is not a functional bug, but it's a visible polish gap.

**Proposed fix:**
Conditional overlay — only show `closeChrome` for non-article scenes:

```swift
ZStack(alignment: .topLeading) {
    sceneBody(sheet)
    if case .articles = sheet { } else {
        closeChrome
    }
}
```

`ArticleListView` already has a correctly styled close button; `closeChrome` is only needed for scenes that don't have their own.

**Status:** Pending execution

---

### Kids Task 2 — Quiz `resultView` shows immediately with local verdict while server result is still pending

**File:** `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:442–478`
**Source:** Direct code review — UX correctness

**Problem:**
When the last question is answered, `showResult = true` triggers `resultView` to render immediately using the local `currentResult` fallback. Simultaneously, `fetchServerVerdict()` is called — it must first wait for all pending `quiz_attempts` writes to settle, then call the `get_kid_quiz_verdict` RPC. This can take 2–5 seconds on a normal connection.

During that window, `verdictPending = true` is tracked in state but never used by `resultView`. If the local computation (60% threshold, `correctCount`) produces a different pass/fail verdict than the server (e.g., the server threshold differs, or a write failure changed the count), the result view silently flips. A kid who sees "Give it another go?" and is processing that outcome might then see it change to "Great job!" with no transition — confusing and disorienting.

`verdictPending` is already the right signal — it's just not wired to the UI.

**Proposed fix:**
Show a short spinner in `resultView` while `verdictPending`:

```swift
private var resultView: some View {
    let r = currentResult
    return VStack(spacing: 20) {
        Spacer()
        if verdictPending {
            ProgressView()
                .padding(.bottom, 8)
            Text("Checking your score…")
                .font(.scaledSystem(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(K.dim)
        } else {
            // existing ZStack icon + "Great job!" / "Give it another go?" + score
        }
        Spacer()
        // "Done" button only when not pending
        if !verdictPending { doneButton }
    }
}
```

Pending duration is typically 1–3 seconds; kids expect a moment of anticipation on a result screen. The wait is not punishing — it's appropriate for a quiz reveal.

**Status:** Pending execution

---

### Kids Task 3 — Quiz load error renders wrong empty state copy

**File:** `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:162–165, 480–502`
**Source:** Direct code review — copy accuracy

**Problem:**
In `loadQuestions()`, when the Supabase query fails, `self.loadError = "Couldn't load quiz"` is set and `self.questions = []`. The `body` property then renders `emptyState` (since `!loading && !blockedNotKidsSafe && questions.isEmpty`), which displays "No quiz yet for this article." with a "Back" button.

This copy implies the quiz doesn't exist — which is accurate when the article genuinely has no quiz questions, but is misleading when the real cause is a network failure. A kid who just lost connectivity sees "No quiz yet" and might think their favorite article just doesn't have a quiz, rather than understanding it's a temporary issue.

`loadError` is set correctly but is never rendered anywhere in the view body.

**Proposed fix:**
Branch on `loadError` before `questions.isEmpty` in the body:

```swift
} else if loadError != nil {
    errorState   // "Couldn't load the quiz. Try again." + Retry button
} else if questions.isEmpty {
    emptyState   // "No quiz yet for this article." — accurate for real missing quiz
}
```

Add a private `errorState` view with a retry button (mirrors `LeaderboardView`'s error pattern):
```swift
private var errorState: some View {
    VStack(spacing: 14) {
        Image(systemName: "wifi.slash")
            .font(.scaledSystem(size: 36, weight: .bold))
            .foregroundStyle(K.dim)
        Text("Couldn't load the quiz right now.")
            .font(.scaledSystem(size: 15, weight: .semibold, design: .rounded))
            .foregroundStyle(K.dim)
            .multilineTextAlignment(.center)
        Button { Task { await loadQuestions() } } label: {
            Text("Try again")
                .font(.scaledSystem(size: 14, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
                .padding(.horizontal, 22).padding(.vertical, 12)
                .frame(minHeight: 44)
                .background(K.teal)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
    .padding(40)
}
```

**Status:** Pending execution

---

### Kids Task 4 — ArticleListView: error message appears below emptyState instead of replacing it

**File:** `VerityPostKids/VerityPostKids/ArticleListView.swift:29–45`
**Source:** Direct code review — error handling

**Problem:**
The view body renders `emptyState` when `articles.isEmpty`, then separately renders the error message from `loadError` below it in the same `VStack`. When a network error causes `load()` to fail, both appear: "No articles in this category yet. Try another or go back home." followed by "Couldn't load articles" in a smaller red caption.

The emptyState copy ("No articles in this category yet") is wrong for a network error — it implies the category simply has no content. The error message that follows contradicts it. A kid who sees both gets conflicting information.

**Proposed fix:**
Mirror the same fix as Task 3 — branch on `loadError` before `articles.isEmpty`:

```swift
if loading && articles.isEmpty {
    ProgressView().padding(.top, 60)
} else if loadError != nil {
    VStack(spacing: 14) {
        Text("Couldn't load articles right now.")
            .font(.system(.subheadline, design: .rounded, weight: .medium))
            .foregroundStyle(K.dim)
            .multilineTextAlignment(.center)
        Button { Task { await load() } } label: {
            Text("Try again")
                .font(.system(.subheadline, design: .rounded, weight: .bold))
                .foregroundStyle(.white)
                .frame(maxWidth: 180, minHeight: 44)
                .background(K.teal)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
    }
    .frame(maxWidth: .infinity).padding(.vertical, 50)
} else if articles.isEmpty {
    emptyState
} else {
    ForEach(articles) { ... }
}
// Remove the trailing loadError Text — error is now handled in its own branch
```

**Status:** Pending execution

---

### Kids Task 5 — Dead code in KidReaderView: scroll-progress structs declared but never used

**File:** `VerityPostKids/VerityPostKids/KidReaderView.swift:259–271`
**Source:** Direct code review — dead code

**Problem:**
Lines 259–271 declare two private structs:
```swift
private struct ReaderContentHeightKey: PreferenceKey { ... }
private struct ReaderScroll: Equatable { ... }
```

Neither is referenced anywhere in the file. The file-level comment says "Tracks scroll progress; when the kid scrolls to ≥80% of the article, emits a reading_log INSERT (completed=true)" — but `logReading()` is only called from the "Take the quiz" button tap. Scroll progress is never measured. The reading_log always sets `completed: true` regardless of how much the kid actually read.

The structs are scaffolding for a scroll-tracking feature that was never wired up. The misleading comment compounds this.

**Proposed fix:**
Delete the two unused structs (lines 259–271). Update the file-level comment to remove the "≥80% scroll" claim:

```swift
// Kid article reader. Loads full article text, renders in kid-friendly style.
// Reading is logged when the kid taps "Take the quiz" — completion is recorded
// at that point. Scroll-progress tracking is deferred (see T-tbd).
```

If scroll-progress tracking is desired in the future, it should be a tracked task with a real implementation — not misleading scaffolding.

**Status:** Pending execution

---

### Kids Task 6 — Leaderboard and ExpertSessions "Retry" buttons below 44pt touch target

**Files:** `VerityPostKids/VerityPostKids/LeaderboardView.swift:90`, `VerityPostKids/VerityPostKids/ExpertSessionsView.swift:65`
**Source:** Direct code review — touch target

**Problem:**
Both files define a "Retry" button in their error state with `.frame(minHeight: 36)` — 8pt below the 44pt HIG minimum. Kids have wider variance in tap precision than adults; small targets on an error state (where the kid is already frustrated) leads to missed taps.

**Proposed fix:**
Change `minHeight: 36` → `minHeight: 44` in both files.

**Status:** Pending execution

---

### Kids Task 7 — PairCodeView error copy uses "Please"

**File:** `VerityPostKids/VerityPostKids/PairCodeView.swift:205`
**Source:** T-013 copy sweep

**Problem:**
Line 205: `errorMessage = "Something went wrong. Please try again."` — part of the global "Please try again" → "Try again" sweep tracked under T-013.

**Proposed fix:**
Change to: `"Something went wrong. Try again."`

**Status:** Pending execution — batch with T-013 global sweep

---

### Kids Task 8 — ExpertSessionsView creates a new DateFormatter per call

**File:** `VerityPostKids/VerityPostKids/ExpertSessionsView.swift:252–256`
**Source:** Direct code review — performance

**Problem:**
Lines 252–256: `formatted()` creates a new `DateFormatter` every time it is called. `DateFormatter` initialization is one of the most expensive UIKit/Foundation operations — constructing it repeatedly on a scroll-driven list (one call per card, per render) creates unnecessary CPU pressure.

```swift
private func formatted(_ date: Date) -> String {
    let fmt = DateFormatter()
    fmt.dateFormat = "MMM d, h:mm a"
    return fmt.string(from: date)
}
```

**Proposed fix:**
Promote to a static constant:

```swift
private static let sessionDateFormatter: DateFormatter = {
    let fmt = DateFormatter()
    fmt.dateFormat = "MMM d, h:mm a"
    return fmt
}()

private func formatted(_ date: Date) -> String {
    Self.sessionDateFormatter.string(from: date)
}
```

**Status:** Pending execution

---

### Kids Task 9 — Quiz delivers full answer key to device before submission (CRITICAL)

**File:** `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:150–165, 255–308`
**Source:** Panel review — Adversary, Seam Inspector, Trust Auditor (by contrast with adult architecture)

**Problem:**
The kids quiz loads questions via `.select("id, article_id, question_text, question_type, options, explanation, difficulty, points, pool_group, sort_order")` against the `quizzes` table (lines 150–165), decoding `isCorrect` per option into `QuizQuestion`. At line 255, `opt.isCorrect` colors the button green during answer reveal. At line 308, `if chosen.isCorrect { correctCount += 1 }` — the client grades the quiz locally with the answer key it received at load time, before any server call.

A parent, researcher, or journalist using Charles Proxy can intercept the device's network traffic and extract every correct answer before the first question is answered. This directly contradicts the product's founding claim ("commenters proved they read the article") on its most sensitive surface (COPPA-covered children).

Contrast: `StoryDetailView.swift:62` notes "No correct-answer data ever lives on the client until /submit response." Adult web and adult iOS call `/api/quiz/start` (questions only) then `/api/quiz/submit` (server-graded). The kids app bypasses this architecture entirely via a direct Supabase client query.

**Proposed fix:**
Route the kids quiz through the same server-graded flow as adults:
1. Replace `loadQuestions()` with a call to `/api/quiz/start`. Extend the route to accept the kids bearer token (or create a `/api/quiz/start-kid` variant that validates `is_kid_delegated` claims).
2. Replace local `correctCount` grading with the existing `get_kid_quiz_verdict` RPC as the sole authority.
3. Remove `isCorrect` from the `QuizQuestion` struct or stop decoding it from the network response.
4. Drive the per-question reveal animation from the server's per-question response (extend `/submit` to return per-question correctness alongside the existing `explanation` field).

The reveal UX stays intact; it just waits for the server rather than reading client-side state.

**Do not ship the kids quiz in current state.**

**Status:** Pending execution — highest priority in the kids surface

---

### Kids Task 10 — Quiz has no framing for why it matters to the kid

**File:** `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:442–478`
**Source:** Panel review — Trust Auditor, The Parent

**Problem:**
The result view shows "Great job!" or "Give it another go?" with no connection to what passing earns. Kids read and quiz without knowing the outcome contributes to their streak, their rank, or anything beyond a right/wrong count. Adult surfaces have explicit framing ("BEFORE YOU DISCUSS," "the conversation opens") that gives the quiz civic weight. Kids get a score and an encouraging label. The quiz reads as a school test, not a participation gate that matters.

**Proposed fix:**
Add one line to the result view connecting the outcome to something concrete. On pass: below "Great job!" — "Your streak just got longer." On fail with attempts remaining: "You need 3 right — give it another go!" On fail after all attempts: "Read it again and try when you're ready." Even a single sentence of framing converts the result from evaluation to context.

**Status:** Pending execution

---

### Kids Task 11 — Kids quiz has no pool-size gate; adult web rejects articles under 10 questions

**Files:** `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:149–165`, `web/src/app/story/[slug]/page.tsx:912`
**Source:** Panel review — Seam Inspector

**Problem:**
Adult web gates the entire quiz block on `quizPoolSize >= 10`. Articles below threshold show no quiz. The kids iOS loads whatever questions exist (`.limit(10)`) and proceeds normally — even with 2 or 3 questions. A kid can pass a 2-question quiz on an article the adult platform considers unready, and that verdict flows into streaks and achievements.

**Proposed fix:**
Add a minimum count check after `loadQuestions()` returns:
```swift
guard questions.count >= 5 else {
    self.questions = []   // emptyState fires: "This article's quiz isn't ready yet."
    return
}
```
5 is a reasonable minimum for kids (lower than adult 10 because kids have no free/paid attempt pool variation). The existing `emptyState` copy handles the zero-question case and works here too.

**Status:** Pending execution

---

### Kids Task 12 — Pass threshold not shown to kids; adult surfaces state it explicitly on both platforms

**Files:** `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:442–478`, `VerityPost/VerityPost/StoryDetailView.swift:860–861`, `web/src/app/story/[slug]/page.tsx:1031`
**Source:** Panel review — Seam Inspector, The Parent, Trust Auditor

**Problem:**
Adults see "3 of 5 correct to join the discussion" on both web and iOS idle cards before they start. The kids result view shows pass/fail state and a score line ("You got 3 of 5 right" at line 455) but never states the threshold. A kid who fails does not know how many they needed or how close they came. "Give it another go?" gives no actionable context.

**Proposed fix:**
Extend the result view copy with threshold context:
- On fail: "You got 2 of 5. You need 3 to pass — try again!"

`passThreshold` is available from the local fallback logic (`max(1, Int(ceil(Double(total) * 0.6)))`). Use it in the copy rather than leaving the bar implicit.

**Status:** Pending execution

---

### Kids Note A — ParentalGateModal is NOT zero-callers — CLAUDE.md note is stale

**File:** `VerityPostKids/VerityPostKids/ParentalGateModal.swift`, `ExpertSessionsView.swift:85`, `PairCodeView.swift:143`
**Source:** Direct code review — CLAUDE.md accuracy

CLAUDE.md currently says: "ParentalGateModal.swift — COPPA gate — defined, zero callers (T-tbd)"

This is incorrect. `ParentalGateModal` is called via the `.parentalGate(isPresented:onPass:)` view modifier defined at the bottom of the file. Active callers:
- `ExpertSessionsView` line 85: `.parentalGate(isPresented: $showParentGate)`
- `PairCodeView` line 143: `.parentalGate(isPresented: $showHelpGate)`

Both are correct COPPA implementations. The gate works — math challenge (multiplication, 12–49 × 2–9), 3-attempt lockout, 5-minute cooldown persisted in UserDefaults.

**Action:** Update CLAUDE.md line to: "ParentalGateModal.swift — COPPA gate — active (ExpertSessionsView, PairCodeView). Modifier `.parentalGate(isPresented:onPass:)` at file bottom."

**Status:** CLAUDE.md update pending

---

## Admin (web only)

**Scope:** All 44 sub-pages under `/admin/`. Admin is web-only — confirmed. No iOS surface. Access from any browser, any device (phone, tablet, desktop).

**Architecture recap:**
- `web/src/app/admin/layout.tsx` — auth gate only. MOD_ROLES threshold (moderator and above). Returns 404 for non-staff — hides `/admin` existence. Wraps children in `ToastProvider`. No persistent navigation.
- Shared primitives: `Page` / `PageHeader` / `PageSection`, `DataTable`, `Button`, `Drawer`, `Modal`, `Toolbar`, `Badge`, `Toast`.
- `Sidebar.jsx` exists in the component library but zero admin pages import it — not an issue.

---

### Admin Task 1 — Button touch targets are too small for mobile (ALL admin pages)

**File:** `web/src/components/admin/Button.jsx:8-10`
**Scope:** Every action button across all 44 admin pages.

Current SIZES definition:

```js
const SIZES = {
  sm: { padY: 4, padX: 10, fontSize: F.sm, height: 26 },
  md: { padY: 6, padX: 14, fontSize: F.base, height: 32 },
};
```

Both variants are used as `minHeight`:

```js
minHeight: sz.height,
```

So `sm` buttons have `minHeight: 26` and `md` buttons have `minHeight: 32`. The iOS HIG and WCAG 2.5.5 both require 44×44px minimum tap targets. An admin loading the users page on their phone and trying to tap "Change role" (sm, 26px) or "Ban user" (md, 32px) is fighting the UI.

The `block` prop exists and is used throughout (`block` = full-width), which helps for drawer action rows. But filter buttons, modal footers, toolbar actions, and all the per-row quick-actions are non-block sm/md buttons — all too small.

**Proposed fix:**
Change both SIZES entries to `minHeight: 44`. The visual padding remains; only the floor changes for touch comfort.

```js
const SIZES = {
  sm: { padY: 4, padX: 10, fontSize: F.sm, height: 44 },
  md: { padY: 6, padX: 14, fontSize: F.base, height: 44 },
};
```

This is a one-line fix that upgrades every admin button on every page simultaneously.

**Status:** Pending execution

---

### Admin Task 2 — Remove KBD ghost shortcuts from admin hub

**File:** `web/src/app/admin/page.tsx:82-88, 167-168, 213-214`

The hub has KBD labels in two places:

1. Header actions row (line 167-168): "Cmd+K" hint next to a "Search" label
2. Each quick-link card (line 213-214): per-destination shortcut hints ("G A", "G U", "G R", "G N", "G S")

The code comment at line 81 acknowledges this: "Cmd-K hint is a visual placeholder only (the launcher itself is a later pass)."

There is no keyboard handler anywhere in the file. No `useEffect` listening for keyboard events. No command palette component. These KBD elements render as visual decorations with no function.

Per product rule: no keyboard shortcuts in admin UI (keyboard shortcuts / hotkeys / command palettes are not to be built or proposed for admin flows).

**Proposed fix:**
- Remove the `KBD` import from the hub.
- Remove the `actions` prop on `PageHeader` that renders the "Search / Cmd+K" label.
- Remove the `<KBD keys={ql.hint} size="xs" />` from each quick-link card in the QUICK_LINKS map.
- The quick-link card layout already has `justifyContent: 'space-between'` — with KBD removed, the label just sits left-aligned, which is correct.

**Status:** Pending execution

---

### Admin Task 3 — No back-navigation from admin sub-pages on mobile

**File:** `web/src/app/admin/layout.tsx`, `web/src/components/admin/Page.jsx`
**Scope:** All 44 admin sub-pages.

`layout.tsx` is a pure auth gate — it renders `{children}` with no surrounding navigation. Sub-pages have no breadcrumb, no "Admin home" link, no persistent header. On a desktop browser this is fine — the tab bar, address bar, and back button are always visible. On a phone in full-browser mode, the nav chrome collapses and there is no clear path back to the hub without manually editing the URL or swiping back.

`PageHeader` has a `hideBreadcrumb` prop (used on the hub itself), which implies a breadcrumb mechanism exists or was planned but not yet wired.

**Proposed fix:**
Add a "← Admin" back link to `Page.jsx` or `PageHeader` that renders only when `hideBreadcrumb` is not set. Simplest implementation: above the `PageHeader` content, render a small anchor that is visible on narrow screens.

```jsx
// In PageHeader, before the title block:
{!hideBreadcrumb && (
  <a
    href="/admin"
    style={{
      display: 'block',
      fontSize: F.xs,
      color: ADMIN_C.dim,
      textDecoration: 'none',
      marginBottom: S[2],
    }}
  >
    ← Admin
  </a>
)}
```

On desktop this is a subtle breadcrumb. On mobile it becomes the primary navigation affordance back to the hub.

**Status:** Pending execution

---

### Admin Task 4 — Drawer close button is too small for touch

**File:** `web/src/components/admin/Drawer.jsx:140-162`

Current close button:

```jsx
<button
  type="button"
  aria-label="Close"
  onClick={attemptClose}
  style={{
    border: 'none',
    background: 'transparent',
    color: ADMIN_C.dim,
    padding: 4,
    fontSize: 20,
    lineHeight: 1,
    cursor: 'pointer',
    borderRadius: 4,
  }}
>
  ×
</button>
```

`padding: 4` on all sides + `fontSize: 20` gives an effective tap area of approximately 28×28px — below the 44px minimum.

**Proposed fix:**
Increase padding to 12px on all sides to bring the tap target to approximately 44×44px:

```js
padding: 12,
```

The visual `×` character stays the same size (`fontSize: 20`). Only the clickable zone grows.

**Status:** Pending execution

---

### Admin Task 5 — Modal lacks a close button (inconsistent with Drawer)

**File:** `web/src/components/admin/Modal.jsx`

`Drawer` has an explicit `×` close button in the header. `Modal` has no close button — it closes only via backdrop click or Esc key.

On a phone, the focus trap + backdrop click work correctly. But the pattern is inconsistent: an admin who learns to close Drawer via the `×` button will not find one in Modal. For confirmation modals and form modals (role change, plan change, ban reason) this creates a confusing experience on mobile.

**Proposed fix:**
Add a close button to Modal's header using the same pattern as Drawer:

```jsx
{(title || description) && (
  <div
    style={{
      padding: `${S[4]}px ${S[4]}px ${S[3]}px`,
      borderBottom: `1px solid ${ADMIN_C.divider}`,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: S[3],
    }}
  >
    <div style={{ minWidth: 0, flex: 1 }}>
      {/* existing title + description */}
    </div>
    <button
      type="button"
      aria-label="Close"
      onClick={attemptClose}
      style={{
        border: 'none',
        background: 'transparent',
        color: ADMIN_C.dim,
        padding: 12,
        fontSize: 20,
        lineHeight: 1,
        cursor: 'pointer',
        borderRadius: 4,
      }}
    >
      ×
    </button>
  </div>
)}
```

The close button only appears when a title or description is rendered (same guard as the existing header block). If a modal has neither, the close mechanism remains backdrop + Esc — which is acceptable for those rare modal shapes.

**Status:** Pending execution

---

### Admin Task 6 — DataTable pagination inherits the 26px button height

**File:** `web/src/components/admin/DataTable.jsx`
**Dependency:** Admin Task 1

DataTable renders Prev/Next pagination buttons using `<Button size="sm">`, which currently gives `minHeight: 26`. Admin Task 1 fixes this globally by raising `sm` to `minHeight: 44`. No separate DataTable change is needed — this is a note confirming the dependency.

If Admin Task 1 ships first, DataTable pagination is fixed automatically. If someone wanted to address DataTable in isolation before Task 1 ships, they could override with `style={{ minHeight: 44 }}` on the pagination buttons directly.

**Status:** Resolved by Admin Task 1

---

### Admin Note A — Page.jsx horizontal padding on narrow screens

**File:** `web/src/components/admin/Page.jsx`

Current: `padding: ${S[6]}px ${S[6]}px ${S[12]}px` = 24px horizontal sides. On a 320px screen that leaves 272px of usable width after padding. Workable, but tight for Toolbar filter rows and stat grids.

Not flagging as a required fix — admin is primarily a desktop/tablet surface and the 24px matches the design language. Document for awareness if users report cramped layout on very small screens.

**Status:** Monitor — no action required now

---

### Admin Note B — Users page linked devices section is dead-gated

**File:** `web/src/app/admin/users/page.tsx:775`

The entire "Linked devices" section inside `UserDetail` is wrapped in `{false && (...)}`. The comment explains: the device fetch is not wired yet, so the section always showed "No devices linked." The code is preserved for when the server-side device lookup ships.

This is intentional technical debt, not a mistake. No action here — just noting the dead code is acknowledged and scoped.

**Status:** No action — deferred to device-lookup implementation

---

### Admin Note C — Moderation page has a local ROLES array instead of importing from lib/roles

**File:** `web/src/app/admin/moderation/page.tsx:26`

```js
const ROLES = ['moderator', 'editor', 'admin', 'expert', 'educator', 'journalist'] as const;
```

This is a local hardcoded copy that does not import from `web/src/lib/roles.js` where `MOD_ROLES`, `ADMIN_ROLES`, `EDITOR_ROLES`, `EXPERT_ROLES` are canonical. If a new role is added to `roles.js` it won't appear here automatically.

Low-priority drift — the moderation console uses this array only for the role-grant UI (the dropdown of grantable roles). No production break risk. Log for cleanup when the file is next touched.

**Status:** Low priority — clean up next time moderation/page.tsx is touched
