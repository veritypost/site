# AuditV1 — Discrepancies & Contradictions

Companion to `OwnerQuestions.md` (which captures owner-decision items). This file inventories every doc-vs-code, doc-vs-doc, doc-vs-current-state, and internal-contradiction I found during AuditV1 sessions 1-10. For each: what each side says, what's actually true, and the resolution path.

Use this to triage: most are 1-line fixes once you've seen them. Group A is highest leverage (CLAUDE.md is the constitution).

---

## A. CLAUDE.md says X; code/state says Y

These are the constitution-vs-reality mismatches. CLAUDE.md is the file every new agent reads first; drift here propagates to every downstream session.

### A-1. Apple Developer account
- **CLAUDE.md says (lines 35-39):** "the owner does not yet have an Apple Developer account."
- **Memory says:** account approved 2026-04-23 (per `Sessions/04-23-2026/Session 1/OWNER_QUESTIONS.md §3.1` "DONE 2026-04-23").
- **Resolution:** rewrite the Apple-block paragraph; mark dev-account-active.

### A-2. FALLBACK_CATEGORIES hardcode
- **CLAUDE.md says (repo tree comment):** `web/src/app/page.tsx` "FALLBACK_CATEGORIES hardcode still there — tracked in MASTER_TRIAGE_2026-04-23.md".
- **Code says:** `grep -c FALLBACK_CATEGORIES web/src/app/page.tsx` = **0**. The hardcode is gone.
- **Resolution:** delete the comment.

### A-3. ParentalGate "zero callers"
- **CLAUDE.md says (repo tree comment):** "ParentalGateModal.swift COPPA gate — defined, zero callers (T-tbd)".
- **Code says:** **4 live callers** verified via grep:
  - `VerityPostKids/VerityPostKids/ProfileView.swift:48` (unpair gate)
  - `VerityPostKids/VerityPostKids/ProfileView.swift:51` (legal-links gate)
  - `VerityPostKids/VerityPostKids/ExpertSessionsView.swift:85` (parent gate)
  - `VerityPostKids/VerityPostKids/PairCodeView.swift:143` (mail composer help gate)
- **Already corrected once:** Sessions/04-23-2026/Session 1/OWNER_QUESTIONS.md §4.3 caught the wrong "zero callers" claim. The audit got fixed; CLAUDE.md never did.
- **Resolution:** delete the claim from CLAUDE.md tree.

### A-4. Rules-of-hooks disable count
- **CLAUDE.md says:** "23 rules-of-hooks disables".
- **Code says:** **25 disables** in `app/{recap, welcome, u}/`.
- **Resolution:** update count + locations.

### A-5. Settings page line count
- **CLAUDE.md says:** "the 3800-line settings page".
- **Code says:** `web/src/app/profile/settings/page.tsx` is **5247 lines**.
- **Resolution:** update or remove the size annotation; it grows.

### A-6. schema/100_backfill location
- **CLAUDE.md says (repo tree):** `schema/100_backfill_admin_rank_rpcs_*.sql` exists in `schema/`.
- **Filesystem says:** `schema/` starts at 101. The file lives at `Archived/100_backfill_admin_rank_rpcs_2026_04_19.sql` instead.
- **Resolution:** either move the file back into `schema/` (preserves DR replay) or fix the CLAUDE.md tree entry.

### A-7. Counts of admin routes / pages / API
- **CLAUDE.md tree says (under web/src/app/admin/...):** "highest blast radius". (No specific count claim, but Session 5's ADMIN_ROUTE_COMPLIANCE_AUDIT_2026-04-21.md cites "75 admin mutation routes".)
- **Code says today:** 87 admin route files; 46 admin pages; 200 total API routes.
- **Resolution:** if any doc cites the older counts, update.

### A-8. @admin-verified marker rule (already fixed in CLAUDE.md but still in archived docs)
- **CLAUDE.md says (current):** "Admin code = highest blast radius. Every change runs the 6-agent ship pattern. No exceptions, no special markers."
- **`Archived/2026-04-18-admin-lockdown/_README.md` line 11 says:** "Admin files still carry the `@admin-verified` marker in the live repo — the lock is real and enforced by convention".
- **Memory says:** marker dropped 2026-04-23 (`feedback_admin_marker_dropped.md`).
- **Resolution:** annotate the archived README as historical (the marker dropped 2026-04-23).

---

## B. Doc says X; another doc says NOT-X (cross-doc contradictions)

### B-1. Trust-page surfaces (largest contradiction in the project)
- **`Future Projects/views/web_welcome_marketing.md` says:** ship 8 new public pages: `/standards`, `/corrections`, `/editorial-charter`, `/editorial-log`, `/refusals`, `/masthead`, `/archive/[date]`, `/recent`.
- **`Future Projects/views/00_INDEX.md` says (line 54):** "Standards / refusals / corrections / masthead public pages — Removed from scope in the 2026-04-21 Charter update."
- **`Future Projects/db/03_corrections_table.md` says:** DEFERRED.
- **`Future Projects/db/06_trust_events_table.md` says:** DEFERRED.
- **Multiple iOS Settings views still link to:** `/standards`, `/corrections`, `/refusals`, `/editorial-log`.
- **Resolution:** owner picks (OwnerQuestions.md Q1).

### B-2. F7 Decision 8 vs §5
- **`Current Projects/F7-DECISIONS-LOCKED.md` Decision 8 says:** "patches wrong correct_index".
- **Same file §5 line 348 says:** "throw-and-regenerate for safety".
- **Internal contradiction in same doc.**
- **Resolution:** owner picks (OwnerQuestions.md Q5).

### B-3. PRELAUNCH_UI_CHANGE.md Part 5 vs §3.13
- **Part 5 says:** schema stays the same.
- **§3.13 says:** add new `articles.illustration_url` column.
- **Internal contradiction in same doc.**
- **Resolution:** owner picks (OwnerQuestions.md Q6).

### B-4. M46 status drift
- **`Sessions/04-21-2026/Session 2/REVIEW_UNRESOLVED_2026-04-21.md` M46 says:** "Deadlocked twice (2/2 on first 4-agent round, 2/2 again on fresh retry) — Owner adjudicates."
- **Memory `MEMORY.md` index entry says:** "M46 memory-pattern deadlock resolved as keep-and-refresh".
- **The on-disk artifact wasn't updated when memory was.**
- **Resolution:** append a `RESOLVED` entry to REVIEW_UNRESOLVED_2026-04-21.md mirroring the M26/M37/M39 pattern.

### B-5. ADMIN_VERIFIED_RECONCILE same-folder contradiction
- **`Sessions/04-23-2026/Session 1/ADMIN_VERIFIED_RECONCILE.md` says:** 77 `@admin-verified` markers BUMPED to 2026-04-23.
- **`Sessions/04-23-2026/Session 1/OWNER_QUESTIONS.md §6.4` (same folder) says:** "VOID. premise was hallucinated. Verified via `git log --since=2026-04-23 --name-only` that **zero** `admin/` paths were touched in this session's 10-commit ship. 52 files in the codebase carry the marker (not 77); none were edited today. No bumps were ever pending."
- **Same OWNER_QUESTIONS §7 says:** owner directive — drop the marker entirely.
- **Two artifacts in the same folder asserting opposite truths about the same work.**
- **Resolution:** annotate ADMIN_VERIFIED_RECONCILE at top with "SUPERSEDED 2026-04-23".

### B-6. APPLE_REVIEW_NAV_CHANGES_REVERT_GUIDE Status
- **Doc says:** `Status: ACTIVE — test changes in place until Apple Developer verification completes`.
- **Reality:** Apple Dev approved 2026-04-23 (per OWNER_QUESTIONS §3.1).
- **Subsequent sessions:** no SHIPPED block on a "revert Apple-review nav" item in MASTER_TRIAGE.
- **Resolution:** either action the revert (flip 3 launch-gate flags + unhide RecapCard) and update status to "REVERT-COMPLETE", OR annotate as "REVERT-PENDING (Apple approved 2026-04-23; deferred to launch day)".

### B-7. F2 reading-receipt status
- **`Current Projects/F2-reading-receipt.md` (mtime 2026-04-20) says:** active feature spec.
- **`Current Projects/PRELAUNCH_UI_CHANGE_2026-04-25.md` says:** silently dropped F2.
- **No cross-reference between them.**
- **Resolution:** add explicit retirement note to F2.

### B-8. F1-F4 vs PRELAUNCH
- **F1-F4 specs (mtime 2026-04-20) say:** active feature specs.
- **PRELAUNCH_UI_CHANGE.md §3.1 conflicts with F4.**
- **PRELAUNCH §3.2 absorbs F3 with no cross-reference either direction.**
- **Resolution:** retire F1+F4 (or reframe); add credit to PRELAUNCH for F3 absorption.

### B-9. Future Projects 8-doc → 24-doc chronology gap
- **`Sessions/04-21-2026/Session 1/SESSION_LOG_2026-04-21.md:50` says:** "Dissolved `Future Projects/` folder; moved 7 design docs into `Current Projects/` with `F1-` through `F7-` prefixes".
- **Same session's `NEXT_SESSION_PROMPT.md` "Contradictions / loose ends" says:** "`Future Projects/` folder at repo root exists with 8 strategy docs (`00_CHARTER.md` through `07_KIDS_DECISION.md`) ... 2026-04-21 reorg commit `974cefd` describes dissolving that folder. Either it was re-created (by owner or a tool), never fully dissolved, or appeared during this session outside PM visibility. Not resolved in Session 1."
- **Today (per AuditV1 Session 4):** `Future Projects/` is a fully-fleshed 24-strategy-doc panel-driven set with `db/` + `views/` + `mockups/` subfolders.
- **The chronology of how the folder went 8 → 24 isn't captured in any session log.**
- **Resolution:** owner clarification needed (OwnerQuestions.md Q24).

### B-10. Folder dissolution events vs current existence
- **`Archived/_retired-2026-04-21/future-projects-README.md`** is the OLD 8-doc README (matches `01-08` proposedideas naming pattern).
- **`Future Projects/README.md`** (live) is the 24-doc panel-driven version.
- **Two file sets are entirely disjoint — same folder name at different points in time.**
- **Resolution:** annotate the archived README as the prior version (predates the panel run).

### B-11. FUTURE_DEDICATED_KIDS_APP says decision was deferred; reality says reversed
- **`Archived/2026-04-20-consolidation/FUTURE_DEDICATED_KIDS_APP.md` says:** "Unified app is launch-ready (feature-verified kids + family_admin tracks)" + "deferred. Parked for post-launch."
- **Reality (2026-04-19):** kids was forked into `VerityPostKids/` per memory `kids_scope.md` and current CLAUDE.md.
- **Resolution:** annotate the archived doc with "Status flipped 2026-04-19 — kids forked into VerityPostKids/."

### B-12. restructure-2026-04-19 "ready for review, nothing executed yet"
- **`Archived/restructure-2026-04-19/structure-synthesis.md` says:** "Status: Ready for owner review. Nothing executed yet."
- **Convergences listed include:** monorepo with pnpm, shared Swift package, `platform/` folder for Supabase migrations.
- **Reality:** none of those landed. Repo uses npm in `web/`, two independent iOS Xcode projects without a shared package, `schema/` at root.
- **Resolution:** annotate doc with "Not adopted. Repo took a different shape."

### B-13. obsolete-snapshots README references retired path
- **`Archived/obsolete-snapshots/_README.md` lines 3 + 13 say:** "For current state see `/STATUS.md` and `/WORKING.md` at repo root."
- **`/STATUS.md` exists** (symlink → Reference/STATUS.md).
- **`/WORKING.md` does NOT exist.** Was retired into `_from-05-Working/2026-04-20-working-md-retired/WORKING.md`.
- **Resolution:** update README reference or remove the line.

### B-14. PM_PUNCHLIST tsconfig claim
- **`Current Projects/PM_PUNCHLIST_2026-04-24.md:60` says:** `tsconfig 'strict':false`.
- **`web/tsconfig.json:7` says:** `"strict": true`.
- **Resolution:** fix the line.

### B-15. db/00_INDEX migration count
- **`Future Projects/db/00_INDEX.md` says:** latest migration `20260420020544`.
- **`schema/` reality:** 169 numbered migrations through 177.
- **Resolution:** rewrite the INDEX or count from disk.

### B-16. 24_AI_PIPELINE_PROMPTS path
- **`Future Projects/24_AI_PIPELINE_PROMPTS.md` references:** `web/src/lib/editorial-guide.js`.
- **Reality:** file is at `web/src/lib/pipeline/editorial-guide.ts` (renamed + moved into pipeline/ subfolder during F7 Phase 1 Task 1).
- **Resolution:** fix path or archive the V4 doc.

### B-17. views/00_INDEX kids file count
- **`Future Projects/views/00_INDEX.md:38` says:** "Kids iOS (8 files)".
- **Same file enumerates 9** (`ios_kids_pair`, `_home_greeting`, `_reader`, `_quiz`, `_streak`, `_badges`, `_leaderboard`, `_profile`, `_expert`).
- **Filesystem confirms 9.**
- **Resolution:** fix count.

### B-18. db/00_INDEX retired marker reference + retired log location
- **`Future Projects/db/00_INDEX.md:41` says:** "Admin lockdown migrations. Admin is `@admin-verified`".
- **`Future Projects/db/00_INDEX.md:54` says:** "Log shipment in `Current Projects/FIX_SESSION_1.md`".
- **Reality:** marker dropped 2026-04-23; FIX_SESSION_1 absorbed into MASTER_TRIAGE_2026-04-23.
- **Resolution:** fix both lines.

### B-19. CUTOVER.md §5 still TBD
- **`Reference/runbooks/CUTOVER.md`** cross-references retired `/TODO.md §OWNER`; §5 smoke openly TBD; cites archived `TEST_WALKTHROUGH`.
- **Resolution:** fix §5 or mark whole runbook historical.

### B-20. Reference/parity/* localhost port + `/kids/*` framing
- **`Reference/parity/{Shared,Web-Only,iOS-Only}.md` say:** localhost:3333.
- **`web/package.json` says:** `next dev -p 3000`.
- **parity/* treats `/kids/*` on web as a real surface** — actual middleware redirects it.
- **No acknowledgement of `VerityPostKids/`** even though kids forked 2026-04-19.
- **Resolution:** rewrite parity/*.

---

## C. Doc says X; physical filesystem says Y

### C-1. NEW_TREE_STRUCTURE empty placeholder
- **`Sessions/04-21-2026/Session 1/SESSION_LOG_2026-04-21.md` describes:** creating a substantial NEW_TREE_STRUCTURE doc with current-state friction + proposed target tree + 15-item migration plan.
- **`Sessions/04-21-2026/Session 1/NEW_TREE_STRUCTURE_2026-04-21.md` actual contents:** 3 lines: `# New Tree Structure — 2026-04-21\n\n(empty — to be populated)`.
- **Same SESSION_LOG explains:** "Cleared `NEW_TREE_STRUCTURE_2026-04-21.md` to empty scaffold per owner direction."
- **Resolution:** delete the empty file (intent is preserved in SESSION_LOG narrative).

### C-2. Sessions/04-23-2026 missing SESSION_LOG
- **`Sessions/04-23-2026/Session 1/NEXT_SESSION_HANDOFF.md` line 84 says:** "`Sessions/04-23-2026/Session 1/SESSION_LOG_2026-04-23.md` (if it exists yet — may need to create at session close)".
- **Filesystem says:** no `SESSION_LOG_2026-04-23.md` exists.
- **Resolution:** rename `NEXT_SESSION_HANDOFF.md` → `SESSION_LOG_2026-04-23.md` (it serves that role) OR create a stub log.

### C-3. mockups duplicate
- **`Future Projects/mockups/web-home.html` and `web-home-standalone.html`:** byte-identical (`diff` returns no output).
- **`mockups/README.md` only references** `web-home.html`, not the standalone.
- **Permission difference:** standalone is `-rw-------`; others are `-rw-r--r--`.
- **Resolution:** delete the standalone duplicate.

### C-4. Empty schema snapshot
- **`schema/snapshots/snapshot-2026-04-18-pre-perms-import.sql`:** 0 bytes.
- **mtime:** 2026-04-18 11:27 — created at the moment of the perms import per Session 6 finding.
- **Resolution:** populate or delete.

### C-5. Schema gaps on disk
- **Numbered migrations on disk:** 169 files; max number 177.
- **8 gaps:** 001-004, 007-008, 052, 092-093, 100.
- **092 + 093 + 100 documented:** SQL bodies live in `Archived/2026-04-19-prelaunch-sprint/round_a_migration.sql`, `round_b_migration.sql`, and `Archived/100_backfill_admin_rank_rpcs_2026_04_19.sql`. Live RPCs (`require_outranks`, `caller_can_assign_role`) have zero on-disk source.
- **Resolution:** owner direction (OwnerQuestions.md Q15).

### C-6. AppIcon empty in both apps
- **Both `Assets.xcassets/AppIcon.appiconset/`** contain only `Contents.json` — no PNG files.
- **App Store rejects builds without icons.**
- **Resolution:** generate icon set.

### C-7. web/public bare except ads.txt
- **`web/public/`** contains only `ads.txt`.
- **No `robots.txt`, no `sitemap.xml`** (these are served by route handlers `web/src/app/robots.js` + `sitemap.js` — confirmed exist).
- **No favicon files** (`favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon.svg`).
- **`web/src/components/JsonLd.tsx` references** `/icon.svg`. The reference doesn't resolve.
- **Resolution:** drop favicon set in `public/` or wire `app/icon.tsx` + `apple-icon.tsx` route handlers.

### C-8. README.md is a 2-line deploy nudge
- **`README.md` content:** `<!-- deploy nudge 1776896446 -->`.
- **Used to:** force Vercel deploys via dummy commits.
- **Resolution:** either replace with proper README OR document the deploy-nudge function.

### C-9. .mcp.json committed AND gitignored
- **`.gitignore:57`** contains `.mcp.json`.
- **Filesystem says:** `.mcp.json` IS committed at root (mtime 2026-04-21).
- **Resolution:** owner direction (OwnerQuestions.md Q26).

### C-10. .gitignore retired site/ patterns
- **`.gitignore:13-15` says:** `site/.env`, `site/.env.*`, `!site/.env.example`.
- **Reality:** `site/` was renamed to `web/` 2026-04-20.
- **Resolution:** delete the 3 lines.

---

## D. Code-vs-code internal inconsistencies

### D-1. hasPermissionServer dual export, different semantics
- **`web/src/lib/auth.js:201`** exports `hasPermissionServer` (uses `compute_effective_perms` RPC).
- **`web/src/lib/permissions.js:207`** also exports `hasPermissionServer` (uses `has_permission` RPC).
- **Same name, different files, different RPC backend, different semantics.** Caller picks behavior by which file they import from.
- **Resolution:** rename one (per AuditV2 D1: `permissions.js` → `hasPermissionClient`) + walk callers.

### D-2. lib/plans.js half-DB-half-hardcoded
- **`web/src/lib/plans.js` lines 12, 14, 101:** `TIER_ORDER` const, `TIERS` map, `PRICING` map (hardcoded).
- **Same file lines 145+:** ships DB-backed cached helpers (`getPlans`, `getWebVisibleTiers`, `getPlanLimit`, `getPlanLimitValue`, `getPlanByName`, `getPlanById`, `resolveUserTier`).
- **Mid-migration state:** new code can use either path; no enforcement.
- **CLAUDE.md "DB is the default, always" rule** says it should be DB-backed.
- **Resolution:** finish the migration (B-3 in the synthesis).

### D-3. Adult quiz threshold hardcoded; kids DB-driven (asymmetric)
- **`schema/012_phase4_quiz_helpers.sql`** `user_passed_article_quiz` hardcodes `WHERE t.correct_sum >= 3`.
- **Same file:** `submit_quiz_attempt` hardcodes `v_passed := (v_correct >= 3)`.
- **`schema/162_kids_quiz_pass_threshold_pct.sql`:** kids threshold IS DB-driven via `settings.kids.quiz.pass_threshold_pct = 60`.
- **Resolution:** add `settings.quiz.unlock_threshold` + parameterize the adult RPC.

### D-4. Adult entitlements vs kids entitlements (disjoint, both incomplete)
- **Adult `VerityPost.entitlements`:** has `com.apple.developer.applesignin = Default` only.
- **Adult missing:** `aps-environment` (push silently broken), `com.apple.developer.associated-domains` (Universal Links don't open in app).
- **Kids `VerityPostKids.entitlements`:** has `aps-environment = development` + `com.apple.developer.associated-domains = applinks:veritypost.com`.
- **Kids missing:** `applesignin`.
- **Kids has wrong env value:** App Store builds need `production`, not `development`.
- **Two apps' entitlement sets are disjoint and incomplete in different directions.** A single coordinated pass would close both gaps.
- **Resolution:** Apple Day-1 entitlements bundle (OwnerQuestions.md Q16).

### D-5. APNS_BUNDLE_ID vs APNS_TOPIC env mismatch
- **`.env.example` line 52:** `APNS_BUNDLE_ID=com.veritypost.app`.
- **`.env.example` line 56 (commented as override):** `APNS_TOPIC=com.veritypost.app`.
- **Both name the same bundle.** Code in `lib/apns.js` reads one of them; the env var name doesn't match the code.
- **Resolution:** pick one + remove the other.

### D-6. BadgeUnlockScene unreachable
- **`VerityPostKids/VerityPostKids/KidsAppRoot.swift:199`** calls `state.completeQuiz(passed:..., score:..., biasedSpotted: false)` — hardcoded `false`.
- **`VerityPostKids/VerityPostKids/KidsAppState.swift:203`** says `if biasedSpotted { ... enqueue BadgeUnlockScene ... }`.
- **Branch never fires.** Scene is fully implemented but never reached from quiz completion.
- **Resolution:** owner direction (OwnerQuestions.md Q14).

### D-7. CFBundleVersion never bumped
- **Both `Info.plist`:** `CFBundleVersion = 1`.
- **Both `project.yml`:** `CURRENT_PROJECT_VERSION: "1"`.
- **Multiple session-shipped changes** with no version bump tracking.
- **Resolution:** establish bump pattern (OwnerQuestions.md Q18).

### D-8. possibleChanges/ ships in app bundle
- **`VerityPost/project.yml:30-31`** excludes only `**/.DS_Store` from the source walk.
- **`VerityPost/VerityPost/possibleChanges/`** contains 7 mockup files (HTML/JSX/MD).
- **All 7 ship as Resources in the .app bundle.**
- **Resolution:** owner direction (OwnerQuestions.md Q17).

### D-9. KidsAppLauncher fallback URL is a placeholder
- **`VerityPost/VerityPost/KidsAppLauncher.swift:19`** uses `URL(string: "https://veritypost.com/kids-app")`.
- **Comment lines 7 + 13 say:** "swap fallbackURL to a real App Store URL once the kids app ships. Apple-block until dev account active."
- **Apple block now lifted** (account active 2026-04-23).
- **Resolution:** swap once kids app is published.

### D-10. OpenKidsAppButton same TODO
- **`web/src/components/kids/OpenKidsAppButton.tsx:3`** has `// TODO: swap to real App Store URL once app is published`.
- **Pair with D-9.**

### D-11. HomeFeedSlots + Keychain orphans
- **Adult app:** `HomeFeedSlots.swift` and `Keychain.swift` exist.
- **Grep across `VerityPost/VerityPost/`:** zero callers for either.
- **Resolution:** delete or document why retained.

### D-12. AlertsView Manage tab gated off
- **`VerityPost/VerityPost/AlertsView.swift:252`** says `private let manageSubscriptionsEnabled = false`.
- **Comment lines 243-256 say:** "Round 11 P1: the Manage tab used to render category/subcategory/keyword … real `subscription_topics` table + API route ships. Do NOT flip this."
- **Documented intentional hold.** No action needed unless owner wants to ship the table.

### D-13. Adult app `#if false` blocks (6)
- **5 in `AlertsView.swift`** (lines 645, 682, 711, 741, 777).
- **1 in `StoryDetailView.swift:1907`** (likely the expert Q&A panel per AuditV2 C38).
- **Launch-hide pattern** equivalent to web's `{false && ...}`. Memory says keep alive for one-line unhide.

### D-14. Web KILL_SWITCH_INVENTORY remaining (5 still hidden)
- **`web/src/app/recap/page.tsx:41`** `LAUNCH_HIDE_RECAP = true`.
- **`web/src/app/story/[slug]/page.tsx:80`** `LAUNCH_HIDE_ANON_INTERSTITIAL = true`.
- **`web/src/app/story/[slug]/page.tsx:1182`** `{false && !isDesktop && (` (mobile tab bar).
- **`web/src/app/story/[slug]/page.tsx:1552`** `{false && showMobileTimeline && ...}` (mobile timeline).
- **`web/src/app/story/[slug]/page.tsx:1572`** `{false && isDesktop && canViewTimeline}` (desktop timeline).
- **`web/src/app/u/[username]/page.tsx:21`** `PUBLIC_PROFILE_ENABLED = false`.
- **One flipped on:** `web/src/app/NavWrapper.tsx:104` `SHOW_BOTTOM_NAV = true` (was `false`; resolved Session 1 owner-decision).

### D-15. @admin-verified residual in code
- **`web/src/app/admin/pipeline/runs/page.tsx`** still carries a `@admin-verified` marker line per AuditV2 C24.
- **`web/src/middleware.js:256`** also has the string `@admin-verified`, but it's a comment narrative ("Both legacy pages carried @admin-verified markers"), not a marker line.
- **Marker was retired 2026-04-23.**
- **Resolution:** sweep the marker line from `admin/pipeline/runs/page.tsx`.

---

## E. Schema-vs-doc / schema-vs-DB contradictions (some need DB verification)

### E-1. cleanup_rate_limit_events column bug
- **`schema/170_ext_audit_cc2_cccs2_cccs5.sql`** function `cleanup_rate_limit_events` references column `occurred_at`.
- **`reset_and_rebuild_v2.sql:947+`** `rate_limit_events` table has column `created_at` (not `occurred_at`).
- **The error_logs table (schema/030)** has `occurred_at` — the RPC author confused the two tables.
- **AuditV2 W3 reports:** `rate_limit_events` at 8,562 rows growing unbounded.
- **Resolution:** P0 — write `schema/178` with CREATE OR REPLACE pinning `created_at`.

### E-2. schema/127 rollback perm-key form
- **`schema/126`** uses canonical `admin.pipeline.<noun>.<verb>` permission keys (per Session 5 SESSION_LOG_2026-04-22 catch in the migration paste cycle: "`pipeline.manage_*` → `admin.pipeline.<noun>.<verb>`").
- **`schema/127_rollback_126_newsroom_redesign.sql` lines 24-26** still use the obsolete `pipeline.manage_*` form.
- **Result:** rollback DELETE wouldn't match anything; the 3 perms inserted by 126 would survive the rollback.
- **Resolution:** edit-in-place or write `schema/179_corrected_127_rollback.sql` (OwnerQuestions.md Q57 spot-check).

### E-3. schema/109 + 111 self-supersede
- **`schema/109`** introduced parallel `verity_score_events` table + double-credit trigger.
- **`schema/111`** (3 days later) rolled it back.
- **`Future Projects/F6 §5` doc** still describes the rolled-back schema/109 design (`verity_score_events`).
- **Resolution:** rewrite F6 §5 or redirect to `Reference/08-scoring-system-reference.md`.

### E-4. 8 RPC bodies still reference superadmin
- **`schema/105_remove_superadmin_role.sql`** removed the role.
- **`schema/167_ext_audit_cc1_cc7.sql` + `schema/174_ext_audit_rls_six_tables.sql`** are recent migrations that still ship superadmin references.
- **Per AuditV2 C6 (live pg_proc check):** 8 function bodies still reference the role.
- **Resolution:** dump pg_proc, write CREATE OR REPLACE migration to clean them.

### E-5. F2 reading_log table active but UI may be hidden
- **`reading_log` table is actively used** (8 rows per AuditV2 W3).
- **`/api/stories/read`** route is live; admin pages consume it.
- **F2 reading-receipt UI may be hidden** — need to read story page UI gates to confirm.
- **Resolution:** verify (OwnerQuestions.md Q9).

---

## F. Counts / numbers stated by docs that are out of date

### F-1. Counts referenced across docs that are stale today

| Doc | Claim | Reality |
|---|---|---|
| Session 5 / ADMIN_ROUTE_COMPLIANCE_AUDIT_2026-04-21.md | 75 admin mutation routes | 87 admin route files today |
| CLAUDE.md (implicit "40+ admin pages") | 40+ | 46 admin pages today |
| Older audits | "100+ API routes" | 200 total API routes |
| CLAUDE.md "23 rules-of-hooks disables" | 23 | 25 |
| CLAUDE.md "the 3800-line settings page" | 3800 lines | 5247 lines |
| Future Projects/views/00_INDEX.md "Kids iOS (8 files)" | 8 | 9 |
| Older audits | "928 active permissions" | per AuditV2 wave3: 998 DB permission rows |

---

## G. Process-level inconsistencies

### G-1. Per-session NEXT_SESSION_PROMPT files never archived
- **Convention used by 04-22-2026 Session 1:** old prompts moved to `_superseded/`.
- **Other session-folders:** still have NEXT_SESSION_PROMPT.md side-by-side with the next session's variant.
- **Resolution:** establish convention going forward (OwnerQuestions.md Q25).

### G-2. Sessions/04-24-2026/ has both Session 1 + Session 2 with same-named COMPLETED_TASKS
- **Functional, but same-named-files-different-folder pattern complicates grep.**
- **Resolution:** convention notes; no critical fix needed.

### G-3. 3 archived owner-action checklists overlap
- **`_retired-2026-04-21/TODO.md`**, **`2026-04-20-consolidation/DEPLOY_PREP.md`**, **`_from-05-Working/2026-04-20-working-md-retired/WORKING.md`** — all have overlapping owner items, none has a "frozen at <date>; current is X" annotation.
- **Resolution:** annotate each with reference to current canonical location.

### G-4. F7_SMOKE_TEST_RUNBOOK missing the GRANT step
- **Runbook (`Sessions/04-22-2026/Session 1/F7_SMOKE_TEST_RUNBOOK.md`)** walks every smoke check but does not check that 4 F7 tables (`ai_models`, `ai_prompt_overrides`, `kid_articles`, `kid_sources`) have `GRANT SELECT TO authenticated, service_role`.
- **Per `Sessions/04-25-2026/Session 1/BUGS_FIXED_2026-04-25.md`:** missing grant silently broke the Generate button until owner-applied migration 177.
- **Resolution:** add a Phase 0.5 step to the runbook.

### G-5. scripts/check-admin-routes.js exists but never ran in CI
- **Script header says:** "Wire this into CI when there's a CI to wire it into."
- **No CI exists.** Script is a manual lint, not enforced.
- **Resolution:** wire into CI (OwnerQuestions.md Q28).

### G-6. ADMIN_ROUTE_COMPLIANCE_AUDIT 52/75 routes failing — no full re-run
- **Audit (2026-04-21) reported:** 52/75 missing `record_admin_action`, 73/75 missing rate-limit.
- **Subsequent sessions** shipped multiple admin-route improvements but no full re-run measured the new pass rate.
- **Resolution:** OwnerQuestions.md Q28.

### G-7. recordAdminAction acknowledged-but-not-fixed
- **`web/src/lib/adminMutation.ts` lines 84-88 docstring says:** "FOLLOW-UP (not in scope of audit-sweep B-C): recordAdminAction does not yet pass `p_ip` / `p_user_agent` through to the RPC. The underlying SQL function accepts them; extending the helper to capture them from the Request object would close the last DA-119 gap."
- **Lines 138-155** confirm helper still doesn't pass them.
- **Resolution:** wire it through.

### G-8. Test data path drift
- **`scripts/import-permissions.js:23`** comment still says: "Backups were taken 2026-04-18 to test-data/backup-2026-04-18/*.json".
- **Reality:** path is now `Archived/_retired-2026-04-21/test-data/backup-2026-04-18/`.
- **Resolution:** comment-only fix; minor.

### G-9. scripts/stripe-sandbox-restore.sql path
- **Header references:** `site/.env.local`.
- **Reality:** `web/.env.local`.
- **Resolution:** comment-only fix.

### G-10. Rollback discipline drops at migration 150
- **Rollback files exist for every odd N from 111 to 149.**
- **Migrations after 150 don't have paired rollbacks** (newer convention or oversight).
- **Resolution:** owner policy direction.

---

## H. Status-vs-reality on session-shipped items

### H-1. CLAUDE.md tree section is mid-drift
- Multiple stale items in CLAUDE.md repo-tree section (FALLBACK_CATEGORIES, ParentalGate, settings size, schema/100 location). The tree section reads as historical at this point.
- **Resolution:** rewrite the tree section.

### H-2. Bottom-nav decision shipped but not noted in any audit
- **`Sessions/04-21-2026/Session 1/NEXT_SESSION_PROMPT.md` listed as open owner-decision:** "#6 bottom nav direction — `SHOW_BOTTOM_NAV = false` currently. Two-part decision: (1) turn it back on, (2) if yes, what tabs."
- **Reality (verified Session 8):** `SHOW_BOTTOM_NAV = true` at NavWrapper.tsx:104 — flipped on at some point.
- **Resolution:** no fix needed; just note the decision was made.

### H-3. Ship-state drift inside KILL_SWITCH_INVENTORY
- **Inventory dated 2026-04-21** lists 11 launch-hides. Subsequent sessions referenced and worked on individual items but inventory was never updated with current ship state.
- **Resolution:** annotate inventory with 2026-04-25 status per item (OwnerQuestions.md Q48 enumeration request).

### H-4. UI_AUDIT_REVIEW.md (archived)
- **`Archived/_retired-2026-04-21/UI_AUDIT_REVIEW.md`** notes: "**Previous PM's audit was 25% overstated** — 5/20 items were hallucinated, already fixed, or misframed (#19 would've regressed security)."
- **This is the empirical foundation** of the memory rule `feedback_verify_audit_findings_before_acting.md`.
- **Resolution:** no fix; cited correctly.

---

## I. Other low-leverage observations

### I-1. Sessions/ folder name has spaces
- **Convention:** `Session 1`, `Session 2`. Capital S, space, integer.
- **Cost:** every shell reference must quote the path.
- **Documented as-is in Session 5; consistent across all 5 session-days.** No fix recommended.

### I-2. Audit_2026-04-24/ extensionless files
- **`review external audit`** (190KB, no `.md`) and **`review external audit-review`** (22KB, no `.md`).
- **Per `99.Organized Folder/Proposed Tree`:** rename plan exists.
- **Resolution:** rename to `.md` for editor + sort behavior.

### I-3. Audit_2026-04-24/_RECONCILER_BRIEFING.md external paths
- References `/root/.claude/plans/` and `/home/user/site/` — paths from outside this filesystem (external-agent transcript).
- **Resolution:** annotate as external-agent historical artifact.

### I-4. `99.Organized Folder/` folder name
- Unusual — `99.Organized Folder/` with literal period and capital-O space.
- Looks like a temporary in-progress drop, not a final location.
- **Resolution:** rename or move into AuditV1/ as a candidate Session 11 input.

---

## Summary — by category

- **A. CLAUDE.md drift:** 8 items (constitution-vs-reality)
- **B. Cross-doc contradictions:** 20 items (doc-vs-doc)
- **C. Doc-vs-filesystem:** 10 items
- **D. Code-vs-code internal inconsistencies:** 15 items
- **E. Schema-vs-doc / DB:** 5 items (some need DB verification — overlap with AuditV2 P0s)
- **F. Stale counts:** 7 items
- **G. Process-level:** 10 items
- **H. Status drift:** 4 items
- **I. Low-leverage notes:** 4 items

**Total: ~83 discrepancies / contradictions / drift items.**

Most are 1-line fixes. Group A is highest leverage. Groups B + C + D contain the load-bearing contradictions where two sources of truth disagree — those need owner direction (already captured in `OwnerQuestions.md`).
