# AuditV1 — Final Synthesis

**Closed:** 2026-04-25.
**Sessions:** 1-10 complete (Reference / Current Projects / Audit_2026-04-24 / Future+Unconfirmed+Completed / Sessions / Archived / Root+scripts+supabase / web / iOS / schema).
**Methodology:** every file in scope opened and read end-to-end (per the owner directive "Slow down. … I want every file opened and read."). Findings split into per-session overlap maps with a confident bucket, inconsistent bucket, open questions, and cross-zone hooks. This synthesis collapses the 10 session docs into one cleanup brief.

**Companion:** A parallel `AuditV2/` audit was authored 2026-04-25 ~20:42 by the owner via a parallel-fleet methodology. Per owner direction, the two audits are kept separate. Where AuditV2 corroborates an AuditV1 finding, the AuditV2 ID is cited for cross-reference; AuditV1 findings unique to this audit are noted as such.

---

## How to use this document

- **§1 Confident bucket** — items where the action is clear. Sorted by surface (docs / code / DB / config / process). Each item is one cleanup that an engineer could execute in a single sitting.
- **§2 Inconsistent bucket** — items where the project itself is inconsistent and an owner decision is needed before any cleanup. Each item is framed as: "X says A; Y says B; pick one or document why both."
- **§3 Open questions** — owner-direction items, no recommendation.
- **§4 Cross-zone hook table** — status of every threaded contradiction.
- **§5 Priority sequencing** — the 4-tier execution order (P0 launch-blockers / P1 ship-soon / P2 hygiene / P3 polish).
- **§6 AuditV2 cross-reference appendix** — where AuditV1 and AuditV2 overlap, where each is unique.

---

## §1 — Confident bucket

### A. Documentation (Reference/, CLAUDE.md, Current Projects/, etc.)

**A-1.** `Reference/CLAUDE.md` carries 4 stale claims:
- Apple-block paragraph (lines 35-39 per AuditV2): account active 2026-04-23. **Update.**
- Repo-tree comment "FALLBACK_CATEGORIES hardcode still there in `web/src/app/page.tsx`" — **0 hits.** Delete.
- Repo-tree comment "ParentalGate has zero callers (T-tbd)" — **4 live `.parentalGate(...)` callers** verified Session 9 (ProfileView × 2, ExpertSessionsView, PairCodeView). Delete.
- Repo-tree mention of "23 rules-of-hooks disables" — actual count is 25 in app/{recap,welcome,u}/. Update.
- Repo-tree comment listing `schema/100_backfill_admin_rank_rpcs_*.sql` — file lives in `Archived/`, `schema/` starts at 101. Update.
- "the 3800-line settings page" — file is now 5247 lines. Update or remove the size annotation.
- (Sessions 1, 5, 6, 7, 8, 9 + AuditV2 §2.A all flag CLAUDE.md drift)

**A-2.** `Reference/README.md` — references nonexistent `WORKING.md` at root, retired `docs/`+`test-data/`, says "kids iOS doesn't exist yet" (false — `VerityPostKids/` shipped 2026-04-19), cites retired `@admin-verified` rule, migration range 005-094 (live: 177). **Rewrite or retire.** (Session 1 + AuditV2 §2.A)

**A-3.** `Reference/FEATURE_LEDGER.md` (mtime 2026-04-18) — references deleted `site/` paths, retired `05-Working/`, retired `@admin-verified`, possibly outdated `perms_global_version=4409`. **Rewrite.** (Session 1 + AuditV2 §2.A)

**A-4.** `Reference/parity/{Shared,Web-Only,iOS-Only}.md` — localhost:3333 (actual 3000), `/kids/*` on web treated as real surface (actual: redirect-only), references removed `KidViews.swift`, no acknowledgement of `VerityPostKids/`. **Rewrite.** (Session 1 + AuditV2 §2.A)

**A-5.** `Reference/runbooks/CUTOVER.md` — cross-refs retired `/TODO.md §OWNER`; §5 smoke openly TBD; cites archived `TEST_WALKTHROUGH`. **Fix §5 OR mark whole runbook as historical.** (Session 1 + AuditV2 §2.A)

**A-6.** `Current Projects/APP_STORE_METADATA.md` — uses retired `site/src/...` paths in 5+ places, cross-refs retired `00-Where-We-Stand/`, `00-Reference/`, `test-data/`. **App Store submission depends on it.** (Session 2 + AuditV2 §2.B P0)

**A-7.** `Current Projects/PM_PUNCHLIST_2026-04-24.md:60` — claims `tsconfig 'strict':false`. Verified false; `tsconfig.json:7` is **`"strict": true`**. (Session 1, 5, 8 + AuditV2 §2.B + W3-summary)

**A-8.** `Current Projects/PRELAUNCH_UI_CHANGE.md` Part 5 vs §3.13 internal contradiction — Part 5 says schema stays; §3.13 proposes `articles.illustration_url`. **Reconcile.** (Session 2 + AuditV2 §2.B)

**A-9.** `Current Projects/F7-pipeline-restructure.md` — ~60% superseded by `F7-DECISIONS-LOCKED.md`. **Mark superseded; archive.** (Session 2 + AuditV2 §2.B)

**A-10.** `Current Projects/F2-reading-receipt.md` — silently dropped by `PRELAUNCH_UI_CHANGE_2026-04-25` (no cross-reference). **Add explicit retirement note.** (Session 2 + AuditV2 §2.B)

**A-11.** `Current Projects/F5-ads-gameplan.md` — 8 unanswered owner decisions in §1; superseded by F6. **Mark superseded.** (Session 2 + AuditV2 §2.B)

**A-12.** `Current Projects/F6 §5 Scoring system` — describes the rolled-back schema/109 design; live ledger is `score_events` from schema/022. **Rewrite §5 or redirect to `Reference/08-scoring-system-reference.md`.** (Session 2 + AuditV2 §2.B + Session 10 T7)

**A-13.** `Current Projects/F7-PM-LAUNCH-PROMPT.md` — references migrations 105-111, retired `@admin-verified` markers, mismatched phased plan. **Update or archive.** (Session 2 + AuditV2 §2.B)

**A-14.** `Current Projects/Audit_2026-04-24/review external audit` and `review external audit-review` are extensionless 190KB+ markdown files. **Rename to add `.md` extension.** (Session 3, AuditV2 §2.A — also flagged in `99.Organized Folder/Proposed Tree`)

**A-15.** `Current Projects/Audit_2026-04-24/_RECONCILER_BRIEFING.md` references `/root/.claude/plans/` and `/home/user/site/` paths — external-agent paths from outside this filesystem. **Annotate as historical / external-agent transcript.** (Session 3 + AuditV2 §2.C)

**A-16.** Future Projects files reference deleted strategy docs `04_TRUST_INFRASTRUCTURE.md` + `17_REFUSAL_LIST.md`. Affected: `views/web_login_signup.md`, `views/web_leaderboard.md`, `views/web_notifications.md`, `views/web_welcome_marketing.md`, `views/ios_adult_alerts.md`, `db/05_defection_links_table.md`. **Either restore the deleted strategy docs (per owner I-1 below) OR strip the dependency lines from the 6+ docs that cite them.** (Session 4 + AuditV2 §2.D + U1)

**A-17.** Future Projects `db/00_INDEX.md` — says latest migration is `20260420020544`; live schema/ has 169 numbered migrations through 177. **Rewrite or delete.** (Session 4 + AuditV2 §2.D)

**A-18.** Future Projects `24_AI_PIPELINE_PROMPTS.md` — refers to `web/src/lib/editorial-guide.js`; actual is `web/src/lib/pipeline/editorial-guide.ts`. **Fix path or archive.** (Session 4 + AuditV2 §2.D)

**A-19.** Future Projects `views/00_INDEX.md:51` + `db/00_INDEX.md:41` + `08_DESIGN_TOKENS.md:19` — reference retired `@admin-verified` marker. **Sweep.** (Session 4 + AuditV2 §2.D + C24)

**A-20.** Future Projects `views/00_INDEX.md` says "Kids iOS (8 files)" but enumerates 9 (`ios_kids_pair`, `_home_greeting`, `_reader`, `_quiz`, `_streak`, `_badges`, `_leaderboard`, `_profile`, `_expert`). **Fix the count.** (Session 4)

**A-21.** Future Projects `mockups/web-home.html` and `web-home-standalone.html` are byte-identical; standalone variant not referenced in `mockups/README.md`. **Delete the standalone duplicate.** (Session 4)

**A-22.** Unconfirmed Projects/ — `product-roadmap.md` (1443 lines, 2026-04-19) wholly superseded by `Future Projects/18_ROADMAP.md`; `UI_IMPROVEMENTS.md` partially superseded by Future Projects. **Archive both** (Session 4 + AuditV2 §2.E).

**A-23.** Completed Projects/ — `CATEGORY_FIXES.md`, `FINAL_WIRING_LOG.md`, `MIGRATION_PAGE_MAP.md` all use retired `site/src/` paths. **Move to `Archived/`** (Session 4).

**A-24.** Sessions/04-21-2026/Session 1/`NEW_TREE_STRUCTURE_2026-04-21.md` — empty 3-line placeholder. **Delete.** (Session 5)

**A-25.** Sessions/04-23-2026/Session 1/`ADMIN_VERIFIED_RECONCILE.md` — documents 77 marker-bumps that were both based on a hallucinated premise (per OWNER_QUESTIONS §6.4 in the same folder) AND superseded same day by drop-the-marker directive. **Annotate at top with "SUPERSEDED 2026-04-23".** (Session 5)

**A-26.** Sessions/04-21-2026/Session 1/`APPLE_REVIEW_NAV_CHANGES_REVERT_GUIDE.md` — `Status: ACTIVE` but trigger (Apple Dev approval) fired 2026-04-23. **Either action the revert or update status to "REVERT-PENDING (deferred to launch day)".** (Session 5)

**A-27.** Sessions/04-22-2026/Session 1/`F7_SMOKE_TEST_RUNBOOK.md` — missing the "verify GRANTs match RLS policies" step that the 04-25 bug-hunt surfaced. **Add a Phase 0.5 step.** (Session 5)

**A-28.** Sessions/04-23-2026/Session 1/ — no `SESSION_LOG_<DATE>.md`. Author flagged the gap in NEXT_SESSION_HANDOFF and never circled back. **Either rename `NEXT_SESSION_HANDOFF.md` to `SESSION_LOG_2026-04-23.md` or create a stub log pointing at existing artifacts.** (Session 5)

**A-29.** 3 audit artifacts in Sessions/04-21-2026/Session 1/ (`REMAINING_ITEMS_RELATIONSHIP_MAP`, `KILL_SWITCH_INVENTORY`, `ADMIN_ROUTE_COMPLIANCE_AUDIT`) reference retired `FIX_SESSION_1.md` numbering. **Add a "Status note 2026-04-25" header to each pointing at MASTER_TRIAGE.** (Session 5)

**A-30.** Sessions/04-21-2026/Session 2/`REVIEW_UNRESOLVED_2026-04-21.md` M46 — doc says "Owner adjudicates"; memory says "resolved as keep-and-refresh". **Append a RESOLVED entry mirroring M26/M37/M39 pattern.** (Session 5)

**A-31.** `Archived/2026-04-18-admin-lockdown/_README.md` line 11 — claims `@admin-verified` markers are live. **Annotate as superseded 2026-04-23.** (Session 6)

**A-32.** `Archived/obsolete-snapshots/_README.md` lines 3 + 13 — references nonexistent `/WORKING.md` at root. **Update reference or remove the line.** (Session 6)

**A-33.** `Archived/2026-04-20-consolidation/FUTURE_DEDICATED_KIDS_APP.md` — says "Unified app is launch-ready". Decision was reversed; kids forked into `VerityPostKids/`. **Annotate at top with "Status flipped 2026-04-19".** (Session 6)

**A-34.** `Archived/restructure-2026-04-19/structure-synthesis.md` — 3-architect repo reorg "Status: Ready for owner review. Nothing executed yet" — never adopted. **Annotate as "Not adopted".** (Session 6)

**A-35.** `VerityPost/VerityPost/REVIEW.md` — 400-line 2026-04-19 UI/UX audit. Some items shipped (per Session 5 SHIPPED commits) but REVIEW isn't annotated; cross-references files like `KidViews.swift` that no longer exist. **Annotate per-item ship state OR mark whole file historical + create a new REVIEW for outstanding work.** (Session 9)

### B. Code (web/src/, VerityPost/, VerityPostKids/)

**B-1.** `web/src/lib/auth.js:201` and `web/src/lib/permissions.js:207` both export `hasPermissionServer` with different RPC backends (compute_effective_perms vs has_permission). **Rename one (per AuditV2 D1: `permissions.js` → `hasPermissionClient`).** Walk callers. (Session 8 + AuditV2 D1)

**B-2.** `web/src/lib/adminMutation.ts:138-155` `recordAdminAction` does not pass `p_ip` / `p_user_agent`. The docstring at lines 84-88 explicitly flags this as a follow-up. **Wire it through.** (Session 5 + Session 8 + AuditV2 C8)

**B-3.** `web/src/lib/plans.js` lines 12-100 hardcode TIER_ORDER + TIERS + PRICING. The same file lines 145+ ship DB-backed cached helpers. **Finish the migration: replace const reads at call sites with `getPlans()` + `getPlanLimit()` + `getPlanByName()`.** (Session 8 + AuditV2 C23 + L12)

**B-4.** `web/src/lib/permissions.js` `hasPermissionServer` (line 207) and `auth.js` `hasPermissionServer` (line 201) — after B-1 rename, **audit which one each call site uses** to confirm semantics match intent.

**B-5.** Adult `VerityPost/VerityPost/VerityPost.entitlements` — missing `aps-environment` (push registration silently broken — `PushRegistration.swift` calls `registerForRemoteNotifications` but no entitlement). **Add entitlement.** Apple-block now actionable. (Session 9 + AuditV2 C4 P0)

**B-6.** Adult entitlements — missing `com.apple.developer.associated-domains` (`applinks:veritypost.com`) — Universal Links open in Safari instead of app. **Add.** Apple-block now actionable. (Session 9 + AuditV2 C36)

**B-7.** Kids `VerityPostKids/VerityPostKids/VerityPostKids.entitlements` — `aps-environment=development`. **Flip to `production` for App Store builds.** (Session 9 + AuditV2 C37)

**B-8.** Both `Assets.xcassets/AppIcon.appiconset/` contain only `Contents.json` — no PNG files. **Generate icon set; App Store rejects builds without icons.** (Session 9 + AuditV2 C5 P0)

**B-9.** `VerityPost/project.yml:30` excludes only `**/.DS_Store`. The 7 mockup files in `VerityPost/VerityPost/possibleChanges/` (HTML/JSX/MD) will ship as Resources in the .app bundle. **Add `possibleChanges/**` to excludes.** (Session 9 + AuditV2 C42)

**B-10.** `VerityPost/VerityPost/KidsAppLauncher.swift:19` fallback URL `https://veritypost.com/kids-app` — Apple-block for "real App Store URL". Apple now active; **swap once kids app is published.** (Session 9 + AuditV2 C43)

**B-11.** `web/src/components/kids/OpenKidsAppButton.tsx:3` — `// TODO: swap to real App Store URL once app is published`. Same Apple-block as B-10; **pair the swap.** (Session 9 + AuditV2 C43)

**B-12.** `VerityPost/VerityPost/HomeFeedSlots.swift` and `Keychain.swift` — orphans (no callers across the codebase). **Delete or document why retained.** (Session 9 + AuditV2 C40)

**B-13.** `VerityPostKids/VerityPostKids/KidsAppRoot.swift:199` hardcodes `biasedSpotted: false`; the corresponding branch in `KidsAppState.swift:203` is unreachable. **Wire bias-spotting from quiz answers OR delete the dead branch.** (Session 9 + AuditV2 C11) — also affects `BadgeUnlockScene` reachability.

**B-14.** Both `Info.plist` `CFBundleVersion=1` (never bumped). **Establish bump pattern (manual / agvtool / CI).** (Session 9 + AuditV2 C41)

**B-15.** Per Session 8 grep, 1 `@admin-verified` marker line remains: `web/src/app/admin/pipeline/runs/page.tsx`. **Sweep per AuditV2 C24.** (Session 8 + AuditV2 C24)

**B-16.** `web/src/components/JsonLd.tsx` references `/icon.svg`; file does not exist in `web/public/`. Either drop the asset OR fix the reference. (Session 8 + AuditV2 C44)

**B-17.** `web/public/` is bare except `ads.txt`. **Generate favicon set + drop in `public/`** (or wire App Router `icon.tsx` + `apple-icon.tsx` route handlers). (Session 8 + AuditV2 C44)

**B-18.** `.env.example` lines 52-56 — `APNS_BUNDLE_ID` + `APNS_TOPIC` both naming the same bundle. **Pick one, remove the other.** (Session 8 + AuditV2 C34)

### C. DB / schema/

**C-1.** `schema/170_ext_audit_cc2_cccs2_cccs5.sql` `cleanup_rate_limit_events` references nonexistent column `occurred_at`; correct column is `created_at`. **P0 — function errors on every invocation.** Author `schema/178_fix_cleanup_rate_limit_events_column.sql` with CREATE OR REPLACE. (Session 10 + AuditV2 C1 P0)

**C-2.** `schema/092`, `schema/093`, `schema/100` missing on disk. SQL bodies live in `Archived/2026-04-19-prelaunch-sprint/round_a_migration.sql`, `round_b_migration.sql`, and `Archived/100_backfill_admin_rank_rpcs_2026_04_19.sql`. **Move/copy them to `schema/` to fix DR replay.** Live RPCs (`require_outranks`, `caller_can_assign_role`) have zero on-disk source. (Session 6 + Session 10 + AuditV2 C2)

**C-3.** `schema/127_rollback_126_newsroom_redesign.sql` lines 24-26 — uses obsolete `pipeline.manage_*` perm keys; live keys are `admin.pipeline.<noun>.<verb>`. **Edit in place OR write `schema/179_corrected_127_rollback.sql`.** (Session 10 + AuditV2 C7)

**C-4.** `schema/012_phase4_quiz_helpers.sql` — `user_passed_article_quiz` hardcodes `>= 3`; no `quiz.unlock_threshold` setting. Asymmetric with kids (`schema/162` is DB-driven). **Add setting + parameterize the RPC.** (Session 10 + AuditV2 C13)

**C-5.** 8 RPC bodies still reference `superadmin` role per AuditV2 C6 (pg_proc query). **Dump bodies + author CREATE OR REPLACE migration.** (Session 10 + AuditV2 C6)

**C-6.** `schema/snapshots/snapshot-2026-04-18-pre-perms-import.sql` is 0 bytes. **Populate or delete.** (Session 10)

**C-7.** Schema gaps 001-004, 007-008, 052 — **owner-decision required** to backfill or document as expected pre-numbered-convention bootstrap. (Session 10 + AuditV2 §2.C/2.D — DR replay item)

**C-8.** Rollback discipline drops at migration 150 (no paired rollbacks for 150-177). **Document policy or backfill.** (Session 10)

### D. Config / scripts / supabase

**D-1.** `.gitignore:13-15` — references retired `site/.env*` patterns. **Delete the 3 lines.** (Session 7 + AuditV2 §2.F)

**D-2.** `.gitignore:57` ignores `.mcp.json` even though file is committed at root. **Owner-decision: drop the gitignore line OR `git rm --cached .mcp.json`.** (Session 7 + AuditV2 §2.F)

**D-3.** `README.md` is a 2-line "deploy nudge" file. Either replace with a proper repo README OR document the deploy-nudge function (it's used to force Vercel rebuilds). (Session 7)

**D-4.** `scripts/smoke-v2.js:24` — references `'..', 'site'` (renamed `web/` 2026-04-20). **Fix the path or retire the script.** (Session 7 + AuditV2 §2.F)

**D-5.** `scripts/import-permissions.js:304` — calls non-existent RPC `bump_global_perms_version`; falls through to writing `version: 999` sentinel before "safer direct bump". **Either create the RPC OR remove the broken call.** (Session 7 + AuditV2 C3 P0)

**D-6.** `scripts/import-permissions.js:156-184` — hardcodes `roleToSets` + `planToSets` mappings in JS. CLAUDE.md "DB is the default". **Move to DB.** (Session 7 + AuditV2 D2)

**D-7.** `scripts/dev-reset-all-passwords.js` — zero prod-safety guards. **Add project-ref allowlist + interactive confirmation prompt.** (Session 7 + AuditV2 §2.F P1)

**D-8.** `scripts/stripe-sandbox-restore.sql:3` — references `site/.env.local` (now `web/.env.local`). 1-line fix. (Session 7)

**D-9.** `scripts/check-admin-routes.js` exists but isn't wired into CI. **Wire into CI to catch admin-route drift automatically.** (Session 7 + Session 8)

**D-10.** `99.Organized Folder/Proposed Tree` — file lacks `.md` extension; folder name is unusual (`99.Organized Folder/`). **Rename the file to `Proposed_Tree.md` and consider moving into AuditV1/ or merging into the synthesis.** (Session 7)

### E. Tests / process

**E-1.** Adult app `#if false` blocks: 5 in AlertsView (lines 645/682/711/741/777) + 1 in StoryDetailView (line 1907) — kid-mode chrome + expert Q&A panel. **Surface in KILL_SWITCH_INVENTORY review pre-launch.** (Session 9)

**E-2.** Web KILL_SWITCH_INVENTORY remaining: `LAUNCH_HIDE_RECAP=true` (recap page), `LAUNCH_HIDE_ANON_INTERSTITIAL=true` (story page), 3× `{false && ...}` in story page (mobile tab bar, mobile timeline, desktop timeline), `PUBLIC_PROFILE_ENABLED=false` (u/[username]), `manageSubscriptionsEnabled=false` (AlertsView). **Owner pre-launch flip-order needed.** `SHOW_BOTTOM_NAV` already flipped on. (Session 5 + Session 8 + Session 9 — CZ-G)

---

## §2 — Inconsistent bucket (project-level decisions needed)

**I-1.** **Charter retired-but-still-cited.** `Future Projects/views/web_welcome_marketing.md` enumerates 8 new public trust/editorial pages (`/standards`, `/corrections`, `/editorial-charter`, `/editorial-log`, `/refusals`, `/masthead`, `/archive/[date]`, `/recent`) as "new pages to build". `Future Projects/views/00_INDEX.md` says these were "Removed from scope in the 2026-04-21 Charter update". `Future Projects/db/03_corrections_table.md` + `db/06_trust_events_table.md` are explicitly DEFERRED. Multiple iOS Settings views still link to `/standards`+`/corrections`. **Owner-decision: cut all of it (per Charter commitment 4) OR resurrect the 4 retired strategy docs and ship the pages.** (Session 4 + AuditV2 U1)

**I-2.** **F7 docs vs shipped pipeline.** `Future Projects/24_AI_PIPELINE_PROMPTS.md` V4 proposes a different prompt-version system than what shipped per `F7-DECISIONS-LOCKED.md` Phase 4. The shipped pipeline (web/src/lib/pipeline/editorial-guide.ts, 13-file directory) is canonical. V4 doc is exploratory. **Owner-decision: V4 = next-cycle iteration, or stale-superseded?** (Sessions 2/3/4/5/6/7/8/10 + AuditV2 D9 + C25)

**I-3.** **F7-DECISIONS-LOCKED Decision 8 vs §5 line 348.** Decision 8 says "patches wrong correct_index"; §5 says "throw-and-regenerate for safety." Internal contradiction in the same doc. (Session 2 + AuditV2 C25)

**I-4.** **Pricing is not locked.** `Future Projects/02_PRICING_RESET.md` and `views/ios_adult_subscription.md` reference Option A vs Option B without an owner-locked decision. App Store Connect product IDs are de-facto truth. **Owner-locked decision needed.** (Session 4)

**I-5.** **Story-manager fate.** `web/src/app/admin/story-manager/page.tsx` (1229 LOC) vs `admin/articles/[id]/{review,edit}` F7 surfaces — both routable. **Owner-decision: keep parallel admin or deprecate legacy.** (AuditV2 D5 + U2)

**I-6.** **Kid story-manager.** `web/src/app/admin/kids-story-manager/page.tsx` (1037 LOC) near-duplicate of story-manager. **Owner-decision: merge with `?kid=true` toggle or keep parallel.** (AuditV2 D6 + U3)

**I-7.** **Admin permission-gate inconsistency** — 3 patterns coexist across admin pages: hardcoded `'owner'||'admin'` literals (6 pages: access/analytics/feeds/notifications/subscriptions/system), role-set membership (~30 pages), `hasPermission` resolver (canonical, partial). Audit log writes also split: server-owned, client-side `record_admin_action`, direct supabase mutations bypassing audit. **Establish canonical, migrate everywhere.** (AuditV2 C21 + C22)

**I-8.** **`hasPermissionServer` dual-export** — both `auth.js:201` and `permissions.js:207` export the same name with different semantics. (See B-1 + B-4. Inconsistent until rename + caller sweep complete.) (Session 8)

**I-9.** **`lib/plans.js` half-DB-half-hardcoded.** Mid-migration is dangerous. (See B-3.) (Session 8)

**I-10.** **Adult quiz threshold hardcoded; kids DB-driven.** Two parallel implementations of the same product behavior under different governance. (See C-4.) (Session 10)

**I-11.** **AuditV1 vs AuditV2.** Per owner: "they are both separate things." Both audits surface overlapping findings (~70% overlap based on cross-checks). The two stacks of recommendations are not merged. **Owner-decision after acting on each: archive one, both, or neither.** Default per AuditV2 U20 + this doc's §6: leave both.

**I-12.** **Future Projects chronology gap.** `Sessions/04-21-2026/Session 1/SESSION_LOG_2026-04-21.md:50` describes dissolving an 8-doc `Future Projects/`. Same session's NEXT_SESSION_PROMPT flagged as a "contradiction" because the folder reappeared. Current state: `Future Projects/` is a 24-doc panel-driven set dated 2026-04-21. The chronology of the 8-doc → 24-doc transition isn't captured anywhere in the Sessions logs. **Owner-direction needed: was this an intentional re-creation, an out-of-band tool action, or owner-direct authoring?** (Session 5 + Session 6)

**I-13.** **Per-session NEXT_SESSION_PROMPT files never archived to `_superseded/`.** Sessions/04-21-2026/Session 1 + 2 + 04-22-2026 etc. each carry a NEXT_SESSION_PROMPT that's been superseded by the next session's variant; only 04-22-2026 used `_superseded/` convention. **Establish convention.** (Session 5)

**I-14.** **`.mcp.json` committed AND gitignored.** Either commit and remove gitignore, or untrack via `git rm --cached`. (See D-2.) (Session 7)

**I-15.** **iOS entitlements split inconsistently.** Adult has `applesignin` only; Kids has `aps-environment` + `associated-domains` only. Each app has half the entitlements it needs. (See B-5/B-6/B-7.) (Session 9)

---

## §3 — Open questions (owner direction)

**Q-1.** Adopt `99.Organized Folder/Proposed Tree`'s numbered-prefix reorg of `Current Projects/` (`00-LIVE/` / `10-LAUNCH-PACKETS/` / `20-FEATURES/` / `30-AUDITS/`)? Concrete answer to Sessions 2+3 inconsistencies but reorgs feel risky mid-launch.

**Q-2.** Apply CLAUDE.md drift fixes (A-1) one-shot or cycle by cycle?

**Q-3.** Patch retired-path references inside historical session logs (`site/`, `01-Schema/`, `05-Working/`, `docs/`, `proposedideas/`, `Ongoing Projects/`, `test-data/`) or leave period-correct?

**Q-4.** Charter trust-page surfaces (I-1) — cut or resurrect?

**Q-5.** Story-manager fate (I-5) + Kids-story-manager (I-6) — owner direction.

**Q-6.** Schema gaps 001-004 / 007-008 / 052 — backfill from live DB DDL or document as expected bootstrap gap?

**Q-7.** F7-DECISIONS-LOCKED Decision 8 contradiction (I-3) — pick one.

**Q-8.** Adult quiz threshold (C-4) — add `settings.quiz.unlock_threshold` now or wait until threshold needs to change?

**Q-9.** Apple Day-1 entitlements bundle (B-5/B-6/B-7) — flip all at once or sequence?

**Q-10.** REVIEW.md (A-35) — keep, annotate per-item, or retire?

**Q-11.** `possibleChanges/` (B-9) — purge from app bundle, or move out of source tree entirely?

**Q-12.** `BadgeUnlockScene` (B-13) — wire bias-spotting OR delete dead branch?

**Q-13.** `verity_family_annual` + `verity_family_xl` plans `is_active=false` in DB — intentional or oversight? (AuditV2 U5)

**Q-14.** `AuditV2/` and `AuditV1/` archival — once both acted on, archive both? (AuditV2 U20 + this doc's §6)

---

## §4 — Cross-zone hook resolution table

| Hook | Description | Final status |
|---|---|---|
| **CZ-A** | F7 V4 prompts vs F7-DECISIONS-LOCKED shipped | **Owner-call** (I-2) |
| **CZ-B** | Reference/STATUS.md vs Unconfirmed Projects/product-roadmap.md | Resolved by A-22 (archive product-roadmap) |
| **CZ-C** | Multiple views/* declare deps on deleted strategy docs | Captured A-16 (sweep) |
| **CZ-D** | `front_page_state` vs `articles.hero_pick_for_date` bridge | **RESOLVED** Session 8: bridge active per page.tsx:17-19 comment; front_page_state table not yet shipped |
| **CZ-E** | Completed Projects vs Archived overlap | Resolved by A-23 (move Completed → Archived) |
| **CZ-F** | Future Projects 8-doc → 24-doc chronology | **Owner-call** (I-12) |
| **CZ-G** | KILL_SWITCH_INVENTORY 11 items | **RESOLVED**: 1 flipped (`SHOW_BOTTOM_NAV`); 5 web-side still hidden (E-2); 6 iOS-side findings (E-1, B-7, B-10, B-13) |
| **CZ-H** | ADMIN_ROUTE_COMPLIANCE 52/75 routes failing | **Partial** — spot-checks compliant; full re-run via D-9 (CI wiring) |
| **CZ-I** | TODO_2026-04-21.md unchecked items | **Defer** to a focused TODO sweep (cross-reference with MASTER_TRIAGE) |
| **CZ-J** | 2026-04-18 PERMISSIONS_AUDIT vs current PERMISSIONS_DECISIONS.md | Resolved Session 6 (PERMISSIONS_DECISIONS canonical; archived audit is historical seed) |
| **CZ-K** | PROFILE_FULL_FLOW promotion | **Owner-call** (AuditV2 U9) |
| **CZ-L** | AuditV2 P0 runtime bugs (cleanup_rate_limit_events, schema/092/093/100, import-permissions RPC) | **RESOLVED** in Session 10 — all three verified at the source level. Captured C-1, C-2, D-5 |
| **CZ-M** | Proposed Tree adoption requires CLAUDE.md rewrite | **Owner-call** (Q-1) |
| **CZ-N** | hasPermissionServer dual-export | Captured B-1 (rename) |
| **CZ-O** | lib/plans.js half-migrated | Captured B-3 (finish migration) |
| **CZ-P** | iOS app version bump pattern | Captured B-14 (establish bump) |
| **CZ-Q** | Schema gaps backfill plan | **Owner-call** (Q-6) |

---

## §5 — Priority sequencing (an execution order)

### Tier P0 — Launch-blockers (do this week)

1. **Fix `cleanup_rate_limit_events` column bug** (C-1) — write `schema/178`. RPC errors on every call; rate_limit_events at 8k+ rows growing unbounded.
2. **Recreate admin-rank RPCs in repo** (C-2) — move/copy the 3 archived files into `schema/` so DR replay reproduces. Live RPCs have no on-disk source.
3. **Fix `scripts/import-permissions.js` broken RPC call** (D-5) — either create `bump_global_perms_version` or rewrite to use `bump_user_perms_version` per-user. Currently writes a sentinel `999` value.
4. **APP_STORE_METADATA.md path fix** (A-6) — replace 11+ `site/` references. App Store submission depends on it.
5. **Adult `aps-environment` entitlement + `associated-domains`** (B-5, B-6) — push registration silently broken; Universal Links don't work. Apple-block now actionable.
6. **Generate AppIcon set both apps** (B-8) — App Store rejects builds without icons.
7. **CLAUDE.md drift sweep** (A-1) — Apple-block paragraph + 4 stale repo-tree comments.
8. **Add rate limit to `/api/comments/[id]/report`** (per AuditV2 C9) — sister `/api/reports` already has 10/hr.
9. **Verify MASTER_TRIAGE items 1-9 still in code; ship fixes** (per AuditV2 C14-C20).

### Tier P1 — Ship-soon (next week)

10. **`recordAdminAction` pass `p_ip`/`p_user_agent`** (B-2) — close DA-119 gap.
11. **Strip `superadmin` from 8 RPC bodies** (C-5) — write `schema/180`.
12. **Fix schema/127 rollback perm-key bug** (C-3) — write `schema/179`.
13. **Migrate 6 admin pages from `'owner'||'admin'` literals to `hasPermission`** (I-7).
14. **Replace `lib/plans.js` hardcodes with cached DB helper** (B-3).
15. **Sweep doc-side `@admin-verified` residuals** — A-19 (Future Projects) + B-15 (page.tsx) + AuditV2 C24's full list of 7.
16. **Fix `views/00_INDEX.md` count** (A-20) + delete duplicate mockup file (A-21).
17. **Make iOS `KidsAppState.completeQuiz` async + reconcile from server** (per AuditV2 C10).
18. **Decide bias-spotting fate** (B-13 / Q-12).
19. **Mark refuted Wave A/B audit findings** in MASTER_TRIAGE (per AuditV2 Sprint 2 #18).
20. **Move 15 STALE items in MASTER_TRIAGE to "Resolved-as-Stale" section.**
21. **Reference/README.md + FEATURE_LEDGER.md + parity/* rewrites** (A-2, A-3, A-4).
22. **Reference/runbooks/CUTOVER.md §5 fix** (A-5).
23. **Sweep retired `FIX_SESSION_1` numbering in Sessions/04-21-2026 audits** (A-29).
24. **Append M46 RESOLVED entry** (A-30).
25. **A-25 + A-26 + A-27 + A-28** — Session-folder cleanups.

### Tier P2 — Hygiene (within 2 weeks)

26. **Apple Day-1 entitlements bundle: applesignin on kids; flip kids aps-environment to production** (B-7, Q-9).
27. **Create AASA file at `/.well-known/apple-app-site-association`** (per AuditV2 C36).
28. **Establish CFBundleVersion bump pattern** (B-14).
29. **Fix `APNS_BUNDLE_ID` vs `APNS_TOPIC` env-var mismatch** (B-18).
30. **Replace App Store URL placeholders post-publish** (B-10, B-11).
31. **Archive `Future Projects/F7-pipeline-restructure.md`** (A-9).
32. **Add retirement notes to F2/F5** (A-10, A-11).
33. **Fix `Future Projects/db/00_INDEX.md` migration count** (A-17).
34. **Resolve F7-DECISIONS-LOCKED Decision 8 vs §5 contradiction** (I-3 / Q-7).
35. **Resolve PRELAUNCH Part 5 vs §3.13 contradiction** (A-8).
36. **Audit which F7 tables need SELECT grant** (continuation of schema/177).
37. **Migrate ~30 admin role-set pages to `hasPermission`** (continuation of I-7).
38. **Owner decision Q-4** (Charter resurrect/cut).
39. **Owner decision Q-5** (story-manager + kids-story-manager merge).
40. **Owner decision Q-13** (`verity_family*` plans is_active).
41. **Mass-edit 6+ Charter-citing docs** (after Q-4).
42. **Archive `Unconfirmed Projects/`** (A-22).
43. **Resolve `.gitignore` `site/.env*` + `.mcp.json`** (D-1, D-2).
44. **Delete 5 confirmed orphan components** (per AuditV2 C45).
45. **Archive 7 dev-only HTML/JSX mockups in `VerityPost/possibleChanges/`** (B-9).
46. **Sweep BUCKET5_TRACKER stale "queued" entries.**
47. **47 NOTIFICATION_DIGEST lens findings** (per AuditV2 U7).
48. **15 O-DESIGN-* + Tiers A-D items** vs PRELAUNCH_UI_CHANGE (per AuditV2 U8).
49. **Fix `scripts/smoke-v2.js`** (D-4).
50. **`scripts/dev-reset-all-passwords.js` prod guards** (D-7).
51. **Wire `scripts/check-admin-routes.js` into CI** (D-9).

### Tier P3 — Cleanup

52. **Bulk-migrate `components/admin/*.jsx` (26 files) to `.tsx`** (per AuditV2 C28).
53. **Establish "no new .js" ESLint rule** (per AuditV2 C29).
54. **Sweep code-comment `site/` references (5 files)** (per AuditV2 C30).
55. **Bulk-migrate 33 layout/loading/error JS shims to TS.**
56. **Promote `PROFILE_FULL_FLOW.md` to `Reference/` if useful** (Q-K).
57. **Archive AuditV1 + AuditV2 once acted on** (Q-14).
58. **Add concurrency comment to webhook + iOS sync routes.**
59. **Resolve `lib/rlsErrorHandler.js` client-semantics question** (per AuditV2 U11).
60. **Delete empty `schema/snapshots/snapshot-2026-04-18-pre-perms-import.sql`** (C-6).
61. **Backfill schema gaps 001-004, 007-008, 052** if owner direction (Q-6).
62. **Document rollback policy post-150** (C-8).

---

## §6 — AuditV1 ↔ AuditV2 cross-reference

Per owner direction "they are both separate things", this is a reference table only — no recommendation to merge.

### Findings unique to AuditV1 (DB-state-blind, doc-deep)

- A-26 APPLE_REVIEW_NAV_CHANGES_REVERT_GUIDE Status:ACTIVE drift
- A-27 F7_SMOKE_TEST_RUNBOOK missing GRANT step
- A-28 Sessions/04-23-2026 missing SESSION_LOG file
- A-24 NEW_TREE_STRUCTURE empty placeholder
- A-25 ADMIN_VERIFIED_RECONCILE undone same day
- A-29 / A-30 / A-31 / A-32 / A-33 / A-34 — Archived/ + Sessions/ doc drift
- I-12 / Q-1 / Q-2 / Q-3 / Q-10 — process-level open questions
- I-13 / I-14 — convention-level inconsistencies
- A-21 byte-identical mockup duplicate

### Findings unique to AuditV2 (DB-state-aware, broad sweep)

- C-1 cleanup_rate_limit_events column bug (P0) — AuditV2 first surfaced; AuditV1 confirmed at source level
- C-2 schema/092/093/100 missing on disk (AuditV1 also surfaced from doc-side; AuditV2 verified live RPC sources)
- C-5 superadmin role still in 8 RPC bodies (live pg_proc check)
- DB-state findings about `verity_family_annual + family_xl` is_active=false
- Refutations: Wave A "35 tables missing RLS" (live: only `events` parent intentional); L08-001 kid RLS blocks writes (RLS verified correct); Wave B `/api/access-request` no auth (route is 410 stub); Wave B `registerIfPermitted` never called (function doesn't exist); Wave B `handlePaymentSucceeded missing perms_version bump` (verified wired at line 846)
- 4-sprint priority sequencing template

### Findings present in both

- A-1 CLAUDE.md drift (multiple sub-items)
- A-2 / A-3 / A-4 / A-5 Reference doc drift
- A-6 APP_STORE_METADATA `site/` paths
- A-7 PM_PUNCHLIST tsconfig strict claim
- A-9 / A-10 / A-11 / A-12 / A-13 Current Projects F2-F7 drift
- A-14 / A-15 Audit_2026-04-24 extensionless files + external paths
- A-16 / A-17 / A-18 / A-19 Future Projects deps + indexes
- A-22 / A-23 Unconfirmed + Completed Projects retirement
- B-1 hasPermissionServer dual-export
- B-2 recordAdminAction missing IP+UA
- B-3 plans.js hardcodes
- B-5 / B-6 / B-7 / B-8 / B-9 / B-10 iOS Apple-block items + bundle hygiene
- B-12 HomeFeedSlots + Keychain orphans
- B-13 BadgeUnlockScene unreachable
- B-14 CFBundleVersion never bumped
- B-15 / A-19 @admin-verified residuals
- B-17 web/public bare
- B-18 APNS_BUNDLE_ID vs APNS_TOPIC
- C-1 / C-2 / C-3 / C-4 / C-5 / C-7 / C-8 schema items
- D-4 / D-5 / D-6 / D-7 scripts
- D-1 / D-2 .gitignore items
- I-2 F7 V4 vs DECISIONS-LOCKED
- I-7 admin gating inconsistency
- Various MASTER_TRIAGE / Audit_2026-04-24 actions

---

## Closing

Audit complete: 10 sessions, every file in scope opened and read end-to-end. ~67 confident-bucket cleanup items, ~15 inconsistent-bucket owner-decisions, 14 open questions. Cross-zone hooks all resolved or assigned. Where AuditV2 has DB-side findings AuditV1 couldn't reach (cleanup_rate_limit_events, superadmin RPCs, schema gap source recovery), those are surfaced here with AuditV2 IDs cited.

Next steps are the owner's call. The §5 priority list is an execution order, not a deadline.
