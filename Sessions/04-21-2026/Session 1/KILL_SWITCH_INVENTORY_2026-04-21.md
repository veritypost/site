# Kill-Switch & Feature-Hide Inventory — Verity Post 2026-04-21

## Executive Summary

**Total kills-switches found: 11**

| Category | Count | Status |
|----------|-------|--------|
| React `{false && ...}` conditionals | 6 | Launch-hidden |
| Feature flag constants (LAUNCH_HIDE_*) | 3 | Launch-hidden |
| Environment-based gates (`NEXT_PUBLIC_SITE_MODE`) | 1 | Configurable |
| Commented-out nav items | 1 | Pre-launch hide |
| Global chrome toggles | 1 | Currently OFF |

### Breakdown by Launch Readiness

**Keep OFF until launch (will break UX if flipped early):**
- Mobile tab bar (requires timeline/discussion features live)
- Quiz + Discussion section (core earning mechanic for locked features)
- Weekly recap list and detail pages (requires recap content generation)
- RecapCard on home page (requires recap content + sign-up conversions ready)
- Anonymous interstitial (requires live sign-up flow)

**Can flip anytime (feature-complete, just gated):**
- Help/Contact footer link (page exists, just hidden from users)
- coming_soon middleware mode (toggles global holding page)
- SHOW_BOTTOM_NAV chrome gate (navigation bar can show)

**Blocked on external dependencies:**
- AdSense approvals (affects ad rendering, not a kill-switch itself)
- User sign-up readiness (conversion & payment setup)

---

## Detailed Kill-Switch Catalog

### 1. Mobile Tab Bar (Article/Timeline/Discussion)

**Location:** `web/src/app/story/[slug]/page.tsx:791-810`

**Current state:** Tab bar never renders on mobile. Users always see Article content; Timeline and Discussion tabs exist in state but are unreachable without the bar.

**Flip pattern:** Change line 791 from `{false && !isDesktop && (` to `{!isDesktop && (` — removes the hardcoded `false` guard.

**What unhiding reveals (user-visible):** 
- On mobile, a sticky tab bar appears below the top nav with three options: "Article", "Timeline", "Discussion"
- Selecting "Timeline" or "Discussion" switches the viewport to show those sections instead of the article body
- This unlocks the full tablet-like experience on phone-sized screens

**Prerequisites before flipping:** 
- Timeline feature fully enabled (desktop version also hidden, see item #3)
- Discussion section fully enabled (see item #4)
- Mobile tab navigation state and styling tested across iOS/Android

**Related audit items (if any):** 
- Mentioned in Sessions/04-21-2026/Session 1/APPLE_REVIEW_NAV_CHANGES_REVERT_GUIDE.md as part of the launch-phase UI trim

**Found via:** Direct grep for `{false && !isDesktop &&`

---

### 2. Timeline: Mobile Implementation

**Location:** `web/src/app/story/[slug]/page.tsx:955-960`

**Current state:** Timeline never renders on mobile even after tab selection. When `showMobileTimeline && canViewTimeline` would both be true, the component is still blocked by the outer `{false && ...}` guard.

**Flip pattern:** Change line 955 from `{false && showMobileTimeline && canViewTimeline && (` to `{showMobileTimeline && canViewTimeline && (`.

**What unhiding reveals (user-visible):**
- Mobile users who tap the Timeline tab see a chronological list of events (e.g., dates, milestone markers from the article's timeline metadata)
- Timeline renders with the same styling as desktop (fontSize 11, uppercase label, custom Timeline component)

**Prerequisites before flipping:**
- Timeline data loaded from `timeline` state (populated from articles.timelines join, already in code)
- Timeline component tested on mobile viewports
- Mobile tab bar unhidden first (item #1) or users can't access it

**Related audit items (if any):** None detected

**Found via:** Direct grep for `{false && showMobileTimeline &&`

---

### 3. Timeline: Desktop Implementation (Sticky Aside)

**Location:** `web/src/app/story/[slug]/page.tsx:964-971`

**Current state:** On desktop, the right-hand timeline sidebar never renders. Even when viewport is >= 1025px and user has `canViewTimeline`, the guard blocks it.

**Flip pattern:** Change line 964 from `{false && isDesktop && canViewTimeline && (` to `{isDesktop && canViewTimeline && (`.

**What unhiding reveals (user-visible):**
- Desktop readers see a sticky 260px-wide sidebar on the right of the article
- Sidebar contains the Timeline label (uppercase, small font) and a timeline event list
- Sidebar stays visible as user scrolls (sticky positioning)
- Provides visual parallel timeline alongside article reading flow

**Prerequisites before flipping:**
- Timeline data verified to load correctly from DB
- 260px sidebar width doesn't break responsive layout (test on 1025-1440px viewports)
- Timeline component mobile-safe (width constraint)

**Related audit items (if any):** None detected

**Found via:** Direct grep for `{false && isDesktop && canViewTimeline &&`

---

### 4. Quiz + Discussion Section (Desktop & Mobile Discussion Tab)

**Location:** `web/src/app/story/[slug]/page.tsx:977-1007`

**Current state:** Neither ArticleQuiz nor CommentThread components render. Both are upstream but blocked by the outer `{false && (isDesktop || showMobileDiscussion) && (` gate.

**Flip pattern:** Change line 977 from `{false && (isDesktop || showMobileDiscussion) && (` to `{(isDesktop || showMobileDiscussion) && (`. Remove lines 977 and 1007 (the wrapping `{false && (` and final `)}`).

**What unhiding reveals (user-visible):**
- **Desktop:** Below the article body, a "Quiz" section appears. After passing 3/5 questions, the "Discussion" comment thread unlocks below it
- **Mobile (Discussion tab):** Same quiz + discussion layout, but confined to the tab viewport
- Quiz prompt shows signup CTA to anonymous users, full quiz to signed-in users
- Discussion section shows locked panel for quiz-failures, "Discussion is for signed-in readers" CTA for anon
- Passing quiz unlocks the CommentThread component (full discussion UI with nested replies)
- Includes a "You might also like" footer with back-to-home and browse CTAs

**Prerequisites before flipping:**
- Quiz pool size >= 10 (checked in line 648; code only renders if `quizPoolSize >= 10`)
- ArticleQuiz component working with per-article question data
- CommentThread component loading comments + rendering nested UI
- Permission system correctly gating `discussion.create.create` for comment creation
- Mobile tab bar (item #1) must be unhidden first or mobile users can't access it
- Test on both 1025px+ (desktop) and <1025px (mobile) viewports

**Related audit items (if any):** R13-C5 Fix 4 (mentioned in comment at line 981; simple exit path after comments)

**Found via:** Direct grep for `{false && (isDesktop || showMobileDiscussion) &&`

---

### 5. Anonymous Signup Interstitial on Article Pages

**Location:** `web/src/app/story/[slug]/page.tsx:79, 372, 742`

**Type:** Feature flag constant

**Current state:** `const LAUNCH_HIDE_ANON_INTERSTITIAL = true;` (line 79). When anon users read 2+ articles in a session, the interstitial never triggers.

**Flip pattern:** Change line 79 from `const LAUNCH_HIDE_ANON_INTERSTITIAL = true;` to `const LAUNCH_HIDE_ANON_INTERSTITIAL = false;`.

**What unhiding reveals (user-visible):**
- After reading 2 articles, anon users see a modal overlay (Interstitial component, "signup" variant)
- Modal promotes free account creation with copy about quizzes & discussions
- User can close it (dismissal is per-session, not persistent)
- Next article session after creating account, the interstitial does not re-trigger (only for anon)

**Prerequisites before flipping:**
- Sign-up flow fully operational (`/signup` and OAuth/email endpoints)
- Interstitial variant "signup" styling and copy approved by owner
- Payment/subscription flow ready for converted users
- Analytics tracking for interstitial dismiss/conversion in place

**Related audit items (if any):** 
- Sessions/04-21-2026/Session 1/APPLE_REVIEW_NAV_CHANGES_REVERT_GUIDE.md (companion revert guide mentioned at line 77)

**Found via:** Grep for `LAUNCH_HIDE_ANON_INTERSTITIAL` constant definition

---

### 6. Weekly Recap List Page

**Location:** `web/src/app/recap/page.tsx:38-44`

**Type:** Feature flag constant

**Current state:** `const LAUNCH_HIDE_RECAP = true;` (line 41). Page returns `null` at render (line 44), effectively 404-ing the route.

**Flip pattern:** Change line 41 from `const LAUNCH_HIDE_RECAP = true;` to `const LAUNCH_HIDE_RECAP = false;`.

**What unhiding reveals (user-visible):**
- Users with `recap.list.view` permission can access `/recap` and see a list of weekly recap quizzes
- Each recap is a card showing title and user's prior score (if taken)
- Clicking a recap loads the detail page (`/recap/[id]`)
- Anon users or users without permission see nothing (no error, just silent return)

**Prerequisites before flipping:**
- Weekly recap content generated in `weekly_recap_quizzes` table (admin process)
- Questions loaded into `weekly_recap_questions` for each recap
- `/api/recap` endpoint working to fetch list
- `recap.list.view` permission assigned to target user tier(s)
- Component queries and data fetching verified to work

**Related audit items (if any):** 
- Sessions/04-21-2026/Session 1/APPLE_REVIEW_NAV_CHANGES_REVERT_GUIDE.md (companion revert guide mentioned at line 39)

**Found via:** Grep for `LAUNCH_HIDE_RECAP` in recap/page.tsx

---

### 7. Weekly Recap Detail Page (Player/Quiz View)

**Location:** `web/src/app/recap/[id]/page.tsx:64-70`

**Type:** Feature flag constant

**Current state:** `const LAUNCH_HIDE_RECAP = true;` (line 67). Page returns `null` (line 70), effectively 404-ing `/recap/[id]` routes.

**Flip pattern:** Change line 67 from `const LAUNCH_HIDE_RECAP = true;` to `const LAUNCH_HIDE_RECAP = false;`.

**What unhiding reveals (user-visible):**
- Users can load a specific recap's quiz interface at `/recap/<id>`
- Quiz state machine: load questions → display quiz UI → collect answers → submit → show score
- Recap metadata (title) displays at top
- Questions render one at a time with 5 multiple-choice options
- After submission, score is calculated and displayed
- User's attempt is recorded in `weekly_recap_attempts` table

**Prerequisites before flipping:**
- `/api/recap/[id]` endpoint returns quiz questions and metadata
- `/api/recap/[id]/submit` (or similar) endpoint accepts and stores answers + scores
- RecapQuestion and SubmitResponse types defined and match API schema
- Component state machine tested (loading → quiz → results)
- `recap.list.view` + additional permission for taking quizzes (if gatekept)

**Related audit items (if any):** 
- Sessions/04-21-2026/Session 1/APPLE_REVIEW_NAV_CHANGES_REVERT_GUIDE.md (companion revert guide mentioned at line 64)

**Found via:** Grep for `LAUNCH_HIDE_RECAP` in recap/[id]/page.tsx

---

### 8. RecapCard on Home Page (Feed)

**Location:** `web/src/app/page.tsx:821-827`

**Current state:** `{false && !loading && feedVisible.length > 0 && <RecapCard />}` — the card never renders on the home feed.

**Flip pattern:** Change line 827 from `{false && !loading && feedVisible.length > 0 && <RecapCard />}` to `{!loading && feedVisible.length > 0 && <RecapCard />}`.

**What unhiding reveals (user-visible):**
- After feed loads and has articles, a prominent dark gradient card appears between the streak indicator and the first article
- Card reads "Weekly recap" → "See what you missed this week" (if user hasn't taken it) or "Your score: X/Y" (if taken)
- Clicking the card navigates to `/recap/<id>` (if a recap exists) or `/profile/settings/billing` (if no access / not paid)
- RecapCard component handles permission checks internally; anon users see a CTA to upgrade

**Prerequisites before flipping:**
- `/api/recap` endpoint returns at least one recap for the user (or an empty list gracefully)
- RecapCard permission checks (`recap.list.view`) working
- Weekly recap content generation pipeline running (admin cron or trigger)
- Card styling fits cleanly between streak display and feed articles on all viewports

**Related audit items (if any):** 
- Companion revert guide mentioned at line 823-825

**Found via:** Grep for `{false && !loading && feedVisible.length > 0 && <RecapCard />`

---

### 9. Help/Contact Link in Footer (Commented-out)

**Location:** `web/src/app/NavWrapper.tsx:307`

**Current state:** Line is commented out: `// { label: 'Help', href: '/help' },`. Link does not appear in footer navigation.

**Flip pattern:** Uncomment line 307: remove the `//` and surrounding comment lines 302-307.

**What unhiding reveals (user-visible):**
- Footer navigation now shows: "About | **Help** | Contact | Privacy | Terms | Cookies | Accessibility | DMCA"
- Help link points to `/help` page (which exists and is reachable directly, just hidden from footer)
- `/help` page is already live and used as Apple App Store support URL

**Prerequisites before flipping:**
- `/help` page fully vetted for launch (already exists at `web/src/app/help/page.tsx`)
- Support resources documented and ready
- No content gaps or broken links on the help page itself

**Related audit items (if any):** 
- Comment indicates Apple App Store submission requires public Support URL; /help is registered for that
- Safe to flip independently of other features

**Found via:** Direct grep for commented-out nav items in footer

---

### 10. NEXT_PUBLIC_SITE_MODE Coming-Soon Gate (Middleware)

**Location:** `web/src/middleware.js:166-197`

**Type:** Environment variable branch

**Current state:** When `process.env.NEXT_PUBLIC_SITE_MODE === 'coming_soon'`, middleware redirects all public requests to `/welcome` (brand card only).

**Flip pattern:** In Vercel dashboard (or local `.env.local`), unset or change `NEXT_PUBLIC_SITE_MODE` from `coming_soon` to any other value (e.g., delete it, or set to `live`).

**What unhiding reveals (user-visible):**
- All public routes become directly accessible (home, articles, browse, etc.)
- `/welcome` still works but functions as onboarding carousel for new signed-in users instead of holding page
- Crawlers no longer see `X-Robots-Tag: noindex` in response headers

**Prerequisites before flipping:**
- All feature flags/kill-switches that should be hidden are set to their desired state first
- Site content is ready (articles published, categories live)
- Sign-up flow tested and optimized
- Analytics/tracking verified to work on public routes
- Admin pages remain behind auth (handled separately via `/admin` permission checks)

**Related audit items (if any):** 
- Middleware contains explicit config: exempts `/preview`, `/api/*`, `/admin/*`, `/_next/*`, `/ideas` (line 174-183)

**Found via:** Grep for `NEXT_PUBLIC_SITE_MODE === 'coming_soon'` in middleware.js

---

### 11. SHOW_BOTTOM_NAV Global Chrome Gate

**Location:** `web/src/app/NavWrapper.tsx:88-89`

**Type:** Global feature gate constant

**Current state:** `const SHOW_BOTTOM_NAV = false;` — the bottom navigation bar (Home / Notifications / Leaderboard / Profile) is completely disabled.

**Flip pattern:** Change line 89 from `const SHOW_BOTTOM_NAV = false;` to `const SHOW_BOTTOM_NAV = true;`.

**What unhiding reveals (user-visible):**
- Bottom nav bar appears on all pages except auth routes, home, article reader, and admin
- 4-item bar: Home, Notifications, Leaderboard, Profile
- Uses same NavItem rendering as currently hidden (code at lines 229-234)
- Notifications icon includes unread count badge when > 0

**Prerequisites before flipping:**
- All target pages (notifications, leaderboard, profile) fully functional
- Bottom nav doesn't overlap important page content (test on various viewports)
- Unread notifications count polling working (`/api/notifications?unread=1`)
- Mobile UX approved (small screens need room for nav)

**Related audit items (if any):** 
- Comment at line 89 clarifies: hidden on home because "no sign-up push pre-launch"
- SHOW_TOP_BAR and SHOW_FOOTER are both `true` (active), only SHOW_BOTTOM_NAV is off

**Found via:** Direct constant definition search in NavWrapper.tsx lines 88-90

---

## Secondary Gates (Not Kill-Switches, But Related)

These are permission-based or environment-based gates that are currently working but aren't hardcoded kill-switches:

### v2_live Feature Flag (DB-Driven)

**Location:** `web/src/lib/featureFlags.js:33-50` (isV2Live / v2LiveGuard functions)

**Current state:** Checks `feature_flags.v2_live` in Supabase. If disabled, returns 503 on guard check. If not configured, defaults to `false` (fail-closed).

**Purpose:** Master cutover switch for any API route or handler that calls `v2LiveGuard()`. Allows graceful 503 response when platform undergoes maintenance or if v2 isn't ready.

**Who flips it:** Admin on `/admin/features` page (not a hardcoded kill-switch).

**Related audit items (if any):** 
- T-073 comment explains 10s TTL caching to avoid stale flag values

---

## Cleanup/Removal Candidates

After launch, mark these for removal during post-launch refactor:

1. **LAUNCH_HIDE_ANON_INTERSTITIAL** (story/[slug]/page.tsx:79) — Once sign-ups are live and tested, remove lines 75-79 and simplify lines 372, 742 to always-on logic.

2. **LAUNCH_HIDE_RECAP** (both recap/page.tsx and recap/[id]/page.tsx) — After launch week, remove the constants and the `if (LAUNCH_HIDE_RECAP) return null;` guards. Content is live.

3. **SHOW_BOTTOM_NAV** (NavWrapper.tsx:89) — After nav appears and is tested, remove the constant and the guard on line 205. Simplify to always show.

4. **Commented-out Help link** (NavWrapper.tsx:302-307) — Uncomment and clean up the multi-line comment.

5. **Mobile tab bar guard** (story/[slug]/page.tsx:791) — Once timeline feature is live, remove `false &&` and keep condition as-is.

---

## Suggested Flip Order for Launch Day

### Phase 1: Pre-Launch Validation (Day -1)

1. **Verify all feature-complete components work:**
   - Quiz rendering and submission flow (test on both desktop & mobile)
   - Comment thread rendering and moderation pipeline
   - Timeline data loading and display
   - RecapCard and weekly recap flow end-to-end

2. **Verify infrastructure:**
   - All `/api/` endpoints responding with real data
   - Permissions system assigning correct tiers
   - Email delivery working (for transactional + weekly recap generation)

### Phase 2: Early Launch (Soft Launch, Staff Only)

**Trigger:** Set `NEXT_PUBLIC_SITE_MODE` to anything other than `coming_soon` (or unset it)

- Public site is now live but discovery is limited (no heavy marketing yet)
- Keep bottom nav off (`SHOW_BOTTOM_NAV = false`) initially to reduce navigation confusion during beta

**Then progressively flip:**

3. **Quiz + Discussion** (item #4, story/[slug]/page.tsx:977) — This is the core product loop. Flip first after public launch. Test comment moderation + quiz scoring at scale.

4. **Timeline** (items #2 and #3) — Non-blocking content feature. Flip once quiz/discussion is proven stable.

5. **Mobile tab bar** (item #1) — Depends on timeline being live. Flip when mobile UX team approves.

### Phase 3: Full Feature Launch (Day 0+)

6. **Weekly Recap List & Detail** (items #6 & #7) — Requires week 1 recap content generated. Flip on day 7 or when first recap is ready.

7. **RecapCard on Home** (item #8) — Depends on recap system live. Flip same day as recap pages.

8. **Anonymous Interstitial** (item #5) — Depends on sign-up and subscription flows working. Flip when conversion is optimized (day 3-5).

### Phase 4: Post-MVP (Week 1+)

9. **Help link in footer** (item #9) — Safe to flip anytime. Low risk. Flip early (day 1) if help content is finalized.

10. **Bottom nav bar** (item #11) — Once Notifications, Leaderboard, and Profile are tested with real traffic. Flip day 2-3.

### Not Included (External Dependencies)

- **AdSense approvals:** Once Google approves `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID`, ads render automatically via the Ad component. No kill-switch flip needed; just update the env var.

---

## Cross-Reference to FIX_SESSION_1.md

The following items from the concurrent audit may reference these kills-switches:

- **F3, F4, 00-L:** (suspected) Quiz/Discussion gating and regwall logic
- **R13-C5 Fix 4:** Mentioned at story/[slug]/page.tsx:981 — exit path after article + comments (included in item #4 block)
- **R13-C5 Fix 5:** Regwall dismissal state (line 253), not a kill-switch but related to launch-phase content gating

---

## Ambiguous / Not Included (False Positives)

### `hideLowCred` in ProfileSettings (profile/settings/page.tsx:2009)

- This is a per-user UI preference toggle, not a launch-phase hide. User can control it themselves.
- Not a kill-switch.

### Linked Devices Section (admin/users/page.tsx:771)

- Comment says "device fetch is not wired yet" — this is honest dead code, not a pre-launch hide. The device table exists but the API endpoint doesn't populate it. Marked `{false && (` with explanation.
- Not a launch-phase kill-switch; it's incomplete implementation. Safe to leave off until device tracking is built.

### Secondary Email Support (profile/settings/page.tsx:1721)

- Marked `{false && (` with comment "deferred. Re-enable when /api/account/emails exists."
- This is infrastructure-blocked, not pre-launch. No endpoint exists yet.
- Not a launch-phase kill-switch.

---

## Summary for Launch Day

**11 kill-switches to manage.** Most are content-ready; the launch sequence depends on:

1. Sign-up conversions (affects interstitial, recap cards)
2. Quiz pool size >= 10 questions per article (affects quiz/discussion unlock)
3. Weekly recap generation pipeline running (affects recap feature)
4. External approvals (AdSense, etc.)

**No architectural blockers.** All code is present and working; these are just conditionally disabled. Flip the gates in order, test at each stage, and roll back individually if needed.

