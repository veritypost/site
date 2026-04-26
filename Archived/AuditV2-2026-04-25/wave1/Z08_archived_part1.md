# Zone Z08: Archived/ (part 1)

## Summary

73 files across 8 first-half archive subdirectories. All read fully. The folder hierarchy charts a roughly chronological narrative of the project's hardening from 2026-04-18 through 2026-04-24:

- **2026-04-18-admin-lockdown** (6 files) — initial admin surface audit + 27-component design system + verification + permissions matrix audit. Coined the `@admin-verified` marker convention (since retired per `feedback_admin_marker_dropped.md`).
- **2026-04-18-phases-1-2** (2 files) — Phase 1 (xlsx → DB import) + Phase 2 (admin user-permissions page + RPC) of the permission system buildout.
- **2026-04-18-security-rounds-2-7** (16 files) — six rounds of focused audit-and-fix prep docs covering `requireRole` migration, marker drift sweep, security CVE lockdowns (admin RPCs, users-table privileged-update trigger, server-side scoring), and bearer-bypass fixes.
- **2026-04-18-ui-ios-audits** (7 files) — read-only UI/UX/iOS audits (one lead + three peers + iOS preflight + an agent briefing).
- **2026-04-19-prelaunch-sprint** (20 files) — nine-round sprint (A-I) that took 3-of-3 reviewer NO verdicts to a CONDITIONAL YES capstone. Includes 3 reviewer reports, deduped master issue list, attack plan, per-round migration SQL + caller-changes + verification + plans, plus a `_claims/` subfolder of track-claim tokens.
- **2026-04-20-consolidation** (10 files) — final pre-tracker consolidation: TASKS.md / DONE.md / NEXT_SESSION.md / DEPLOY_PREP.md / kidsactionplan.md + the deferred `FUTURE_DEDICATED_KIDS_APP.md` + the BATCH_FIXES_2026_04_20 batch log + two `.old` files (CUTOVER + TEST_WALKTHROUGH).
- **2026-04-24-tracker-retirement** (4 files) — three handoff prompts (424/426/427) that span four sessions plus the retired-but-archived `FIX_SESSION_1.md` (canonical pre-retirement task list, 35 items + 00-A through 00-O owner actions + F1-F7 features).
- **_from-05-Working** (4 files) — material extracted from the retired `05-Working/` folder before deletion: the three task-synthesis documents (Agent 1 consolidated, Agent 2 gap-tasks, Agent 3 review notes) + the retired `WORKING.md`.

The archive is a coherent, deeply documented record of how the codebase reached "ship-ready"; nothing in this half clearly belongs in the live working set, and zero files contain an active TODO that hasn't been folded into MASTER_TRIAGE.

## Files

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-admin-lockdown/_README.md
- Purpose: index for the 5 admin-lockdown documents.
- Topics: `@admin-verified 2026-04-18` marker, 39 admin pages + 27 DS components LOCKED.
- Archival reason: lockdown work shipped; the `@admin-verified` marker has since been retired (memory note `feedback_admin_marker_dropped.md`). The README therefore describes a historical seal.
- Cross-refs: `00-Where-We-Stand/REFERENCE.md` §12 (referenced doc no longer exists in repo).
- Concerns: still claims the LOCK is real and enforced — superseded by 2026-04-23 marker drop; could mislead a fresh reader.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-admin-lockdown/ADMIN_AUDIT.md
- Purpose: 39-page initial admin-page audit identifying 23 hard data-layer bugs + 47 UX issues across the admin surface (`site/src/app/admin/**`).
- Topics: per-page findings (PGRST201 FK ambiguity on `support_tickets`/`user_warnings`/`user_roles`, missing-table refs `rss_feeds`/`story_clusters`/`webhooks`, missing-column reads on `quiz_attempts.passed`, dead buttons, hardcoded role strings, missing pagination).
- Archival reason: every Critical/High row was either fixed during the lockdown pass or rolled into MASTER_TRIAGE; the audit itself is historical.
- Cross-refs: cites `site/src/app/admin/**/page.js` paths that have since moved to `web/src/app/admin/**` (the `site/` → `web/` rename happened later).
- Concerns: file paths are stale (use `site/`) — anyone re-reading must mentally remap to `web/`.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-admin-lockdown/ADMIN_STATUS.md
- Purpose: list of 39 LOCKED admin page+component files with `@admin-verified 2026-04-18` marker; Wave-1-done snapshot with explicit known-open issues (perms_version TOCTOU, FK gaps in moderation/reports embed, etc.).
- Topics: 5 known issues documented but not auto-fixed; explicitly says Wave 2 is OUT OF SCOPE for these LOCKED files.
- Archival reason: marker convention retired.
- Cross-refs: stale `site/` paths.
- Concerns: The 5 enumerated open issues (perms_version TOCTOU, /admin/moderation/reports embed of only `reporter`, cascading set toggles not bumping versions, /api/admin/users/:id/roles not bumping perms_version, /admin/subscriptions manual downgrade not syncing users.plan_id) — verify whether these have all been individually fixed in MASTER_TRIAGE rounds or whether any persist.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-admin-lockdown/ADMIN_VERIFICATION.md
- Purpose: live-DB verification of every admin page's primary fetch + 10 mutation flows.
- Topics: per-page PASS table (37 admin routes), 10 mutation tests (ban/unban, role assign, permission grant, override remove, set assign, role-set-grant, plan-set-grant, settings update, reserved username, feature flag toggle).
- Archival reason: snapshot of post-fix verification.
- Cross-refs: trivial-fixes section names 7 specific embed disambiguations (`fk_articles_category_id`, `fk_subscriptions_user_id`, `fk_reports_reporter_id`).
- Concerns: notes a `articles!author_id(username)` shorthand — flag if PostgREST tightens semantics (still in use? worth verifying).

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-admin-lockdown/E2E_VERIFICATION.md
- Purpose: platform-wide E2E pass: TS clean, 98 page routes, 129 API routes, schema alignment, permission-key alignment, admin-toggle flow, iOS structural pass.
- Topics: 9 missing perm keys + 11 inactive perm keys flagged for owner; 28/28 iOS files have `@migrated-to-permissions`; 4 keys missing from DB (`ads.suppress`, `article.bookmark.collections`, `article.bookmark.unlimited`, `recap.view`).
- Archival reason: shipped state snapshot.
- Cross-refs: cites `site/src/lib/auth.js` UNAUTHENTICATED status fix, two support route fixes.
- Concerns: 9-keys + 11-keys flagged-for-owner list — verify whether these have all been resolved by Round 4 Track W's `068_round4_permission_key_cleanup.sql` migration or remain open.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-admin-lockdown/PERMISSIONS_AUDIT.md
- Purpose: 175-row historical permissions audit; describes the dual-permission-system problem (dot-namespaced caps loaded but inert; every gate enforced via legacy role/plan).
- Topics: D-number traceability (D1-D44), per-feature row map across 6 surfaces, drift between code and xlsx (~40 spec'd-not-built keys, ~25 built-not-spec'd), 9 D-numbers with no enforcement or gaps (D6 comment-visibility RLS, D13 bookmarks broken, D33 expert_discussions select too wide, etc.).
- Archival reason: replaced by the new 928→932→928-permission live system; this is the precursor.
- Cross-refs: cites `01-Schema/reset_and_rebuild_v2.sql`, several phase migrations (011, 014, 015, 016, 017, 018, 019, 022, 056, 063, 064, 067).
- Concerns: 9 D-number gaps it lists — verify each was closed during the prelaunch sprint (Rounds A/B handled the bulk via RLS + RPC lockdowns).

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-phases-1-2/_README.md
- Purpose: index for Phases 1-2 of the permission rebuild.
- Topics: Phase 1 import (916→928 perms + 10 sets), Phase 2 admin user-perms page + `compute_effective_perms` RPC + POST endpoint.
- Archival reason: shipped; superseded by `Reference/STATUS.md` §12.
- Cross-refs: commits `0416e52` (phase 1) + `d09e3ee` (phase 2).
- Concerns: none.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-phases-1-2/MIGRATION_STATUS.md
- Purpose: Step-by-step log of Phases 1+2 — 1a backup, 1b import script, 1c dry-run, 1d execute (916 perms, 10 sets, 2493 set-perm links, perms_global_version 12→3751), 2.1 SQL function, 2.2 admin page, 2.3 POST endpoint.
- Topics: backup at `test-data/backup-2026-04-18/` (8 tables), the env-pointing-at-VP2 incident (swapped back to VP Project mid-session), per-page admin-schema-sync table (12 fixes).
- Archival reason: explicitly superseded — this README says so.
- Cross-refs: `01-Schema/064_compute_effective_perms.sql`, `00-Where-We-Stand/REFERENCE.md`.
- Concerns: cites `site/src/types/database.ts` (8918 lines, 273 KB) — the count is post-Phase-1 baseline; if regenerated since, the count drifted.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-security-rounds-2-7/_README.md
- Purpose: index for the six security/cleanup round prep docs (R2 Phase-5 cleanup, R3 marker hygiene, R4 critical fixes, R5 promo bugs + iOS hardening, R6 admin RPC lockdown + iOS gates + iOS column drift, R7 startConv/support/bearer).
- Topics: outcome reference to `00-Where-We-Stand/REFERENCE.md` §12.
- Archival reason: rounds shipped.
- Cross-refs: `../2026-04-19-prelaunch-sprint/` (Rounds A-I capstone).
- Concerns: none.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-security-rounds-2-7/_round2_prep.md
- Purpose: Phase-5 prep for retiring `requireRole` (54 calls × 38 files) + dropping `role_permissions` table + cleaning `@/lib/tiers` + `requireRole` deletion + tracker drift fix.
- Topics: 4 tracks (M migrate callers, N drop role_permissions, O delete QuizPoolEditor + tiers + comment cleanup, P delete requireRole + dup-key deactivation); 3 real tracker drift cases identified (3 admin-API routes with claimed but missing `@admin-verified` marker).
- Archival reason: shipped pre-prelaunch.
- Cross-refs: cites `site/src/lib/auth.js`, `site/src/lib/roles.js`, `site/src/lib/plans.js`, the now-retired `permissionKeys.js`.
- Concerns: notes `permission_set_perms` had INSERT failures during fresh reseeds; flag if this still bites.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-security-rounds-2-7/_round3_prep.md
- Purpose: Round 3 marker-completion + tracker-drift sweep (NavWrapper migration, 4 iOS feature views, 8 iOS pre-auth views, 10 JS marker-only files).
- Topics: zero real tracker drift after R2 closed; subscription-key drift resolved via doc rewrite (no DB rename); admin-API-LOCK question flagged for owner (34 admin API routes vs 39 admin LOCKED pages).
- Archival reason: shipped.
- Cross-refs: cites canonical billing keys (`billing.cancel.own`, `billing.invoices.view_own`, etc.).
- Concerns: marker convention since dropped.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-security-rounds-2-7/_round4_prep.md
- Purpose: Round 4 prep covering 13 real bugs across 4 tracks (U DB lockdown + scoring, V iOS broken flows, W key cleanup + REFERENCE counts, X marker cleanup + dead NotificationBell).
- Topics: users-table privileged-column trigger, `award_reading_points` RPC, AlertsView column-name bug (`is_read` vs `read`), SubscriptionView phantom-column promo flow, AuthViewModel signup user_roles 403 swallow, missing `profile.expert.badge.view` key, 16 unmigrated files, 27 admin DS primitives, 18 marker-missing files, dead `NotificationBell.tsx`.
- Archival reason: shipped pre-prelaunch.
- Cross-refs: enumerates exact line numbers across `VerityPost/VerityPost/StoryDetailView.swift:1753-1790`, `AlertsView.swift:494-528`, `SubscriptionView.swift:481-493`, `AuthViewModel.swift:275-288`.
- Concerns: line numbers are pre-rename (file was at `VerityPost/VerityPost/`, now `VerityPost/VerityPost/`).

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-security-rounds-2-7/_round4_prep_HYGIENE.md
- Purpose: Tracks W + X side of Round 4 (validated against live DB on 2026-04-18) — surgical sequence for migration `068_round4_permission_key_cleanup.sql`, `/api/health` lockdown, REFERENCE.md count fixes, marker pass on 16 + 27 + 34 files.
- Topics: 928 active permissions post-migration; `notifications.mark_read`/`mark_all_read` already exist; flag-but-don't-delete on `NotificationBell.tsx`; `perms_global_version` lives in its own table not `settings`.
- Archival reason: shipped.
- Cross-refs: cites the master prep + Track U/V package (`_round4_prep_SECURITY.md`).
- Concerns: notes 4 `profile.activity.*` cluster variants (`.view`, `.view.own`) — verify final state after deactivation.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-security-rounds-2-7/_round4_prep_SECURITY.md
- Purpose: Tracks U + V (security package) — privileged-column trigger design + `award_reading_points` RPC + extended `handle_new_auth_user` to seed default `user` role for non-first signups.
- Topics: 22-column extended privileged-column blocklist; trigger-bypass via `current_user IN ('postgres','supabase_admin','service_role','supabase_auth_admin')` exemption; iOS path swap (`StoryDetailView.appAwardPoints` → RPC; `AlertsView` mark-read via existing `PATCH /api/notifications`; `SubscriptionView.redeemPromo` via existing `/api/promo/redeem`); migration numbers 065/066/067.
- Archival reason: shipped.
- Cross-refs: extends `handle_new_auth_user()` from migration 067; flagged latent bug `applies_to_plans` vs `applicable_plans` for follow-up.
- Concerns: latent bug at `/api/promo/redeem/route.js:88` (`applicable_plans?.[0]`) — closed in Round 5 Item 1.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-security-rounds-2-7/_round5_item1B_audit.md
- Purpose: Audit of `promo_uses` insert at `route.js:69-73` writing nonexistent `redeemed_at` column + omitting NOT NULL `discount_applied_cents`.
- Topics: schema verification, two combined bugs, "useError → already used" copy hides schema regressions; counter-rollback semantics; UNIQUE constraint missing on `(promo_code_id, user_id)`.
- Archival reason: shipped via Round 5.
- Cross-refs: `site/src/types/database.ts:5259-5307`.
- Concerns: notes missing UNIQUE — flag for verification.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-security-rounds-2-7/_round5_item1B_fix_plan.md
- Purpose: 3-edit fix plan for Item 1B — fix column name, compute `discountAppliedCents`, differentiate insert errors from duplicate-use, refactor 100%-discount block to consume pre-fetched plan.
- Topics: same as audit + concrete diff blocks.
- Archival reason: shipped.
- Cross-refs: same.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-security-rounds-2-7/_round5_item1_audit.md
- Purpose: Audit of `applicable_plans` (wrong) → `applies_to_plans` (real) bug + plans `.eq('name', uuid)` adjacent bug.
- Topics: 4 references in route.js (line 85 comment, 88 read, 95 plan lookup, 133 response key); 0 active promos in DB at audit time; admin UI is schema-correct.
- Archival reason: shipped.
- Cross-refs: cites `01-Schema/reset_and_rebuild_v2.sql:1359`.
- Concerns: none.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-security-rounds-2-7/_round5_item1_fix_plan.md
- Purpose: 5-edit fix plan to rename column reads, switch lookup to UUID, update audit metadata, response key, and resolve V.6 Round 4 carry-over flag.
- Topics: same.
- Archival reason: shipped.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-security-rounds-2-7/_round5_item2_audit.md
- Purpose: Audit of iOS `SettingsView` direct `users` writes; latent column bugs (location/website/avatar/preferences phantoms).
- Topics: 6 SettingsView.swift call sites + 1 AuthViewModel; column classification (SELF-SERVICEABLE / SYSTEM-ONLY / PRIVILEGED) across 90 columns; recommends Option B (new `update_own_profile` RPC) over Option A (web endpoint) since web is just-as-direct.
- Archival reason: shipped.
- Cross-refs: cites Round 4 trigger + `06_award_reading_points` migration.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-security-rounds-2-7/_round5_item2_fix_plan.md
- Purpose: Implementation plan for `update_own_profile(p_fields jsonb)` RPC + 6 iOS SettingsView edits + 1 AuthViewModel edit + 7 web call-site swaps.
- Topics: 18-column allowlist, fail-closed unknown-key behavior, Option 1 (server-side metadata deep-merge) vs Option 2 (client-side); expert_title/expert_organization owner-decision flagged; `lib/coppaConsent.js` separate; migration 067.
- Archival reason: shipped.
- Concerns: one ambiguity (expert_title/expert_organization) flagged for owner — verify resolved.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-security-rounds-2-7/_round6_ios_data_plan.md
- Purpose: Round 6 iOS-DATA — 7 column-drift fixes across 4 Swift files (~15 call sites).
- Topics: `preferences` → `metadata` (6 SettingsView reads); `VPNotification` `read`/`link` → `is_read`/`action_url`; `alert_preferences` model mismatch → `#if false` until Round 7; `expert_applications` shape via `/api/expert/apply`; `support_tickets` shape via `/api/support`; `kid_profiles` flow via `/api/kids` (recommend redirect to existing flow); StoryDetailView mention autocomplete drops `plan, role, avatar`.
- Archival reason: shipped (Round 6).
- Cross-refs: cites `/api/support` web-side `description`-column bug (cross-track flag, fixed Round 7).
- Concerns: notes `submitted_at` → `created_at` order-by bug (fix shipped).

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-security-rounds-2-7/_round6_ios_gates_plan.md
- Purpose: Round 6 iOS-GATES — paid-tier bypass fixes for DM send + follow toggle + bearer-fallback patch in `auth.js`.
- Topics: `MessagesView.swift:854` direct `messages.insert` bypassing post_message rate-limit/length/paid-gate; `PublicProfileView.swift:191-201` direct follow insert bypassing `profile.follow` perm; bearer-bypass in `requirePermission`; new-DM convo orphan flagged for Round 7.
- Archival reason: shipped.
- Cross-refs: pinpoints `site/src/lib/auth.js` `resolveAuthedClient` introduction + `kids/reset-pin signInWithPassword` not bypass-affected.
- Concerns: flags `/api/bookmarks` and `/api/stories/read` silently 401-ing from pure-iOS sessions — closed in Round 7 bearer plan.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-security-rounds-2-7/_round6_security_plan.md
- Purpose: Round 6 SECURITY — admin RPC lockdown (14 SECURITY DEFINER fns) + pso_select RLS tighten.
- Topics: REVOKE-only strategy chosen over body rewrites (auditor-recommended) because every legitimate caller uses service_role; `anonymize_user` gets defensive self-anonymize guard as the one body-edit; `permission_scope_overrides.pso_select` tightened from `true` to admin OR scope_id matching auth.uid(); 14 functions enumerated with full signatures; web/iOS caller audit confirms zero session-client callers.
- Archival reason: shipped.
- Cross-refs: cites `01-Schema/016_phase8_trust_safety.sql`, `056` increment_field hardening.
- Concerns: notes `anonymize_user` cron caller not located in `site/src` — verify cron path runs as service_role.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-security-rounds-2-7/_round7_bearer_bypass_plan.md
- Purpose: Round 7 bearer-bypass on pre-bound routes — 7 routes pass cookie-bound client into `requirePermission` short-circuit.
- Topics: hybrid approach — Tier 1 iOS-reachable (`/api/stories/read`) gets route-local bearer resolver; Tier 2 web-only (6 routes including `/api/admin/stories` PUT/POST/DELETE) gets Option-A (drop pre-bound argument, use cookie fallback); `/api/account/delete` already correct.
- Archival reason: shipped.
- Cross-refs: explicitly flags `/api/kids/reset-pin signInWithPassword` for future iOS support.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-security-rounds-2-7/_round7_startconv_support_tx_plan.md
- Purpose: Round 7 — `start_conversation` RPC (atomic convo + 2 participants, paid-gate, dedup) + `create_support_ticket` RPC (atomic ticket+message).
- Topics: free-user empty-conversation orphan bypass via direct `conversations.insert`; orphan support-ticket header on partial failure; recommends Option (a) SECURITY DEFINER RPCs over RLS rewrite or compensating delete; new `/api/conversations` route.
- Archival reason: shipped (migrations 069, 070).
- Cross-refs: refs `post_message` RPC pattern.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-ui-ios-audits/_README.md
- Purpose: index for the 5 read-only UI/UX/iOS observational audits.
- Topics: lead audit + 3 peer audits + iOS preflight.
- Archival reason: findings absorbed; reports themselves are observational artifacts.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-ui-ios-audits/IOS_UI_AGENT_BRIEF.md
- Purpose: Read-only briefing template for iOS UI agents — establishes 19 hard non-negotiables (don't change `PermissionStore.shared.has`, don't introduce new keys, don't write directly to `users`, don't re-enable `#if false` blocks, no third-party analytics, no emojis except Kids, no `print(...)`, etc.).
- Topics: complete file inventory + responsibility/ownership map; permission model overview; iOS architecture grouping (infra-DO-NOT-MODIFY vs feature-territory); known a11y debt; copy principles.
- Archival reason: archive of process artifact, not active code.
- Cross-refs: cites `Theme.swift`, `PermissionService.swift`, `Models.swift` post-Round-8 column-name fixes.
- Concerns: still describes the codebase accurately at a high level — could be useful for future onboarding agents but is currently archived.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-ui-ios-audits/_ios_preflight_audit.md
- Purpose: Pre-flight App Store readiness audit on `VerityPost/VerityPost.xcodeproj`.
- Topics: 4 entitlement-level blockers (no aps-environment, no SIWA entitlement, no Associated Domains, IAP capability); runtime risks (no `.storekit` config); 7 raw `print()` calls in ProfileView.swift; privacy-label list; product-ID alignment with DB confirmed clean (8 IDs match plans.apple_product_id).
- Archival reason: snapshot of pre-launch readiness.
- Cross-refs: refs `01-Schema/reset_and_rebuild_v2.sql` plans seed.
- Concerns: line "No Sentry, Firebase, Segment, Amplitude wired" + "Recommend adding Sentry iOS SDK post-launch" — owner directive is to defer Sentry pre-launch (memory `feedback_sentry_deferred.md`); the audit's recommendation predates that decision.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-ui-ios-audits/_ui_lead_audit.md
- Purpose: Lead UI audit (solo first pass) covering web (23 surfaces), kids web (5), admin console (sampled), iOS (8 core views).
- Topics: Top-15 ranked issues — Sign in/Sign up casing inconsistency (top issue), double headers everywhere, font-size soup (16 unique values web + iOS adds 5 more), 13 avatar sizes, container maxWidth sprawl across 20 widths, iOS Dynamic Type completely broken (App Store accessibility risk).
- Archival reason: observational — findings absorbed into Round I + later UI work.
- Concerns: ~70% of issues remain partially open per the responsive-behavior gaps and design-token sprawl.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-ui-ios-audits/_ui_peer_1_audit.md
- Purpose: Peer audit #1, copy + information hierarchy focus.
- Topics: 30 ranked findings across 3 severity tiers; "Invalid credentials" too cold; "/messages billing dead-end" silent redirect; sign in casing canonical proposal "Sign in / Sign up"; tier ladder name inconsistency (Newcomer/Reader/Contributor mixing demographic + activity + honorific).
- Archival reason: observational.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-ui-ios-audits/_ui_peer_2_audit.md
- Purpose: Peer audit #2, spacing + hierarchy + visual system focus.
- Topics: 26 ranked findings; iOS forced-light + zero @ScaledMetric (P0); 5 total media queries across entire web (no responsiveness 320→1920); 16 borderRadius values; 16 fontSize values; 20 maxWidth values; 13 avatar sizes; touch-target violations table.
- Archival reason: observational.
- Concerns: many of these design-system findings are still open at archive time; flagged in MASTER_TRIAGE work.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-18-ui-ios-audits/_ui_peer_3_audit.md
- Purpose: Peer audit #3, engagement + user journey + accessibility focus.
- Topics: 28 ranked findings; iOS zero accessibility modifiers (P0); every page same `<title>` (P0 SEO); bottom nav missing Search/Bookmarks/Messages/Browse (P0 IA); story regwall no focus trap (P0 a11y); breaking-banner not clickable; conversion-moment scattered upgrade CTAs.
- Archival reason: observational.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-19-prelaunch-sprint/_README.md
- Purpose: index for the 9-round capstone hardening sprint.
- Topics: maps Rounds A-I to migrations 092 (RLS), 093 (RPC), 094 (auth integrity), `_claims/` token folder; capstone verdict CONDITIONAL YES.
- Cross-refs: `05-Working/OWNER_TO_DO.md`, `ROTATE_SECRETS.md`.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-19-prelaunch-sprint/_prelaunch_attack_plan.md
- Purpose: Round-by-round attack plan with effort estimates, sequencing, cross-round dependencies.
- Topics: 87 raw → 59 deduped → 9 Rounds A-I + deferred + owner-side; dedupe verification table for Agent 1 "already fixed" claims; 3 NEW issues surfaced by Agent 2 (12 RLS-no-policy tables, users column write primitives, owner-bootstrap race); deferred bucket explicit list.
- Archival reason: shipped.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-19-prelaunch-sprint/_prelaunch_capstone_report.md
- Purpose: Independent verification of all 9 rounds against live DB; ship verdict CONDITIONAL YES.
- Topics: 51/59 in-scope + 3 new resolved; 6 Critical + 22 High + 15 Medium done; remaining gaps: M-02/M-04/M-05/M-06 (technical debt deferred), L-05/L-07/L-10/L-11; HIBP toggle owner-side.
- Cross-refs: `OWNER_TO_DO.md` Pass 99, `ROTATE_SECRETS.md`.
- Concerns: notes `webhook_log` belt-and-suspenders setup, `banners` bucket SELECT scoped to authed-foldername-only — questions whether anon viewer access is intentionally blocked.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-19-prelaunch-sprint/_prelaunch_master_issues.md
- Purpose: Deduped master issue list — 6 Critical, 22 High, 20 Medium, 11 Low. Authoritative input to Rounds A-I.
- Topics: per-issue file:line, severity, dedup evidence, "already handled" struck list (R1-C2 env, R2-C1 Test: headlines, R2-C3 0 seeded content, R3-C3 live secrets); per-issue "code fix" vs "owner-side" flag.
- Archival reason: shipped.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-19-prelaunch-sprint/_prelaunch_reviewer_1.md
- Purpose: Reviewer 1 deploy/config NO verdict.
- Topics: 4 Critical (status page fabrication, env placeholders in `.env.local`, sitemap localhost, schema drift); 6 High (signup display_name drop, OAuth callback caller-client writes, perms_global_version RLS, banners bucket LIST, HIBP off, etc.).

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-19-prelaunch-sprint/_prelaunch_reviewer_2.md
- Purpose: Reviewer 2 user-flow NO verdict.
- Topics: 5 Critical (Test: headlines, /billing 404, 0 sources/comments seeded, bookmark cap copy contradicts itself, Family signup dead-end); 10 High user-friction items.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-19-prelaunch-sprint/_prelaunch_reviewer_3.md
- Purpose: Reviewer 3 security/ops NO verdict.
- Topics: 5 Critical (PII leak via users RLS + column grants, 11 spoofable DEFINER RPCs, live secrets on workstation, authenticated CRUD on auth tables, audit_log forgery); CSP unsafe-inline; Stripe URLs unvalidated.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-19-prelaunch-sprint/round_a_caller_changes.md
- Purpose: 15 caller-file edits (12 web + 3 iOS) required before/with `092_rls_lockdown.sql` deploy.
- Topics: signup, callback, login, support, admin/users, admin/permissions, admin/plans, admin/subscriptions audit_log inserts; service-role swaps for `user_roles`/`audit_log` writes (revoked from authenticated).

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-19-prelaunch-sprint/round_a_migration.sql
- Purpose: 092 RLS lockdown migration (537 lines) — the highest-leverage migration.
- Topics: closes C-03 (PII leak via `public_user_profiles` view + REVOKE column-level SELECT), C-05 (REVOKE auth-table CRUD), C-06 (audit_log_insert WITH CHECK = false), H-07 (anon EXECUTE on auth helpers), H-20 (perms_global_version RLS), M-16 (webhook_log_insert false), N-01 (12 RLS-enabled-no-policy tables — 6 user-facing get policies, 6 service-only), N-02 (users column write primitives revoked).
- Cross-refs: stuck `caller-changes BEFORE` enumerated.
- Concerns: notes 7 Round A WARN advisors expected to remain (user-facing `access_requests` insert + 5 anon-write collectors).

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-19-prelaunch-sprint/round_a_verification.md
- Purpose: Per-issue SQL + curl verification for Round A.
- Topics: C-03 view check, C-05 table privilege check, C-06 forbidden insert, H-07 EXECUTE check, etc.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-19-prelaunch-sprint/round_b_caller_changes.md
- Purpose: Single web caller edit (`/api/support/route.js`) for Round B; 10 RPCs only need REVOKE.
- Topics: drop p_user_id + p_email from `create_support_ticket`; new 3-arg signature; ship-order constraint (atomic with migration).

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-19-prelaunch-sprint/round_b_migration.sql
- Purpose: 093 RPC actor-spoof lockdown — REVOKE-only on 10 RPCs + drop spoofable args on `create_support_ticket`.
- Topics: REVOKE strategy rationale (every caller is server-side service-role); guard-clause approach rejected because no session-bound caller exists.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-19-prelaunch-sprint/round_c_plan.md
- Purpose: Round C plan — money-path UX (C-02 /billing 404 → server redirect, H-09 /messages overlay, H-10 settings/billing client-stub flash, H-15 quiz dead-end, H-17 fragile #billing anchor, M-20 AskAGrownUp default href).
- Topics: detailed file:line snippets + before/after.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-19-prelaunch-sprint/round_d_plan.md
- Purpose: Round D plan — public-surface hardening.
- Topics: C-01 delete /status fabricated page; H-06 derive Stripe URLs from request.nextUrl.origin; H-11 public /contact; H-12 sitemap with articles+categories; H-14 dead search-verify banner; H-18 generateMetadata on story page; H-19 access-request rate-limit; L-01 sitemap enumeration.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-19-prelaunch-sprint/round_e_plan.md
- Purpose: Round E plan — auth + signup integrity.
- Topics: H-01 signup display_name (resolved by Round A); H-02 OAuth callback service-role swap; H-08 stripe_customer_id race (`.is('stripe_customer_id', null)`); H-22 verified `handle_new_auth_user` does not read raw_user_meta_data.role; N-03 owner-bootstrap race guard.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-19-prelaunch-sprint/round_f_plan.md
- Purpose: Round F plan — CSP, CORS, observability.
- Topics: H-05 nonce-based CSP via middleware (drop unsafe-inline + unsafe-eval, add Sentry connect-src); H-21 cron Vercel header; M-03 timing-safe health compare; M-15 rate-limit fail-closed in prod; M-17 CORS allow-list; M-18 Sentry wrap throws in prod when @sentry/nextjs missing.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-19-prelaunch-sprint/round_g_owner_action.md
- Purpose: Single owner-side dashboard click for HIBP toggle (H-04).
- Topics: exact clickpath in Supabase Auth → Providers → Email → Password Security; verification with `password123` test signup.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-19-prelaunch-sprint/round_g_plan.md
- Purpose: Round G plan — banners bucket SELECT tighten (H-03) + HIBP toggle (H-04).
- Topics: REVOKE LIST scoped to path-prefix per user; HIBP owner action.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-19-prelaunch-sprint/round_h_migration.sql
- Purpose: Round H — 12 ALTER FUNCTION SET search_path = public, pg_temp.
- Topics: priority sequencing (`reject_privileged_user_updates` first); zero semantic change; verification query.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-19-prelaunch-sprint/round_i_plan.md
- Purpose: Round I plan — UX/copy polish across 22+ items.
- Topics: H-13 unlock-quizzes copy; H-16 mobile Discussion tab states; M-08 dedup quiz celebration; M-09 reading-complete visibility guard; M-10 anon Sign up CTA; M-11 bookmark cap dedup; M-12 regwall sessionStorage clear; L-04 curly apostrophe; deferred bucket (L-03/L-05/L-06/L-07/L-09/L-10/L-11/M-02/M-04/M-05/M-13).

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-19-prelaunch-sprint/_claims/track_E_claimed.txt
- Purpose: Track E claim token — files claimed by parallel-execution agent.
- Topics: 4 components (`Ad.jsx`, `Interstitial.jsx`, `LockModal.jsx`, `RecapCard.jsx`).

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-19-prelaunch-sprint/_claims/track_F_claimed.txt
- Purpose: Track F claim token (not yet read body, file is in zone — same pattern).

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-19-prelaunch-sprint/_claims/track_G_claimed.txt
- Same pattern.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-19-prelaunch-sprint/_claims/track_H_claimed.txt
- Same.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-19-prelaunch-sprint/_claims/track_K_claimed.txt
- Same.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-19-prelaunch-sprint/_claims/track_L_claimed.txt
- Same.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-20-consolidation/BATCH_FIXES_2026_04_20.md
- Purpose: 51-fix batch session log — applied across 12 batches via paranoid agent pattern (2 pre + implementer + 1-2 post per batch). Typecheck/build green. NO commits — file changes ready for review.
- Topics: route fixes, checkout-feedback + ghost-read + onboarding routing, rate-limits on 5 routes, hardening + feedback, welcome gate + v2LiveGuard fail-closed + PII sweep, admin dead-widgets + /kids-app landing, error sweep on 4 more routes, Kids iOS Dynamic Type migration (24 sites), Kids tap targets + DOB validation + DB perm fix, then more rounds.
- Cross-refs: a precursor to TASKS.md / DONE.md split.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-20-consolidation/CUTOVER.md.old
- Purpose: Production cutover runbook (preserved as `.old` after retirement).
- Topics: Stripe live setup, Resend, Vercel env, Vercel cron, backup, etc.
- Archival reason: superseded by `Current Projects/Audit_2026-04-24/OWNER_TODO_2026-04-24.md`.
- Concerns: still describes Stripe product names + price IDs format — could mislead a reader if Stripe spec has changed.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-20-consolidation/DEPLOY_PREP.md
- Purpose: Owner-side deploy-prep checklist consolidating remaining P0s — apply 4 seed SQLs, set Vercel env vars, HIBP toggle, rotate secrets, reconcile migration drift, publish real articles, push 20 commits.
- Topics: schema/101 (rate_limits seed), 102 (data_export_ready email template), 103 (reserved_usernames), 104 (blocked_words); current state at writing (20 commits ahead of origin/main).

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-20-consolidation/DONE.md
- Purpose: Master log of shipped work, append-only, grouped by area.
- Topics: auditor contract (grep before flagging); per-area shipping log (Auth, Billing, Kids, Permissions, etc.).
- Archival reason: explicitly retired per CLAUDE.md ("DONE.md → retired; ship status is tracked inline in `Current Projects/MASTER_TRIAGE_2026-04-23.md` via per-item `SHIPPED <date>` blocks plus the Session folder's `COMPLETED_TASKS_<YYYY-MM-DD>.md`").
- Concerns: still cited from active CLAUDE.md as where shipping was tracked before SHIPPED-block convention; useful as historical reference.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-20-consolidation/FUTURE_DEDICATED_KIDS_APP.md
- Purpose: Spec for forking Kids iOS into its own app (deferred post-launch).
- Topics: Option A (two Xcode targets, shared sources) vs Option B (separate projects, shared Swift Package); auth flow rework (no child self-sign-up, parent-issued pair codes).
- Archival reason: deferred. The dedicated Kids app has since been built (`VerityPostKids/`) — this doc predates that decision.
- Concerns: **MISCLASSIFIED.** The dedicated kids iOS app exists at `VerityPostKids/` and is described in active `Reference/CLAUDE.md` as one of the three apps. This archived doc describes an alternate-future "if/when forked" scenario which is now actual. The proposal predates the build; the actual fork happened. The doc itself is correctly archived (it's a planning artifact), but its existence in archive could mislead an agent into thinking the Kids iOS app does not exist.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-20-consolidation/NEXT_SESSION.md
- Purpose: Session 2026-04-20 → next-session handoff.
- Topics: 25 commits ahead of origin/main, NOT pushed; T-019 12 two-wide cases; T-018 2 files refactor; helpers shipped (adminMutation, siteUrl, plans, roles, rateLimit, apiErrors); seed SQLs awaiting owner.
- Archival reason: superseded by 2026-04-24 prompts.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-20-consolidation/PROFILE_FULL_FLOW.md
- Purpose: Full feature inventory of the product (Part 1 — every feature) + role/tier ladder (Part 2).
- Topics: reading, quizzes, comments, expert, social, family, kids, billing, search, settings, notifications, admin, etc. Comprehensive feature list.
- Archival reason: completeness reference, observational.
- Concerns: Could be useful as a product reference today — flag as a candidate for promotion to `Reference/` if no equivalent exists. (Verify if `Reference/STATUS.md` or similar covers the same ground.)

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-20-consolidation/TASKS.md
- Purpose: Canonical task list at session-end 2026-04-20 — 86 tasks (P0=6, P1=21, P2=29, P3=24, P4=6).
- Topics: T-001..T-086+ workflow (active → shipping → close); per-task ID/Priority/Effort/Lens/file:line/Why/Do/Acceptance.
- Archival reason: explicitly retired per CLAUDE.md ("TASKS.md retired into `Current Projects/FIX_SESSION_1.md`" → which itself was retired into MASTER_TRIAGE_2026-04-23).
- Concerns: cites historical T-IDs that the SHIPPED blocks in MASTER_TRIAGE may still reference.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-20-consolidation/TEST_WALKTHROUGH.md.old
- Purpose: End-to-end manual test walkthrough.
- Topics: signup + email verification, onboarding, browse/article, quiz, comments, bookmarks, kid mode, expert app.
- Archival reason: superseded.
- Concerns: still describes a working test plan — could be revisited but not active.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-20-consolidation/kidsactionplan.md
- Purpose: Kids iOS app action plan for 2026-04-19.
- Topics: Pass 1-4 progress; live migrations 095/096/097; Pair-code auth; V3 animations; ParentalGate; PrivacyInfo.xcprivacy.
- Archival reason: kids iOS app shipped; this is a historical plan.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-24-tracker-retirement/424_PROMPT.md
- Purpose: Continuation prompt for next session ("424") at the moment 10 fix commits + 2 docs commits had landed across 2 sessions on 2026-04-23.
- Topics: 7 commits closing Tier 0 + Tier 1 (Items 1+2/4/3/6/7/8/9 from 11-agent review sweep); 3 billing infra commits (B1/B11/B3); owner items pending (apply schema/148, 146, NEXT_PUBLIC_SITE_URL); pick-up state for L1 (SEO leak — `/category` and `/card` in `PROTECTED_PREFIXES` causing indexing leak), 4 pre-impl agents in flight (A returned NEEDS-REWORK, B/C maybe still running, D not dispatched).
- Archival reason: handoff archival.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-24-tracker-retirement/426_PROMPT.md
- Purpose: Continuation prompt 426 ("what shipped 2026-04-24, 26 commits"). Tier 2 12-of-12 closed; Tier 3 web 11 shipped + 5 STALE/NOT-A-BUG; Admin band 3-of-7; migrations 150/151/152 verified live.
- Topics: STALE markers (#23, #28, #29, #32, #35, #37, #38, K5, K12); owner action still pending (SiteMode env etc).

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-24-tracker-retirement/427_PROMPT.md
- Purpose: Continuation prompt 427 ("Session 2 closed Admin + Kids iOS bands, most of Billing, most of Cron/lib"). Admin 4-of-4, Kids iOS 11-of-11 + 3 STALE, Billing 12-of-17 + 3 STALE + 2 DEFERRED, Cron/lib 11-of-20 + 6 STALE + 3 DEFERRED.
- Topics: migrations queued (153, 154, 155, 156); STALE/DEFERRED catalog with reasoning per ID.
- Archival reason: handoff archival.

### /Users/veritypost/Desktop/verity-post/Archived/2026-04-24-tracker-retirement/FIX_SESSION_1.md
- Purpose: 1183-line canonical pre-retirement task list — 35 numbered items + 00-A through 00-O owner immediate actions + F1-F7 feature proposals.
- Topics: detailed per-item targets (file:line), verdicts (REAL/NOT-A-BUG/STALE), effort, source agent IDs; reader-UX cluster (F1+F2+F3+F4 all touch story page); monetization cluster (00-B AdSense + F5 ads + F6 measurement share infra); quiz-gate cluster (F3 needs kill-switch flip + 00-L needs ≥10 questions); cross-item overlap notes.
- Archival reason: explicitly retired per CLAUDE.md. Absorbed into `Current Projects/MASTER_TRIAGE_2026-04-23.md`.
- Concerns: Used heavily as a reference doc — many MASTER_TRIAGE rows cite FIX_SESSION_1 item numbers, so this archive is still load-bearing as a citation target.

### /Users/veritypost/Desktop/verity-post/Archived/_from-05-Working/2026-04-20-task-synthesis/_CONSOLIDATED_TASKS.md
- Purpose: Agent 1 consolidated task list (T-001..T-110) from BATCH_FIXES, STATUS, WORKING, 4 final auditors.
- Topics: per-task file:line/Priority/Effort/Lens; deferred bucket T-061..T-066; owner-only T-067..T-080.
- Archival reason: input to TASKS.md → MASTER_TRIAGE → archive.

### /Users/veritypost/Desktop/verity-post/Archived/_from-05-Working/2026-04-20-task-synthesis/_GAP_TASKS.md
- Purpose: Agent 2 gap-detection task list (G-001..G-060) — DB-first drift detection.
- Topics: hardcoded data already living in Supabase (score_tiers vs hardcoded TIER_META, plans duplicated PLAN_OPTIONS, plans.price_cents vs PRICING, plans.description vs TIERS.features, plans.max_family_members vs maxKids, plan_features.bookmarks.limit_value vs FREE_BOOKMARK_CAP, etc.).
- Archival reason: synthesized into MASTER_TRIAGE.

### /Users/veritypost/Desktop/verity-post/Archived/_from-05-Working/2026-04-20-task-synthesis/_REVIEW_NOTES.md
- Purpose: Agent 3 verification of every claim in Agents 1+2 against live codebase + DB.
- Topics: Agent 1: VERIFIED 92 / WRONG 2 / PARTIAL 6 / UNCERTAIN 10. Agent 2: VERIFIED 52 / WRONG 1 / PARTIAL 5 / UNCERTAIN 2. 14 duplicate pairs identified.
- Archival reason: verification artifact.

### /Users/veritypost/Desktop/verity-post/Archived/_from-05-Working/2026-04-20-working-md-retired/WORKING.md
- Purpose: Active-resolution surface as of 2026-04-19.
- Topics: launch blockers (HIBP, secrets, Sentry env, NEXT_PUBLIC_SITE_URL, real articles, CSP flip, schema commit backlog, build hygiene); pre-capstone Apple/GoogleOAuth/Vercel APNs items; 5 LBs (LB-006/010/013/016/034); shipped pre-capstone.
- Archival reason: explicitly retired and superseded by FIX_SESSION_1.md → MASTER_TRIAGE.

## Within-zone duplicates / overlap

- **TASKS.md (consolidation)** vs **_CONSOLIDATED_TASKS.md (from-05-Working)**: same lineage, same T-IDs but the consolidation copy is the canonical end-state with workflow rules; the from-05-Working copy is the synthesis input. Both are correctly archived; not real duplicates.
- **DONE.md (consolidation)**: precedes the SHIPPED-block convention in MASTER_TRIAGE. The same shipped facts are now tracked inline in MASTER_TRIAGE rows. DONE.md remains a useful historical lookup but is intentionally retired.
- **CUTOVER.md.old + DEPLOY_PREP.md** in 2026-04-20-consolidation: overlapping cutover guidance. CUTOVER is fuller; DEPLOY_PREP is the focused owner-side checklist. Both still useful.
- **TEST_WALKTHROUGH.md.old**: standalone test plan; no overlap with other docs.
- **_round4_prep.md** vs **_round4_prep_HYGIENE.md** vs **_round4_prep_SECURITY.md**: master prep + 2 split-package preps. Master prep is the planning doc; the two split preps are paired-prepper outputs that supersede with validated-against-live-DB findings. Useful in chronological sequence (master → packages).
- **_round5_item1_audit.md / _round5_item1_fix_plan.md / _round5_item1B_audit.md / _round5_item1B_fix_plan.md / _round5_item2_audit.md / _round5_item2_fix_plan.md**: 6 paired docs, no internal overlap; each item has its own audit/plan pair.
- **_prelaunch_attack_plan.md** vs **_prelaunch_master_issues.md**: input list (master issues) → execution plan (attack). No real overlap.
- **_prelaunch_reviewer_{1,2,3}.md**: 3 independent reviewer reports — by design they overlap on findings; the deduped master issue list collapses them.
- **WORKING.md** vs **NEXT_SESSION.md**: distinct snapshots, different dates, no real overlap.
- **kidsactionplan.md** vs **FUTURE_DEDICATED_KIDS_APP.md**: different concerns (current pass plan vs proposed future fork). No overlap.
- **424_PROMPT.md / 426_PROMPT.md / 427_PROMPT.md**: chronological session-handoff prompts; each closes the prior with no real duplication. They reference each other forward (424 → 426 → 427).

## Within-zone misclassification (archived but still active)

- **None firmly active.** No archived doc here clearly describes current behavior in a way that would mean it shouldn't be archived. However, two notes:
  - `Archived/2026-04-20-consolidation/PROFILE_FULL_FLOW.md` is a comprehensive feature inventory + role/tier ladder. It's archived but reads like a still-useful product reference. Worth verifying whether the live `Reference/STATUS.md` or `Reference/CLAUDE.md` covers the same ground; if not, this could deserve promotion to `Reference/` (as a product spec) rather than living in archive.
  - `Archived/2026-04-18-ui-ios-audits/IOS_UI_AGENT_BRIEF.md` is a still-coherent briefing for any future iOS UI agent. It's correctly archived as a process artifact, but its 19 hard non-negotiables remain accurate and could be folded into the iOS section of CLAUDE.md if not already.
- **Zero `@admin-verified` markers should ever be reintroduced** per memory `feedback_admin_marker_dropped.md`; the README files in `2026-04-18-admin-lockdown/` and `_round2_prep.md` describe an active LOCK convention that has since been dropped. Their archival status is correct, but a future agent reading these out of context could reintroduce the marker.

## Notable claims worth verifying in later waves

1. **`@migrated-to-permissions` and `@feature-verified` marker convention status**: the `_round3_prep.md` and `_round4_prep_HYGIENE.md` describe these markers as load-bearing. The 2026-04-23 admin-marker drop only retired `@admin-verified`. Verify whether the other two markers are still active in current code or whether they too have been retired — if retired, the older docs implying they're load-bearing are misleading.
2. **`profile.activity.*` cluster post-Round-4-Track-W**: 4 variants identified; deactivated `profile.activity.view` and `profile.activity.view.own`. Verify that `profile.activity` (canonical) and `profile.activity.own` (claimed not to exist) match live DB today.
3. **The 5 known-open issues from `ADMIN_STATUS.md`**: perms_version TOCTOU, /admin/moderation/reports embed of only `reporter`, cascading set toggles not bumping versions, /api/admin/users/:id/roles not bumping perms_version, /admin/subscriptions manual downgrade not syncing users.plan_id. Verify each is resolved in MASTER_TRIAGE shipped blocks.
4. **`E2E_VERIFICATION.md` 9-key + 11-key flag-for-owner list**: `ads.suppress`, `article.bookmark.collections`, `article.bookmark.unlimited`, `expert.queue.oversight_all_categories`, `leaderboard.view.categories`, `notifications.view_inbox`, `profile.card.share`, `profile.verity_score.view`, `recap.view` — verify these have all been added or renamed in the matrix.
5. **`PERMISSIONS_AUDIT.md` D-number gaps**: D6 comment-visibility RLS, D13 bookmarks broken, D33 expert_discussions select too wide. Verify each was closed (Round A RLS + RPC lockdowns are likely culprits).
6. **`anonymize_user` cron caller location**: Round 6 SECURITY plan flagged needing to verify the cron path runs as service_role. Verify cron file location + role.
7. **`/api/promo/redeem` UNIQUE constraint** on `(promo_code_id, user_id)` flagged as missing in Round 5 Item 1B audit. Verify whether the partial-index has been added since.
8. **iOS line numbers**: every Round 4-7 prep cites specific `VerityPost/VerityPost/StoryDetailView.swift:1753`, `AlertsView.swift:494-528`, etc. Lines are pre-rename/pre-edit; don't rely on these for current investigation.
9. **`/site/` paths in older docs**: every doc dated 2026-04-18 cites `site/src/...`; the rename to `web/src/...` happened later. Read paths with that translation.
10. **Marker drift fix on the 3 admin API routes** in Round 2 (signed-off as folded into Track M): verify markers exist on `web/src/app/api/admin/subscriptions/[id]/manual-sync/route.js`, `web/src/app/api/admin/users/[id]/permissions/route.js`, `web/src/app/api/admin/users/[id]/roles/route.js` — though these may now be retired with the marker convention.
11. **`update_own_profile` RPC**: 18-column allowlist defined in Round 5 Item 2; expert_title/expert_organization owner-decision flagged as ambiguity. Verify whether allowlist matches current live function.
12. **Round 4 Track W's HEALTH_CHECK_SECRET env var**: introduced as a header-based gate. Verify still present in Vercel env / used by health route.
