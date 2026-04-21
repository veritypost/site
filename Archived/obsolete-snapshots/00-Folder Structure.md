# 00-Folder Structure — Verity Post Repository Map

**Last generated:** 2026-04-18
**Purpose:** One-shot map of every folder and file in the repo, what each is about, and whether it's live-build / reference / archived.

**Status legend:**
- **Active** — part of the live build or actively maintained documentation
- **Reference** — design authority / lookup-only, not compiled but still load-bearing
- **Archived** — historical; do not use as source of truth

---

## `/` (repo root)

Top-level anchor. Holds numbered docs/data folders + the two code apps (`site/` web, `VerityPost/` iOS) + scripts + archive.

- `.claude/` — Claude Code session data + project memory. **Active** (tooling).
- `.gitignore` — git ignore rules. **Active**.
- `00-Folder Structure.md` — this file. **Active** (reference).

---

## `00-Reference/`

Canonical product reference. Design decisions, schema guide, blueprint, test-account lists. Read-only input to every PM / coding session. None of these are compiled; they're authoritative documentation.

- `Verity_Post_Blueprint_v2.docx` — master product blueprint (v2). Source of truth for feature scope. **Reference**.
- `Verity_Post_Design_Decisions.md` — D1–D44 canonical product rules. Every code decision maps back to a D-number. **Reference**.
- `Verity_Post_Schema_Guide.xlsx` — human-readable schema guide. **Reference**.
- `database_tables.xlsx` — tabular list of DB tables + purpose. **Reference**.
- `permissions_matrix.xlsx` — role × permission matrix. **Reference**.
- `test_accounts.xlsx` — seeded test accounts for each role/tier. **Reference**.

---

## `01-Schema/`

Canonical SQL. The v2 rebuild file is the base; migrations 005–063 layer on top. All applied to Supabase as of 2026-04-17.

- `reset_and_rebuild_v2.sql` — canonical Blueprint v2 schema (tables, RLS policies, indexes, seed data). **Active** (base schema).
- `005_test_content.sql` — seed test articles. **Active** (applied).
- `006_test_comments.sql` — seed test comments. **Active** (applied).
- `009_test_timelines.sql` — seed test timelines. **Active** (applied).
- `010_fix_user_roles.sql` — user_roles cleanup migration. **Active** (applied).
- `011_phase3_billing_helpers.sql` — billing RPCs + helpers. **Active** (applied).
- `012_phase4_quiz_helpers.sql` — quiz RPCs. **Active** (applied).
- `013_phase5_comments_helpers.sql` — comment helpers. **Active** (applied).
- `014_phase6_expert_helpers.sql` — expert-queue helpers. **Active** (applied).
- `015_phase7_helpers.sql` — general helpers. **Active** (applied).
- `016_phase8_trust_safety.sql` — trust & safety (blocks, mutes). **Active** (applied).
- `017_phase9_family.sql` — family-plan / kids bootstrap. **Active** (applied).
- `018_phase10_ads.sql` — ads tables. **Active** (applied).
- `019_phase11_notifications.sql` — notifications pipeline. **Active** (applied).
- `020_phase12_cutover.sql` — cutover migration. **Active** (applied).
- `021_phase13_cleanup.sql` — cleanup. **Active** (applied).
- `022_phase14_scoring.sql` — Verity Score scoring RPCs. **Active** (applied).
- `023_phase15_mute_checks.sql` — mute enforcement checks. **Active** (applied).
- `024_phase15_kid_trial_convert.sql` — D44 kid trial conversion. **Active** (applied).
- `025_phase17_fixes.sql` — phase 17 fixes. **Active** (applied).
- `026_phase18_sql.sql` — phase 18 SQL. **Active** (applied).
- `027_phase19_deletion.sql` — account deletion flow. **Active** (applied).
- `028_phase19_data_export.sql` — GDPR-style data export. **Active** (applied).
- `029_phase21_onboarding.sql` — onboarding RPCs. **Active** (applied).
- `030_phase22_error_logs.sql` — client error log table. **Active** (applied).
- `031_phase22_quiet_hours.sql` — push quiet-hours. **Active** (applied).
- `032_seed_test_articles.sql` — additional test articles seed. **Active** (applied).
- `033_comment_depth_2.sql` — limit comment depth to 2. **Active** (applied).
- `034_bugfix_ask_expert_tier.sql` — expert-ask tier fix. **Active** (applied).
- `035_kid_trial_perms.sql` — kid-trial permission wiring. **Active** (applied).
- `036_ios_subscription_plans.sql` — iOS apple_product_id seeding. **Active** (applied).
- `037_user_push_tokens.sql` — APNs push-token table. **Active** (applied).
- `038_messages_unread.sql` — unread-count RPC + index. **Active** (applied).
- `039_message_receipts_rls.sql` — DM read-receipts RLS. **Active** (applied).
- `040_data_export_email_template.sql` — export-ready email template. **Active** (applied).
- `041_expert_reverification.sql` — annual expert reverification cron. **Active** (applied).
- `042_family_achievements_coadult.sql` — co-adult achievements. **Active** (applied).
- `043_conversations_realtime_publication.sql` — realtime publication. **Active** (applied).
- `044_dm_read_receipts_enabled.sql` — per-user read-receipt opt-out. **Active** (applied).
- `045_fix_bookmarks_rls.sql` — fix bookmarks RLS (D13). **Active** (applied).
- `046_articles_search_fts.sql` — full-text search GIN index. **Active** (applied).
- `047_follows_paid_only.sql` — follows paid-only RLS (D28). **Active** (applied).
- `048_normalize_kid_category_names.sql` — kid category data migration. **Active** (applied).
- `049_post_message_rpc.sql` — `post_message` RPC. **Active** (applied).
- `050_check_user_achievements.sql` — `check_user_achievements` RPC. **Active** (applied).
- `051_user_category_metrics_rpc.sql` — profile 4-metric breakdown RPC + self-heal preamble. **Active** (applied).
- `053_resolve_username_to_email_rpc.sql` — login-via-username RPC. **Active** (applied).
- `054_user_account_lockout.sql` — account lockout RPCs (5-failed = 15min lockout). **Active** (applied).
- `055_admin_audit_log.sql` — admin_audit_log table + `record_admin_action` RPC. **Active** (applied).
- `056_verity_score_rpcs.sql` — verity-score RPC lockdown. **Active** (applied).
- `057_rpc_lockdown.sql` — rate-limit atomic RPC + search_path sweep. **Active** (applied).
- `058_kid_pin_salt.sql` — kid PIN PBKDF2 salt + algo. **Active** (applied).
- `059_billing_hardening.sql` — subscriptions self-write RLS drop + uncancel RPC. **Active** (applied).
- `060_resolve_username_anon_revoke.sql` — revoke anon on resolve-username RPC. **Active** (applied).
- `061_kid_paused_at.sql` — kid Pause/Resume column. **Active** (applied).
- `062_kid_global_leaderboard_opt_in.sql` — kid-leaderboard opt-in column. **Active** (applied).
- `063_kid_expert_session_rls.sql` — kid_expert_* RLS policies. **Active** (applied).
- `064_compute_effective_perms.sql` — permission resolver function. **Active** (applied).
- `065_restrict_users_table_privileged_updates_2026_04_19.sql` — Round 4 privileged-update trigger v1. **Active** (applied).
- `066_add_award_reading_points_rpc_2026_04_19.sql` — iOS award-on-read RPC. **Active** (applied).
- `067_add_post_signup_user_roles_trigger_2026_04_19.sql` — post-signup user-roles trigger. **Active** (applied).
- `068_round4_permission_key_cleanup.sql` — Round 4 Track W permission-key hygiene. **Active** (applied).
- `069_start_conversation_rpc_2026_04_18.sql` — Round 7 atomic start_conversation RPC. **Active** (applied).
- `070_create_support_ticket_rpc_2026_04_18.sql` — Round 7 atomic create_support_ticket RPC. **Active** (applied).
- `071_fix_article_reading_bindings.sql` — article.read.log + ad_free anon leak close. **Active** (applied).
- `072_fix_anon_leak_bindings.sql` — four keys moved off anon set. **Active** (applied).
- `073_fix_home_breaking_banner_paid.sql` — paid banner moved off anon. **Active** (applied).
- `074_bump_user_perms_version_atomic_security.sql` — harden perms-version bump (TOCTOU fix). **Active** (applied).
- `075_fix_notifications_core_bindings.sql` — notifications inbox/prefs bound to all signed-in tiers. **Active** (applied).
- `076_fix_settings_leak_bindings.sql` — settings surface bound to free+pro+family+expert+mod+editor. **Active** (applied).
- `077_fix_permission_set_hygiene_2026_04_18.sql` — 54-key Pattern B backfill + hygiene sweep. **Active** (applied).
- `078_fix_billing_bindings_2026_04_18.sql` — billing keys bound to paid tiers. **Active** (applied).
- `079_drop_role_permissions_table_2026_04_18.sql` — DROP legacy role_permissions table. **Active** (applied).
- `080_fix_editor_access_regression_2026_04_18.sql` — restore editor access to 10 admin.* keys. **Active** (applied).
- `081_deactivate_duplicate_billing_keys_2026_04_18.sql` — deactivate billing.cancel + billing.invoices.view. **Active** (applied).
- `082_restrict_users_table_privileged_updates_v2_2026_04_19.sql` — INVOKER trigger fix. **Active** (applied).
- `083_restrict_users_table_privileged_inserts_2026_04_19.sql` — BEFORE INSERT gap closed. **Active** (applied).
- `084_restrict_users_table_privileged_inserts_v2_2026_04_19.sql` — allow defaults on clean INSERT. **Active** (applied).
- `085_add_update_own_profile_rpc_2026_04_19.sql` — single server-side self-profile write contract. **Active** (applied).
- `086_lock_down_admin_rpcs_2026_04_19.sql` — 14 admin RPCs REVOKE + anonymize_user guard. **Active** (applied).
- `087_tighten_pso_select_rls_2026_04_19.sql` — pso_select tightened from USING(true). **Active** (applied).
- `088_anonymize_user_guard_cron_safe_2026_04_19.sql` — narrower self-anonymize guard (cron-safe). **Active** (applied).
- `089_start_conversation_rpc_2026_04_19_reapply.sql` — idempotency reapply. **Active** (applied).
- `090_fix_round8_permission_drift_2026_04_19.sql` — Round 8 permission drift fixes. **Active** (applied).
- `091_get_own_login_activity_rpc_2026_04_18.sql` — self-serve login activity RPC. **Active** (applied).

---

## `02-Parity/`

Cross-platform feature parity documentation. Web vs iOS split.

- `README.md` — parity docs overview. **Reference**.
- `Shared.md` — features shipping on both web + iOS. **Reference**.
- `Web-Only.md` — web-only features (admin, certain settings). **Reference**.
- `iOS-Only.md` — iOS-only features (biometric, push, StoreKit). **Reference**.

---

## `03-Build-History/`

Historical build/wiring notes. Snapshot-style documents from earlier phases — not actively maintained but useful for archaeology.

- `CATEGORY_FIXES.md` — categories schema/UI fixes log. **Reference** (historical).
- `FINAL_WIRING_LOG.md` — wiring log from an earlier deploy cut. **Reference** (historical).
- `MIGRATION_PAGE_MAP.md` — maps migrations to pages that depend on them. **Reference**.
- `PROFILE_FULL_FLOW.md` — profile flow walk-through doc. **Reference** (historical).

---

## `04-Ops/`

Operational / deployment docs.

- `CUTOVER.md` — go-live cutover plan + runbook. **Reference**.
- `PROJECT_STATUS.md` — operational status snapshot (refreshed Pass 15). **Reference** (may be stale — prefer `05-Working/STATE.md`).
- `TEST_WALKTHROUGH.md` — E2E smoke-test walkthrough script. **Reference**.

---

## `05-Working/`

Active PM + working-doc hub. Refreshed continuously; this is where current-state, bug intake, audit logs, and owner checklists live.

- `APPLY_ALL_MIGRATIONS.sql` — 12-migration concatenated paste-set for Supabase (includes 051 self-heals). **Active** (all 12 applied 2026-04-17; kept for re-apply reference).
- `AUTONOMOUS_FIXES.md` — append-only per-task receipt log (150 entries). **Active**.
- `DEEP_AUDIT.md` — 188-finding Deep Audit report. **Reference** (read-only input to Pass 99).
- `DEEP_AUDIT_ACTION_PLAN.md` — earlier 119-item action plan; superseded. **Reference** (historical).
- `DEEP_AUDIT_REVIEW.md` — adjudication of Deep Audit claims. **Reference**.
- `FRESH_AUDIT.md` — 240-finding Fresh Audit report. **Reference** (read-only input to Pass 99).
- `INDEX.md` — navigation map for this folder. **Active**.
- `KIDS_AUDIT_AND_REPAIR_LOG.md` — per-chunk log of the Kids Audit + Repair pass. **Active**.
- `KIDS_SISTER_APP_PLAN.md` — post-launch Verity Post Kids sister app plan. **Reference** (deferred work).
- `LIVE_TEST_BUGS.md` — active bug intake (LB-001..LB-039). **Active**.
- `OVERNIGHT_SWEEP_2026-04-17.md` — read-only overnight audit report, 31 findings, ~95 of 204 files covered. **Active**.
- `OWNER_TO_DO.md` — owner-only launch-prep checklist. **Active**.
- `PM_HANDOFF.md` — canonical PM discipline brief. **Active** (read first on session start).
- `REPAIR_LOG.md` — per-chunk execution log for Pass 99. **Active**.
- `ROTATE_SECRETS.md` — owner checklist for rotating compromised secrets. **Active**.
- `STATE.md` — canonical current-state snapshot. **Active** (refreshed after every pass).
- `Verity_Post_Phase_Log.md` — append-only narrative history per pass. **Active** (canonical audit trail).
- `stripe-sandbox-restore.sql` — SQL to restore Stripe sandbox price IDs for testing. **Reference**.
- `z-Remaining Items.md` — legacy outstanding-items list. **Reference** (mostly superseded by `OWNER_TO_DO.md`).

---

## `99-Archive/`

Historical snapshots. Nothing here should be used as current source of truth. Preserved for cross-reference.

- `MANIFEST.md` — archive contents guide. **Reference**.

### `99-Archive/audits/`

Point-in-time audits. Findings absorbed into `05-Working/STATE.md` or closed via passes.

- `FULL_AUDIT.md` — 323-item static verification through Pass 13. **Archived**.
- `HEALTH_CHECK.md` — Pass 14 health check. **Archived**.
- `LIVE_TEST_BUGS_DIAGNOSIS.md` — diagnosis of 39 LB entries. **Archived**.
- `REMAINING_WORK.md` — post-Pass-16 backlog. **Archived** (superseded by `STATE.md`).
- `USER_JOURNEY_DISCOVERY.md` — 132-finding discovery audit. **Archived**.

### `99-Archive/site-only-copy-snapshot/`

Snapshot copy of `site/` from an earlier deploy. **Archived** — do not edit; reference only.

### `99-Archive/tools/`

One-off scripts + historical tool docs.

- `CLEANUP_RECOMMENDATIONS.md` — cleanup recommendations from a prior sweep. **Archived**.
- `PERMISSIONS_SETUP.md` — initial permissions bootstrap doc. **Archived**.
- `gen_permission_keys.py` — Python generator for permission key constants. **Archived**.
- `ios_profileview_patch.md` — one-off iOS patch notes. **Archived**.
- `smoke_test.sql` — archived smoke-test SQL. **Archived** (use `scripts/smoke-v2.js` instead).

### `99-Archive/v1-schema/`

- `_archive_reset_and_rebuild_v1.sql` — the v1 canonical schema. **Archived** — superseded by v2.

### `99-Archive/vpost-xcode-scaffold/`

Original iOS scaffold before the `VerityPost/` active app. **Archived** — do not build.

- `vpost/` — Swift sources (archived).
- `vpost.xcodeproj/` — Xcode project (archived).

### `99-Archive/working-docs/`

Closed per-pass working docs (Passes 1–17) + closed tracking docs. History preserved in phase log.

- `Z - Bug Triage.md` — 104-bug triage closed at Pass 12. **Archived**.
- `Z - Code Quality Recommendations.md` — 35 CQ items (19 actioned, 16 deferred). **Archived**.
- `Z - Launch Confidence Notes.md` — 8-commitment reference. **Archived**.
- `Z - PM Handoff Prompt.md` — original PM handoff brief. **Archived** (superseded by `05-Working/PM_HANDOFF.md`).
- `Z - Pass 9 Critical Fix Prompts.md` through `Z - Pass 17 Autonomous Web Sweep.md` — per-pass working docs. **Archived**.
- `Z - Remaining Pass 1 - Admin.md` through `Z - Remaining Pass 6 - Polish and Decisions.md` — Passes 1–6. **Archived**.
- `Z - Remaining Pass 8 - Comprehensive Audit.md` — Pass 8 (no Pass 7). **Archived**.

---

## `VerityPost/` (iOS Swift app)

SwiftUI iOS app. Code-complete for core flows; blocked on Apple Developer DUNS. 37 Swift files plus Xcode project.

- `VerityPost.xcodeproj/` — Xcode project file. **Active**.
- `build/` — Xcode build artifacts (machine-generated; not source). **Active** (ignored by git).

### `VerityPost/VerityPost/` (Swift sources)

- `VerityPostApp.swift` — app entry point. **Active**.
- `ContentView.swift` — root view / tab controller. **Active**.
- `Theme.swift` — design tokens (colors, spacing, type). **Active**.
- `Models.swift` — data model types. **Active**.
- `SupabaseManager.swift` — Supabase client wrapper. **Active**.
- `AuthViewModel.swift` — auth state + session. **Active**.
- `Keychain.swift` — secure token storage. **Active**.
- `Password.swift` — password utilities. **Active**.
- `Log.swift` — logging helpers. **Active**.
- `WelcomeView.swift` — welcome / onboarding splash. **Active**.
- `LoginView.swift` — login screen. **Active**.
- `SignupView.swift` — signup screen. **Active**.
- `ForgotPasswordView.swift` — forgot-password flow. **Active**.
- `ResetPasswordView.swift` — reset-password flow. **Active**.
- `VerifyEmailView.swift` — email verification screen. **Active**.
- `HomeView.swift` — home feed. **Active**.
- `HomeFeedSlots.swift` — feed slot composition. **Active**.
- `StoryDetailView.swift` — article reader (1796 LOC — flagged CQ-14 for post-launch split). **Active**.
- `LeaderboardView.swift` — leaderboards (global / category / family). **Active**.
- `ProfileView.swift` — profile hub. **Active**.
- `ProfileSubViews.swift` — profile sub-tabs. **Active**.
- `PublicProfileView.swift` — public profile view. **Active**.
- `SettingsView.swift` — settings root. **Active**.
- `SettingsService.swift` — settings persistence. **Active**.
- `SubscriptionView.swift` — billing / StoreKit 2 integration. **Active**.
- `StoreManager.swift` — StoreKit product + purchase logic. **Active**.
- `AlertsView.swift` — notification preferences. **Active**.
- `BookmarksView.swift` — bookmarks list. **Active**.
- `MessagesView.swift` — DMs. **Active**.
- `RecapView.swift` — weekly recap (D25). **Active**.
- `FamilyViews.swift` — family plan surfaces. **Active**.
- `KidViews.swift` — kid-mode screens. **Active**.
- `ExpertQueueView.swift` — expert queue UI. **Active**.
- `PushPermission.swift` — APNs permission logic. **Active**.
- `PushPromptSheet.swift` — push permission prompt. **Active**.
- `PushRegistration.swift` — APNs token registration. **Active**.
- `TTSPlayer.swift` — text-to-speech playback. **Active**.

---

## `beta ui ux kids/`

Kids redesign mockups (HTML + React mockups). Design input for the kids sister-app work; not built.

- `AdultArticle.jsx` — adult article mockup. **Reference**.
- `AdultHome.jsx` — adult home mockup. **Reference**.
- `Kids UX Design Spec.md` — kids UX design document. **Reference**.
- `expert-session-live.html`, `expert-session-replay.html`, `expert-sessions-list.html` — expert session mockups. **Reference**.
- `index.html` — mockup index. **Reference**.
- `kid-home.html`, `kid-home-category.html` — kid home mockups. **Reference**.
- `kid-leaderboard-all.html`, `kid-leaderboard-family.html`, `kid-leaderboard-topic.html` — kid leaderboard mockups. **Reference**.
- `kid-profile.html` — kid profile mockup. **Reference**.
- `kid-story-done.html`, `kid-story-quiz.html`, `kid-story-reading.html` — kid reading flow mockups. **Reference**.
- `parent-create-kid-basics.html`, `parent-create-kid-coppa.html`, `parent-create-kid-pin.html` — kid-create flow mockups. **Reference**.
- `parent-dashboard.html`, `parent-kid-detail.html` — parent dashboard mockups. **Reference**.
- `profile-picker.html` — profile-picker mockup. **Reference**.
- `styles.css` — mockup styles. **Reference**.

---

## `scripts/`

One-off utility scripts run outside the web build.

- `check-stripe-prices.js` — Stripe price-ID validator; outputs `UPDATE plans SET stripe_price_id...` statements. **Active** (owner uses post-Stripe-create).
- `preflight.js` — pre-deploy env/config smoke check. **Active**.
- `smoke-v2.js` — v2-schema smoke test. **Active**.

---

## `site/` (Next.js web app — live build)

Next.js 14 App Router + React 18. This is the production web app.

### Root config

- `.env.local` — local env vars (Supabase, Stripe, Resend, APNs, OpenAI). **Active** (local dev only; do not commit).
- `jsconfig.json` — JS path aliases. **Active**.
- `next.config.js` — Next.js config. **Active**.
- `package.json`, `package-lock.json` — dependencies. **Active**.
- `postcss.config.js` — PostCSS config. **Active**.
- `sentry.client.config.js`, `sentry.edge.config.js`, `sentry.server.config.js` — Sentry init configs. **Active**.
- `vercel.json` — Vercel deployment config. **Active**.

### `site/src/`

- `middleware.js` — Next.js middleware; protects `/admin/*`, `/profile/*`, `/notifications/*`, `/messages/*`, `/bookmarks/*`. **Active**.

### `site/src/lib/` (shared libraries)

- `adminPalette.js` — admin-surface color tokens (ADMIN_C, ADMIN_C_LIGHT). **Active**.
- `apiErrors.js` — API error shape helpers. **Active**.
- `apns.js` — APNs push-send helpers. **Active**.
- `appleReceipt.js` — Apple IAP receipt validation. **Active**.
- `auth.js` — server-side auth helpers (`requireAuth`, `requireRole`). **Active**.
- `authRedirect.js` — post-login redirect logic. **Active**.
- `coppaConsent.js` — COPPA parental-consent helpers for kid creation. **Active**.
- `counters.js` — counter-increment helpers (lockdown-hardened via migration 057). **Active**.
- `cronAuth.js` — CRON_SECRET verification for cron routes. **Active**.
- `cronLog.js` — cron-execution logging. **Active**.
- `email.js` — Resend email send wrapper. **Active**.
- `errorReport.js` — client error reporting helper. **Active**.
- `featureFlags.js` — feature-flag evaluator (reads `feature_flags` table). **Active**.
- `guards.js` — `assertNotKidMode(router)` + related route guards. **Active**.
- `kidMode.js` — kid-mode session state (localStorage `vp_active_kid_id`). **Active**.
- `kidPin.js` — PBKDF2 kid PIN hashing (migration 058 shape). **Active**.
- `kidSession.js` — kid-session lifecycle. **Active**.
- `kidTheme.js` — kid warm-cream palette tokens. **Active**.
- `kids.js` — kid-mode utilities. **Active**.
- `mentions.js` — @mention autocomplete helpers (D21 paid-only). **Active**.
- `observability.js` — Sentry / breadcrumb wrapper. **Active**.
- `password.js` — password validation helpers. **Active**.
- `permissionKeys.js` — permission key constants. **Active**.
- `permissions.js` — permission-evaluation helpers. **Active**.
- `plans.js` — plan / tier constants + lookups. **Active**.
- `rateLimit.js` — rate-limit wrapper (fail-closed prod, fail-open dev). **Active**.
- `rlsErrorHandler.js` — RLS-denial error translation. **Active**.
- `roles.js` — role hierarchy + helpers (ROLE_ORDER). **Active**.
- `scoring.js` — Verity Score scoring helpers. **Active**.
- `session.js` — session helpers. **Active**.
- `settings.js` — settings read/write helpers. **Active**.
- `stripe.js` — Stripe client + webhook verification (HMAC + timingSafeEqual). **Active**.
- `tiers.js` — tier helpers (`isPaidTier`, etc.). **Active**.
- `useFocusTrap.js` — focus-trap React hook for modals. **Active**.

#### `site/src/lib/certs/`

- `README.md` — cert storage notes. **Reference**.
- `apple-root-ca-g3.der` — Apple Root CA G3 for StoreKit JWS + App Store Server Notifications. **Active**.

#### `site/src/lib/supabase/`

- `client.js` — browser-side Supabase client. **Active**.
- `server.js` — server-side Supabase client (+ `createServiceClient` with SERVICE_ROLE_KEY). **Active**.

### `site/src/components/` (shared React components)

- `AccountStateBanner.jsx` — unified banner for banned/muted/frozen/grace states. **Active**. *(Known bug: `deletion_scheduled_at` typo at L63-64 — schema is `deletion_scheduled_for`.)*
- `Ad.jsx` — ad rendering component. **Active**.
- `ArticleQuiz.jsx` — 5-question quiz component (D1). **Active**.
- `Avatar.js` — avatar rendering. **Active**.
- `CommentComposer.jsx` — comment composer with mute check + @mention. **Active**.
- `CommentRow.jsx` — single comment row. **Active**.
- `CommentThread.jsx` — threaded comment tree. **Active**.
- `ConfirmDialog.jsx` — generic user-facing confirm modal. **Active**.
- `DestructiveActionConfirm.jsx` — admin destructive-action modal with `record_admin_action` RPC. **Active**.
- `FollowButton.jsx` — follow/unfollow button (D28 paid gate). **Active**.
- `Interstitial.jsx` — full-screen interstitial. **Active**.
- `LockModal.jsx` — paywall/gate lock modal. **Active**.
- `NavWrapper.js` — top nav chrome; reads user state for banner/avatar. **Active**. *(Known bug: `deletion_scheduled_at` typo at L67.)*
- `NotificationBell.jsx` — notification bell with unread badge. **Active**.
- `ObservabilityInit.js` — client-side Sentry boot. **Active**.
- `PermissionGate.jsx` — tier/permission gate wrapper. **Active**.
- `PermissionsProvider.jsx` — permissions context provider. **Active**.
- `QuizPoolEditor.jsx` — admin quiz-pool editor. **Active**.
- `RecapCard.jsx` — weekly recap card. **Active**.
- `StatRow.js` — stat-row display. **Active**.
- `TTSButton.jsx` — text-to-speech button. **Active**.
- `Toast.js` — toast notification. **Active**.
- `VerifiedBadge.js` — verified public-figure badge. **Active**.

#### `site/src/components/kids/`

Kid-scoped components (D9 no-social compliance).

- `AskAGrownUp.jsx` — kid-friendly "ask a grown-up" gate panel. **Active**.
- `Badge.jsx` — kid achievement badge. **Active**.
- `EmptyState.jsx` — kid-friendly empty state with SVG line art. **Active**.
- `KidTopChrome.jsx` — sticky kid-scope chrome with exit-PIN. **Active**.
- `StreakRibbon.jsx` — kid streak celebration ribbon. **Active**.

### `site/src/app/` (Next.js routes)

App Router route tree. Each sub-folder is a route; each folder contains `page.js` (user-facing page) or `route.js` (API handler). Route list below; every entry is **Active** unless noted.

#### Root route files

- `NavWrapper.js` — top nav (shared across most routes). **Active**.
- `error.js`, `global-error.js` — Next.js error boundaries. **Active**.
- `not-found.js` — 404 page. **Active**.
- `globals.css` — global stylesheet. **Active**.
- `layout.js` — root layout (providers, fonts, metadata). **Active**.
- `page.js` — home feed. **Active**.
- `manifest.js` — PWA manifest. **Active**.
- `robots.js` — robots.txt generator. **Active**.
- `sitemap.js` — sitemap generator. **Active**.

#### User-facing routes

- `/accessibility/` — accessibility statement. **Active**.
- `/appeal/` — ban-appeal form. **Active**.
- `/bookmarks/` — saved articles. **Active**.
- `/browse/` — browse all articles. **Active**.
- `/card/[username]/` — public Verity Score card (D32). **Active**.
- `/category/[id]/` — category landing page. **Active**.
- `/cookies/` — cookie policy. **Active**.
- `/dmca/` — DMCA notice. **Active**.
- `/expert-queue/` — expert answer queue (user-facing). **Active**.
- `/forgot-password/` — forgot-password form. **Active**.
- `/how-it-works/` — marketing / explainer. **Active**.
- `/leaderboard/` — leaderboards. **Active**.
- `/login/` — login form. **Active**.
- `/logout/` — logout redirect. **Active**.
- `/messages/` — DMs (D11 paid-only). **Active**.
- `/notifications/` — notification list. **Active**.
- `/privacy/` — privacy policy. **Active**.
- `/recap/`, `/recap/[id]/` — weekly recap (D25). **Active**.
- `/reset-password/` — reset-password form. **Active**.
- `/search/` — search page. **Active**.
- `/signup/`, `/signup/expert/`, `/signup/pick-username/` — signup flow. **Active**.
- `/status/` — system status. **Active**.
- `/story/[slug]/` — article reader. **Active**.
- `/terms/` — terms of service. **Active**.
- `/u/[username]/` — public profile view. **Active**.
- `/verify-email/` — email verification page. **Active**.
- `/welcome/` — post-signup welcome flow. **Active**.

#### Profile routes

- `/profile/` — profile hub. **Active**.
- `/profile/[id]/` — public profile by id/username. **Active**. *(Recently fixed: PUBLIC_USER_FIELDS constant, no more `select('*')`.)*
- `/profile/activity/` — activity history. **Active**.
- `/profile/card/` — profile card (D32 paid-only). **Active**.
- `/profile/category/[id]/` — per-category 4-metric drill-in (uses `get_user_category_metrics` RPC). **Active**.
- `/profile/contact/` — contact / support intake. **Active**.
- `/profile/family/` — family plan dashboard. **Active**.
- `/profile/kids/` — kid profile management. **Active**.
- `/profile/milestones/` — milestones / achievements. **Active**.
- `/profile/settings/` + sub-routes — settings tree (profile/password/email/alerts/billing/data/privacy/blocked/etc.). **Active**.

#### Kids routes (D9/D12 enforcement)

- `/kids/` — kids home. **Active**.
- `/kids/expert-sessions/` — kid expert sessions. **Active**.
- `/kids/leaderboard/` — kids-scoped leaderboard. **Active**.
- `/kids/profile/` — kid profile. **Active**.
- `/kids/story/[slug]/` — kid-safe article reader. **Active**.

#### Admin routes (30 pages)

- `/admin/` — admin hub. **Active**.
- `/admin/access/` — access codes (rebuilt 2026-04-17 against v2). **Active**.
- `/admin/ad-campaigns/` — ad campaign management. **Active**.
- `/admin/ad-placements/` — ad placement management. **Active**.
- `/admin/analytics/` — platform analytics. **Active** (has structural issues flagged; see STATE.md).
- `/admin/breaking/` — breaking news send (has structural rebuild flagged). **Active**.
- `/admin/categories/` — category management. **Active**.
- `/admin/cohorts/` — user cohorts. **Active**.
- `/admin/comments/` — comments moderation. **Active**.
- `/admin/data-requests/` — data export/delete requests. **Active**.
- `/admin/email-templates/` — email template editor. **Active**.
- `/admin/expert-sessions/` — expert session management. **Active**.
- `/admin/features/` — feature flags (rebuilt 2026-04-17 against v2). **Active**.
- `/admin/feeds/` — RSS feeds management (flagged: queries non-existent `rss_feeds` table; needs rebuild). **Active** (broken).
- `/admin/ingest/` — content ingestion pipeline (has structural issues flagged). **Active**.
- `/admin/kids-story-manager/` — kid articles management. **Active**.
- `/admin/moderation/` — moderation queue. **Active**.
- `/admin/notifications/` — notification admin. **Active**.
- `/admin/permissions/` — permissions/roles management. **Active**.
- `/admin/pipeline/` — AI pipeline dashboard. **Active**.
- `/admin/plans/` — plan + feature management (rebuilt 2026-04-17 against v2). **Active**.
- `/admin/promo/` — promo codes (rebuilt 2026-04-17 against v2). **Active**.
- `/admin/reader/` — reader config admin. **Active**.
- `/admin/recap/` — weekly recap admin. **Active**.
- `/admin/reports/` — user reports moderation. **Active**.
- `/admin/settings/` — platform settings. **Active** (API-driven).
- `/admin/sponsors/` — sponsor management. **Active**.
- `/admin/stories/` — article admin. **Active**.
- `/admin/stories/[id]/quiz/` — per-article quiz editor. **Active**.
- `/admin/story-manager/` — primary article editor. **Active**.
- `/admin/streaks/` — streak config admin. **Active**.
- `/admin/subscriptions/` — subscription admin. **Active** (has Stripe-sync gaps flagged).
- `/admin/support/` — support tickets admin. **Active**.
- `/admin/system/` — system dashboard + audit log viewer. **Active** (rate-limit UI structural rebuild queued).
- `/admin/users/` — user admin. **Active**.
- `/admin/verification/` — expert verification admin. **Active**.
- `/admin/webhooks/` — webhook log viewer. **Active** (retry path flagged — writes to non-existent table).
- `/admin/words/` — banned words + reserved usernames. **Active**.

#### API routes

All `route.js` under `site/src/app/api/`. Grouped by prefix; each group contains multiple sub-routes (GET/POST/DELETE handlers).

- `/api/account/` — account delete, login-cancel-deletion, onboarding. **Active**.
- `/api/admin/*` — admin-only endpoints (user/expert/webhook admin actions). **Active**.
- `/api/ads/` — ad serving. **Active**.
- `/api/ai/` — AI endpoints (generate, etc.). **Active**.
- `/api/appeals/` — ban appeals. **Active**.
- `/api/auth/*` — login, signup, reset-password, callback, check-email, resolve-username, etc. **Active** (audited Tier S).
- `/api/billing/*` — cancel, change-plan, resubscribe. **Active** (Stripe-sync gaps flagged).
- `/api/bookmark-collections/`, `/api/bookmarks/*` — bookmarks. **Active**.
- `/api/comments/*` — comment CRUD + vote/flag/context-tag/report. **Active**.
- `/api/cron/*` — cron endpoints (send-emails, expert reverification, etc.). **Active**.
- `/api/errors/` — client error ingestion. **Active**.
- `/api/expert/*`, `/api/expert-sessions/*` — expert queue + sessions. **Active**.
- `/api/family/` — family plan endpoints. **Active**.
- `/api/follows/` — follow/unfollow (D28 paid-only). **Active**.
- `/api/health/` — health check. **Active**.
- `/api/ios/appstore/` — Apple App Store Server Notifications V2. **Active**.
- `/api/kids/*` — kid profile CRUD + reset-pin. **Active**.
- `/api/messages/*` — DMs (uses `post_message` RPC). **Active**.
- `/api/notifications/*` — notifications + preferences. **Active**.
- `/api/promo/*` — promo redeem. **Active** (flagged: wrong column name).
- `/api/push/` — push registration. **Active**.
- `/api/quiz/` — quiz endpoints. **Active**.
- `/api/recap/` — recap endpoints. **Active**.
- `/api/reports/` — user reports. **Active**.
- `/api/search/` — search endpoints (applies `is_kids_safe` per D12). **Active**.
- `/api/stories/*` — story read-tracking etc. **Active** (flagged: incrementField wrong shape).
- `/api/stripe/*` — checkout, portal, webhook. **Active**.
- `/api/supervisor/` — supervisor opt-in surface (D22). **Active**.
- `/api/support/` — support ticket intake. **Active** (flagged: non-existent `description` column — currently broken).
- `/api/users/[id]/*` — user-scoped actions (block, etc.). **Active**.

---

## Summary

- **Active live-build code:** `site/` (Next.js web app), `VerityPost/` (iOS Swift app)
- **Active canonical data:** `01-Schema/` (all 12 recent migrations applied 2026-04-17)
- **Active working docs:** `05-Working/` (STATE.md, LIVE_TEST_BUGS.md, OWNER_TO_DO.md, etc.)
- **Reference-only:** `00-Reference/`, `02-Parity/`, `03-Build-History/`, `04-Ops/`, `beta ui ux kids/`
- **Archived (do not use as source of truth):** `99-Archive/` (all subfolders)

**Known critical bugs (as of 2026-04-18):**
- `NavWrapper.js:67` + `AccountStateBanner.jsx:63-64` — `deletion_scheduled_at` column typo (schema is `deletion_scheduled_for`). Silent two-place break affecting every user.
- `/admin/feeds` — queries non-existent `rss_feeds` table (real table is `feeds`); whole-file rebuild pending.
- `/api/support` — inserts into non-existent `description` column; every support ticket submission fails.
- `/api/promo/redeem` — wrong column name; 100% promo redemption path broken.
- Plus ~30 more findings tracked in `05-Working/STATE.md` + `05-Working/OVERNIGHT_SWEEP_2026-04-17.md`.

Refresh this file when adding/removing top-level folders or when a large section of `site/src/app/` gains new routes.
