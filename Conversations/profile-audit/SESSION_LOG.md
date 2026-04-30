# Profile Audit — Session Log

Append-only chronological log. Most recent at the bottom. Each entry: date, phase, what happened, what output was produced, what's blocked, what next session picks up.

---

## Session 0 — (not yet run) — Founding

**Phase entering:** 0 (no artifacts).
**Phase leaving:** 0 (program founded; no investigation started).

**What happened.** Program structure created. Mapped the full web profile surface from the filesystem:
- 21 sections in `_sections/`
- 8 settings cards in `settings/_cards/`
- 8 sub-routes under `/profile/`
- 1 API route (`/api/profile/trial-banner-dismiss`)
- iOS: `ProfileView.swift`, `SettingsView.swift`, `SettingsService.swift`, `AlertsView.swift`
- Kids iOS: `ProfileView.swift`

Drew on `Conversations/profile-bugfix/` (15 bugs, 3 sessions) as known-fixed context. Seeded cross-platform consistency gap table in INDEX.md with pre-known unknowns.

**No investigation or code changes made.**

**What's blocked.** Nothing.

**What next session should pick up.** ~~Phase 1 — Inventory.~~ Phase 2 — Role matrix (see INDEX.md).

---

## Session 1 — 2026-04-30 — Phase 1: Inventory

**Phase entering:** 1 (not-started)
**Phase leaving:** 1 (complete)

**What happened.** Spawned 3 parallel Explore agents:
- **Agent A** — read all 21 section files in `_sections/` + `ProfileApp.tsx` (full section mounting array, permission keys, special patterns T331/T342/T356/T360)
- **Agent B** — read all 8 settings cards + 10 sub-route page.tsx files + the trial-banner-dismiss API route
- **Agent C** — read `VerityPost/VerityPost/ProfileView.swift` + `SettingsView.swift` + `VerityPostKids/VerityPostKids/ProfileView.swift` in full

**Output produced.** `phases/01-inventory.md` — complete inventory table across all three platforms:
- 21 web sections (Parts A)
- 8 settings cards (Part B)
- 10 sub-routes + 1 API route (Parts C–D)
- iOS ProfileView sections E1–E16 (Part E)
- iOS SettingsView sections F1–F18 (Part F)
- Kids iOS sections G1–G4 (Part G)

**Findings summary:**
- 4 wrong-gate items (WG1–WG4): milestones permission key mismatch, sessions section ungated on web, card-share key mismatch, contact form no auth check
- 5 gap items (G1–G5): streak heatmap missing on web, expert queue no iOS surface, expert profile/credentials no iOS surface, feed preferences no web equivalent, blocked accounts location inconsistency
- 3 redundant items (R1–R3): /profile/settings route alias, iOS double sign-out, blocked accounts in two locations
- 7 needs-design items (ND1–ND7): PublicProfileSection no iOS equivalent, quick actions mutual exclusion undocumented, activity/achievements previews free on iOS without gate, dead notification toggle code, /profile/category/[id] bypasses CategoriesSection gate, invite gate conditions differ across platforms
- 0 should-not-exist items
- 10 pre-research open questions added to INDEX.md (OQ1–OQ10)

**What's blocked.** Nothing. Phase 2 can start immediately.

**What next session should pick up.** Phase 2 — Role matrix. Spawn 4 parallel agents:
- Agent A: trace every `PermsBoundary`, `hasPermission()`, and section lock in web `_sections/` + `ProfileApp.tsx`
- Agent B: trace permission gates in web settings cards + sub-routes
- Agent C: trace all `PermissionService.shared.has()` calls in iOS `ProfileView.swift` + `SettingsView.swift`
- Agent D: query DB — `my_permission_keys` RPC implementation + permission sets + which keys map to which roles/plans

Produce `phases/02-role-matrix.md`. OQ6 (permission key name reconciliation) will be partially or fully answered by Agent D.
- Agent A: read all 21 files in `web/src/app/profile/_sections/`; for each, note: what data does it fetch, what does it render, what permission check (if any) gates it, is there a kill switch
- Agent B: read all 8 files in `web/src/app/profile/settings/_cards/`; same questions; also read all sub-route `page.tsx` files; read `/api/profile/trial-banner-dismiss/route.ts`
- Agent C: read `VerityPost/VerityPost/ProfileView.swift` and `SettingsView.swift` in full; read `VerityPostKids/VerityPostKids/ProfileView.swift` in full; note what sections exist, what data they fetch, what permission/role checks gate them

Synthesize into the inventory table in `phases/01-inventory.md`. Every row must have: section name, platform(s), what it does, current permission gate, role(s) that see it, kill-switch status, finding type (correct / gap / redundant / wrong-gate / should-not-exist / needs-design).

---

## Session 2 — 2026-04-30 — Phase 2: Role Matrix

**Phase entering:** 2 (not-started)
**Phase leaving:** 2 (complete)

**What happened.** Spawned 4 parallel Explore agents:
- **Agent A** — read `ProfileApp.tsx` in full (26-slot section array, `perms` useMemo, all 11 `hasPermission()` calls), `PermsBoundary.tsx` mechanics, and all 21 `_sections/` files for internal gates
- **Agent B** — read 5 sub-route page files (`settings/page.tsx`, `settings/expert/page.tsx`, `family/page.tsx`, `kids/page.tsx`, `kids/[id]/page.tsx`), quoting every `hasPermission()` call, redirect condition, and conditional render
- **Agent C** — read `PermissionService.swift` (actor-based cache calling `my_permission_keys` RPC), `ProfileView.swift`, `SettingsView.swift`; listed every `PermissionService.shared.has("key")` call with surrounding condition; confirmed kids ProfileView does not use PermissionService
- **Agent D** — ran 5 DB queries via MCP Supabase: `my_permission_keys` RPC body, full `permissions` table list, `permission_set_perms` join, `role_permission_sets`, and OQ6 key-existence check

**Output produced.** `phases/02-role-matrix.md`:
- Part 1: 37-key canonical permission table with web surfaces, iOS surfaces, cross-platform match status, and flags
- Part 2: Full role × section matrix (75 rows: 1–21, B1–B8, C1–C10, D1, E1–E16, F1–F18, G1–G4) with anon/free/pro/expert/admin/parent/kid cells and gate correct? column

**Key findings:**
- **WG1 resolved:** both platforms already use `profile.achievements` — the variable name `perms.milestones` in web code was misleading but correct. No code change needed.
- **WG3 confirmed:** `profile.card_share` (web) and `profile.card.share_link` (iOS) are two different DB keys with different permission-set coverage. Canonicalization required.
- **PF-1 (new):** iOS gates 5 account-settings rows (`settings.view`, `settings.account.edit_email`, `settings.account.change_password`, `settings.account.2fa.enable`, `settings.data.request_export`) that web renders with no permission gate at all. Systematic web omission.
- **PF-2 (new):** `profile.milestones.view` exists in DB but is used nowhere in code. Dead key.
- **OQ-NEW-1 (new):** DB data suggests gated keys like `profile.achievements` are in the `free` permission set (which all signed-in users hold) — contradicting locked-for-free UI behavior. Needs Phase 3 verification.
- **OQ-NEW-2 (new):** The PF-1 cluster as a design question — should web add matching permission gates for account-settings rows?
- **DB schema correction:** `permission_keys` table does not exist (`permissions` is correct); `permission_set_keys` does not exist (`permission_set_perms` is correct).

**What's blocked.** Nothing. Phase 3 can start immediately.

**What next session should pick up.** Phase 3 — Research. 12 open questions (OQ1–OQ10 + OQ-NEW-1 + OQ-NEW-2). Priority order for research: OQ-NEW-1 (DB contradiction — resolve before Phase 4 decisions depend on plan-gating), OQ-NEW-2 (PF-1 design), OQ8 (contact auth — simplest to verify), OQ9 (iOS free previews — intentional or not), OQ7 (sessions vs. login activity feature distinction), OQ5 (blocked canonical home), then OQ1/OQ2/OQ3/OQ4/OQ10. Each question needs full research (current state + options + tradeoffs) before going to Phase 4 Q&A.

---

## Session 3 — 2026-04-30 — Phase 3: Research (Priority Group 1)

**Phase entering:** 3 (not-started)
**Phase leaving:** 3 (in-progress — Group 1 done, Group 2 pending)

**What happened.** Spawned 4 parallel agents (A=general-purpose for DB queries, B–D=Explore for code reads):

- **Agent A** — OQ-NEW-1: ran 4 SQL queries via MCP Supabase to resolve the DB contradiction about gated feature keys being in the `free` set
- **Agent B** — OQ-NEW-2 + OQ8: read IdentitySection, SecuritySection, NotificationsSection, DataSection, contact page, and `/api/support` route
- **Agent C** — OQ9 + OQ7: read ProfileView.swift (preview sections), SettingsView.swift (LoginActivityView), SessionsSection.tsx, sessions API route
- **Agent D** — OQ5 + OQ10: read BlockedSection.tsx, BlockedAccountsView in SettingsView.swift, NotificationsCard.tsx, notifications preferences API route

**Output produced.** `phases/03-research.md` — Priority Group 1 research (7 OQs):

**Key findings:**

- **OQ-NEW-1 RESOLVED:** The DB agent was correct. `profile.achievements`, `profile.activity`, `profile.categories`, and `bookmarks.list.view` ARE in the `free` permission set, which the `user` role grants to every signed-in user. The UI locks these for free-tier users **incorrectly** — the DB has already granted them access. `messages.inbox.view` is correctly pro-only. Phase 4 must decide: unlock for free (accept DB as correct) or move keys to pro-only (accept UI as intent).

- **OQ8 RESOLVED / WG4 CLOSED:** `/profile/contact` is open to anon at the component level (good for support-access UX), but the API route enforces `requireAuth()` — 401 on unauthenticated POST. Not a bug. No action needed.

- **OQ10 RESOLVED / ND5 CLOSED:** Dead iOS notification toggles were already removed in commit `24f655e`. They wrote to `users.metadata.notifications` — a column nothing reads. Web and iOS are both correctly at channel-level only for the first pass. No action needed.

- **OQ-NEW-2 researched:** All 4 web sections (Identity, Security, Notifications, Data) have zero permission gates. iOS gates 5 equivalent rows. Recommendation: remove the iOS gates (account management should not be tier-gated; every user likely holds these keys via `free` set).

- **OQ5 researched:** Web blocks in profile rail (always visible, always fetched, shows empty state). iOS blocks in Settings > Privacy (lazy-loaded). Near-identical functionality. Recommendation: move web to Settings — semantically correct, reduces rail noise, eliminates always-on fetch.

- **OQ7 researched:** Web SessionsSection = active session manager with revocation; iOS LoginActivityView = read-only historical audit log. Genuinely different features. Web has no audit log; iOS has no revocation. Recommendation: add audit log to web (RPC already exists; low effort; high security value).

- **OQ9 researched:** iOS Overview tab previews (E9 activity, E10 achievements) load real data with no permission gate. The full tabs (Activity, Milestones) are gated. No server-side RLS found on these tables. Assessment: oversight — free users get real preview data. **But this depends on OQ-NEW-1:** if the tabs are unlocked for free (DB is correct), the oversight disappears.

**Findings closed this session:** WG4 (contact auth), ND5 (dead notification toggles).

**What's blocked.** Priority Group 2 (OQ1, OQ2, OQ3, OQ4, OQ6/WG3) not yet researched. Blocked on session time only.

**What next session should pick up.** Two tasks in order:
1. **Phase 3 Group 2** — spawn parallel Explore agents for OQ1 (streak heatmap), OQ2 (iOS expert queue), OQ3 (expert credentials on iOS), OQ4 (feed prefs on web), OQ6/WG3 (card share key canonicalization). Same format: current state + options + tradeoffs + recommendation + Q&A question text. Write findings into `phases/03-research.md`.
2. **Close Phase 3, begin Phase 4** — Q&A with owner. Start with OQ-NEW-1 (the product decision on whether free users should have activity/categories/achievements/bookmarks — this unlocks or changes several other OQs). Then OQ-NEW-2, OQ5, OQ7. OQ9 can be asked after OQ-NEW-1 is answered.

---

## Session 4 — 2026-04-30 — Phase 3 Group 2 complete; Phase 4 Q&A complete

**Phase entering:** 3 (in-progress — Group 1 done)
**Phase leaving:** 4 (complete — all 12 decisions locked)

**What happened.** Spawned 3 parallel agents for Priority Group 2:

- **Agent A (Explore)** — OQ1 + OQ4: read `ActivitySection.tsx` (flat list only, no streak/heatmap), `ProfileView.swift` streak rendering code (streakStrip, loadStreak functions — quotes captured), grep for streak tables in migrations (none found — computed from `reading_log`), `FeedPreferencesSettingsView` in `SettingsView.swift` (5 toggles, stored in `users.metadata.feed` via `update_own_profile` RPC), web grep for feed preferences (none found)
- **Agent B (Explore)** — OQ2 + OQ3: read `ExpertQueueSection.tsx` (4 tabs, claim/decline/answer actions, `/api/expert/queue` endpoint), found `ExpertQueueView.swift` (separate file — full iOS implementation with parity); read `ExpertProfileSection.tsx` (credentials editor, vacation toggle, status display, verified areas), SettingsView.swift expert section (`// MARK: - Expert settings` comment empty, zero post-verification management on iOS)
- **Agent C (general-purpose)** — OQ6/WG3: read `ProfileApp.tsx` (cardShare usage), `/profile/card/page.js` (redirects to `/card/[username]`), `ProfileView.swift` share quick-action (ShareLink with same URL), ran DB query confirming `profile.card_share` in 8 sets vs. `profile.card.share_link` in only 3 sets

**Key findings:**

- **OQ2 RESOLVED:** Phase 1 inventory was wrong about iOS expert queue. `ExpertQueueView.swift` exists as a separate file (Phase 1 agent read ProfileView.swift but missed it). iOS has full feature parity with web — 4 tabs, all actions, answer composer. Back-channel is a placeholder on both platforms. G2 finding is closed.

- **OQ6/WG3 bug confirmed:** `profile.card.share_link` is only in 3 permission sets (admin, free, owner) while `profile.card_share` is in all 8 non-anon sets. An expert, editor, family, moderator, or pro user on iOS cannot see the share button. Real bug. Both keys gate identical user-facing action (share card URL).

- **OQ1:** iOS has full 30-day heatmap (10×3 grid, computed from `reading_log`, streak counts from `users.streak_current`/`streak_best`). Web has none. Data already exists — zero backend work to add web heatmap. Recommendation: add to web.

- **OQ4:** iOS has 5-toggle feed preferences (stored in `users.metadata.feed` via `update_own_profile` RPC). Web has zero equivalent. Web's NotificationsCard even has a comment pointing to "feed preferences" as existing elsewhere. Data structure exists; implementation is ~150 lines. Recommendation: add to web.

- **OQ3:** iOS has expert *application* form but zero post-verification expert management. The `// MARK: - Expert settings (role=expert)` section in SettingsView.swift is empty. No vacation toggle, no credentials editor, no status display. Recommendation: build on iOS (no new APIs needed).

**Phase 3 closed.** All 12 OQs researched (or resolved without Q&A): OQ-NEW-1, OQ-NEW-2, OQ5, OQ7, OQ8, OQ9, OQ10, OQ1, OQ2 (resolved), OQ3, OQ4, OQ6/WG3.

**Phase 4 complete.** All 12 decisions locked (Q1–Q12).

**Q1 (OQ-NEW-1):** Achievements/categories/bookmarks free; activity 30-day free / full history pro. Design: show data, never gamify.
**Q2 (OQ-NEW-2):** Remove iOS account-settings permission gates.
**Q3 (OQ5):** Move web blocked accounts to Settings/Privacy.
**Q4 (OQ7):** Add login audit log to web (RPC exists).
**Q5 (OQ9):** Closed/mooted by Q1.
**Q6 (OQ6/WG3):** Canonicalize card share on `profile.card_share` — iOS one string change.
**Q7 (OQ1):** Add 30-day reading heatmap to web, ambient/neutral display only.
**Q8 (OQ4):** Add FeedPreferencesCard to web (conditional: verify renderer reads flags first).
**Q9 (OQ3):** Build ExpertProfileView on iOS (4 operations: vacation, credentials, verified areas, status).
**Q10 (SUB-1):** Fix story editor subcategory save — wire subcategory_id into article save payload.
**Q11 (SUB-2):** Add subcategory filter bar to `/category/[slug]` browse pages.
**Q12 (SUB-3):** Rebuild CategoriesSection as hierarchical analytics dashboard using existing `get_user_category_metrics` RPC.

**Additional context captured this session:**
- Discovered `get_user_category_metrics` RPC already handles two-level hierarchy (top-level + subcategory drill-down) with all 4 metrics (reads, quizzes_passed, comments, upvotes_received)
- Story editor subcategory dropdown exists and captures state but save was never wired — `articles.subcategory_id` is null for all articles
- Category browse pages are flat (no subcategory filter) — search API supports subcategory filtering but UI doesn't expose it
- Leaderboard is the only existing surface that shows subcategory filtering (pro users)
- `user_achievements`, `family_achievements`, `family_achievement_progress`, `analytics_events` tables also exist — relevant for future sessions
- Web feed renderer flag verification needed before shipping FeedPreferencesCard (Q8)

**What's blocked.** Nothing.

**What next session should pick up.** Phase 5 — Implementation plan. Spawn plan agent to produce complete file:line change list covering all 12 decisions. Adversarial review before any code. Then Phase 6 (web) and Phase 7 (iOS) implementation.

---

## Session 5 — 2026-04-30 — Phase 5: Implementation Plan

**Phase entering:** 5 (not-started)
**Phase leaving:** 5 (complete — implementation plan locked)

**What happened.** Ran 4-agent pattern (Investigator → Planner → Big-picture Reviewer + Adversary in parallel):

- **Investigator (Explore)** — Read all affected files for all 12 decisions. Confirmed Q8 renderer verdict: `web/src/app/page.tsx` does not read `users.metadata.feed` flags at all — two-part task confirmed. Quoted current code for every decision including exact line numbers for iOS gates (Q2), card share key (Q6), story editor save payload (Q10), CategoriesSection data source (Q12), and the empty Expert settings MARK (Q9).
- **Planner (Plan)** — Produced full change list: 6-wave ship order, precise file:line targets for all 12 decisions, two new web files (Q4 route, Q8B card), one new iOS struct (Q9).
- **Big-picture Reviewer (Explore)** — Verified ProfileApp locked: renderer drives LockedSection unmount (PASS). Confirmed PrivacySection is already a client component — BlockedSection addition is safe (PASS). Confirmed `get_own_login_activity` RPC exists with correct signature (PASS). Confirmed page.tsx is RSC with Promise.all ready (PASS). Found Q10 narrative error (subcategory field already holds UUID, not name). Found Q1 missing kids iOS platform statement. VERDICT: APPROVE WITH NOTES.
- **Adversary (Explore)** — Found 3 real issues: (1) Q1 has no mechanism to distinguish free vs. pro for 30-day cap after unlock — `profile.activity` becomes true for all, so `isPro = perms.activity` would always be true. (2) Q10 onChange concern (resolved: subcategory already holds UUID, fix is one-line addition). (3) Q4 pre-existing permission key mismatch between web (`settings.account.login_activity.view`) and iOS (`settings.login_activity.view`). VERDICT: APPROVE WITH FIXES.

**Resolution of adversary issues before writing to disk:**
1. **Q1 free vs. pro gap** — Introduced new DB migration: add `profile.activity.full_history` key to `permissions` table, assign to pro/expert/admin/editor/moderator/family sets. Free users get `profile.activity` only (30-day cap). Pro+ users get both keys (full history). `isPro` derived from `hasPermission('profile.activity.full_history')` on both web and iOS.
2. **Q10 onChange** — Confirmed subcategory field already holds UUID (reviewer verified). Fix is: add `subcategory_id: story.subcategory || null` to save payload. No two-field update needed.
3. **Q4 key mismatch** — New web route standardizes on `'settings.account.login_activity.view'`. iOS mismatch flagged for a future iOS session; does not block Q4.

**Output produced:** `phases/05-implementation-plan.md` — complete file:line change list for all 12 decisions. Every entry has: file path, current behavior (quoted), new behavior, decision satisfied, web/iOS/kids iOS platform statement.

**Key decisions recorded in plan:**
- Q1: DB migration first (Wave 3 prerequisite); new `profile.activity.full_history` key separates free/pro
- Q8: Two-part task — Part A (renderer) before Part B (card); strictly sequential
- Q10 → Q12 dependency: flagged in ship order and in Q12 entry; top-level metrics available immediately
- Q4 iOS mismatch: flagged as a future iOS fix

**What's blocked.** Nothing.

**What next session should pick up.** Phase 6 — Web implementation. Follow the 6-wave ship order in `phases/05-implementation-plan.md`. Wave 1 (Q10) ships first. The DB migration for `profile.activity.full_history` ships as part of Wave 3 before any Q1 code lands. Phase 7 (iOS + kids implementation) can run in parallel after Wave 2 is cleared.

---

## Session 6 — 2026-04-30 — Phase 6: Web Implementation (all 5 waves)

**Phase entering:** 6 (not-started)
**Phase leaving:** 6 (complete — all web changes shipped and pushed)

**What happened.** Ran 5 waves of web implementation using the 6-agent ship pattern (4 pre-impl + 2 post-impl per wave). All waves passed 2/2 post-impl verifiers. TypeScript compiled clean after each wave. All commits pushed to `main`.

**Wave 1 — Q10: Subcategory save payload (commits in prior session)**

Carried forward from Session 5. `StoryEditor.tsx` and `KidsStoryEditor.tsx` subcategory dropdowns were fixed to store UUID (not name) via `subcategoriesByParent` type change, and `subcategory_id: story.subcategory || null` added to both save payloads. `save/route.ts` got explicit `ArticleFields` type with `subcategory_id?: string | null`.

**Wave 2 — Q3 + Q4: BlockedSection move + login audit log**

- `PrivacySection.tsx`: now renders `<BlockedSection>` inline (moved from profile rail)
- `ProfileApp.tsx`: removed `blocked` section entry; added `<BlockedSection>` import removed; removed `locked:` gates from `blocked` slot
- `SessionsSection.tsx`: added `<LoginAuditLog>` component rendering last 50 sign-ins from `/api/account/login-activity`
- `web/src/app/api/account/login-activity/route.js`: new route calling `get_own_login_activity` RPC via cookie-based client

**Wave 3 — Q1 DB + Q1 web + Q7: Permission key + activity unlock + reading heatmap**

- DB migration `20260430191705_profile_activity_full_history.sql`: new `profile.activity.full_history` key assigned to pro/expert/admin/editor/moderator/family
- `ProfileApp.tsx`: `activityFullHistory` permission derived; `locked:` gates removed from bookmarks/categories/milestones/activity sections; `isPro={perms.activityFullHistory}` passed to ActivitySection
- `ActivitySection.tsx`: `isPro` prop gates 30-day vs all-time query cutoff; `ReadingHeatmap` component (30-day grid + streak stats) added; streak fetched from `users.streak_current`/`streak_best` in parallel with activity queries; `IIFE` isolation prevents streak failure cascading

**Key issues caught and fixed in Wave 3:**
- DB migration: `permissions` table requires `display_name` NOT NULL and `category` NOT NULL (discovered iteratively via MCP)
- `permission_set_perms` uses UUID FK (`permission_id`), not string key — had to use `CROSS JOIN permissions p WHERE p.key = '...'`
- `C.brand` does not exist in palette → changed to `C.accent`
- `PostgrestBuilder` has no `.catch()` → wrapped streak fetch in IIFE
- ProfileApp.tsx encoding corruption (U+2018 curly quotes) → fixed via Python byte-level replacement

**Wave 4 — Q8A: Feed flag wiring**

Pre-impl review found: `metadata.feed` IS real (1 of 2 users has it, structure confirmed: `showBreaking`, `showTrending`, `showRecommended`, `hideLowCred`, `display`, `minScore`, `cats`). However, only `showBreaking` has a live consumer (`HomeBreakingStrip`). Other flags scoped out: `hideLowCred` (no credibility column on articles; system dropped), `display` (not `compact` — flag name differs from plan), `showTrending`/`showRecommended` (no consumer sections). Shipped `showBreaking`-only:
- `page.tsx`: new `userMetaPromise` IIFE (isolated, never cascades) added to Promise.all; `showBreaking` extracted with `?? true` default; `HomeBreakingStrip` gated with `&& showBreaking`

**Wave 5 — Q11 + Q12: Subcategory filter bar + CategoriesSection RPC**

Pre-impl review found:
- Q11: no `subcategories` table — subs live in `categories` via `parent_id`; `articles.subcategory_id` is 100% NULL on live articles; filter still ships with graceful empty state (verifier caught missing `setActiveSubcat(null)` on category navigation — fixed)
- Q12: `get_user_category_metrics` RPC confirmed, returns `reads`/`quizzes_passed`/`comments`/`upvotes_received`; `CategoryScoreRow` type renamed (Reviewer verified zero external imports — safe); `categories` query kept for zero-activity display

Shipped:
- `category/[id]/page.js`: `subcategories` + `activeSubcat` state; subcategory fetch inside useEffect (resets on category change); filter → sort → slice pipeline; pill bar (only when subs exist); "No articles in this subcategory yet" empty state; Load More guard keyed off `sorted.length`
- `CategoriesSection.tsx`: `CategoryScoreRow` updated to inline type with `reads`/`quizzes_passed`/`comments`/`upvotes_received`; `CategoriesSectionConnected` switched from `category_scores` table to `get_user_category_metrics` RPC; scope card shows 4 stats (adds Comments + Upvotes received); `categories` query preserved

**Commits shipped:**
- `981e49a` — feat(profile): unlock activity/bookmarks/categories/milestones for free users; add reading heatmap (Q1, Q7)
- `ad8657d` — feat(home): wire users.metadata.feed.showBreaking into home page breaking strip (Q8A)
- `eddcd68` — feat(category/profile): add subcategory filter bar + rebuild CategoriesSection on RPC (Q11, Q12)

(Waves 1–2 commits shipped in Session 5.)

**Decisions deferred / flagged:**
- **Q8B** (FeedPreferencesCard): deferred pending Q8A production verification. Other feed flags (`showTrending`, `showRecommended`, `display`, `hideLowCred`) deferred until consumer components exist.
- **Q4 iOS key mismatch**: `settings.login_activity.view` (iOS) vs `settings.account.login_activity.view` (web route) — to be fixed in Phase 7 iOS session.

**Platform coverage:**
- Q10: web ✓ / iOS not-started (no iOS StoryEditor equivalent) / kids iOS not-started
- Q3: web ✓ / iOS N/A (already in Settings) / kids iOS N/A
- Q4: web ✓ / iOS deferred (key mismatch + separate iOS login activity surface) / kids iOS N/A
- Q1/Q7: web ✓ / iOS deferred (streak display exists; 30-day/full-history cap may differ) / kids iOS N/A
- Q8A: web ✓ / iOS N/A (feed prefs UI already exists on iOS) / kids iOS N/A
- Q11: web ✓ / iOS not-started / kids iOS not-started
- Q12: web ✓ / iOS not-started / kids iOS N/A

**What's blocked.** Nothing.

**What next session should pick up.** Phase 7 — iOS + kids implementation:
- Q2: remove iOS account-settings permission gates (5 rows in `SettingsView.swift`)
- Q6: canonicalize card share key to `profile.card_share` (one-string change in `ProfileView.swift`)
- Q9: build `ExpertProfileView` on iOS (vacation toggle, credentials editor, verified areas display, status)
- Q4 iOS: add `LoginActivityView`-equivalent audit log with correct permission key; fix key mismatch
- Q10 iOS: StoryEditor equivalent for iOS (if one exists)
- Q11 iOS: subcategory filter on category browse pages (if iOS has them)
- Q1/Q7 iOS: confirm streak heatmap is already present; confirm 30-day/full-history cap is applied

---

## Session 7 — 2026-04-30 — Phase 7: iOS Implementation (all items)

**Phase entering:** 7 (not-started)
**Phase leaving:** 7 (complete — all iOS changes shipped and pushed)

**What happened.** Ran 6-agent ship pattern per item. All items passed 2/2 post-impl verifiers. One commit pushed to `main`.

**Investigation (parallel Explore agents):**
- `SettingsView.swift` agent: confirmed Q2 lines 1165–1168/1173; Q4 line 1169 key mismatch; Q9 MARK block empty at 2579; no `is_expert`/`expertStatus` @State vars; URLSession pattern for HTTP calls; SettingsToggleRow signature
- `ProfileView.swift` agent: confirmed Q6 line 196; canViewActivityFullHistory absent; 30-day cap not applied; streak confirmed using `streak_current`/`streak_best` from users table ✓; loadActivity has no date filter; tab dispatch confirmed lines 919–921 with lockedTabView
- Q9 deeper investigation: no `expertApplicationStatus` @State; URLSession + Bearer pattern confirmed; `/api/expert/vacation` and `PATCH /api/expert/apply` routes verified to exist; `credentials` column is JSON type (not TEXT); `vacation_until` column exists via migration
- Q10/Q11 iOS investigation: **both N/A** — iOS is reader-only (no StoryEditor equivalent); iOS category browse has subcategory data in models but no filter UI (HomeView comment confirms it was intentionally stripped)

**Key Adversary finding addressed:** Q6 Planner found second functional occurrence of `"profile.card.share_link"` in `PublicProfileView.swift` line 123 — fixed both. Adversary's DB-key concerns on Q2/Q4/Q6 were based on migration-search miss; resolved by direct MCP SQL query confirming all keys exist in correct sets.

**Pre-impl divergence on Q1/Q7 iOS:** Reviewer and Adversary both flagged two issues:
1. Bookmarks fetch also needs 30-day date filter (web spec includes it — iOS plan omitted it) → fixed: added `.gte("created_at", value: cutoff)` to all 4 fetches (reading_log, quiz_attempts, comments, bookmarks)
2. `credentials` JSON decode — custom `Decodable init(from:)` with explicit `credentialsText = ""` initialization and `[String]`/`String` fallback handling
Reviewer's @ViewBuilder concern was resolved by reading `activityTab`: it's inside VStack's @ViewBuilder closure, so mixing `let` + view expressions is valid.

**Items shipped:**

**Q2 — Remove 5 iOS account-settings permission gates**
- `SettingsView.swift` `loadPerms()`: 5 lines (`canEditProfile`, `canEditEmail`, `canChangePassword`, `canViewMFA`, `canViewDataPrivacy`) changed from `PermissionService.shared.has(...)` to `= true`. All 5 keys confirmed in `free` set via MCP SQL — existing behavior unchanged, now explicit.
- Web: N/A (already unconditional). Kids iOS: N/A.

**Q4 iOS — Canonicalize LoginActivityView permission key**
- `SettingsView.swift` `loadPerms()` line 1169: `"settings.login_activity.view"` → `"settings.account.login_activity.view"`. Both keys confirmed in DB and in all 8 sets; change canonicalizes with web route.
- Web: already correct. Kids iOS: N/A.

**Q6 — Fix iOS card share permission key**
- `ProfileView.swift` line 196: `"profile.card.share_link"` → `"profile.card_share"`
- `PublicProfileView.swift` line 123: same fix (Planner-discovered second occurrence)
- Web: already correct. Kids iOS: N/A.

**Q1/Q7 iOS — Activity unlock + 30-day cap + streak verification**
- `ProfileView.swift`: added `@State private var canViewActivityFullHistory: Bool = false`; added permission check for `"profile.activity.full_history"` in perms task
- Tab dispatch: removed `else { lockedTabView() }` from activity/categories/milestones → all unconditional. Deleted `lockedTabView()` function (no remaining call sites)
- Bookmarks guards: removed both `if canViewBookmarks` wrappers at lines 611 and 1025
- `loadTabData()`: removed `&& canViewActivity/Categories/Achievements` conditions
- `loadActivity()`: added `cutoff` let; applied `.gte("created_at", value: cutoff)` to reading_log, quiz_attempts, comments, AND bookmarks fetches (correcting the spec omission from the original plan)
- `activityTab`: added `if !canViewActivityFullHistory { Text("Showing last 30 days.") ... }` in else block
- Streak: confirmed already uses `streak_current`/`streak_best` from users table — no changes needed ✓
- Web: N/A (done in Session 6). Kids iOS: N/A.

**Q9 — Build ExpertProfileView on iOS**
- `SettingsView.swift`: added `@State private var expertApplicationStatus: String? = nil`
- `loadPerms()`: added async DB fetch for `expert_applications.status` (wrapped in `try?`, silent on failure)
- `expertRows`: added "Expert profile" `HubRowSpec` entry (shows when `isExpert == true || status in ["pending","approved"]`)
- Inserted `ExpertProfileView` struct (~220 lines) between the expert MARK comments: vacation toggle (POST `/api/expert/vacation` + NSNull() for null-clearing), credentials TextEditor (PATCH `/api/expert/apply`, max 600 chars), status display (4 states: approved/pending/rejected/revoked), verified areas read-only pills
- Custom `AppRow.init(from:)` decoder handles `credentials` JSON column as either `[String]` or `String` (with explicit `credentialsText = ""` initialization before conditional branches)
- Inserted `ExpertAreaPills` at file scope (not nested — Swift prohibits View-conforming types nested inside other View-conforming structs)
- VP.error does not exist → used `VP.danger` throughout
- URLSession pattern with Bearer token, NSNull() for JSON null, `/api/expert/vacation` and `/api/expert/apply` relative URL paths
- Web: N/A (ExpertProfileSection.tsx already implemented). Kids iOS: N/A.

**Q10 iOS — N/A.** iOS is a reader-only app. No StoryEditor equivalent exists. All `.from("articles")` calls in iOS are SELECT-only. Kids iOS: N/A.

**Q11 iOS — N/A.** iOS category browse has subcategory_id in models but no filter UI; HomeView comment confirms it was intentionally stripped. Kids iOS: N/A.

**Q8B — Deferred.** Pending Q8A production verification (unchanged from Session 6).

**Commits shipped:**
- `f0603fd` — feat(ios): permission key fixes + activity unlock + ExpertProfileView (profile-audit Session 7)

**Platform coverage final state:**
| Q | Web | iOS | Kids iOS |
|---|---|---|---|
| Q1/Q7 | ✓ Session 6 | ✓ Session 7 | N/A |
| Q2 | N/A | ✓ Session 7 | N/A |
| Q3 | ✓ Session 6 | N/A (already in Settings) | N/A |
| Q4 | ✓ Session 6 | ✓ Session 7 | N/A |
| Q6 | N/A (already correct) | ✓ Session 7 | N/A |
| Q8A | ✓ Session 6 | N/A | N/A |
| Q8B | deferred | N/A | N/A |
| Q9 | N/A (web done) | ✓ Session 7 | N/A |
| Q10 | ✓ Session 5/6 | N/A | N/A |
| Q11 | ✓ Session 6 | N/A | N/A |
| Q12 | ✓ Session 6 | deferred | N/A |

**What's blocked.** Nothing.

**What next session should pick up.** Q8B (FeedPreferencesCard web) — deferred until owner confirms Q8A `showBreaking` working in production. Q12 iOS (CategoriesSection rebuild) if desired.
