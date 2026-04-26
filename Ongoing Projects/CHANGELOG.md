# Change Log

Every change made during audit execution sessions. Format per entry:
- **What** — the specific change
- **Files** — files touched
- **Why** — the reason; OwnersAudit task reference where applicable

---

## 2026-04-26 (IA shift bundle — Profile Task 5 + Search Task 6 prep) — _pending push to git + DB apply_

This is one coherent IA migration spanning three artifacts:
1. A DB migration (written, not applied yet)
2. iOS perm-key swap to canonical short-form (in-source)
3. Leaderboard relocated into Profile on web (in-source)
4. Full session prep doc for the new iOS Browse tab + bottom-bar swap

### DB migration written (not applied)

- **File** — `Ongoing Projects/migrations/2026-04-26_profile_categories_canonical_binding.sql`
- **What it does** — Binds `profile.categories` to the same 8 plan sets that already carry `profile.activity` and `profile.achievements` (admin/editor/expert/family/free/moderator/owner/pro); removes the `anon` binding.
- **Why** — MCP-verified live state showed `profile.categories` was bound only to `anon`. The `/profile` route is middleware-protected from anon, so the binding has been a no-op for everyone — nobody on web sees the Categories tab today, and the drift was never noticed because the tab just disappears quietly. iOS used an orphan key (`profile.score.view.own.categories`, bound to admin/free/owner — 3 sets only) which was a migration-142 leftover the 143 rollback was supposed to clean up. Net effect after apply: web Categories tab returns for every logged-in plan; iOS code change (next bullet) makes both surfaces query the same canonical key; orphan key becomes deletable in a follow-up. Migration is wrapped in `BEGIN/COMMIT`, idempotent on re-apply, with rollback statement and verification query in the file header.
- **Apply order** — (1) run migration, (2) bump `users.perms_version` so live perms cache invalidates, (3) push the iOS code so iOS reads the canonical key the moment the DB has it. Doing them out of order leaves a brief stale-perm window.

### iOS perm-key short-form swap (in-source, not committed)

- **What** — `ProfileView.swift:191-193` switched from long-form (`profile.activity.view.own`, `profile.score.view.own.categories`, `profile.achievements.view.own`) to canonical short-form (`profile.activity`, `profile.categories`, `profile.achievements`). Comment in source explicitly references the migration file so the dependency is traceable.
- **Files** — `VerityPost/VerityPost/ProfileView.swift`
- **Why** — Per CLAUDE.md canonical guidance ("short-form is canonical, .view.own variants are a rolled-back migration artifact"). Web has always used short-form; iOS being on the long-form variants was the source of the cross-platform Categories-tab divergence. Once the DB binding migration above lands, this single 3-line swap restores full parity — same DB row, same login, same tab visibility on both surfaces.

### Leaderboard relocated into Profile on web (in-source, not committed)

- **What** — Added `<QuickLink href="/leaderboard" label="Leaderboards" description="See where you rank by topic and overall" />` to the `OverviewTab` "My stuff" section in `web/src/app/profile/page.tsx`. Removed the section's conditional wrapper so it always renders — Leaderboards is a default-on entry, the other links are perm-gated additions.
- **Files** — `web/src/app/profile/page.tsx`
- **Why** — Pre-positioning the entry point on the web side. When the iOS bottom-bar swap ships (separate session — replaces "Most Informed" with "Browse"), the same QuickLink pattern lands on iOS, and Leaderboard's permanent home becomes Profile on both surfaces. Description copy is plain factual ("See where you rank by topic and overall") — no rank teaser, no streak boast. Per owner directive 2026-04-26: "don't gamify whatever you're too much." The leaderboard surface still exists; what changes is its placement signals it's a check-in stat page, not a primary destination users should optimize for.

### iOS Browse tab + bottom-bar swap — session prep written, not implemented

- **File** — `Ongoing Projects/Sessions-Pending/BrowseView_iOS_Session_Prep.md`
- **What's in it** — Full prompt, files-to-read list, build spec for `BrowseView.swift` (~200 lines mirroring `web/src/app/browse/page.tsx`), tab swap plan for `ContentView.swift` (`MainTabView.Tab` + `TextTabBar.items`), iOS Profile QuickLink note (must land with this session so the Leaderboard entry is never absent during the cutover), DB migration coordination order, acceptance criteria, explicit out-of-scope list (no Home rank-changed nudge per owner directive, no 6-tab bar, no new API endpoint, no keyboard shortcuts).
- **Why a separate session** — `BrowseView.swift` is a fresh view file at ~200 lines. Bundling it with the bottom-bar swap and the iOS Profile QuickLink + the DB migration coordination makes one coherent TestFlight push instead of multiple half-states where Browse is in the bar but Leaderboard hasn't been relocated yet, or where the perm migration has applied but the iOS code hasn't shipped.

---

## 2026-04-26 (Group 8 — Settings Task 4 + 1/2/6 deferred) — _pending push to git_

### Settings Task 4 — sanitize raw Supabase Auth error in password card

- **What** — `pushToast({ message: upErr.message, variant: 'danger' })` → log the raw message via `console.error('[settings.password.update]', upErr.message)` and toast a fixed `"Password could not be updated. Try again."`
- **Files** — `web/src/app/profile/settings/page.tsx`
- **Why** — Supabase Auth's `updateUser` error string can contain policy detail (`"Password should be different from the old password"`) or stack-trace fragments on edge errors. The path is also reachable after the user already passed the per-user-rate-limited `/api/auth/verify-password` check, so any remaining failure here is most often a Supabase Auth backend issue — not something the user can act on with the raw message. Fixed string keeps the user oriented; the real detail goes to the JS console for debugging.

### Settings Tasks 1, 2, 6 — deferred (not pending push, not yet done)

- **Task 1 (web MFA card)** — full TOTP enrollment + verify + unenroll is a feature build, not audit cleanup; needs its own design pass on enrollment and recovery UX
- **Task 2 (iOS TTS toggle)** — adding the row is small but verifying iOS reads the same `users.metadata.tts_per_article` shape that web writes + having the TTS player honor the toggle deserves a QA pass alongside, not a one-line drop-in
- **Task 6 (DM read receipts placement)** — extracting a `PrivacyPrefsCard` from `ProfileCard` touches the user-row PATCH path; T-073 settings split is going to reshuffle anchors anyway, so this re-anchoring is much cheaper to land inside that deploy window than as a one-off now

---

## 2026-04-26 (Group 6 — Kids surface UX polish) — _pending push to git_

### Kids Task 1 — kill the duplicate close button on ArticleListView

- **What** — `KidsAppRoot.fullScreenCover` now branches on the active sheet. For `.articles`, it renders only the scene body (no `closeChrome` overlay). For `.streak` / `.badge`, the overlay still renders because those scenes have no toolbar of their own.
- **Files** — `VerityPostKids/VerityPostKids/KidsAppRoot.swift`
- **Why** — `ArticleListView` is a `NavigationStack` and already paints its own `xmark` button via `ToolbarItem(.topBarLeading)`. The blanket `closeChrome` overlay was sitting at the same screen coordinates on Dynamic Island devices (~59pt safe-area top), giving the kid two visually overlapping circles to tap. Both worked, so it's a polish bug not a functional one — but a kid app showing two close buttons looks broken to a parent doing the App Store walkthrough.

### Kids Task 2 — hold the result reveal until server verdict resolves

- **What** — `resultView` branches on `verdictPending`. While true, shows `ProgressView()` + "Checking your score…" caption and hides the Done button. Once the RPC returns and `verdictPending` flips false, the existing pass/fail layout renders.
- **Files** — `VerityPostKids/VerityPostKids/KidQuizEngineView.swift`
- **Why** — Local `correctCount` and the server `get_kid_quiz_verdict` RPC can disagree: a write failure mid-quiz drops a row from the server count, so a kid who locally tallies 4/5 might get a server verdict of 2/5. Without the spinner, the view first showed "Great job!" and then silently flipped to "Give it another go?" 2–5 seconds later. Disorienting at the exact moment a kid is parsing whether they passed. The 1–3 second wait is anticipation, not punishment — quizzes always have a result-reveal beat.

### Kids Task 3 — distinguish a network failure from a missing quiz (KidQuizEngineView)

- **What** — Body now branches `loadError != nil → errorState` before `questions.isEmpty → emptyState`. New `errorState` view: `wifi.slash` icon + "Couldn't load the quiz right now." + 44pt "Try again" button calling `loadQuestions()`. `loadQuestions()` resets `loadError` and `blockedNotKidsSafe` on entry so the retry path clears stale state.
- **Files** — `VerityPostKids/VerityPostKids/KidQuizEngineView.swift`
- **Why** — When the Supabase fetch failed, `loadError` was set but never rendered; the body fell through to `questions.isEmpty` which displayed "No quiz yet for this article." A kid who lost wifi for two seconds got told their favorite article didn't have a quiz, with no path to retry beyond closing the cover and re-opening. The empty-state copy is correct for the *real* missing-quiz case (Kids Task 11's pool-size guard fires it legitimately) — the fix is to not lie about which case is happening.

### Kids Task 4 — same fix for ArticleListView

- **What** — `loadError != nil` branch now precedes `articles.isEmpty`, with its own retry view. Trailing red `loadError` caption removed (it was rendering *under* the contradicting empty state). `load()` resets `loadError` on entry.
- **Files** — `VerityPostKids/VerityPostKids/ArticleListView.swift`
- **Why** — Same divergence pattern as Task 3. With the trailing caption, a kid saw both "No articles in this category yet" AND "Couldn't load articles" simultaneously — two answers to the same question. Now they see one clear state with a path forward.

### Kids Task 10 — connect quiz outcome to something concrete

- **What** — Below the score line, resultView now shows pass: "Your streak just got longer." / fail: "Read it again and try when you're ready."
- **Files** — `VerityPostKids/VerityPostKids/KidQuizEngineView.swift`
- **Why** — Without context, the result screen reads as a school test — pass/fail score, no consequence, no participation framing. Adult surfaces have explicit civic framing ("BEFORE YOU DISCUSS" / "the conversation opens") that gives the quiz weight. Kids needed parallel framing so the mechanic feels like a thing you participate in, not a thing being done to you. Streak is the kid surface's strongest motivational signal — wiring the pass result back to it costs one line and earns the most.

### Kids Task 12 — show the pass threshold in the result line

- **What** — Pass: "You got X of N right." Fail: "You got X of N. You need Y to pass." `Y` is computed from current question count using the same `max(1, ceil(N × 0.6))` formula the local-fallback logic already uses.
- **Files** — `VerityPostKids/VerityPostKids/KidQuizEngineView.swift`
- **Why** — A kid who failed had no way to tell how close they came. "You got 2 of 5 right" + "Give it another go?" leaves the bar invisible — they could have missed by 4 or by 1. Adult web/iOS surfaces state "3 of 5 to pass" up front on the idle card; kids was the only surface where the threshold was a hidden constant. Fail copy now is the natural place to surface it because that's when it's actionable.

---

## 2026-04-26 (Groups 5 + 7 — Static + Browse polish)

### Static Task 5 — How-it-works Step 4 copy

- **What** — Step 4 description: "Build your Verity Score by reading thoroughly, acing quizzes, contributing quality discussions, and verifying sources. Higher scores unlock expert features and community recognition." → "Build your Verity Score by reading thoroughly, acing quizzes, and contributing quality discussions. Higher scores earn community recognition and let you apply for expert and journalist roles." Owner-approved tweak: "open the door to applying" → "let you apply" — active, fewer hops.
- **Files** — `web/src/app/how-it-works/page.tsx`
- **Why** — OwnersAudit Static Task 5. Old copy was a false promise (experts apply + are vetted, not score-gated) — worst possible place for inaccuracy on the page that sells the trust mechanism.

### Browse Task 4 — Error state with retry

- **What** — `fetchData` lifted from inline `useEffect` to a `useCallback` so the retry button can call it directly. Added `loadFailed` state. On Supabase error in either parallel query, console-logs the message, clears state, and sets `loadFailed = true`. Render branches `loading → BrowseSkeleton`, `loadFailed → error pane`, else content. Error pane: "Couldn't load content" / "Check your connection and try again." / 44pt "Retry" button. Distinct from the "No categories match" empty state so the two failure modes don't conflate.
- **Files** — `web/src/app/browse/page.tsx`
- **Why** — OwnersAudit Browse Task 4. Without an error branch, RLS / network / 5xx errors silently rendered as empty layout.

### Browse Task 7 — Pre-search topic chips: deferred (Browse half)

- The Browse page already shows the entire active-category grid as its "pre-search" state, so adding chips above the input would duplicate. The Search and iOS FindView pieces of this task remain pending and will land in Group 4 (iOS Browse tab + Search/Find chip parity).

### Browse Task 8 — VP_PALETTE extract: deferred (low priority)

- Same scope as Home Task 3 ("Deferred to global token sweep"). One-file extraction leaves drift; needs to land as one global pass.

---

## 2026-04-26 (Group 3 — Kids Mgmt Tasks 1, 2, 3, 4)

### Kid PIN label clarified

**Task 1 — "Parent PIN" → "Kid PIN"**
- **What** — Web `Field` label `"Parent PIN (4 digits, optional but recommended)"` → `"Kid PIN (4 digits, optional) — your child types this to open the app"`. Aligns with iOS `FamilyViews.swift:1226` semantics — same PIN, no ambiguity about who holds it.
- **Files** — `web/src/app/profile/kids/page.tsx`
- **Why** — OwnersAudit Kids Mgmt Task 1.

### App Store CTA placeholder

**Task 2 — `KidsAppBanner` component**
- **What** — New persistent banner above the kids list. Single `KIDS_APP_STORE_URL` constant gates between two states: when `null` (today), shows "Coming soon to the App Store" non-clickable button + "Pair codes from this page will link the account once the app launches." copy. When set to a real URL, flips to "Get the app" `<a target="_blank">` button + "Then open the app and enter a pair code from this page to link the account." Once Apple approves, set the constant — no UI rework. Uses the existing `C` palette + 44pt button height.
- **Files** — `web/src/app/profile/kids/page.tsx`
- **Why** — OwnersAudit Kids Mgmt Task 2. Parents who set up profiles on web had no signal the next step was downloading the iOS app — the funnel dead-ended.

### Dashboard stats parity

**Task 3 — Web `MiniStat` row aligned to iOS**
- **What** — `{Read | Streak | Score}` → `{Articles | Quizzes | Streak}`. `Read` → `Articles` (uses existing `articles_read_count`). `Score` → `Quizzes` (uses existing `quizzes_completed_count` on `kid_profiles`, MCP-verified before the swap). Matches iOS canonical set (`statBlock("Articles")` / `statBlock("Quizzes")` / `statBlock("Streak")`).
- **Files** — `web/src/app/profile/kids/page.tsx`
- **Why** — OwnersAudit Kids Mgmt Task 3. Owner-locked decision: parents need three concrete behaviors (Are they reading? Understanding? Coming back?) — Score was a noisy gamification number for parent context.

### Pause/Resume parity

**Task 4 — iOS pause kid profile parity with web**
- **What** — Added `pausedAt: Date?` (mapped to `paused_at`) to the `KidProfile` model. New `KidsAPI.setPaused(kidId:paused:)` mirrors web `togglePause()` — PATCHes `/api/kids/:id` with `{paused: Bool}`; route already supports the toggle (line 49 of `[id]/route.js`). Ellipsis menu now includes "Pause profile" / "Resume profile" entry (label flips on `kid.pausedAt != nil`); success calls `load()` to refresh and sets a flash. `kidCard` shows reduced-opacity avatar (0.45) + "Paused" caption in `VP.warn` instead of the age line when paused. MCP-verified `paused_at` column exists on `kid_profiles`.
- **Files** — `VerityPost/VerityPost/FamilyViews.swift`, `VerityPost/VerityPost/Models.swift`
- **Why** — OwnersAudit Kids Mgmt Task 4. Web parents could pause; iOS parents had no equivalent control or visual signal of pause state.

---

## 2026-04-26 (Group 2 — Profile Tasks 1, 2, 6, 7, 9)

### Profile — branch LockedTab on actual lock reason

**Task 1 — emailVerified-aware LockedTab**
- **What** — Added `emailVerified` prop to `LockedTab`. When false, retains the existing "Verify email" CTA → `/verify-email`. When true, shows "This tab is part of paid plans." with "View plans" CTA → `/profile/settings#billing`. Three callsites in `tab` switch (Activity / Categories / Milestones) updated to pass `emailVerified={!!user.email_verified}`. Verified-but-plan-locked users no longer get sent to a dead-end on the verify page that just confirms their email is already verified.
- **Files** — `web/src/app/profile/page.tsx`
- **Why** — OwnersAudit Profile Task 1. URL is the pre-T-073 anchor per Note C — same pattern as the other 4 settings-anchor sites that update at T-073 deploy.

### Profile — iOS locked-tab parity

**Task 2 — gate iOS Activity / Categories / Milestones with lockedTabView**
- **What** — `tabContent(_:)` switch branches now check `canViewActivity` / `canViewCategories` / `canViewAchievements` before dispatching to the content view. When the perm is false, `lockedTabView()` renders: "This tab is part of paid plans." + "View plans" button → `showSubscription = true` (existing sheet wired at line 210). `loadTabData()` was also gated — locked tabs no longer trigger an unnecessary network round-trip on tab switch. Mirrors web `LockedTab` pattern with iOS subscription sheet wiring.
- **Files** — `VerityPost/VerityPost/ProfileView.swift`
- **Why** — OwnersAudit Profile Task 2. Previously a free user on iOS saw the Activity tab content load to "No activity yet" with no signal that the tab was perm-gated; now they see the explicit lock state and a path to upgrade.

### Profile — expert queue + follower stat parity

**Task 6 — expert queue surfacing on web**
- **What** — Added `expertQueue` perm to the `perms` state (`hasPermission('expert.queue.view')`); threaded into `OverviewTab` props. New `QuickLink` rendered inside the "My stuff" section: `/expert-queue` → "Expert queue" / "Questions waiting for your answer". Section visibility expanded to include `expertQueue` so experts who lack messages/bookmarks/family but have expert queue access still see the section.
- **Files** — `web/src/app/profile/page.tsx`
- **Why** — OwnersAudit Profile Task 6. iOS already surfaces the queue from two spots; web had zero entry point from the profile hub.

**Task 7 — Followers/Following stats now permission-gated on web**
- **What** — Added `followersView` (`profile.followers.view.own`) + `followingView` (`profile.following.view.own`) to `perms` and `OverviewTab` props. Stats array uses conditional spread (`...(followersView ? […] : [])`) so the count only renders when the perm is held. Matches iOS `socialRow()` gating.
- **Files** — `web/src/app/profile/page.tsx`
- **Why** — OwnersAudit Profile Task 7. Cross-platform consistency.

### Profile — iOS skeleton swaps

**Task 9 — Activity + Categories tabs use skeletons, not spinners**
- **What** — Replaced `ProgressView().padding(.top, 40)` in both Activity (line 1177) and Categories (line 1273) tabs with skeleton rows. Activity: `VStack` of 6 `compactSkeletonRow()` placeholders (the same helper already used in the overview activity preview). Categories: `VStack` of 4 `RoundedRectangle` placeholders sized to match the loaded category-card height (48pt) with the same `VP.streakTrack` fill + `VP.border` overlay as the overview shimmer. No more visual discontinuity between the smooth skeleton in overview and a bare spinner in the full tab.
- **Files** — `VerityPost/VerityPost/ProfileView.swift`
- **Why** — OwnersAudit Profile Task 9.

### Profile Task 5 — DEFERRED (DB binding decision required)

`profile.categories` is bound to `anon` only (1 set) — `verified_base` no longer carries it. iOS uses `profile.score.view.own.categories` which is bound to admin/free/owner (3 sets). Switching iOS to canonical short-form would break free-user iOS Categories without a DB migration. Three options surfaced in OwnersAudit Profile Task 5; recommendation is option (a): bind `profile.categories` to the same 8 plan sets as `profile.activity` + `profile.achievements`, drop the anon binding, then switch iOS. Holding pending owner approval — DB rebinding is meaningful behavior change.

---

## 2026-04-26 (Group 1 — Story tabs cross-platform)

### Story Tasks 18 + 19 — 3-column tab header on mobile web + iOS adult

**Mobile web tab bar enabled — Story | Timeline | Discussion**
- **What** — Removed the `{false && !isDesktop && (…)}` kill-switch on the mobile tab bar; now renders whenever `!isDesktop`. Renamed the type union, state default, and string literal from `'Article'` to `'Story'` (matches the URL slug — `/story/[slug]`). Tab labels render `'Story', 'Timeline', 'Discussion'`. Updated the comment block above the bar to describe the live behavior + per-pane gating instead of "launch-phase hide". Updated the T-064 ref comment (line 672) — mobile no longer "kill-switched"; switching `activeTab` to `'Discussion'` is now the equivalent post-quiz-pass affordance.
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 19. Owner-locked decision 2026-04-26: 3 columns on top of every article (mobile only — desktop remains single-column inline reading flow).

**Mobile Timeline pane enabled with permission-gated fallback**
- **What** — Removed the `{false && showMobileTimeline && canViewTimeline && (…)}` kill-switch on the Timeline mobile content. Now renders whenever `showMobileTimeline` is true. When `canViewTimeline` is true, the existing `<Timeline events={timeline} />` component shows. When false, an inline upgrade prompt renders ("Timeline is part of paid plans. See how this story developed across the day with sourced events. → View plans" linking to `/profile/settings#billing`). Same prompt visual weight as the discussion lock prompt — keeps the tab from ever being an empty pane.
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 19 implication: enabling the tab without enabling the content would dead-end Timeline-locked viewers in an empty tab.

**iOS tab `Article` → `Story`**
- **What** — `enum StoryTab: String`: `case story = "Article"` → `case story = "Story"`. The enum's `rawValue` is the displayed tab label, so this single edit relabels iOS without any other plumbing change.
- **Files** — `VerityPost/VerityPost/StoryDetailView.swift`
- **Why** — OwnersAudit Story Task 19 + cross-platform parity (label string identical to web).

**iOS Discussion tab visible to anonymous users + auth-gate prompt**
- **What** — `visibleTabs` no longer filters by `auth.isLoggedIn`; returns `StoryTab.allCases`. The `.discussion` switch case branches on `auth.isLoggedIn` → `discussionContent` (existing) when logged in, or new `anonDiscussionPrompt` view when anon. Anon prompt: "Earn the discussion." headline + "Create a free account, pass the quiz, and join the conversation." body + "Create free account" primary button + "Already have an account? Sign in" secondary link. Both buttons present `LoginView` as a sheet via new `@State showLogin`. Mirrors the proven anon pattern from `MessagesView.swift:84-110`. Both buttons hit the 44pt touch target floor (`.frame(minHeight: 44)` + `.contentShape(Rectangle())` on the secondary link to extend the tap region beyond the text glyph).
- **Files** — `VerityPost/VerityPost/StoryDetailView.swift`
- **Why** — OwnersAudit Story Task 18. The product mechanic ("earn the discussion") was invisible to anon iOS readers — they couldn't see the tab existed. Now they see it, tap it, get the pitch.

**iOS Timeline locked-state prompt (replaces silent EmptyView)**
- **What** — `.timeline` switch case: `if canViewTimeline { timelineContent } else { EmptyView() }` → `else { timelineLockedPrompt }`. New view: "Timeline is part of paid plans." + body copy + "View plans" button → `showSubscription = true` (uses existing sheet wired at line 299). Same pattern as web Timeline upgrade prompt; identical wording across surfaces.
- **Files** — `VerityPost/VerityPost/StoryDetailView.swift`
- **Why** — OwnersAudit Story Task 19 implication on iOS: with the Timeline tab now always visible, viewers without the timeline permission must see *something* — silent `EmptyView()` looks broken.

---

## 2026-04-26 (audit pickup batch — Home/Story/Profile/Browse/Search/Static/Settings/Kids/Admin)

### Home — OwnersAudit Tasks 1, 2

**Loading skeleton**
- **What** — Replaced italic centered "Loading today's front page…" `<p>` with a `FrontPageSkeleton` component. Hero block reuses the page's full-bleed dark band (`HERO_DEFAULT_BG`) with eyebrow + 2 headline lines (88% / 62% width) + 2 excerpt lines (90% / 70%) — all `rgba(255,255,255,…)` at low opacity to read against the dark band. Below: 4 supporting card placeholders separated by `hairlineStyle`, each with eyebrow + 2 headline bars + meta bar. `vp-pulse` keyframe (`0%, 100% opacity 1; 50% opacity 0.55`) injected once via inline `<style>`. Layout dimensions match the loaded state to eliminate layout shift on data arrival.
- **Files** — `web/src/app/page.tsx`
- **Why** — OwnersAudit Home Task 1.

**Anon end-of-page CTA**
- **What** — `EndOfFrontPage` now branches on `loggedIn`. Logged-in users still get "Browse all categories →" link (unchanged). Anon users now see a follow-up pitch line ("Create a free account to unlock comments and track your reading streak.") + "Create free account →" `<Link>` to `/signup`. Captures the warm-lead moment when an anon reader has consumed the whole front page.
- **Files** — `web/src/app/page.tsx`
- **Why** — OwnersAudit Home Task 2.

### Story — OwnersAudit Task 14

**iOS quiz idle card no longer primes attempt anxiety**
- **What** — Collapsed the `hasUnlimitedQuizAttempts` ternary on lines 889-891. Both branches now read the same single line: `"5 questions about what you just read. Get 3 right and the conversation opens."` Drops the "Free accounts get 2 attempts; each pulls a fresh set of questions." anxiety prime from the entry state. Post-fail attempt context is unaffected — already lives in the result-state copy at lines 967 + 999-1001 ("X attempts remaining" / "You've used both free attempts. Upgrade for unlimited retakes.").
- **Files** — `VerityPost/VerityPost/StoryDetailView.swift`
- **Why** — OwnersAudit Story Task 14. Idle = invitation, not warning.

### Profile — OwnersAudit Tasks 3, 4, 8

**Web load-error description tightened**
- **What** — `description="Something went wrong retrieving your account. Try refreshing, or head back home."` → `"Refresh the page, or head back home."`. Drops the passive vague phrase; the title already says what failed.
- **Files** — `web/src/app/profile/page.tsx`
- **Why** — OwnersAudit Profile Task 3.

**Kids Unpair button touch target**
- **What** — Added `.frame(minHeight: 44)` to the "Unpair this device" `Button` label in the kids `ProfileView`. Previously rendered at ~26pt with `font(.scaledSystem(size: 12))` + 7+7 vertical padding.
- **Files** — `VerityPostKids/VerityPostKids/ProfileView.swift`
- **Why** — OwnersAudit Profile Task 4.

**Milestones empty CTA reroute + label**
- **What** — `<Button onClick={() => window.location.assign('/')}>Take a quiz</Button>` → `<Button onClick={() => router.push('/browse')}>Find an article</Button>`. Added `const router = useRouter()` to `MilestonesTab` since `router` only existed in `ProfilePageInner` scope. CTA is now honest about the action — quiz is downstream of finding+reading an article.
- **Files** — `web/src/app/profile/page.tsx`
- **Why** — OwnersAudit Profile Task 8.

### Browse — OwnersAudit Tasks 1, 2, 3, 5, 6

**Link migrations (3 internal `<a>`)**
- **What** — Featured story card (~line 281), trending row inside expanded category card (~line 510), and "View all {cat.name} articles" (~line 521) — all `<a>` → `<Link>`. Added `import Link from 'next/link'`. Internal nav now goes through Next.js client-side routing instead of full reload.
- **Files** — `web/src/app/browse/page.tsx`
- **Why** — OwnersAudit Browse Task 1.

**Search input touch target**
- **What** — Keyword input `height: 42` → `minHeight: 44`. Switching to `minHeight` ensures Dynamic Type scaling can grow the input without clipping.
- **Files** — `web/src/app/browse/page.tsx`
- **Why** — OwnersAudit Browse Task 2.

**Loading skeleton**
- **What** — Replaced plain centered "Loading..." text with new `BrowseSkeleton` component. 3 featured-card placeholders (80px image band + 3-bar text block) and 6 category-card placeholders (42×42 avatar circle + 2 text bars), `vp-pulse` keyframe pattern, dimensions match loaded state.
- **Files** — `web/src/app/browse/page.tsx`
- **Why** — OwnersAudit Browse Task 3.

**Latest in {cat.name}**
- **What** — Expanded-category-card section header `"Trending in {cat.name}"` → `"Latest in {cat.name}"`. Matches actual data (the trending list is sorted by `published_at desc`, not view count). Top-of-page "Latest" header was already corrected in a prior pass; this fixes the inner duplicate.
- **Files** — `web/src/app/browse/page.tsx`
- **Why** — OwnersAudit Browse Task 5.

**Featured empty-state copy**
- **What** — `"No new stories yet today. Check back later."` → `"No new stories yet."`. Drops the time-bound "today" framing and the passive "Check back later" tail.
- **Files** — `web/src/app/browse/page.tsx`
- **Why** — OwnersAudit Browse Task 6.

### Search — OwnersAudit Tasks 1, 2, 3, 4

**Link migrations (2 internal `<a>`)**
- **What** — Per-result story card and "Browse categories" CTA in the no-results empty state. Story card uses `prefetch={false}` to avoid mass prefetch on long result lists.
- **Files** — `web/src/app/search/page.tsx`
- **Why** — OwnersAudit Search Task 1.

**Search button touch target**
- **What** — Added `minHeight: 44` to the Search submit button.
- **Files** — `web/src/app/search/page.tsx`
- **Why** — OwnersAudit Search Task 2.

**Drop mode label from results count**
- **What** — `${results.length} result${plural} · ${mode}` → `${results.length} result${plural}`. The raw API mode token (`basic` / `advanced`) was leaking to users.
- **Files** — `web/src/app/search/page.tsx`
- **Why** — OwnersAudit Search Task 3.

**Sanitize search error**
- **What** — Catch block now sets `setError('Search failed. Try again.')` directly instead of forwarding the thrown message. The non-ok JSON `error` field is logged via `console.error('[search]', data.error)` for debugging but never reaches the UI.
- **Files** — `web/src/app/search/page.tsx`
- **Why** — OwnersAudit Search Task 4. Information hygiene — internal API messages stay server-side.

### Static/Marketing — OwnersAudit Tasks 1, 2, 3, 4, 6, 7, 8

**Kids-app: Link migrations + touch targets + drop API error string**
- **What** — `Back to home` and `Parent account sign-in` `<a>` → `<Link>`. Email input and submit button: `minHeight: '44px'` added. The `j?.error` parse path in `onSubmit` removed entirely — non-ok responses now always show the generic `"Couldn't save. Try again in a moment."` string. Also removed the now-unused `try { … } catch` around the JSON parse.
- **Files** — `web/src/app/kids-app/page.tsx`
- **Why** — OwnersAudit Static Tasks 1, 2, 3.

**How-it-works: Get Started Link**
- **What** — `<a href="/signup">Get Started</a>` → `<Link href="/signup">Get Started</Link>`. Added `import Link from 'next/link'`. Server component — `Link` works fine in server components.
- **Files** — `web/src/app/how-it-works/page.tsx`
- **Why** — OwnersAudit Static Task 4.

**About: 5 policy Link migrations**
- **What** — Terms / Privacy / Cookies / Accessibility / DMCA — all five `<li><a>` rows → `<li><Link>`. Added `import Link from 'next/link'`. The `mailto:` Contact links are correctly left as `<a>`.
- **Files** — `web/src/app/about/page.tsx`
- **Why** — OwnersAudit Static Task 6.

**Privacy + Terms: "Kids Mode" → "Verity Kids"**
- **What** — Privacy line 164: "Kids Mode collects minimal data…" → "Verity Kids collects minimal data…". Terms line 111: "A dedicated Kids Mode provides age-appropriate content." → "A dedicated Verity Kids app provides age-appropriate content." Reflects the post-2026-04-19 product split (separate iOS app, not a mode inside the adult app).
- **Files** — `web/src/app/privacy/page.tsx`, `web/src/app/terms/page.tsx`
- **Why** — OwnersAudit Static Task 7. Legal docs must use the canonical product name.

**Terms: "Family Dashboard" → "Family section"**
- **What** — Terms line 116: "…through the Family Dashboard." → "…through the Family section of their account." There is no UI surface called "Family Dashboard" — the actual surface lives at `/profile/kids` and is labeled "Family" in nav.
- **Files** — `web/src/app/terms/page.tsx`
- **Why** — OwnersAudit Static Task 8.

### Settings — OwnersAudit Task 5

**Alerts channel checkbox label minHeight**
- **What** — `minHeight: 32` → `minHeight: 44` on the `<label>` wrapping each notification channel checkbox (email/push toggles in the Alerts card).
- **Files** — `web/src/app/profile/settings/page.tsx`
- **Why** — OwnersAudit Settings Task 5.

### Kids — OwnersAudit Tasks 5, 6, 7, 8, 11

**KidReader dead code removal + corrected file comment**
- **What** — Deleted `ReaderContentHeightKey` and `ReaderScroll` private structs (lines 259-271) — never referenced. Updated the file-level comment: removed the false "≥80% scroll" claim. Reading is logged when the kid taps "Take the quiz", not when they scroll.
- **Files** — `VerityPostKids/VerityPostKids/KidReaderView.swift`
- **Why** — OwnersAudit Kids Task 5.

**Leaderboard + ExpertSessions Retry button touch targets**
- **What** — Both error-state Retry buttons: `.frame(minHeight: 36)` → `.frame(minHeight: 44)`. Kid touch precision is wider variance than adults; error-state controls are the worst place to miss.
- **Files** — `VerityPostKids/VerityPostKids/LeaderboardView.swift`, `VerityPostKids/VerityPostKids/ExpertSessionsView.swift`
- **Why** — OwnersAudit Kids Task 6.

**PairCodeView "Please" copy**
- **What** — `errorMessage = "Something went wrong. Please try again."` → `"Something went wrong. Try again."` in the catch branch of the pair attempt.
- **Files** — `VerityPostKids/VerityPostKids/PairCodeView.swift`
- **Why** — OwnersAudit Kids Task 7. Voice consistency.

**ExpertSessions DateFormatter cache**
- **What** — Replaced per-call `let fmt = DateFormatter()` with a `private static let sessionDateFormatter` initialized once. `formatted(_:)` now reads from `Self.sessionDateFormatter`. Eliminates per-card DateFormatter construction during scroll.
- **Files** — `VerityPostKids/VerityPostKids/ExpertSessionsView.swift`
- **Why** — OwnersAudit Kids Task 8. `DateFormatter` init is one of the most expensive UIKit/Foundation operations; caching is standard.

**Kids quiz pool-size guard**
- **What** — Added `guard rows.count >= 5 else { self.questions = []; self.startedAt = nil; return }` after the quiz fetch. Articles with fewer than 5 questions now hit the existing `emptyState` ("No quiz yet for this article.") instead of being graded as a real pass on a 2-question quiz. Floor is 5 (vs adult web's 10) since kids have no free/paid attempt-pool variation.
- **Files** — `VerityPostKids/VerityPostKids/KidQuizEngineView.swift`
- **Why** — OwnersAudit Kids Task 11. Restores parity with adult-web's pool-size discipline (`quizPoolSize >= 10` gate at `web/src/app/story/[slug]/page.tsx:912`).

### Admin — OwnersAudit Tasks 1, 2, 4, 5

**Admin Button SIZES — touch target floor across all 44 admin pages**
- **What** — Both `sm` and `md` SIZES entries: `height: 26` / `height: 32` → `height: 44`. Visual padding (`padY` / `padX`) and `fontSize` unchanged — only the `minHeight` floor changes. One edit upgrades every action button on every admin page (and DataTable Prev/Next pagination, which uses `<Button size="sm">` — Admin Task 6 resolved automatically).
- **Files** — `web/src/components/admin/Button.jsx`
- **Why** — OwnersAudit Admin Task 1 (and Task 6 by inheritance).

**Remove KBD ghost shortcuts from admin hub**
- **What** — Removed `import KBD from '@/components/admin/KBD'`. Removed the `actions` prop on `PageHeader` that rendered the "Search · Cmd+K" hint. Removed `<KBD keys={ql.hint} size="xs" />` from each quick-link card. Narrowed `QUICK_LINKS` shape from `{href, label, hint}` to `{href, label}` — `hint` field deleted entirely. No keyboard handler ever existed for these — they were visual decoration only, contradicting the no-keyboard-shortcuts product rule for admin.
- **Files** — `web/src/app/admin/page.tsx`
- **Why** — OwnersAudit Admin Task 2.

**Drawer close button padding**
- **What** — `padding: 4` → `padding: 12` on the `×` close button in the Drawer header. `fontSize: 20` (visual character size) unchanged. Effective tap area grows from ~28×28 to ~44×44.
- **Files** — `web/src/components/admin/Drawer.jsx`
- **Why** — OwnersAudit Admin Task 4.

**Modal close button (matching Drawer)**
- **What** — Restructured the Modal header to flex row with `justifyContent: 'space-between'` — title + description block on the left, new `×` close button on the right. Close button uses identical styling to Drawer (transparent bg, `padding: 12`, `fontSize: 20`, hover toggles color between `ADMIN_C.dim` and `ADMIN_C.accent`). `aria-label="Close"` set; `onClick={attemptClose}` so it respects the existing dirty-state confirm via `onRequestClose` override path. Only renders inside the existing `(title || description)` guard — modals with neither continue to close via backdrop + Esc only.
- **Files** — `web/src/components/admin/Modal.jsx`
- **Why** — OwnersAudit Admin Task 5.

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

## 2026-04-26 (notifications)

### Notifications — OwnersAudit Tasks 1–4, 6–7

**Bell SVG replaces [!] icon**
- **What** — Replaced `[!]` monospace text in the anon-state 64px circle with an SVG bell (Feather icon path). Removed `fontSize`, `fontWeight`, `fontFamily` from the container; kept `color: C.accent` so the SVG inherits the accent colour via `stroke="currentColor"`.
- **Files** — `web/src/app/notifications/page.tsx`
- **Why** — OwnersAudit Notifications Task 1. `[!]` reads as "error"; bell is the universal notification icon.

**Type badge labels**
- **What** — Added `TYPE_LABELS: Record<string, string>` mapping `BREAKING_NEWS → 'Breaking news'`, `COMMENT_REPLY → 'Reply'`, `MENTION → '@mention'`, `EXPERT_ANSWER → 'Expert answer'`. Badge now renders `TYPE_LABELS[n.type] ?? n.type` (unknown types fall back to raw string). iOS: added `private func typeLabel(_ type: String) -> String` as a member of `AlertsView`; replaced `Text(type.uppercased())` with `Text(typeLabel(type))`.
- **Files** — `web/src/app/notifications/page.tsx`, `VerityPost/VerityPost/AlertsView.swift`
- **Why** — OwnersAudit Notifications Task 2. Raw DB enum values (`COMMENT_REPLY`) were visible to users.

**null action_url scroll-to-top fix**
- **What** — Kept `href={n.action_url || '#'}` for keyboard focus. Added `onClick={(e) => { if (!n.action_url) e.preventDefault(); markOne(n.id); }}` — when there's no URL, `preventDefault` stops the `#` scroll while `markOne` still fires.
- **Files** — `web/src/app/notifications/page.tsx`
- **Why** — OwnersAudit Notifications Task 3. Using `href={n.action_url ?? undefined}` was rejected: `<a>` without href loses keyboard focus and is unreliable on iOS Safari tap.

**Touch targets**
- **What** — Added `minHeight: 36` to `pillBase` (filter pills), "Mark all read" button, and "Preferences" `<a>`. Preferences also gets `display: 'flex', alignItems: 'center'` so `minHeight` applies to the inline element.
- **Files** — `web/src/app/notifications/page.tsx`
- **Why** — OwnersAudit Notifications Task 4.

**Error copy**
- **What** — `` `Couldn't load notifications (${res.status}).` `` → `"Couldn't load notifications. Try again."` — status code removed from user-facing string.
- **Files** — `web/src/app/notifications/page.tsx`
- **Why** — OwnersAudit Notifications Task 6.

**iOS "Mark all read" label**
- **What** — `Button("Read All")` → `Button("Mark all read")` in the toolbar. Matches web label, sentence case.
- **Files** — `VerityPost/VerityPost/AlertsView.swift`
- **Why** — OwnersAudit Notifications Task 7.

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

### iOS Browse tab + bottom-bar IA shift — OwnersAudit Search Task 6

**New `BrowseView.swift` (adult iOS) — mirrors web /browse**
- **What** — ~340 lines of fresh SwiftUI: featured "Latest" horizontal row (3 most-recent published articles) + `LazyVStack` of category cards. Tap-to-expand reveals the 3 latest in-category articles as `NavigationLink`s pushing `StoryDetailView`; bottom of expanded card has a 44pt "View all {cat} articles" button pushing `CategoryDetailView` (the existing per-category feed view, promoted from `private` in `HomeView.swift` so it can be reused). Skeleton loading state with `vp-pulse`-style opacity animation; distinct error state ("Couldn't load content" + 44pt Retry — not a silent empty). Two parallel direct Supabase queries via `SupabaseManager.shared.client` (no new API endpoint): categories (`not('slug','like','kids-%')`, `order(name)`) + articles (`status='published'`, `order published_at desc`, `limit 500`). Kids categories filtered out exactly per web — closes the gap with the in-home `BrowseLanding` view (which lets kids categories leak in).
- **Files** — `VerityPost/VerityPost/BrowseView.swift` (new), `VerityPost/VerityPost.xcodeproj/project.pbxproj` (file added to target — PBXBuildFile, PBXFileReference, group + Sources phase membership)
- **Why** — OwnersAudit Search Task 6. Topic-first discovery on iOS; web has had this for months.

**Bottom-bar swap: `.leaderboard` → `.browse`**
- **What** — `MainTabView.Tab` enum: `case home, find, browse, notifications, profile` (was `home, find, notifications, leaderboard, profile`). `adultTabView` switch: `.browse` arm pushes `NavigationStack { BrowseView() }.environmentObject(auth)`; `.leaderboard` arm removed. `TextTabBar.items`: Browse inserted at position 3, "Most Informed" entry deleted. Section header comment updated. No stray `.leaderboard` enum references remain in the iOS target.
- **Files** — `VerityPost/VerityPost/ContentView.swift`
- **Why** — OwnersAudit Search Task 6 IA decision (owner-locked 2026-04-26): replace "Most Informed" with Browse; relocate Leaderboard to a Profile QuickLink.

**`CategoryDetailView` promoted from `private` to internal**
- **What** — Dropped `private` on `struct CategoryDetailView` so `BrowseView.swift` can push it as the "View all {cat} articles" destination. Single source of truth for the per-category feed across Home BrowseLanding and the new Browse tab. Kept the existing comment block; appended a note explaining the promotion.
- **Files** — `VerityPost/VerityPost/HomeView.swift`
- **Why** — Reuse vs. duplicating ~100 lines of identical query + row layout.

**Profile QuickLink: Leaderboards (iOS) — entry point post-IA-shift**
- **What** — Added `quickLink(label: "Leaderboards", description: "See where you rank by topic and overall", destination: AnyView(LeaderboardView().environmentObject(auth)))` to the `OverviewTab` "My stuff" list. Always-on (LeaderboardView is public; no perm gate). Section render condition simplified — was `permsLoaded && (canViewMessages || canViewBookmarks || canViewFamily || canViewExpertQueue)`, now unconditional, since Leaderboards is always present and the perm-gated rows already handle their own conditional render. Mirrors the web `web/src/app/profile/page.tsx` "My stuff" PageSection (Leaderboards QuickLink shipped there in commit 07febf5).
- **Files** — `VerityPost/VerityPost/ProfileView.swift`
- **Why** — Replaces the bottom-bar entry point that the tab swap removes. Web parity.

**DB migration: `profile.categories` canonical binding** — _NOT YET APPLIED_
- **What** — Owner action required: run `Ongoing Projects/migrations/2026-04-26_profile_categories_canonical_binding.sql` via Supabase SQL editor (MCP refused both `execute_sql` writes and `apply_migration` — the project link is currently in read-only mode), then `UPDATE users SET perms_version = perms_version + 1;` to invalidate the 60s perms cache. The migration brings `profile.categories` into line with the other two short-form profile permissions (binds it to the 8 canonical plan sets and removes the no-op anon binding). Until applied, free-plan users on the latest iOS build will not see the Profile → Categories tab — the iOS short-form perm-key swap from commit 07febf5 already shipped against a binding that doesn't exist yet for them.
- **Files** — `Ongoing Projects/migrations/2026-04-26_profile_categories_canonical_binding.sql` (no source code change in this entry — flagged here so the apply step is tracked alongside the iOS push)
- **Why** — OwnersAudit Profile Task 5 — completes the canonical short-form swap end-to-end; without this DB step the iOS swap in commit 07febf5 silently breaks Categories-tab visibility for any plan that isn't in the current `profile.categories` binding (which is anon-only — i.e., everyone is broken, not just one plan).

**Session prep doc retired**
- **What** — Deleted `Ongoing Projects/Sessions-Pending/BrowseView_iOS_Session_Prep.md` — work shipped in this entry; the prep doc is now historical and lives in `git log` (commit message + this CHANGELOG entry).
- **Files** — `Ongoing Projects/Sessions-Pending/BrowseView_iOS_Session_Prep.md` (deleted)
- **Why** — Sessions-Pending is by definition for unstarted prep; finished sessions don't sit there.
