# Zone Z01: Reference/

## Summary
Reference/ is the canonical-doc zone: project constitution (CLAUDE.md), live-state narrative (STATUS.md), workflow brief for the PM role (PM_ROLE.md), changelog, feature ledger, design decisions D1–D44, scoring-system reference, parity matrices (Shared/Web-Only/iOS-Only), runbooks (CUTOVER, ROTATE_SECRETS), credential rotation tracker (ROTATIONS.md), a stub README that has not kept up with the post-2026-04-21 reorg, and one xlsx data file. The zone has substantial internal drift: README.md, FEATURE_LEDGER.md, parity/* and runbooks/CUTOVER.md still reference deleted folders (`site/`, `docs/`, `test-data/`, `05-Working/`, `localhost:3333`), a removed `@admin-verified` LOCK system, and superseded trackers (FIX_SESSION_1.md, TODO.md, DONE.md), while STATUS.md and CLAUDE.md and PM_ROLE.md and CHANGELOG.md and 08-scoring-system-reference.md and ROTATIONS.md and Verity_Post_Design_Decisions.md are current as of 2026-04-23..2026-04-25.

## Files

### Reference/08-scoring-system-reference.md
- **Purpose:** Definitive reference for the live scoring stack so future agents do not repeat the schema/109 parallel-ledger mistake.
- **Topics:** `score_events` ledger schema + dedupe indexes + RLS; `score_rules` table seed (14 actions with points/caps/cooldown); `award_points` RPC flow + idempotency; per-event wrappers (`score_on_quiz_submit`, `score_on_reading_complete`, `score_on_comment_post`, `advance_streak`, `recompute_verity_score`); guard trigger `schema/083`; reconciliation; gaps (reading-log trigger, kid_profiles guard, `reconcile_category_scores`, admin rate-limit metrics); rules for new scoring work; "what to build next" priority order.
- **Key claims / decisions / dates:**
  - As of 2026-04-20: the seeded action list, points, caps, cooldowns are enumerated.
  - schema/111 rolled back schema/109; future scoring work extends `score_events`, never replaces it.
  - `recompute_verity_score` and `award_points` are the only two paths that mutate `users.verity_score`.
  - `kid_profiles` is missing the parity guard trigger that `users` has via schema/083 — flagged as a gap.
  - `reconcile_category_scores()` not yet built — proposed body included.
  - Reading-log DB trigger proposed as belt-and-suspenders.
  - All listed gaps are post-launch hardening, not launch blockers.
- **Cross-references:** `schema/022_phase14_scoring.sql`, `schema/reset_and_rebuild_v2.sql`, `schema/083_restrict_users_table_privileged_inserts_2026_04_19.sql`, `schema/111`, `schema/066`, `web/src/app/api/quiz/submit/route.js`, `web/src/app/api/stories/read/route.js`, `web/src/app/api/comments/route.js`, `web/src/lib/scoring.js`.
- **Status:** Current. Authoritative. Listed as required reading in PM_ROLE.md §3.
- **Concerns:** None — single source of truth on scoring.

### Reference/CHANGELOG.md
- **Purpose:** Dated entries (newest first, Keep-a-Changelog style) of changes shipped in the 2026-04-20 post-fired-dev session.
- **Topics:** Security fixes (kid keychain, error.message leaks, Sentry PII scrubber, `/admin` 404, parental gate wiring, kid PIN weak-pattern); Database (migrations 105, 106, seeds 101–104, audit-trail extensions); iOS adult + kids changes; Web changes; Scripts; Documentation; Verified-clean items.
- **Key claims / decisions / dates:**
  - 2026-04-20 — superadmin role removed (migration 105 already applied to live DB); Migration 106 written but NOT YET applied (waiting on owner SQL Editor paste).
  - Test account count: 20 → 19 (19 test + 30 community + 2 kids).
  - Settings seed `streak.freeze_max_kids = 2`.
  - "TODO item" cross-references go from #10–#51.
  - Last entry refers reader to "archive/2026-04-20-consolidation/DONE.md" for pre-session log.
- **Cross-references:** `schema/105_remove_superadmin_role.sql`, `schema/106_kid_trial_freeze_notification.sql`, `web/src/lib/kidPinValidation.js`, `web/sentry.shared.js`, `web/src/instrumentation.ts`, `scripts/apply-seeds-101-104.js`, archive paths under `archive/2026-04-20-consolidation/`.
- **Status:** Snapshot of 2026-04-20 work; only that date's entry. Multiple subsequent dated sessions (04-21 through 04-25) have not been appended — CHANGELOG is stale relative to STATUS.md/PM_ROLE.md/MASTER_TRIAGE.
- **Concerns:** Stale TODO numbering scheme (#10..#51) matches the retired `TODO.md`/`FIX_SESSION_1.md`, not the current `MASTER_TRIAGE_2026-04-23.md`. Migration 106 status ("NOT YET APPLIED") may be obsolete given the 5 days of subsequent sessions logged in MASTER_TRIAGE.

### Reference/CLAUDE.md
- **Purpose:** Project constitution — how an AI session should orient and behave on Verity Post.
- **Topics:** Be thorough; quality bar; the goal (3-surface launch, Apple-block context); product intent (quiz-gated discussion, paid tiers, kids walled-off, experts/journalists vetted, permission matrix as DNA); architecture (3 apps + 1 DB Supabase `fyiwulqphgmoqullmrfn`); auth topology (GoTrue vs custom kid JWT); files-to-reread list; repo tree; the machinery (lib files); route conventions; Supabase tables/RPCs; "DB is default"; permissions xlsx ↔ Supabase 1:1 rule; conventions (admin = highest blast radius, 6-agent ship pattern, file markers); brand/UX rules (no emojis adult, paid tier names canonical); code rules (web is TypeScript, kids is iOS-only); how work enters; risk tiers (trivial/surgical/multi-surface/architectural); close-the-loop; what-not-to-do; start.
- **Key claims / decisions / dates:**
  - Pristine is the standard.
  - Apple Developer account not yet active (gates publishing both iOS apps).
  - `/kids/*` web is redirect-only.
  - `Current Projects/MASTER_TRIAGE_2026-04-23.md` is the canonical audit tracker (FIX_SESSION_1.md + TASKS.md + DONE.md retired).
  - `Current Projects/Audit_2026-04-24/` artifacts are read-only; new items go to MASTER_TRIAGE.
  - Permissions xlsx canonical path: `/Users/veritypost/Desktop/verity post/permissions.xlsx` (note space).
  - `permissions_matrix.xlsx` deleted 2026-04-20.
  - "Husky lives at web/.husky/, NOT repo root."
  - Admin code = highest blast radius; runs 6-agent ship pattern (4 pre + 2 post).
  - No emojis on adult surfaces / dev docs; kids iOS only.
  - Conventional commit format `<area>(#<item>): <short title>`.
  - Web is TypeScript; no new `.js`/`.jsx` in `web/src/`.
- **Cross-references:** `Reference/STATUS.md`, `Current Projects/MASTER_TRIAGE_2026-04-23.md`, `Current Projects/Audit_2026-04-24/OWNER_TODO_2026-04-24.md`, `Sessions/<MM-DD-YYYY>/Session <N>/SESSION_LOG_*.md`, `web/src/lib/auth.js`/`permissions.js`/`roles.js`/`plans.js`/`rateLimit.js`/`supabase/{client,server}.ts`/`featureFlags.js`/`middleware.js`, `scripts/import-permissions.js`, `schema/reset_and_rebuild_v2.sql`.
- **Status:** Current as of 2026-04-24 mtime; matches the system-reminder copy; this is `Reference/CLAUDE.md` (the symlink target — `/CLAUDE.md` → `Reference/CLAUDE.md`).
- **Concerns:** Mentions FIX_SESSION_1 item IDs in the commit-style example (e.g. "#20") even though the tracker is now MASTER_TRIAGE — minor wording lag. Says "FALLBACK_CATEGORIES hardcode still there" in `web/src/app/page.tsx`; the page.tsx file was rewritten 2026-04-23 per STATUS.md (hand-curated front page); this comment may be stale.

### Reference/FEATURE_LEDGER.md
- **Purpose:** Per-feature completion rollup of the permission migration / hygiene work, with `@feature-verified <name> 2026-04-18` markers as the per-file authoritative seal.
- **Topics:** ~22 named features (bookmarks, expert_queue, messaging, follow, tts, recap, comments, quiz, kids, family_admin, article_reading, home_feed, notifications, search, profile_settings, subscription, system_auth, ads, shared_components, shared_pages, profile_card, admin_api, admin (UI — LOCKED), expert_sessions, expert, family, reports, supervisor, ai). For each: status, file count, what's covered, known follow-ups (with severity tag), related DB state. Cross-cutting sections: DB hygiene state (928 active perms, 64 inactive, 10 sets, perms_global_version=4409), Round 1–4 migration list, triggers/RPCs, cross-feature open items.
- **Key claims / decisions / dates:**
  - Last updated: 2026-04-18.
  - 928 active perms / 64 inactive (as of 2026-04-19 post Round-4 Track W).
  - perms_global_version = 4409.
  - admin UI LOCK = 39 pages + 27 DS components + 3 admin-API drift files = 69 files marked.
  - Multiple cross-feature items "RESOLVED Round 5/6 (2026-04-19)".
  - Severity legend (Must-fix / Should-fix / Nice-to-fix / Product-decision / Defense-in-depth).
- **Cross-references:** `site/src/app/...` (deleted folder) all over; `05-Working/PERMISSION_MIGRATION.md`, `05-Working/ADMIN_STATUS.md`, `05-Working/_round{2,3,4}_prep*.md`; `schema/022_phase14_scoring.sql`; `schema/083`; `schema/066`; many migration names like `fix_settings_leak_bindings`, `lock_down_admin_rpcs_2026_04_19`, `tighten_pso_select_rls_2026_04_19`.
- **Status:** Heavily stale. Refers throughout to `site/` (folder deleted), `05-Working/` (folder retired), and to `@admin-verified` markers (the marker system was retired 2026-04-23 per project memory `feedback_admin_marker_dropped.md`). Folder paths and the LOCK rule no longer match reality.
- **Concerns:** Massive drift. README still calls it "the per-feature status rollup" — but the per-file `@feature-verified` markers are paired with `@admin-verified` which was officially dropped. Should be either rewritten against the new layout (web/, MASTER_TRIAGE) or archived.

### Reference/PM_ROLE.md
- **Purpose:** Role brief for an AI acting as project manager; defines orchestrator-only mandate, the 4-agent workflow, anti-hallucination rules.
- **Topics:** §1 The role + the one rule (verify before stating fact); precedence clause (PM_ROLE wins over CLAUDE.md on role/scope); the 4-agent workflow (2 parallel → 1 serial → 1 independent → owner green-light only on 4/4 convergence); anti-hallucination rules (8 of them, citing predecessor failures); specific traps (schema/109 disaster, double-credit cleanup, xlsx-vs-DB drift, wrong column name, updated_at vs scoring triggers); behavior rules for owner's voice; invariants. §2 Repo tree (post-2026-04-21 reorg). §3 Must-read files. §4 Sources-of-truth map. §5 First-task ordering. §6 Known outstanding items at handover (with supersede note pointing to FIX_SESSION_1.md). §7 Things that are NOT your job. §8 End / acknowledge to owner.
- **Key claims / decisions / dates:**
  - Predecessor was fired for hallucinating, double-credit scoring bug, unilateral decisions, drifting off workflow.
  - 4-agent flow is verbatim from owner; do not paraphrase or invent rules.
  - Sources of truth map: permissions.xlsx (matrix), `schema/reset_and_rebuild_v2.sql` (shape), live Supabase DB (runtime), `schema/NNN_*.sql` (incremental), git (history); status docs = "human intent, can drift; never load-bearing for fact claims."
  - Migration ledger: 105–111 listed; 109 marked "Rolled back by 111. Mistake. Never use as reference."
  - 2026-04-21 repo reorg moved roots to `Reference/`, `Current Projects/`, `Sessions/`, etc.
  - `kidsactionplan.md` archived; `scripts/seed-test-accounts.js` retired 2026-04-21.
  - PM never edits / writes / runs SQL directly.
  - `Reference/08-scoring-system-reference.md` is the definitive scoring doc.
  - 7 known outstanding items grouped A–G (some marked DONE 2026-04-21).
- **Cross-references:** `Reference/CLAUDE.md`, memory file `~/.claude/projects/-Users-veritypost-Desktop-verity-post/memory/feedback_four_agent_review.md`, `Current Projects/FIX_SESSION_1.md` (canonical at time of writing this doc), `Reference/08-scoring-system-reference.md`, `Current Projects/F1..F7-*.md`, `Current Projects/APP_STORE_METADATA.md`, `schema/022`, `schema/083`, `schema/105..111`, `web/src/lib/{auth,permissions,roles,plans,rateLimit,scoring,track,trackServer,useTrack,events/types,botDetect}.{js,ts}`, `web/src/middleware.js`, `web/src/components/{Ad.jsx,AdSenseSlot.tsx,GAListener.tsx}`, `Sessions/04-21-2026/Session 1/SESSION_LOG_2026-04-21.md`.
- **Status:** Current as of 2026-04-21 with a 2026-04-21 supersede note pointing forward to `FIX_SESSION_1.md`. The supersede note is one rev behind: per CLAUDE.md and STATUS.md and project memory, FIX_SESSION_1 has itself been retired into `MASTER_TRIAGE_2026-04-23.md`.
- **Concerns:** PM_ROLE.md says "the canonical tracker is FIX_SESSION_1.md" but CLAUDE.md and STATUS.md (newer) point to MASTER_TRIAGE_2026-04-23.md. PM_ROLE references `Current Projects/F6-measurement-and-ads-masterplan.md` as "Partially stale — §5 describes rolled-back schema/109 design"; that flag may itself be stale. References ~30 commits via `git log --oneline -30` as a startup task — file count assumes a stable startup workflow.

### Reference/README.md
- **Purpose:** Top-level orient doc — what the platform is, top-level folder layout, dev quick-start.
- **Topics:** "Permission-driven news discussion platform"; STATUS.md + WORKING.md as canonical status docs; folder map (web/, VerityPost/, VerityPostKids/, schema/, supabase/, scripts/, test-data/, docs/, Archived/); docs map (docs/reference, docs/runbooks, docs/product, docs/planning, docs/history); conventions (two canonical status docs at root, migration numbering, admin LOCK markers, permission migration markers); dev (cd web; cd VerityPost xcode); cutover pointer to `docs/runbooks/CUTOVER.md`.
- **Key claims / decisions / dates:**
  - Mentions `WORKING.md` as a canonical doc.
  - Describes admin LOCK via `@admin-verified 2026-04-18`.
  - Says VerityPostKids has its own README.md (`see VerityPostKids/README.md`).
  - Says migrations are 005–094 + reset.
- **Cross-references:** `STATUS.md`, `WORKING.md`, `web/`, `VerityPost/`, `VerityPostKids/`, `schema/`, `supabase/`, `scripts/`, `test-data/`, `docs/`, `Archived/`, `docs/runbooks/CUTOVER.md`, `scripts/preflight.js`.
- **Status:** Heavily stale.
- **Concerns:** (1) `WORKING.md` does not exist (per CLAUDE.md / STATUS.md, work tracker is `Current Projects/MASTER_TRIAGE_2026-04-23.md`). (2) `docs/`, `test-data/`, `Archived/` mentions don't match the post-2026-04-21 layout (`Reference/`, `Current Projects/`, `Sessions/`, `Archived/` capitalised). (3) Migration range "005–094" is incorrect — schema/ now goes through 177 per STATUS.md. (4) The `@admin-verified` marker rule has been retired. (5) `kids iOS doesn't exist yet — see VerityPostKids/README.md` directly contradicts that VerityPostKids/ ships an active app per CLAUDE.md / STATUS.md / FEATURE_LEDGER.md.

### Reference/ROTATIONS.md
- **Purpose:** Tracker of credentials that expire or should be rotated periodically.
- **Topics:** Apple Sign-In-With-Apple client secret JWT (6-month rotation, last 2026-04-23, next 2026-10-23, with command-line generation steps); APNs auth key; Apple Service ID + App IDs (Service ID `com.veritypost.signin`, App IDs `com.veritypost.app` + `com.veritypost.kids`, Team `FQCAS829U7`); Supabase anon + service role keys; Stripe keys; Anthropic + OpenAI API keys; Sentry auth token; CRON_SECRET; Resend API key; quarterly checklist.
- **Key claims / decisions / dates:**
  - Apple SIWA last rotated 2026-04-23, next due 2026-10-23.
  - Apple Team ID: FQCAS829U7.
  - APNs Key ID: 8WQ2K66T63.
  - Apple SIWA Service ID: `com.veritypost.signin`.
  - Apple App IDs: `com.veritypost.app`, `com.veritypost.kids`.
  - Service-role key is server-only; recommended annual rotation.
  - SIWA P8 path: `~/Desktop/AuthKey_S462U229AG.p8`; KID `S462U229AG`; SUB `com.veritypost.signin`.
- **Cross-references:** `scripts/generate-apple-client-secret.js` (script must exist for the rotation steps to work); Vercel env (`APNS_AUTH_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, etc.).
- **Status:** Current and pragmatic. The Apple Developer account context here ("we have Team ID, App IDs, Service ID, P8s, last rotated 2026-04-23") is interesting because CLAUDE.md says "the owner does not yet have an Apple Developer account" and PM_ROLE.md / project memory list Apple-Dev enrollment as a pending owner action. ROTATIONS.md effectively contradicts that (or, more likely, tracks the post-enrollment state that was achieved between sessions).
- **Concerns:** Possible contradiction with CLAUDE.md / OWNER_TODO list re Apple Developer status — needs verification in later wave. Refers to a script `scripts/generate-apple-client-secret.js` that should be confirmed present.

### Reference/STATUS.md
- **Purpose:** "What the product IS. Not what's left." Live-state narrative; first thing every session is supposed to read.
- **Topics:** One-line summary; platforms table (Web, iOS adult, iOS kids, Admin, Database, Hosting, AI pipeline F7, Profile + Leaderboard, Home page); permission system snapshot (928 active, 10 sets, resolver = `compute_effective_perms`, server gate `requirePermission`, client gate `hasPermission`, version polling via `users.perms_version`); architecture (web adult-only, GoTrue for adult, custom JWT for kids); key machinery table; dev tooling (ESLint/Prettier/Husky 9 shipped 2026-04-21); canonical mutation route shape; brand rules; test accounts; E2E test infrastructure (added 2026-04-25 — Playwright 480+ tests, XCUITest, seeded harness).
- **Key claims / decisions / dates:**
  - Top-of-doc points work tracker to `MASTER_TRIAGE_2026-04-23.md` and most recent session to `Sessions/04-25-2026/Session 1/SESSION_LOG_2026-04-25.md`.
  - 928 active permissions; 10 sets; permission resolver = `compute_effective_perms(user_id)`.
  - Hosting: Vercel; deploys on push to main (verified 2026-04-21).
  - F7 newsroom redesign 2026-04-22, commit `b269e17`.
  - Profile + Leaderboard parity pass 2026-04-23 (SHA TBD), 7-agent review.
  - Home page rebuild 2026-04-23, schema/144_articles_hero_pick.sql, hand-curated front page.
  - Husky shipped 2026-04-21 (FIX_SESSION_1 #20). `web/.husky/` location, NOT root.
  - Test accounts: 19 test + 30 community + 2 kids; manual SQL canonical; seed script absent on disk.
  - E2E added 2026-04-25: 480+ tests, 468 passing, 14 known flakes, 14 intentional skips. iOS XCUITest 9 smoke tests green. Seed harness `web/tests/e2e/_fixtures/seed.ts`.
- **Cross-references:** `Current Projects/MASTER_TRIAGE_2026-04-23.md`; `CLAUDE.md`; `Sessions/04-25-2026/Session 1/SESSION_LOG_2026-04-25.md`; `Future Projects/09_HOME_FEED_REBUILD.md`; `web/src/middleware.js`; `web/src/lib/{auth,permissions,roles,rateLimit,supabase/server,adminMutation,apiErrors,siteUrl,stripe,appleReceipt,kidPin,cronAuth,pipeline}`; `web/src/app/api/newsroom/ingest/run/route.ts`; `web/src/app/api/admin/pipeline/generate/route.ts`; `web/src/app/api/cron/pipeline-cleanup/route.ts`; `schema/reset_and_rebuild_v2.sql`; `schema/144_articles_hero_pick.sql`; `Current Projects/FIX_SESSION_1.md` (one residual mention).
- **Status:** Current as of 2026-04-25 mtime. Most-current doc in zone.
- **Concerns:** Still mentions `FIX_SESSION_1.md` parenthetically in the `reset_and_rebuild_v2.sql` row; that tracker is retired per CLAUDE.md. `LeaderboardPeriod` Swift file mentioned with "audit-consensus parity pass 2026-04-23 (SHA TBD)" — TBD SHA needs filling.

### Reference/Verity_Post_Design_Decisions.md
- **Purpose:** Running log of architectural decisions (D1–D44+) — the product spec at the decision-by-decision level.
- **Topics:** D1 quiz gates discussion (3/5 pass, 2 attempts free, fresh question pools, min 10 questions/article); D2 verity score = knowledge map not status; D3 expert badges = only public authority signal; D4 category scores drive breadth; D5 paid score visibility as conversion driver; D6 comments fully invisible until quiz pass; D7 comment score shows verity not quiz score; D8 no quiz bypass for any role; D9 kids have no discussion section — expert sessions instead; D10 tier names (Free / Verity / Verity Pro / Verity Family); D11 DMs paid-only forever; D12 kid profiles undiscoverable (clarified 2026-04-16: separate kids global leaderboard); D13 bookmarks free w/ 10-cap, full at Verity; D14 breaking-news 1/day free; D15 no community notes — organic context pinning; D16 anyone-passed-quiz can tag context; D17 TTS Verity+; D18 offline reading cut; D19 streak freezes Verity Pro + Family kids only (2/week); D20 ask-an-expert paid + blurred for free + plagiarism scan; D21 mentions paid-only; D22 category supervisor (name TBD); D23 ad strategy by tier; D24 family unique engagement features (family leaderboard, shared achievements, weekly family report); D25 no email digest; D26 search basic free advanced paid; D27 no source/article credibility ratings; D28 follow paid-only; D29 no reactions (upvote/downvote on comments only); D30 role hierarchy (supervisors flag → mods act → editors publish → admins manage); D31 leaderboard tiers (anon top-3, free global, paid +category); D32 profile privacy free, customization paid; D33 expert queue + private back-channel (visible to experts/editors/admins/owners only); D34 family plan two tiers ($14.99 / $19.99); D35 sponsored quizzes — reputable only; D36 weekly recap quizzes paid-only; D37 article timelines universal w/ revenue-aware link access; D38 no profile cosmetics; D39 reporting + blocking all verified; D40 cancellation: DMs immediate, 7-day grace, then frozen profile; D41 quiz explanations all tiers; D42 annual pricing ~17% discount; D43 no free trial; D44 1-week kid trial.
- **Key claims / decisions / dates:**
  - 44 numbered decisions (D1–D44).
  - D12 carries an explicit 2026-04-16 clarification about kids global leaderboard.
  - Pricing: Verity $3.99/mo or $39.99/yr, Verity Pro $9.99/mo or $99.99/yr, Verity Family $14.99/mo or $149.99/yr, Verity Family XL $19.99/mo or $199.99/yr.
  - Family XL = up to 2 adults + up to 4 kids; Family = up to 2 adults + up to 2 kids.
  - D40 frozen-profile mechanic; resubscription restores everything.
  - D44 one kid trial per account ever, 1 week.
  - "More decisions to be added as discussion continues." trailer.
- **Cross-references:** Implicit only — referenced by FEATURE_LEDGER, F-tracks, and gates throughout. No explicit `[link]` references.
- **Status:** Current. Carries owner-locked product decisions (referenced as `D<N>` across the codebase). No supersede markers.
- **Concerns:** D33 "expert back-channel visible to experts/editors/admins/owners only" — CHANGELOG.md notes that `Superadmins` was dropped from the list in `docs/reference/Verity_Post_Design_Decisions.md` (which is *this* file post-move). This decision file is stable but D22 ("Category Supervisor — Name TBD") and D15 "Article Context tag name TBD" remain open. Pricing in D42 also lives in `web/src/lib/plans.js`/DB — single-source-of-truth concern (CLAUDE.md says config should live in DB). Possible drift if either side changes.

### Reference/parity/README.md
- **Purpose:** Index for the three sibling parity docs.
- **Topics:** Pointer to Shared.md / iOS-Only.md / Web-Only.md and what each covers.
- **Key claims / decisions / dates:**
  - "Last refreshed: 2026-04-16 (Pass 2 Task 28 — refreshed from live code ground truth; Pass 3 Task 33 re-homed each file here from its former standalone parent directory)."
  - References `../04-Ops/PROJECT_STATUS.md` §5 as the cross-platform parity matrix source.
- **Cross-references:** `./Shared.md`, `./iOS-Only.md`, `./Web-Only.md`, `../04-Ops/PROJECT_STATUS.md`.
- **Status:** Stale (refresh-date 2026-04-16; predates 2026-04-21 reorg).
- **Concerns:** `../04-Ops/PROJECT_STATUS.md` does not exist after the reorg; the chain to derive the parity tables is broken. Refers to live code paths under `site/src/` and `VerityPost/VerityPost/` whereas the web tree is now `web/src/`.

### Reference/parity/Shared.md
- **Purpose:** Page-mapping table: feature → web URL on `localhost:3333` ↔ iOS Swift file.
- **Topics:** ~21 rows of shared screens (Home, Welcome, Login, Signup, Forgot/Reset Password, Verify Email, Article Detail, Leaderboard, Profile self/public, Bookmarks, Messages, Alerts, Settings, Subscription, Recap, Expert Queue, Kids Mode, Family Dashboard, Per-Kid Dashboard); note that iOS uses 3-tab bar inside `KidViews.swift`, web uses three separate routes; note re Swift source-of-truth lives at `VerityPost/VerityPost/`; mention that an old `Shared/app/` folder has been removed.
- **Key claims / decisions / dates:**
  - Localhost dev port specified as `3333`.
  - Kid mode iOS = 3 tabs in KidViews.swift; Web = `/kids`, `/kids/leaderboard`, `/kids/profile`.
- **Cross-references:** Each row links a localhost URL to a Swift file by name; references `KidViews.swift`, `FamilyViews.swift`, `HomeView.swift`, etc.
- **Status:** Stale — the localhost port in CLAUDE.md/dev guidance is `3000` (`web/`), not `3333`. Architecture has moved: kids product is now its own `VerityPostKids/` app; CLAUDE.md says "Kids has no web surface" so the `/kids/*`, `/kids/leaderboard`, `/kids/profile` rows are wrong (they redirect now). `KidViews.swift` referenced in adult app may not exist anymore (kid mode removed from VerityPost on 2026-04-19 per CLAUDE.md).
- **Concerns:** Strong contradiction with CLAUDE.md ("`/kids/*` on the web redirects authed users to `/profile/kids`") and "kid mode removed 2026-04-19". Whole table needs rebuild.

### Reference/parity/Web-Only.md
- **Purpose:** Routes that exist only on web (no iOS equivalent).
- **Topics:** Auth pages (`/signup/pick-username`, `/signup/expert`, `/auth/callback`, `/logout`); profile sub-pages (`/profile/activity`, `/profile/card`, `/profile/contact`, `/profile/milestones`, `/profile/kids`, `/profile/{id}`, `/card/{username}`); profile settings (12 sub-routes); content pages (`/category/{id}`, `/search`, `/browse`, `/create-post`, `/recap/{id}`, `/kids/leaderboard`, `/kids/profile`, `/kids/expert-sessions/*`); static/legal pages; admin pages (~38 listed under `/admin/*`).
- **Key claims / decisions / dates:**
  - Lists `/admin/newsroom`, `/admin/pipeline/{runs,costs,settings}`, `/admin/kids-story-manager`.
  - Admin section starts with "Admin Pages (web-only by design)".
  - Localhost port `3333` again.
- **Cross-references:** `/admin/...` routes; implicit refs to `D32` (paid-only profile card).
- **Status:** Mostly current at the route-name level (admin routes match what STATUS.md/CLAUDE.md describe), but the `/kids/*` rows contradict CLAUDE.md's "kids has no web surface" rule. Localhost port 3333 is wrong.
- **Concerns:** Same /kids/* drift as Shared.md. `/create-post` page may no longer exist (not referenced in CLAUDE.md repo tree). Should re-verify against live code.

### Reference/parity/iOS-Only.md
- **Purpose:** Files that exist only in iOS (no web equivalent).
- **Topics:** App-entry/routing files (VerityPostApp.swift, ContentView.swift); Services (AuthViewModel, SupabaseManager, SettingsService, StoreManager, Keychain, Models, Theme, Log); Push notifications (PushPermission, PushPromptSheet, PushRegistration); Internal view helpers (HomeFeedSlots, ProfileSubViews, TTSPlayer).
- **Key claims / decisions / dates:**
  - StoreManager handles "8 subscription product IDs per D42".
  - SettingsService has 60-second TTL.
  - PushRegistration upserts via `upsert_user_push_token` RPC.
  - TTSPlayer wraps AVSpeechSynthesizer for D17.
  - Theme.swift is "Color palette + shared SwiftUI components".
- **Cross-references:** `D17`, `D42`, `upsert_user_push_token` RPC.
- **Status:** Mostly current at file-name level, though omits new files referenced in CLAUDE.md (e.g. `KidsAppLauncher.swift`, `PermissionService.swift`, `Theme.swift` is mentioned but `Theme.swift` lives only in adult app vs `KidsTheme.swift` in kids — no kids files acknowledged here at all). Predates the kids-app split.
- **Concerns:** Talks only about `VerityPost/VerityPost/` (adult). The kids app `VerityPostKids/` is missing entirely. Should be split or extended to cover both iOS targets.

### Reference/runbooks/CUTOVER.md
- **Purpose:** Production-cutover runbook — ordered, idempotent or rollback-able steps.
- **Topics:** §0 Prerequisites (8 owner items #1–#8 from `/TODO.md`); §1 Backup prod (Supabase point-in-time + pg_dump fallback); §2 Apply unapplied migrations (`for f in schema/1[0-9][0-9]_*.sql; do psql -f $f`); §3 Run preflight (`scripts/preflight.js` exit 0); §4 Deploy web (`vercel --prod`, Ignored Build Step on by default); §5 Post-deploy smoke (TBD — replacement walkthrough needed); §6 Monitor 24h (Supabase webhook_log/notifications, Vercel Sentry); §7 Rollback (kill switch via `feature_flags.is_enabled = false WHERE key = 'v2_live'`, full revert via pg_dump restore + `vercel rollback`).
- **Key claims / decisions / dates:**
  - References "/TODO.md §OWNER" items #1..#8 by number.
  - 9 Vercel crons total (per preflight).
  - Old `docs/runbooks/TEST_WALKTHROUGH.md` retired 2026-04-21 to `Archived/_retired-2026-04-21/`.
  - Smoke section is TBD.
  - Kill switch is `v2_live` feature flag.
- **Cross-references:** `/TODO.md` (does not exist post-reorg), `schema/NNN_*.sql`, `scripts/preflight.js`, `Archived/2026-04-20-consolidation/CUTOVER.md.old`, `Archived/_retired-2026-04-21/TEST_WALKTHROUGH.md`, `feature_flags` table.
- **Status:** Partly current. Mechanics (backup, migration loop, vercel deploy, kill switch, rollback) are right. Cross-refs to `/TODO.md` are stale. Smoke section openly TBD.
- **Concerns:** §0 prerequisites reference the retired `/TODO.md` numbering. §5 explicitly TBD. No mention of MASTER_TRIAGE_2026-04-23.md as the new tracker. No mention of pg_cron migration owner action listed in CLAUDE.md / OWNER_TODO.

### Reference/runbooks/ROTATE_SECRETS.md
- **Purpose:** One-shot secret rotation checklist tied to Fresh Audit finding F-001 (env file with live secrets found on disk).
- **Topics:** Why rotate (web/.env.local with 4,261 bytes plaintext, last modified 2026-04-17 06:49); ordered rotation: (1) SUPABASE_SERVICE_ROLE_KEY, (2) STRIPE_SECRET_KEY, (3) STRIPE_WEBHOOK_SECRET, (4) other secrets (RESEND_API_KEY, OPENAI_API_KEY, APNS_AUTH_KEY, CRON_SECRET, any *_SECRET/*_KEY/*_TOKEN/*_PASSWORD); after-rotation tasks (delete env file, create web/.env.example, ensure .gitignore covers `.env*` + `web/.env.*`, grep sb_secret/sk_live/whsec_); detection/monitoring; owner sign-off checklist.
- **Key claims / decisions / dates:**
  - F-001 audit finding; live secrets in `web/.env.local` mtime 2026-04-17 06:49.
  - Stripe one-time 12h overlap on key roll.
  - 32-byte CRON_SECRET via `node -e "...randomBytes(32)..."`.
  - Mentions `site/.env.example` in the sign-off (folder no longer exists; should be `web/.env.example`).
- **Cross-references:** Vercel env panel; Supabase dashboard API page; Stripe dashboard webhooks; Apple Developer keys; `web/.env.local`; `web/.env.example`; `site/.env.example` (stale).
- **Status:** Reads like a one-shot sign-off, never marked done. The owner checklist boxes at the bottom are unchecked. Project memory notes `web/.env.local` rotation is owner-side; cannot tell if completed.
- **Concerns:** §"After rotation" item 6 references `site/.env.example` instead of `web/.env.example` — internal inconsistency (the doc itself uses `web/.env.example` in step 2 but `site/.env.example` in the sign-off). Sign-off boxes unchecked — verify whether owner already executed this rotation.

### Reference/education_site_sources_1.xlsx
- **Purpose:** XLSX data file (binary). Cannot be read as text in this audit.
- **Topics:** Inferred from filename: a list of "education site sources" — likely candidate sources for the kids-app or expert-vetting pipeline (sources like Mayo Clinic, NASA, etc. fit D35 sponsored-quiz rationale). Not enumerable here.
- **Key claims / decisions / dates:**
  - File mtime: Apr 13 11:10 (predates the 2026-04-19 hardening sprint and the 2026-04-21 reorg).
  - File size: 21,315 bytes.
- **Cross-references:** None located in the textual docs in this zone (no `education_site_sources_1` reference appears in any of the other Reference/* files).
- **Status:** Orphan-looking. No textual doc in the Reference zone refers to it; not picked up by README, FEATURE_LEDGER, PM_ROLE, STATUS, or CLAUDE. May be a stranded research artifact.
- **Concerns:** Drift candidate. Either should be referenced by a doc explaining its role (where it feeds the pipeline / curation / vetting), moved out of `Reference/` into `Archived/`, or removed.

## Within-zone duplicates / overlap

- **STATUS.md vs README.md** — both claim to be the orientation doc. README.md still says "Start here: STATUS.md and WORKING.md" but `WORKING.md` no longer exists (per CLAUDE.md/STATUS.md). STATUS.md is current; README.md is stale and partially misleading.
- **CLAUDE.md vs PM_ROLE.md** — overlap on architecture, sources of truth, the lib layer, and the quality bar. PM_ROLE.md has a precedence clause ("PM_ROLE.md wins" on role/scope). The two stay coherent because they cover different scopes (PM = orchestration; CLAUDE = behavior + repo facts), but there's repeated description of architecture/auth/scoring traps that could drift independently.
- **CHANGELOG.md vs FEATURE_LEDGER.md** — both record what shipped. CHANGELOG.md is dated entry log (granular, single-day 2026-04-20 only); FEATURE_LEDGER.md is feature-by-feature rollup (last updated 2026-04-18). Both predate MASTER_TRIAGE_2026-04-23.md, which CLAUDE.md and STATUS.md now treat as canonical for "what shipped."
- **CLAUDE.md repo-tree vs PM_ROLE.md repo-tree** — both render an ASCII repo tree. PM_ROLE has the post-2026-04-21 reorg shape; CLAUDE.md also has the post-reorg shape; neither matches README.md's pre-reorg description. Two trees in two docs is a duplicate-source-of-truth problem.
- **Permissions matrix path** — same canonical path repeated in CLAUDE.md, PM_ROLE.md, STATUS.md (3 sites): `/Users/veritypost/Desktop/verity post/permissions.xlsx` with the space caveat. Consistent across the three but redundant.
- **Apple identifiers (Service ID, App IDs, Team ID)** — listed in ROTATIONS.md verbatim; relied on implicitly by the Apple-block items in CLAUDE.md. Single-source in ROTATIONS, but no doc explicitly declares ROTATIONS the canonical home for those IDs, so risk of someone adding them again elsewhere.
- **Parity docs Shared/Web-Only/iOS-Only** — overlap with CLAUDE.md repo tree (which describes the Swift files of the iOS apps and the web app routes). Both purport to map the surface area; parity docs are stale (port 3333, kids-mode-on-web, single iOS app), CLAUDE.md is current.

## Within-zone obvious staleness

- **README.md** — references `WORKING.md`, `docs/`, `test-data/`, migration range "005–094", admin `@admin-verified` LOCK, "kids iOS doesn't exist yet — see VerityPostKids/README.md". All five points are out of date (WORKING.md never created, docs/ folder retired in 2026-04-21 reorg, migrations now go to 177, admin-verified marker dropped 2026-04-23, VerityPostKids is an active app per CLAUDE.md/STATUS.md/FEATURE_LEDGER).
- **CHANGELOG.md** — only has the 2026-04-20 entry; nothing for 2026-04-21 reorg, 2026-04-22 newsroom redesign (`b269e17`), 2026-04-23 home-page rebuild + parity pass + MASTER_TRIAGE creation, 2026-04-24 audit, 2026-04-25 bug-hunt + E2E test infra. Five sessions of activity unrecorded.
- **FEATURE_LEDGER.md** — refers to `site/src/...` paths everywhere (folder deleted), `05-Working/PERMISSION_MIGRATION.md` (folder retired), `@admin-verified` markers (dropped 2026-04-23), and severity-tagged follow-ups whose status is now tracked in MASTER_TRIAGE. Last-updated 2026-04-18.
- **parity/README.md** — references `../04-Ops/PROJECT_STATUS.md` which doesn't exist post-reorg.
- **parity/Shared.md** — localhost port `3333` (should be 3000); `/kids` rows describe a kids surface on web that no longer exists (web is adult-only, kids redirects); `KidViews.swift` reference predates the kids-app split.
- **parity/Web-Only.md** — same `localhost:3333`; lists `/kids/leaderboard`, `/kids/profile`, `/kids/expert-sessions` as live web routes — contradicts CLAUDE.md "kids has no web surface".
- **parity/iOS-Only.md** — covers only `VerityPost/`, omits `VerityPostKids/` entirely.
- **runbooks/CUTOVER.md** — references `/TODO.md §OWNER` (file retired); §5 Post-deploy smoke is TBD; archived-path references go to `Archived/2026-04-20-consolidation/` and `Archived/_retired-2026-04-21/` which is fine but confirms the doc was last seriously edited mid-April.
- **runbooks/ROTATE_SECRETS.md** — internal inconsistency (`site/.env.example` in the sign-off vs `web/.env.example` in step 2). Sign-off boxes unchecked; cannot tell whether the rotation was ever completed.
- **education_site_sources_1.xlsx** — orphan binary; no textual doc references it.
- **PM_ROLE.md supersede note** — points to `FIX_SESSION_1.md` as the canonical tracker, but newer docs (CLAUDE.md, STATUS.md) have moved it on to `MASTER_TRIAGE_2026-04-23.md`.

## Notable claims worth verifying in later waves

1. **Migration 106 application status.** CHANGELOG.md says it was "NOT YET APPLIED" to live DB. Five sessions and ~5 days have passed; live DB state should be re-checked.
2. **schema/106 + 107 numbering collision.** PM_ROLE.md says `schema/107_seed_rss_feeds.sql` was "renamed from prior `105_` prefix collision". Verify file name on disk and migration log.
3. **schema/105_remove_superadmin_role.sql applied in live DB but the on-disk numbering vs the renamed `107_seed_rss_feeds.sql` raises a question of whether 105 was applied twice.** PM_ROLE table marks 105 / 106 / 107 / 108 / 109 / 110 / 111 all "Applied" except 109 ("Rolled back by 111"); CHANGELOG says 105 already-live before 2026-04-20.
4. **928 active permissions / perms_global_version=4409.** FEATURE_LEDGER snapshot from 2026-04-19; STATUS.md still says 928 active on 2026-04-25. Has the count moved? Verify against live DB.
5. **Apple Developer account state.** ROTATIONS.md tracks Team ID FQCAS829U7, Service ID, App IDs, P8 paths, last rotated 2026-04-23. CLAUDE.md says "owner does not yet have an Apple Developer account." These conflict; project memory `project_apple_console_walkthrough_pending.md` says owner DOES have a dev account but the bundle-ID walkthrough is deferred. Reconcile across docs.
6. **`scripts/generate-apple-client-secret.js`.** Referenced in ROTATIONS.md as the rotation tool; verify it exists.
7. **`/admin` 404 for non-staff.** CHANGELOG.md says `/admin` middleware was reverted from `PROTECTED_PREFIXES` and the layout returns `notFound()`; verify against `web/src/middleware.js` + `web/src/app/admin/layout.tsx`.
8. **`scripts/seed-test-accounts.js` retired vs still referenced.** STATUS.md says retired; PM_ROLE.md says retired 2026-04-21 to `Archived/_retired-2026-04-21/`. Verify file is absent on disk and no remaining references in `scripts/preflight.js` etc.
9. **`web/.env.local` rotation completion.** ROTATE_SECRETS.md sign-off unchecked. Is the env file still present plaintext? Has the owner rotated SUPABASE_SERVICE_ROLE_KEY / Stripe live + webhook?
10. **`v2_live` feature flag.** CUTOVER.md uses it as the kill switch. CLAUDE.md mentions `featureFlags.js` (`isV2Live`, `v2LiveGuard`, "fails closed now"). Verify the flag still exists in `feature_flags` table and the guard wraps the right routes.
11. **`kid_profiles` guard trigger parity.** 08-scoring-system-reference.md flags this as missing (parity with schema/083). Verify whether it has been added in any of the post-2026-04-19 schema migrations.
12. **`reconcile_category_scores()`.** Same as above — flagged missing in 08-scoring-system-reference.md; verify whether it has been added.
13. **F6-measurement-and-ads-masterplan.md §5 stale (rolls-back-schema/109 design).** PM_ROLE.md flags this; verify whether the doc has been rewritten.
14. **D33 expert back-channel "Superadmins removed from list" carried into Reference/Verity_Post_Design_Decisions.md.** Verify D33 in this file does not list superadmins.
15. **Home page rebuild claims (STATUS.md).** "1 hero (32pt serif) + up to 7 supporting (22pt serif), masthead, browse-all-categories link, schema/144_articles_hero_pick.sql"; verify against the live `web/src/app/page.tsx` and schema/144.
16. **AI pipeline F7 newsroom redesign commit `b269e17` (STATUS.md).** Verify commit exists in `git log`.
17. **E2E test counts (STATUS.md).** "480+ tests, 468 passing, 14 known flakes, 14 intentional skips, 9 iOS smoke tests." Verify by running the suites or counting in `web/tests/e2e/`.
18. **Husky location `web/.husky/`.** CLAUDE.md and STATUS.md both insist on this location; verify no `.husky/` at repo root.
19. **`Reference/education_site_sources_1.xlsx`.** Determine whether it should be referenced from a doc, moved, or deleted.
20. **PM_ROLE.md §3 must-read list contains `Current Projects/FIX_SESSION_1.md`.** Per CLAUDE.md / STATUS.md the file is retired; verify whether it still exists or has been moved/archived.
