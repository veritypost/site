# Zone Z09: Archived/ (part 2)

## Summary

68 files across 5 archived sub-directories — all content is historical and explicitly archived. No item describes current behavior; every file is a snapshot of a prior project state, retired blueprint, one-off plan that shipped, or scratch UI prototype. Active docs cite these locations correctly (as "retired 2026-04-21" / "see archive"). No misclassification found. Within-zone duplication is heavy among the obsolete-snapshots (multiple parallel "current state" docs from different dates), and there are predictable overlaps (PRELAUNCH_HOME_SCREEN.md vs scratch-ui/, two q1_card_plan versions, three restructure docs that converged on one synthesis). One notable surprise: `Archived/_retired-2026-04-21/test-data/ACCOUNTS.md` documents 19 test accounts that the owner subsequently wiped from live DB on 2026-04-21 (per `Reference/STATUS.md:89`), so this archived doc still echoes a now-stale truth — but it's archived, so that's correct. The big PERMISSION_MIGRATION.md (1685 lines) is the canonical historical log of the Wave 2 permission migration sweep — explicitly referenced in `Reference/CHANGELOG.md:194` as "too large to fully read; sampled and left as-is." Eight binary fixtures (xlsx/docx) are reference-only data files that already moved out of canonical use (the canonical permissions xlsx is now `/Users/veritypost/Desktop/verity post/permissions.xlsx`).

## Files

### Archived/_retired-2026-04-21/07-owner-next-actions.md
- Purpose: post-shipped runbook of owner-side applies (schema/110, 111 rollback, pg_cron, AdSense pub-ID setup) following four sequential commits from a master-plan Phase A/B/D/E sequence.
- Topics: schema/109 rollback (parallel scoring ledger that double-credited every quiz pass), AdSense adapter migration (110), pg_cron enablement, ads.txt + AdSense env config.
- Archival reason: all four items shipped or were superseded by current MASTER_TRIAGE workflow.
- Cross-refs: schema/108, 109, 110, 111; `web/public/ads.txt`; `EVENT_HASH_SALT`, `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID`.
- Still-cited-by-active-docs: No (file path appears in `Reference/PM_ROLE.md` only as a "where things went" pointer).
- Concerns: None — clean archive.

### Archived/_retired-2026-04-21/PERMISSION_MIGRATION.md
- Purpose: 1685-line live working doc tracking the Wave 2 permission migration sweep (web pages 2A, API routes 2B, shared components 2C, iOS views 2D). Per-file checkbox log with notes on every conversion, type fix, RPC swap, and DB binding adjustment.
- Topics: `@migrated-to-permissions` markers, file conversions js→tsx, tsx→jsx deletions, `hasPermission` swaps, `requirePermission` server gates, role→set bindings, scope overrides, flip-test results, Round 1–10 tracks, sub-tracks E/F/G/H/K/M/N etc.
- Archival reason: Wave 2 migration finished; living tracker retired into history. Ship state now lives in `Current Projects/MASTER_TRIAGE_2026-04-23.md`.
- Cross-refs: `site/` paths (now `web/`), `01-Schema/` paths (now `schema/`), generated types `site/src/types/database.ts`, dozens of admin LOCK / DS components, `permissions_matrix.xlsx` (note: deleted 2026-04-20 per current CLAUDE.md), `permissions.xlsx`.
- Still-cited-by-active-docs: Yes, by `Reference/CHANGELOG.md:194` ("too large to fully read; sampled and left as-is") and by `Reference/FEATURE_LEDGER.md:269,310,654` for round-level context. These are archive pointers, not load-bearing claims.
- Concerns: References `site/src/...` paths throughout — repo restructure renamed `site/` → `web/`. Anyone doing forensic spelunking will need to translate. Also references `permissions_matrix.xlsx` (deleted 2026-04-20). Both fine for archive — flagged because the file is so large that future agents may grep it for filenames and get false negatives.

### Archived/_retired-2026-04-21/PRELAUNCH_HOME_SCREEN.md
- Purpose: blueprint for a "coming soon" holding page (middleware + /preview bypass + env toggle `NEXT_PUBLIC_SITE_MODE=coming_soon`).
- Topics: middleware match patterns, redirect-vs-rewrite tradeoff, /preview bypass cookie, robots noindex, SEO 503-with-Retry-After.
- Archival reason: never implemented; owner chose to launch direct.
- Cross-refs: `site/src/middleware.ts` (path uses old `site/`), `site/src/app/page.tsx`, `NEXT_PUBLIC_SITE_MODE`, `PREVIEW_BYPASS_TOKEN`.
- Still-cited-by-active-docs: No (PRE_LAUNCH_AUDIT_LOG_2026-04-20.md mentions `PREVIEW_BYPASS_TOKEN` env var as still optional, but does not point at this blueprint).
- Concerns: None — blueprint that never executed.

### Archived/_retired-2026-04-21/PRE_LAUNCH_AUDIT_LOG_2026-04-20.md
- Purpose: 8-pass pre-launch audit sweep of the web repo — broken links, env var coverage, tsc, dev leftovers, error states, SEO/metadata, middleware redirect chains. Documents the one launch blocker (truncated `NEXT_PUBLIC_SUPABASE_URL` in Vercel) plus fixes applied that session and parking lot of low/medium-effort follow-ups.
- Topics: Sentry env vars, `.env.example` rewrite, login network-vs-credentials error distinction, robots.js disallow additions, error-state polish in reader hot path, OG image gaps on legal pages, CSP Report-Only-vs-enforce flip.
- Archival reason: pre-launch sweep landed; remaining items absorbed into MASTER_TRIAGE.
- Cross-refs: `web/.env.example`, `web/src/app/login/page.tsx`, `web/src/app/robots.js`, `next.config.js`, `web/src/middleware.js`, `src/app/page.tsx`, `src/app/story/[slug]/page.tsx`, `components/PermissionsProvider.tsx`, `manifest.js`.
- Still-cited-by-active-docs: No.
- Concerns: The doc claims `NEXT_PUBLIC_SUPABASE_URL` in Vercel is truncated to `.supabase.c` — if this is still uncorrected in Vercel today, it would still be a launch blocker. Worth verifying in a later wave that this fix shipped. Owner-side fix; not visible in code.

### Archived/_retired-2026-04-21/TEST_WALKTHROUGH.md
- Purpose: end-to-end manual smoke test from cold sign-up through every major feature gate (signup → onboarding → reader → quiz/comments → bookmark cap → tier gates → Stripe checkout → kid pair → cancel/grace → admin actions → crons → kids iOS quiz writes).
- Topics: 13 steps with Expected lines + cleanup SQL.
- Archival reason: relied on 18+ seeded test accounts wiped from live DB 2026-04-21; needs replacement admin-only smoke test.
- Cross-refs: `test-data/accounts.json`, `scripts/seed-test-accounts.js`, `schema/032_seed_test_articles.sql`, every major route.
- Still-cited-by-active-docs: Yes — `Reference/runbooks/CUTOVER.md:95` explicitly cites this archive path and notes that "a replacement admin-only or single-user smoke test must be authored before production cutover." Active doc pointer is correct (treats this as retired, not current).
- Concerns: Cutover smoke test still TBD — flagged as a real outstanding launch task in CUTOVER.md, sourced from this archive.

### Archived/_retired-2026-04-21/TODO.md
- Purpose: split owner-todo / autonomous-todo doc, retired in favor of MASTER_TRIAGE.
- Topics: Apple Dev account enrollment, Vercel ex-dev removal, Stripe 3-check, publish 10 articles, schema/106 apply, migration list for DR replay, HIBP toggle, Vercel + Stripe full audits, reserved-username claim flow design, Sentry activation; autonomous items #23/#31/#32/#35/#46/#49.
- Archival reason: superseded by `Current Projects/MASTER_TRIAGE_2026-04-23.md` per-item SHIPPED workflow.
- Cross-refs: `schema/106_kid_trial_freeze_notification.sql`, `web/tsconfig.json`, `web/src/app/admin/subscriptions/page.tsx`, `Reference/CHANGELOG.md`, `Archived/_retired-2026-04-21/PRELAUNCH_HOME_SCREEN.md`.
- Still-cited-by-active-docs: No (the items it tracked have moved into the canonical triage).
- Concerns: Several items here (Apple Dev account, ex-dev removal from Vercel, Stripe audit) appear in current `Current Projects/Audit_2026-04-24/OWNER_TODO_2026-04-24.md` per CLAUDE.md context. Worth verifying in later waves that the migration was clean (no item was lost during the retirement).

### Archived/_retired-2026-04-21/UI_AUDIT_REVIEW.md
- Purpose: per-item verification log for the 20-item UI Improvements audit (now-archived `UI_IMPROVEMENTS.md`). 5 NOT-REAL/already-shipped, 10 real targeted fixes, 5 design-system bundle items.
- Topics: per-page `<title>` metadata, responsive 1024–1920px (Track A vs Track B), regwall a11y (Escape, scroll lock), login/signup error a11y, 44×44 touch targets, iOS bare text buttons, story action row + cap banner, breaking treatment unification, empty-state sweep, error-message security sweep (`err.message` leaks), bottom nav reorder, palette/font/maxWidth/radius consolidation.
- Archival reason: 20-item review concluded; outstanding items absorbed into MASTER_TRIAGE.
- Cross-refs: `web/src/app/story/[slug]/page.tsx`, `web/src/app/login|signup|forgot-password|reset-password/`, `web/src/components/LockModal.tsx`, `web/src/lib/adminPalette.js`, `web/src/components/admin/Page.jsx`, `web/src/components/Avatar.tsx`.
- Still-cited-by-active-docs: No.
- Concerns: Item #19 surfaces 1 confirmed `err.message` leak in `web/src/app/api/stripe/checkout/route.js:65` — current CLAUDE.md context indicates `fix(api): stop leaking raw error.message to clients` shipped recently (commit `29f7a22`). Worth confirming this specific stripe leak was included in the sweep. Item #6 (regwall Escape/scroll-lock missing) — verify whether shipped.

### Archived/_retired-2026-04-21/docs-binaries/Verity_Post_Blueprint_v2.docx
- Purpose: master product blueprint v2 (binary).
- Topics: feature scope, tier model, role ladder, expert vetting rules.
- Archival reason: retired alongside the rest of `00-Reference/` 2026-04-21.
- Cross-refs: referenced as "reference" in `00-Folder Structure.md` (also archived).
- Still-cited-by-active-docs: No (current doctrine is `Current Projects/MASTER_TRIAGE_2026-04-23.md` + permission xlsx + DB).
- Concerns: Could mention features the team now treats as cut (e.g., reactions, community_notes per `00-New-Findings.md`). Binary — not directly readable in this audit.

### Archived/_retired-2026-04-21/docs-binaries/Verity_Post_Schema_Guide.xlsx
- Purpose: human-readable schema guide (binary).
- Archival reason: superseded by canonical `schema/reset_and_rebuild_v2.sql` + numbered migrations + generated types.
- Still-cited-by-active-docs: No.
- Concerns: Drift risk if anyone treats it as authoritative. Archived correctly.

### Archived/_retired-2026-04-21/docs-binaries/database_tables.xlsx
- Purpose: tabular DB table inventory (binary).
- Archival reason: superseded by live MCP queries + generated types.
- Still-cited-by-active-docs: No.
- Concerns: Per `00-New-Findings.md`, this xlsx had 90 tables vs live's 114 (24-row drift). Correctly archived.

### Archived/_retired-2026-04-21/docs-binaries/test_accounts.xlsx
- Purpose: seeded test account list (binary).
- Archival reason: parallel companion to ACCOUNTS.md. Owner wiped accounts from live DB 2026-04-21.
- Still-cited-by-active-docs: No directly (CHANGELOG mentions `test-data/ACCOUNTS.md` — the .md version, retained at `web/test-data/` per project memory).
- Concerns: None.

### Archived/_retired-2026-04-21/future-projects-README.md
- Purpose: landing index for the four "proposed ideas" docs (sources-above-headline, reading-receipt, earned-chrome-comments, quiet-home-feed) plus ads gameplan, measurement masterplan, owner-next-actions runbook, scoring system reference.
- Topics: design moves for adult web reader leaning on restraint; product thesis "commentary is earned, not given."
- Archival reason: retired with the rest of `Future Projects/` 2026-04-21.
- Cross-refs: 01-08 sibling files (sources-above-headline.md etc.) — these may live elsewhere; not in this zone.
- Still-cited-by-active-docs: No.
- Concerns: References sibling files (01–08) by relative path — those files aren't in this zone, so anyone trying to follow up gets dead pointers.

### Archived/_retired-2026-04-21/seed-test-accounts.js
- Purpose: idempotent script seeding 19 test + 30 community + 2 kid accounts to live Supabase.
- Topics: Supabase auth admin createUser, users upsert, user_roles assignment, kid_profiles creation, special-state mapping (banned/muted/shadow/streak/expert).
- Archival reason: retired 2026-04-21; manual SQL is now the canonical seed path per `Reference/STATUS.md:89` (file already absent from `scripts/`; verified 2026-04-23).
- Cross-refs: `web/.env.local` (loadEnv), `test-data/accounts.json`, `roles`, `plans`, `users`, `user_roles`, `kid_profiles` tables.
- Still-cited-by-active-docs: Yes by name in `Reference/PM_ROLE.md:399, 524-526`, `Reference/STATUS.md:89`, `Reference/CHANGELOG.md:47, 146` — all correctly call it "retired" and direct readers not to use it.
- Concerns: PLAN_MAP uses `verity_annual` / `verity_family_annual` — current canonical plan names per CLAUDE.md are `verity`, `verity_pro`, `verity_family`, `verity_family_xl`. If anyone re-instates this script, they'd need to map to current plan names.

### Archived/_retired-2026-04-21/test-data/ACCOUNTS.md
- Purpose: human-readable companion to `accounts.json` — 19 test accounts (owner, admin, editor, mod, anon, noemail, free, premium, family, expert, educator, journalist, banned, muted, shadow, newbie, veteran) + 2 kids (Emma, Liam) + 30 community users.
- Archival reason: companion to retired seed script.
- Cross-refs: `scripts/seed-test-accounts.js`.
- Still-cited-by-active-docs: Yes — `Reference/STATUS.md:89` says "Seeds in `test-data/accounts.json`. Manual SQL is the canonical seed path; `scripts/seed-test-accounts.js` was retired."
- Concerns: STATUS.md says seeds live in `test-data/accounts.json` — that JSON is the live path. The .md companion in this archive is the retired version with stale role names and special states. Active doc references the live `test-data/accounts.json` (not the archived ACCOUNTS.md).

### Archived/_retired-2026-04-21/test-data/accounts.json
- Purpose: structured input to the retired seed script — 19 test accounts + 30 community, with email/password/role/plan/verified/special.
- Archival reason: companion to seed script; `test-data/` was relocated.
- Cross-refs: `seed-test-accounts.js`.
- Still-cited-by-active-docs: Indirectly (active `STATUS.md:89` references `test-data/accounts.json`). Whether the archived copy here is identical to the live one wasn't verified.
- Concerns: Two copies of `accounts.json` may now exist (live + archived). Worth checking for drift in a later wave. (Not file-read here — would be JSON.)

### Archived/_retired-2026-04-21/test-data/backup-2026-04-18/* (7 JSON files)
- Files: permission_scope_overrides.json, permission_set_perms.json, permission_sets.json, permissions.json, perms_global_version.json, plan_permission_sets.json, role_permission_sets.json.
- Purpose: snapshot backup of permission system tables on 2026-04-18.
- Archival reason: pre-Round-8/9/10 backup; superseded by current DB state.
- Cross-refs: permission system tables.
- Still-cited-by-active-docs: No.
- Concerns: 2026-04-18 snapshot — could be useful for forensic comparison if the current DB state diverges from xlsx unexpectedly. Otherwise dead.

### Archived/obsolete-snapshots/_README.md
- Purpose: index for the obsolete-snapshots dir — explains which doc was superseded by what.
- Topics: pre-sprint era PM_HANDOFF/STATE/INDEX/APPLY_ALL_MIGRATIONS/z-Remaining-Items/PROJECT_STATUS, plus 2026-04-19 round of REFERENCE/OWNER_TO_DO/LIVE_TEST_BUGS.
- Archival reason: living index for archived material — itself frozen.
- Cross-refs: `/STATUS.md` and `/WORKING.md` at repo root (those exist as `Reference/STATUS.md` symlink today; `WORKING.md` may not exist anymore).
- Still-cited-by-active-docs: No.
- Concerns: Mentions `/WORKING.md` at repo root — current canonical lives at `Current Projects/MASTER_TRIAGE_2026-04-23.md`. Stale pointer, but harmless inside an archive index.

### Archived/obsolete-snapshots/INDEX.md
- Purpose: 2026-04-17 navigation map for the then-active `05-Working/` directory.
- Topics: PM_HANDOFF as entry point, STATE.md, LIVE_TEST_BUGS, OWNER_TO_DO, KIDS_SISTER_APP_PLAN, Verity_Post_Phase_Log, AUTONOMOUS_FIXES, DEEP_AUDIT, FRESH_AUDIT, REPAIR_LOG, ROTATE_SECRETS.
- Archival reason: superseded by current repo organization.
- Cross-refs: 99-Archive/working-docs/, 99-Archive/audits/, 00-Reference/Verity_Post_Design_Decisions.md, 01-Schema/.
- Still-cited-by-active-docs: No.
- Concerns: References folders (`05-Working/`, `99-Archive/`, `00-Reference/`, `01-Schema/`, `02-Parity/`, `04-Ops/`) that have all been reorganized. Pure historical artifact.

### Archived/obsolete-snapshots/STATE.md
- Purpose: 2026-04-17 canonical product-state snapshot (post Q&A breakout, post Pass 99, post Kids Audit + Repair, post admin surface sweep).
- Topics: web launch readiness, iOS DUNS-blocked, all 12 queued migrations applied (051-063), Sentry staging, secret rotation pending, content-zero, 5 architectural patterns, kids audit deliverables, 18 owner clarifications, Q&A-locked product decisions.
- Archival reason: superseded by current `Reference/STATUS.md` + MASTER_TRIAGE.
- Cross-refs: `Verity_Post_Phase_Log.md`, `OWNER_TO_DO.md`, `LIVE_TEST_BUGS.md`, `KIDS_AUDIT_AND_REPAIR_LOG.md`, `01-Schema/051-063`, `01-Schema/reset_and_rebuild_v2.sql`.
- Still-cited-by-active-docs: No.
- Concerns: None — clearly archived snapshot.

### Archived/obsolete-snapshots/PM_HANDOFF.md
- Purpose: PM discipline brief — anti-hallucination rules, spot-check checklist, what prior PM missed. Pass 1–19 era.
- Topics: never fabricate, verify before citing, treat owner instincts as first-class, three-level tracking hierarchy, decision authority split, pause-then-trust rhythm.
- Archival reason: superseded by current CLAUDE.md.
- Cross-refs: `STATE.md`, `Verity_Post_Phase_Log.md`, `Verity_Post_Design_Decisions.md`, `lib/auth.js`, `lib/permissions.js`, `lib/roles.js`.
- Still-cited-by-active-docs: No.
- Concerns: Historical only. The discipline rules in this doc anticipate the patterns now baked into `Reference/CLAUDE.md` — overlap is intentional generational continuity.

### Archived/obsolete-snapshots/REFERENCE.md
- Purpose: 2026-04-19 "where we stand" 3-min reference. Replaced by `Reference/STATUS.md`.
- Topics: 928 active permissions, 10 sets (anon/unverified/free/pro/family/expert/moderator/editor/admin/owner), grants flow, resolver, admin LOCK (66 files), Wave 2 progress (50/57 web pages, 55/128 API routes, 6/50 components, 28/37 iOS), open issues (#1–#11), recently-fixed (Track D, hygiene sweep, Phase 5).
- Archival reason: Round-10 reorg moved to current STATUS.
- Cross-refs: `05-Working/PERMISSION_MIGRATION.md`, `05-Working/ADMIN_STATUS.md`, `01-Schema/090_fix_round8...sql:70-73`, schema files 071-091, `site/src/types/database.ts`, `site/src/lib/auth.js`.
- Still-cited-by-active-docs: No.
- Concerns: Mentions `permissions_matrix.xlsx` (deleted 2026-04-20). Mentions `00-Where-We-Stand/` paths. All historical.

### Archived/obsolete-snapshots/OWNER_TO_DO.md
- Purpose: 2026-04-19 owner-action checklist — security, env vars, content, CSP flip, schema commit backlog, build hygiene, Apple ecosystem, Google OAuth, APNs, OPEN LB bugs, post-deployment validation.
- Topics: HIBP toggle, secret rotation, Sentry DSN, NEXT_PUBLIC_SITE_URL, publish 10+ articles, replace 5 `Test:` headlines, CSP enforce flip, migrations 092/093 commit, `npm install`, `site/public/` PWA icons; iOS DUNS-gated items (App Store Connect 8 SKUs, V2 Server URL, APNs .p8, universal links); Google OAuth client ID; APNs env vars; LB-006/010/013/016/034 OPEN bugs.
- Archival reason: superseded by `Current Projects/Audit_2026-04-24/OWNER_TODO_2026-04-24.md` and MASTER_TRIAGE.
- Cross-refs: `99-Archive/2026-04-19-prelaunch-sprint/round_g_owner_action.md`, `ROTATE_SECRETS.md`, `next.config.js:61-68`, `site/src/middleware.js:139,160`, `LIVE_TEST_BUGS.md`.
- Still-cited-by-active-docs: No.
- Concerns: Many of these items (HIBP, Sentry DSN, schema commit backlog, ex-dev removal, Apple Dev) appear in CLAUDE.md context for the current `OWNER_TODO_2026-04-24.md`. Worth verifying in a later wave that the migration was complete and no LB-* bug was lost.

### Archived/obsolete-snapshots/LIVE_TEST_BUGS.md
- Purpose: 2026-04-17 active bug intake. 5 OPEN entries (LB-006, LB-010, LB-013, LB-016, LB-034); FIXED/deferred/wontfix collapsed to one-liners.
- Topics: severity ladder, status markers, owner intake protocol; LB-006 notifications-empty, LB-010 expert-apply post-submit strands user, LB-013 Stripe redirect (move to Embedded Checkout), LB-016 title-less feed card, LB-034 sessions dropping.
- Archival reason: bug intake folded into MASTER_TRIAGE.
- Cross-refs: `Verity_Post_Phase_Log.md`, `99-Archive/`.
- Still-cited-by-active-docs: No.
- Concerns: Need to verify that LB-006/010/013/016/034 were tracked through to closure or migrated into MASTER_TRIAGE — flagged for later wave.

### Archived/obsolete-snapshots/PROJECT_STATUS.md
- Purpose: 2026-04-16 direct verification report — 96 web pages, 112 API routes, 18 components, 31 SQL migrations, 113 schema tables, 37 Swift files, 0 broken imports, 6 TODOs (all APNS stubs).
- Topics: doc inventory, web inventory, every category of route real-vs-stub, v2 feature flag, Stripe routes, SQL migrations 005–035 list.
- Archival reason: pre-hardening snapshot.
- Cross-refs: `00-Reference/Verity_Post_Design_Decisions.md`, `Verity_Post_Blueprint_v2.docx`, `01-Schema/reset_and_rebuild_v2.sql`, `Verity_Post_Schema_Guide.xlsx`, `05-Working/Verity_Post_Phase_Log.md`, `03-Build-History/FINAL_WIRING_LOG.md`, `04-Ops/TEST_WALKTHROUGH.md`, `04-Ops/CUTOVER.md`.
- Still-cited-by-active-docs: No.
- Concerns: Numbers here are 2026-04-16 — schema since grew to 100+ migrations; routes to 128+; components much larger. Pure historical.

### Archived/obsolete-snapshots/00-Folder Structure.md
- Purpose: 2026-04-18 repo map enumerating every folder + file with status (Active / Reference / Archived).
- Topics: 00-Reference/, 01-Schema/ migrations 005–063 + 064–094, 02-Parity/, 03-Build-History/, 04-Ops/, 05-Working/, 99-Archive/, site/, VerityPost/, scripts/.
- Archival reason: repo restructured 2026-04-19.
- Cross-refs: every numbered folder.
- Still-cited-by-active-docs: No.
- Concerns: Folder names all reorganized. Pure historical map.

### Archived/obsolete-snapshots/00-New-Findings.md
- Purpose: 2026-04-18 end-to-end smoke test findings.
- Topics: 8 API routes returning 500-not-401 (root cause: `requireAuth`/`requireRole` throw plain Error without `.status`); permission-set role grants effectively a no-op (8 staff roles share same 7 sets); staff access via role-hierarchy not sets (`is_admin_or_above()` etc.); 3 dropped social tables (`community_notes`, `community_note_votes`, `reactions`); 27 added rogue tables; 14 column-drift tables; `role_permissions` empty; missing test accounts; double-subscribe race on comments realtime; missing settings row; Resend 400; emoji in breaking-news email template; sparse audit_log.
- Archival reason: findings absorbed into hardening sprint.
- Cross-refs: `lib/auth.js`, `lib/permissions.js`, RLS helpers, `database_tables.xlsx`, `test_accounts.xlsx`, `compute_effective_perms`, `webhook_log.event_id`.
- Still-cited-by-active-docs: No.
- Concerns: Several items here (status-code throwing, double-subscribe, audit-log sparse) may still apply — owner ran a recent `error.message` leak sweep and Loading-state guard fix per CLAUDE.md commit history, suggesting the route-error pattern is being reworked. Worth a verification pass in a later wave to confirm none of these 14 findings are still live.

### Archived/obsolete-snapshots/z-Remaining Items.md
- Purpose: 2026-04-16 outstanding-work list. Split into Human-Only (apply migrations, Apple, Stripe, content) and Autonomous (50+ items, most marked resolved with Task IDs).
- Topics: migrations 036–047 apply, Apple Root CA G3, App Store Connect 8 subscriptions, V2 Server URL, APNs .p8, universal links, Stripe 8 prices, content (zero published), iOS muted banner, login cancel-deletion, identity-verification UI, data_export_ready template seed, co-adult achievements, OG metadata, phase log, StoreManager appAccountToken, REFUND_REVERSED, MessagesView realtime, unread indicator, read receipts, expert reverification cron, behavioral anomaly detection (still open), admin tree issues (broken link, duplicate entry, RBAC drift), repo hygiene (`site copy/`, `Verity_Post_Migration_Gameplan.md` reference, TODO at `email/send-test/route.js:1`), passes 1–6 outstanding items.
- Archival reason: 2026-04-16 snapshot superseded.
- Cross-refs: 30+ migration filenames, 30+ Swift / JS file paths, 50+ Task IDs.
- Still-cited-by-active-docs: No.
- Concerns: Item 30 "Behavioral anomaly detection (Blueprint 10.3)" was unresolved at archive time — verify whether this surfaced in current MASTER_TRIAGE or was scoped out.

### Archived/obsolete-snapshots/APPLY_ALL_MIGRATIONS.sql
- Purpose: 2026-04-17 v3 migration bundle (12 migrations 051–063, with 052 reserved-but-skipped). Idempotent SQL editor paste.
- Topics: 051 user_category_metrics RPC self-heal, 053-063 sequence.
- Archival reason: superseded by current schema sequence (live migrations now run through 100+, per current CLAUDE.md context).
- Cross-refs: `01-Schema/051..063`.
- Still-cited-by-active-docs: No.
- Concerns: None.

### Archived/one-off-plans/_README.md
- Purpose: index for the three one-off shipped plans.
- Cross-refs: `_q1_card_plan.md`, `_q1_card_plan_v2.md`, `_q2_stripe_portal_plan.md`.
- Still-cited-by-active-docs: No.
- Concerns: Notes that v2 superseded v1 — within-zone duplicate intentional.

### Archived/one-off-plans/_q1_card_plan.md
- Purpose: plan for `/card/[username]` anon copy rewrite (kept gated, reword no-card branch).
- Topics: `profile.card.view` permission + `free` set, 4 reachable states (loading/not_found/private/no_card/ready), OG image fallback, generateMetadata.
- Archival reason: superseded by v2 (full reverse — make card public).
- Cross-refs: `site/src/app/card/[username]/page.js,layout.js,opengraph-image.js`, `site/src/app/u/[username]/page.tsx`, `site/src/app/profile/card/page.js`, `01-Schema/077_fix_permission_set_hygiene_2026_04_18.sql:134`, `VerityPost/VerityPost/PublicProfileView.swift:124`, `ProfileView.swift:73`.
- Still-cited-by-active-docs: No.
- Concerns: Within-zone duplicate of v2 (intentional).

### Archived/one-off-plans/_q1_card_plan_v2.md
- Purpose: superseding plan — make `/card/[username]` fully public; gate `/u/[username]` for anon (currently leaks); add `<meta robots="noindex,nofollow">` on card; auth-aware "View full profile" link.
- Topics: same files as v1 with reversed gating direction.
- Archival reason: shipped (per `_README.md` "DONE").
- Cross-refs: same as v1.
- Still-cited-by-active-docs: No.

### Archived/one-off-plans/_q2_stripe_portal_plan.md
- Purpose: investigation of "widen `billing.stripe.portal` to family + expert" request — finding that `.stripe.portal` was already deactivated in migration 090 and `.portal.open` was already bound to all 8 sets, so no migration needed; real bug is Settings UI not branching by plan source for Apple IAP users.
- Topics: `permissions`, `permission_set_perms`, `permission_sets`, `01-Schema/090_fix_round8_permission_drift_2026_04_19.sql:70-73`, `site/src/app/api/stripe/portal/route.js:10`, `site/src/app/profile/settings/page.tsx:99,2988-2996`.
- Archival reason: investigation produced "do not ship" verdict; UI branch fix landed separately.
- Cross-refs: above schema + code paths.
- Still-cited-by-active-docs: No.
- Concerns: Plan flagged that web Settings doesn't branch by plan source — verify in later wave whether the Apple-IAP-vs-Stripe branching landed.

### Archived/restructure-2026-04-19/2026-04-19-audit.md
- Purpose: independent verification of "what's actually still not done" post-capstone via two parallel Explore agents.
- Topics: missing migrations 092/093 on disk (Round A/B applied via MCP but never committed); `site/public/` directory missing → PWA icons 404; 5 OPEN LB bugs not re-evaluated by capstone; CSP still Report-Only; OWNER_TO_DO stale; M-02/M-04/M-05/M-06/L-07/L-10/L-11 capstone-deferred items.
- Archival reason: subsumed by Restructure plan + STATUS rewrite.
- Cross-refs: `00-Where-We-Stand/REFERENCE.md`, `99-Archive/2026-04-19-prelaunch-sprint/`, schema migrations 086-094, `site/src/app/page.tsx:3,83-108,278`, `site/src/lib/permissions.js:7,16,160`, `components/Interstitial.tsx`, `lib/appleReceipt.js:23`, `next.config.js:56-68`.
- Still-cited-by-active-docs: No.
- Concerns: This audit raised 7 owner questions (intentional vs forgot 092/093, ship with 5 LB bugs, etc.). Worth verifying these were resolved.

### Archived/restructure-2026-04-19/future-structure-plan.md
- Purpose: blueprint for repo restructure — single STATUS.md + WORKING.md at root, `apps/`, `shared/`, `platform/`, `archive/` layout. Phased migration order (1–8).
- Topics: monorepo design, kids/adult iOS split (separate Xcode projects, separate bundle IDs), admin location decision (in adult-site for now), permissions xlsx into repo.
- Archival reason: blueprint partially executed; current repo follows a different end-state (web/, VerityPost/, VerityPostKids/, schema/, scripts/, supabase/, etc., per CLAUDE.md).
- Cross-refs: `00-Where-We-Stand/REFERENCE.md`, `00-Reference/`, `00-Folder Structure.md`, `99-Archive/`, `xx-updatedstatus/`, `permissions.xlsx`.
- Still-cited-by-active-docs: No.
- Concerns: Final repo layout differs from this blueprint — `apps/` was not adopted; `web/` + `VerityPost/` + `VerityPostKids/` is the actual structure.

### Archived/restructure-2026-04-19/structure-synthesis.md
- Purpose: 3-architect synthesis of repo restructure — convergences, divergences resolved, final recommended `apps/`+`packages/`+`platform/`+`tools/`+`design/`+`docs/`+`archive/`+`.github/` structure.
- Topics: pnpm workspaces, Swift Package extraction, ADRs under `docs/decisions/`, kids bundle ID `com.veritypost.kids`, migration numbering preserved, pre-commit hook blocking "currently/as of/today".
- Archival reason: superseded — final repo took a different shape.
- Cross-refs: `apps/web-adult`, `apps/ios-adult`, `apps/ios-kids`, `packages/{db-types,web-ui,web-lib,ios-core,permissions}`, `platform/{supabase,stripe,vercel,apple}`.
- Still-cited-by-active-docs: No.
- Concerns: Within-zone duplicate of `future-structure-plan.md` (intentional — synthesis came after plan).

### Archived/scratch-ui/adult-profile-ui.html
- Purpose: static HTML mockup of adult profile page (UI-only, 191 lines).
- Topics: VP token palette, profile-card layout, 56px avatar, username row.
- Archival reason: scratch UI prototype; never wired.
- Still-cited-by-active-docs: No.
- Concerns: None.

### Archived/scratch-ui/adult-profile-full-ui.html
- Purpose: longer static HTML mockup of adult profile page (1303 lines).
- Topics: same as adult-profile-ui.html plus extended states (warn-bg, warn-bd, warn-fg).
- Archival reason: scratch.
- Still-cited-by-active-docs: No.
- Concerns: Within-zone duplicate of `adult-profile-ui.html` (longer variant of same prototype).

### Archived/scratch-ui/profile-settings-preview.jsx
- Purpose: React component preview of profile settings UI (600 lines).
- Topics: lucide-react icons, VP color tokens matching SwiftUI, mockUser data, Avatar + section primitives.
- Archival reason: scratch.
- Still-cited-by-active-docs: No.
- Concerns: None.

### Archived/scratch-ui/beta ui ux kids/Kids UX Design Spec.md
- Purpose: non-destructive design proposal for kids experience — ground rules (zero emojis, no social affordances, PIN-gated exit, per-kid theme color, chunky/tactile/rounded), per-screen sections (Kid Home, Article, Quiz, Done, Leaderboard, Profile, Parent Dashboard, Parent Kid Detail, Create Kid Basics/COPPA/PIN, Profile Picker, Expert Sessions).
- Archival reason: scratch — current Kids iOS app design carries some of these patterns but not all.
- Cross-refs: `site/src/app/kids/page.js:28-258, 70-75, 19-26`, `VerityPost/VerityPost/KidViews.swift:102-388`.
- Still-cited-by-active-docs: No.
- Concerns: Note "no emojis" — this contradicts current CLAUDE.md ("Kids iOS app is the only surface where emojis are intentional"). Design spec was archived before that policy clarified.

### Archived/scratch-ui/beta ui ux kids/AdultArticle.jsx
- Purpose: React static prototype of the Adult Article reading view (595 lines, T color tokens — paper/card/ink/inkSoft/inkFaint/rule).
- Archival reason: scratch.
- Still-cited-by-active-docs: No.
- Concerns: None.

### Archived/scratch-ui/beta ui ux kids/AdultHome.jsx
- Purpose: React static prototype "A Briefing not a feed" (732 lines).
- Topics: 5-piece briefing model, ~10 minutes, finishable, ceremony on quiz pass.
- Archival reason: scratch.
- Still-cited-by-active-docs: No.
- Concerns: None.

### Archived/scratch-ui/beta ui ux kids/index.html
- Purpose: tile-grid landing for the prototype set — links to ~30 sub-prototypes (Adult home/notifications/leaderboard/profile/article/article-quiz/article-unlocked/settings, Adult v2 Front/Wire/Archive/Room/Ledger/Piece, Kids screens).
- Archival reason: scratch.
- Still-cited-by-active-docs: No.
- Concerns: References sibling files via relative path; only some siblings present in this dir (the v2-issue-metaphor "front/wire/archive/room/ledger/piece" pages are not in the dir). Dead-link risk if anyone clicks through. Acceptable for archive.

### Archived/scratch-ui/beta ui ux kids/styles.css
- Purpose: shared CSS tokens + components for the prototype set (4637 lines).
- Topics: CSS variables, kid-shell phone frame, tile/grid/card primitives, kid accent palette.
- Archival reason: scratch.
- Still-cited-by-active-docs: No.
- Concerns: Largest file in zone — uses tokens that diverged from canonical adminPalette/F-scale.

### Archived/scratch-ui/beta ui ux kids/expert-session-live.html
- Purpose: scratch HTML — kids expert session (live).
- Archival reason: scratch.
- Still-cited-by-active-docs: No.

### Archived/scratch-ui/beta ui ux kids/expert-session-replay.html
- Purpose: scratch HTML — kids expert session (replay).
- Archival reason: scratch.
- Still-cited-by-active-docs: No.

### Archived/scratch-ui/beta ui ux kids/expert-sessions-list.html
- Purpose: scratch HTML — kids expert sessions list.
- Archival reason: scratch.
- Still-cited-by-active-docs: No.

### Archived/scratch-ui/beta ui ux kids/kid-home-category.html
- Purpose: scratch HTML — kid home category page.
- Archival reason: scratch.
- Still-cited-by-active-docs: No.

### Archived/scratch-ui/beta ui ux kids/kid-home.html
- Purpose: scratch HTML — kid home (greeting + streak-line + category grid). Per-kid accent var `--accent` set inline (`#8b5cf6` violet).
- Archival reason: scratch.
- Still-cited-by-active-docs: No.

### Archived/scratch-ui/beta ui ux kids/kid-leaderboard-all.html
- Purpose: scratch HTML — global kid leaderboard prototype.
- Archival reason: scratch.
- Still-cited-by-active-docs: No.

### Archived/scratch-ui/beta ui ux kids/kid-leaderboard-family.html
- Purpose: scratch HTML — family-only kid leaderboard.
- Archival reason: scratch.
- Still-cited-by-active-docs: No.

### Archived/scratch-ui/beta ui ux kids/kid-leaderboard-topic.html
- Purpose: scratch HTML — topic-scoped kid leaderboard.
- Archival reason: scratch.
- Still-cited-by-active-docs: No.

### Archived/scratch-ui/beta ui ux kids/kid-profile.html
- Purpose: scratch HTML — kid profile (4-stat 2x2 grid).
- Archival reason: scratch.
- Still-cited-by-active-docs: No.

### Archived/scratch-ui/beta ui ux kids/kid-story-done.html
- Purpose: scratch HTML — kid story done state (passed quiz).
- Archival reason: scratch.
- Still-cited-by-active-docs: No.

### Archived/scratch-ui/beta ui ux kids/kid-story-quiz.html
- Purpose: scratch HTML — kid quiz screen.
- Archival reason: scratch.
- Still-cited-by-active-docs: No.

### Archived/scratch-ui/beta ui ux kids/kid-story-reading.html
- Purpose: scratch HTML — kid reader screen.
- Archival reason: scratch.
- Still-cited-by-active-docs: No.

### Archived/scratch-ui/beta ui ux kids/parent-create-kid-basics.html
- Purpose: scratch HTML — parent dashboard, create kid (basics step).
- Archival reason: scratch.
- Still-cited-by-active-docs: No.

### Archived/scratch-ui/beta ui ux kids/parent-create-kid-coppa.html
- Purpose: scratch HTML — parent create-kid COPPA gate.
- Archival reason: scratch.
- Still-cited-by-active-docs: No.

### Archived/scratch-ui/beta ui ux kids/parent-create-kid-pin.html
- Purpose: scratch HTML — parent create-kid PIN setup.
- Archival reason: scratch.
- Still-cited-by-active-docs: No.

### Archived/scratch-ui/beta ui ux kids/parent-dashboard.html
- Purpose: scratch HTML — parent dashboard hero surface.
- Archival reason: scratch.
- Still-cited-by-active-docs: No.

### Archived/scratch-ui/beta ui ux kids/parent-kid-detail.html
- Purpose: scratch HTML — parent dashboard, per-kid detail.
- Archival reason: scratch.
- Still-cited-by-active-docs: No.

### Archived/scratch-ui/beta ui ux kids/profile-picker.html
- Purpose: scratch HTML — kid mode profile picker.
- Archival reason: scratch.
- Still-cited-by-active-docs: No.

## Within-zone duplicates / overlap

- **Adult profile mockups**: `adult-profile-ui.html` (191 lines) vs `adult-profile-full-ui.html` (1303 lines) — same prototype, two lengths. Intentional pair.
- **Q1 card plans**: `_q1_card_plan.md` vs `_q1_card_plan_v2.md` — v2 reverses v1 direction. Documented as superseded.
- **Restructure docs**: `2026-04-19-audit.md` + `future-structure-plan.md` + `structure-synthesis.md` — three-doc evolution converging on synthesis. Synthesis is the canonical of the three.
- **Snapshot triplets**: `STATE.md` (2026-04-17), `REFERENCE.md` (2026-04-19), `PROJECT_STATUS.md` (2026-04-16) — three different "current state" docs from three different dates, each capturing an in-flight state. All correctly archived as superseded by current STATUS.md.
- **Owner-action triplets**: `OWNER_TO_DO.md` (2026-04-19) + `z-Remaining Items.md` (2026-04-16) + the active TODO.md in `_retired-2026-04-21/` — three generations of owner-action checklists, each archived in turn.
- **Permission-system snapshot**: `test-data/backup-2026-04-18/*.json` (7 files) duplicates the permission-system tables' state on that day. Single backup, not a duplicate of another archive.
- **Overlapping kids design source**: `Kids UX Design Spec.md` + 17 kid-prototype HTML files + `styles.css` — design spec describes what the HTML implements. Not duplicates, but tightly coupled.

## Within-zone misclassification

None found. Every file in this zone is correctly archived. The dirs are clearly named (`_retired-2026-04-21`, `obsolete-snapshots`, `one-off-plans`, `restructure-2026-04-19`, `scratch-ui`) and their content matches the dir name. No archived file in this zone is masquerading as canonical or is referenced as load-bearing by an active doc.

## Notable claims worth verifying in later waves

1. **Vercel `NEXT_PUBLIC_SUPABASE_URL` typo** (`PRE_LAUNCH_AUDIT_LOG_2026-04-20.md`): claimed truncated to `.supabase.c` (missing trailing `o`) — verify this owner-side fix shipped. If not, still a launch blocker. Per CLAUDE.md context the active `OWNER_TODO_2026-04-24.md` mentions a Vercel URL typo — likely the same item, owner action pending.
2. **Stripe checkout `err.message` leak** (`UI_AUDIT_REVIEW.md` item #19): claims `web/src/app/api/stripe/checkout/route.js:65` returns raw `err.message`. Recent commit `29f7a22` "fix(api): stop leaking raw error.message to clients" suggests sweep landed — confirm this specific stripe leak was included.
3. **5 OPEN LB bugs from 2026-04-17** (LB-006, LB-010, LB-013, LB-016, LB-034): notifications-empty, expert-apply post-submit strands, Stripe redirect (move to Embedded Checkout), title-less feed card, sessions dropping. Need to verify each was either closed or migrated into MASTER_TRIAGE.
4. **Migrations 092/093 commit-to-disk** (`2026-04-19-audit.md`): claimed Round A/B SQL applied via MCP but not committed as numbered files. Per current CLAUDE.md `OWNER_TODO_2026-04-24.md` mentions "migration-state SQL paste" — likely still open.
5. **Item 30 Behavioral anomaly detection** (`z-Remaining Items.md`): never closed at archive time. Verify whether it surfaced in MASTER_TRIAGE or was scoped out.
6. **Item 7 Ad-Network adapter / pg_cron / AdSense pub-ID** (`07-owner-next-actions.md`): some items shipped, some pending. Verify status against current code (`schema/108-111`, `web/public/ads.txt`).
7. **`00-New-Findings.md` 14 findings**: several plausibly still apply (status-code-throwing routes, double-subscribe race on comments realtime, sparse audit_log, Resend API 400, breaking-news email template emoji). Each worth a current-state check.
8. **`scripts/seed-test-accounts.js` PLAN_MAP drift**: archived script uses `verity_annual` / `verity_family_annual` plan names; current canonical names per CLAUDE.md are `verity` / `verity_pro` / `verity_family` / `verity_family_xl`. If anyone re-instates the script they'll need to remap.
9. **`_q2_stripe_portal_plan.md` Apple-IAP-vs-Stripe Settings UI branch**: plan flagged Settings UI doesn't branch by plan source. Verify whether the branch was added.
10. **Two copies of `accounts.json`**: one archived here, one referenced live in `Reference/STATUS.md:89` as `test-data/accounts.json`. Verify they don't drift, or that the live one is canonical and the archived one is frozen.
