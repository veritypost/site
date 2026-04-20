# Kids App Action Plan

**Last updated:** 2026-04-19 (Pass 1–4 landed)
**Goal:** `VerityPostKids` (`com.veritypost.kids`) fully functional + ready for Apple Made-for-Kids submission, with only owner-side items remaining.

---

## Legend
- [x] DONE · [~] IN PROGRESS · [ ] NOT STARTED · [🔒] OWNER-ONLY

---

## Status snapshot

### Live on prod DB
- [x] Migration 095 — `kid_pair_codes` + generate/redeem RPCs
- [x] Migration 096 — `is_kid_delegated()` + RLS for `kid_profiles`/`reading_log`/`quiz_attempts`, RESTRICTIVE block of `users` for kid JWT
- [x] **Migration 097** — kid JWT RLS for `user_achievements`, `category_scores`, `kid_category_permissions`, `kid_expert_questions`

### Verified end-to-end via MCP (simulated kid JWT)
- [x] Kid sees own `kid_profiles` row (1 row)
- [x] Kid can't see other kid's profile (0 rows — isolation works)
- [x] Kid can't see `users` table (0 rows — RESTRICTIVE block works)
- [x] Kid can INSERT `reading_log` with legit `parent_user_id` claim (user_id binding enforced)
- [x] `generate_kid_pair_code` rejects unowned kid (ownership check works)
- [x] `redeem_kid_pair_code` succeeds + returns `{kid_profile_id, parent_user_id, kid_name}`
- [x] Double-redeem rejected (code-used check works)

### Code shipped (committed, ready to push)

**Adult web (awaits deploy):**
- [x] `/api/kids/generate-pair-code` — parent-auth-gated, wraps RPC
- [x] `/api/kids/pair` — rate-limited, mints kid JWT with `parent_user_id` claim, 7-day TTL
- [x] Parent UI `PairDeviceButton.tsx` → `/profile/kids/[id]`

**VerityPostKids iOS (xcodebuild: BUILD SUCCEEDED):**
- [x] Pairing flow: `PairingClient`, `PairCodeView`, `KidsAuth` (pair-only, no dev fallback)
- [x] V3 animation scenes: Greeting, Streak, QuizPass, BadgeUnlock
- [x] Primitives: `KidsTheme`, `ParticleSystem`, `CountUpText`, `FlameShape`
- [x] **Tab bar** (`TabBar.swift`) — Home / Ranks / Experts / Me
- [x] **Kid view primitives** (`KidPrimitives.swift`) — `StatBubble`, `BadgeTile`, `LeaderRow`
- [x] **ProfileView** — stat bubbles (streak, score, quizzes, badges) + earned badges grid + unpair button
- [x] **LeaderboardView** — Family / Global / Category scopes, RLS-respecting queries
- [x] **ExpertSessionsView** — scheduled/live session list via `kid_expert_sessions`
- [x] **ParentalGateModal** — math challenge (n1+n2, n∈[4,15]), 3-attempt-then-5-min-lockout, persisted in UserDefaults, `.parentalGate(isPresented:onPass:)` modifier
- [x] **PrivacyInfo.xcprivacy** — iOS 17+ privacy manifest declaring minimal collection (UserContent, UserID, DeviceID — all linked, none tracked)
- [x] **Models.swift** extended — `Achievement`, `UserAchievement`, `CategoryScore`, `KidExpertSession`, `QuizQuestion`, `LeaderboardEntry`
- [x] **KidsAppRoot** refactored — pair-gate then tab bar (removed debug-only `SignInView` + `KidPickerView`)

### xcodebuild: `** BUILD SUCCEEDED **` on iPhone simulator (iOS 17+)

---

## Pass 1 — Inventory + RLS foundation — **DONE ✓**
- [x] Agent A inventory report — identified 7 views + port order
- [x] Agent B COPPA checklist — parental gate spec + privacy labels + review notes template
- [x] Migration 097 applied (live on prod)

## Pass 2 — Core views — **DONE ✓**
- [x] Tab bar
- [x] Profile view
- [x] Leaderboard view (3 scopes)
- [x] Expert sessions view
- [x] Primitives (StatBubble, BadgeTile, LeaderRow)
- [x] KidsAppRoot refactored to tab-based nav

## Pass 3 — Article reader + real quiz engine — **NOT STARTED**

Needed for feature-complete kids app. Currently the home uses V3 QuizPassScene with hardcoded demo content, not real quiz data.

- [ ] `KidReaderView.swift` — fetch article by id, render `kids_summary` (or `body` fallback), scroll tracking, emit `reading_log` INSERT on ≥80% read
- [ ] `KidQuizEngineView.swift` — fetch `quizzes` rows by article_id + pool_group, step through questions, write `quiz_attempts` INSERT with real quiz_id + questions_served + selected_answer, call `advance_streak` RPC on pass
- [ ] Wire `KidsAppState.completeQuiz` → real DB writes (currently local-only)
- [ ] Update home: tapping a category navigates to a kid-safe article list → tap article → reader → quiz → result scene

**Why deferred:** requires meaningful article-list + reader UI work. Scenes + tab structure are in place, so this is self-contained additive work.

## Pass 4 — Parental gate + COPPA hardening — **DONE ✓**
- [x] ParentalGateModal built + `.parentalGate(isPresented:onPass:)` modifier exposed
- [x] PrivacyInfo.xcprivacy declared
- [x] DEBUG-only views removed (SignInView + KidPickerView deleted)
- [x] No third-party analytics linked (no Sentry, no Firebase — project.yml only depends on `supabase-swift`)
- [ ] Wrap actual external-link tap-sites with `.parentalGate(...)` — **N/A today** because no external links exist yet; do when article source-link buttons land in Pass 3

## Pass 5 — Build + verify + commit — **DONE ✓**
- [x] `xcodebuild BUILD SUCCEEDED`
- [x] MCP DB round-trip verified kid JWT RLS
- [x] Plan updated (this doc)

---

## OWNER-ONLY (pre-submission)

- [🔒] **`SUPABASE_JWT_SECRET`** in Vercel env (Supabase Dashboard → Settings → API → JWT Secret → paste)
- [🔒] **`git push`** + redeploy adult web (ship the two new API routes + parent UI)
- [🔒] **Apple Developer Program DUNS** (blocking for any iOS app submission)
- [🔒] **App Store Connect record** for `com.veritypost.kids`:
  - Made for Kids toggle ON
  - Age range (4+ / 6–8 / 9–11 — decide)
  - Category: Education (primary)
  - Separate subscription group, or share with adult (decision)
- [🔒] **Screenshots** (6.7" iPhone) — showing only kid UI
- [🔒] **Kids-specific privacy policy URL** (Agent B has content checklist in `xx-updatedstatus/` / prior agent runs)
- [🔒] **COPPA contact email** (e.g., `coppa@veritypost.com`) — real monitored inbox
- [🔒] **Review notes** — paste template from Agent B's report
- [🔒] **Publish kid-safe articles** — `is_kids_safe = true` articles so the kids app has real content
- [🔒] **Apple Kids Category review submission** — expect 1-2 rejection cycles

---

## Also needed (not blockers — can ship without, iterate post-launch)

- [ ] **Pass 3** — article reader + real quiz engine (today the quiz is V3 demo content)
- [ ] **Parent email on pairing** — Resend notification when a device pairs with kid profile (defense in depth)
- [ ] **Revoke-device endpoint** — `POST /api/kids/revoke-device` so lost devices can be unpaired before token expires
- [ ] **Tighten parent-only table RLS** (migration 098) — add `AND is_kid_delegated() IS NULL` clauses to `subscriptions`, `comments`, `messages`, `admin_*` as defense-in-depth (today these tables reject kid JWT because `auth.uid() = kid_profile_id` doesn't match their user_id check, but explicit deny is cleaner)
- [ ] **Push notifications for kids** — Apple Kids requires stricter notification categories; defer

---

## How to proceed from here

**Today's commits have landed** the 4 of 5 planned passes.

**To ship to Made-for-Kids review (minimum viable):**
1. Owner: set `SUPABASE_JWT_SECRET` + push + redeploy
2. Run Pass 3 (article reader + quiz engine) — AI work, 1 more pass
3. Owner: App Store Connect setup + screenshots + privacy policy + review notes + submit

**Pass 3 can start whenever.** The app builds and runs today; launching into tabs + home works; pairing flow is end-to-end wired. The missing piece is the middle of the kid experience — reading real articles and taking real quizzes. The scenes already exist as presentation; Pass 3 connects them to DB-backed data.
