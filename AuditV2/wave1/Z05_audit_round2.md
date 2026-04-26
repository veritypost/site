# Zone Z05: Audit_2026-04-24/Round2/

## Summary

Round 2 of the 2026-04-24 multi-wave audit. Round 1 (84 agents, organized by surface) produced a master fix list; Round 2 dispatched 15 lens specialists each walking the entire codebase through one quality lens (cross-surface lens vs single-surface domain). Anchor SHA `10b69cb99552fd22f7cebfcb19d1bbc32ae177fe`, dispatched 2026-04-24T20:43:19Z. This zone contains the seven Round 2 lens reports that were persisted to disk (L03 quiz/comments, L05 settings deep-walk, L06 billing E2E, L07 parent-kids mgmt, L09 admin/mod operator, L10 pipeline operator, L14 security correctness) plus the briefing, anchor, and a notification digest summarizing the eight lenses (L01, L02, L04, L08, L11, L12, L13, L15) that produced findings via completion notification but did not Write to disk. Total findings across all 15 lenses combine NEW issues, EXTENDS-existing-master-items, and a few CONTRADICTS or owner-input items. Read-only audits — no code edits.

## Files

### /Users/veritypost/Desktop/verity-post/Current Projects/Audit_2026-04-24/Round2/_ANCHOR_SHA.txt
- **Purpose**: Anchor commit SHA that all Round 2 audits reference for line citations.
- **Contents**: SHA `10b69cb99552fd22f7cebfcb19d1bbc32ae177fe`; DISPATCHED=2026-04-24T20:43:19Z.
- **Status**: Static reference. No findings.

### /Users/veritypost/Desktop/verity-post/Current Projects/Audit_2026-04-24/Round2/_LAYER1_BRIEFING.md
- **Purpose**: Briefing prompt distributed to all Layer-1 lens specialists.
- **Topics**: Project map, coming-soon mode (`NEXT_PUBLIC_SITE_MODE=coming_soon` is live), context that Round 1 was surface-organized so lens-organized Round 2 catches cross-surface inconsistencies, shared-pattern violations, end-to-end journey failures, accessibility, security uniformity.
- **Rules**: Read-only, evidence-first (file:line or SHA), don't duplicate Round 1, stay in lens (off-lens findings go in OUTSIDE MY LENS section), output to own file in Round2 dir.
- **Output format**: YAML frontmatter + Findings (CRITICAL/HIGH/MEDIUM/LOW) with file:line, what's wrong, lens applied, NEW vs EXTENDS_MASTER_ITEM_XX vs CONTRADICTS, evidence, disposition (AUTONOMOUS-FIXABLE / OWNER-INPUT / POLISH). 1800-word cap, 20-min cap.
- **Status**: Operational briefing.

### /Users/veritypost/Desktop/verity-post/Current Projects/Audit_2026-04-24/Round2/_NOTIFICATION_DIGEST.md
- **Purpose**: Captures Layer-1 lens specialist findings that returned in completion notifications but never ran Write to persist to disk.
- **Lenses captured**: L01 anonymous reader (5), L02 auth flows (3), L04 social/messages (5), L08 kid iOS (7), L11 UI/UX visual (4), L12 accessibility (7), L13 states/copy (8), L15 compliance/sync (8). Total 47 findings paraphrased from agent summaries with original file:line evidence preserved.
- **Severity high points**:
  - **L01-01 HIGH NEW**: Missing metadata on 5 anon-pages (home, browse, search, how-it-works, kids-app) — SEO blind once coming-soon flips off.
  - **L01-02**: Inactive categories on home extends C11; fixed in commit c08e592.
  - **L2-02-auth-001/002/003 MEDIUM NEW**: Email signup + verify-email + signup `onAuthStateChange` don't preserve `?next=` through onboarding (extends H2).
  - **L2-L04-01 CRITICAL NEW**: `post_message` + `start_conversation` RPCs do NOT check bidirectional block; blocked users still receive DMs in existing conversations. Owner-input.
  - **L2-L04-02 HIGH NEW**: `toggle_follow` RPC lacks block-check.
  - **L2-L04-03 HIGH (extends H7)**: `/api/notifications/preferences` PATCH gate uses one permission `notifications.prefs.toggle_push` for all channels (email/in-app/SMS/quiet-hours).
  - **L2-L04-04 HIGH NEW**: Messages page only loads outgoing blocks; inbound blocks invisible.
  - **L2-L04-05 MEDIUM NEW**: `message_receipts` upsert with `ignoreDuplicates: true` silently fails to update `read_at`.
  - **L08-001 CRITICAL NEW (extends C15)**: Kid JWT has `sub = kid_profile_id` so `auth.uid()` resolves to kid id, but RLS on `reading_log`/`quiz_attempts` requires `user_id = auth.uid()` — `NULL = <uuid>` → FALSE. Either silent write failure or undocumented bypass; contradicts C15 data-egress claims.
  - **L08-002 CRITICAL (extends C16)**: ExpertSessionsView.swift:156-176 has no parental gate.
  - **L08-003 HIGH (extends H9)**: Global Authorization header on `SupabaseKidsClient` singleton; logout doesn't invalidate.
  - **L08-004 CRITICAL NEW (extends C15)**: `KidsAppRoot.swift:189` calls `state.completeQuiz()` BEFORE `writeAttempt()`; force-quit between leaves DB without quiz_attempts row but local streak bumped.
  - **L08-005 HIGH (extends C26)**: `kid_expert_sessions` has RLS enabled but zero policies; queries return empty silently (part of C26's 14-table RLS-enabled-no-policies list).
  - **L08-006 HIGH NEW**: Kid-safe filter relies on slug convention (`kids-%`); articles RLS doesn't include `is_kids_safe` check — only `status='published'`.
  - **L08-007 MEDIUM NEW**: PairingClient.refresh() writes Keychain then UserDefaults sequentially — crash-window mismatch.
  - **L11-01 HIGH NEW**: `VerityPost/Theme.swift:14` has `dim = #666666` but web `globals.css` was updated per DA-054 to `#5a5a5a` (5.95:1 vs 5.13:1 contrast); cross-platform token drift.
  - **L11-02 HIGH NEW**: 24 files in `web/src/` define local `const C = {...}` palettes with hardcoded hex; `success`/`danger`/`dim` all have multiple inconsistent values.
  - **L11-03 HIGH NEW**: AccountStateBanner.tsx:10-11 uses `redBorder: '#dc2626'` + `redText: '#991b1b'` not mapped to CSS variables.
  - **L11-04 MEDIUM NEW**: 146 inline `style={{}}` objects with hardcoded hex.
  - **L12-a01 HIGH NEW**: `ConfirmDialog.tsx:30-37` has `role="dialog" aria-modal="true"` but no `useFocusTrap()`. Modal/LockModal use it correctly. WCAG 2.1.2 + 2.4.3.
  - **L12-a02 HIGH NEW**: `PermissionGateInline` uses `<span role="button" tabIndex={0}>` with onClick but no onKeyDown. WCAG 2.1.1.
  - **L12-a03 HIGH NEW**: iOS adult Theme.swift hardcodes `.font(.system(size:weight:))` ignoring Dynamic Type.
  - **L12-a04 HIGH NEW**: `signup/page.tsx:627` uses `C.muted` (#999999) on white = 3.54:1, fails WCAG AA (4.5:1). `C.dim` (#666666) passes at 5.92:1.
  - **L12-m01/m02/m03 MEDIUM NEW**: Password show/hide < 44×44, signup checkbox 18×18, KidsApp animation reduce-motion inconsistent.
  - **L13-001 CRITICAL (extends H1)**: `verify-email/page.tsx:104-109` maps 429 rate-limit to `status='expired'` conflating two states (Owner chose Option A).
  - **L13-002 HIGH (extends C7)**: Admin numeric inputs persist on blur only, edit lost on navigate.
  - **L13-003 HIGH NEW**: `CommentComposer.tsx:86-125` mention validation shows error banner but doesn't block submit.
  - **L13-004 HIGH NEW**: `messages/page.tsx:476, 510, 548` `.catch(() => ({}) as ...)` swallow JSON decode errors.
  - **L13-005/006/007 MEDIUM Polish**.
  - **L13-008 MEDIUM NEW**: iOS SettingsView.swift has no Toast/Alert system wired to alert-preference mutation failures.
  - **L15-01 CRITICAL (extends C15)**: Reading + quiz data collected before parental verification.
  - **L15-02 CRITICAL NEW**: Web-to-iOS session sync gap: `/api/auth/logout` doesn't propagate to iOS bearer tokens; iOS sessions persist 7 days post-logout until natural token expiry.
  - **L15-03 HIGH NEW**: `consent_records` table exists but never populated/queried; COPPA consent only in `kid_profiles.metadata.coppa_consent` with no audit trail.
  - **L15-04 HIGH NEW**: `export_user_data()` RPC doesn't include kid-profile-specific data (streaks/badges/family) on parent export — GDPR completeness gap.
  - **L15-05 HIGH NEW**: iOS `logout()` doesn't call `PermissionService.shared.invalidate()`; cache persists in memory.
  - **L15-06/07/08 MEDIUM**: Breach-notification pipeline absent; `revoke_session()`/`revoke_all_other_sessions()` RPCs exist but never called from logout flows; no WCAG CI gate.
- **Closing note**: Findings should be folded into MASTER_FIX_LIST as EXTENDS-CI / NEW-CRITICAL / NEW-HIGH / OWNER-INPUT (added to OWNER_ACTIONS_2026-04-24.md).
- **Status**: Operationally important — many findings are NOT in MASTER_FIX_LIST yet because they were never written to disk by the lens specialists.

### /Users/veritypost/Desktop/verity-post/Current Projects/Audit_2026-04-24/Round2/L03_quiz_comments.md
- **Purpose**: Walks article → quiz gate → pass/fail → comment post → vote → edit → delete → moderation flow.
- **Findings (6)**:
  - **L3-001 CRITICAL NEW**: TOCTOU race in `soft_delete_comment` (schema/013_phase5_comments_helpers.sql:331-343) and `edit_comment` (:368-383). SELECT-then-UPDATE without WHERE-guard; concurrent soft-delete between check and write leaves edit succeeding silently on `[deleted]` body. Autonomous-fixable.
  - **L3-002 CRITICAL NEW**: `/api/comments/[id]/vote/route.js:13-102` lacks `checkRateLimit()`. POST /api/comments has 10/min; vote has none. Cross-article spam vector. Autonomous-fixable.
  - **L3-003 CRITICAL EXTENDS_MASTER_ITEM_H16**: Vote endpoint permission check at handler entry (line 35); RPC executes with no re-check (line 71). If admin revokes mid-flight, RPC still succeeds. Owner-input.
  - **L3-004 HIGH NEW**: `/api/quiz/submit/route.js:87-116` + schema/012:246-254 — 2-attempt limit for free users has race window; concurrent double-click can bypass via stale `user_article_attempts` read. Autonomous-fixable (UNIQUE constraint or serialization).
  - **L3-005 HIGH EXTENDS_MASTER_ITEM_H16**: `CommentThread.tsx:84-90, 188-261` realtime subscription set up once at mount; if permission revoked mid-session, subscription stays active. Owner-input.
  - **L3-006 MEDIUM NEW Polish**: Vote endpoint doesn't validate `{up, down, your_vote}` shape from RPC; client expects keys; future RPC drift breaks UI silently.
- **Outside lens**: C1, H8, C21-C22 confirmed as Round 1 items.
- **Status**: Persisted, well-evidenced.

### /Users/veritypost/Desktop/verity-post/Current Projects/Audit_2026-04-24/Round2/L05_settings_deep_walk.md
- **Purpose**: Comprehensive walk of `/profile/settings/page.tsx` (5174 lines) across 9 sections.
- **Findings (7)**:
  - **L5-001 CRITICAL EXTENDS_MASTER_ITEM_C3**: `BlockedCard.unblock()` line 3281 calls `supabase.from('blocked_users').delete()` directly, bypassing `/api/users/[id]/block` DELETE which enforces permission + email-verified + rate-limit. C3 fix not yet applied.
  - **L5-002 CRITICAL EXTENDS_MASTER_ITEM_C4**: `DataExportCard.requestExport()` line 3393 calls `supabase.from('data_requests').insert()` directly. Permission gate is client-only (line 3364: `hasPermission(PERM.ACTION_DATA_EXPORT)`); no server route exists. C4 fix not yet applied.
  - **L5-003 CRITICAL EXTENDS_MASTER_ITEM_H8**: `reloadUser()` (lines 573-595) doesn't call `invalidate()` or `refreshAllPermissions()`. ProfileCard, FeedCard, AccessibilityCard, AlertsCard, ExpertProfileCard's onSaved → reloadUser → stale permission cache. Billing route (line 555-556) does it correctly.
  - **L5-004 HIGH NEW**: `ExpertWatchlistCard.toggle()` lines 4882-4901 — incomplete M16 mitigation: re-reads metadata but derives `watched` from optimistic `nextCats` BEFORE re-read. FeedCard/AccessibilityCard correctly re-read first. Owner-input.
  - **L5-005 HIGH NEW Polish**: BlockedCard unblock button lines 3331-3338 has no ConfirmDialog. Other destructive ops (sign-out-everywhere, step-down, delete-account) all have confirmation.
  - **L5-006 MEDIUM NEW Polish**: Permission gates read once at component mount via `hasPermission(PERM.*)` (lines 3256, 3364, 3513). Never re-read after mutation; UI stale until 60s TTL.
  - **L5-007 MEDIUM NEW Polish**: DataExportCard has no client-side rate-limit feedback; depends on C4 fix.
- **Outside lens**: M16 concurrency lens, permission-matrix lens, form-validation, error-message leakage.
- **Status**: Persisted, very high evidence quality (5174-line page deeply walked).

### /Users/veritypost/Desktop/verity-post/Current Projects/Audit_2026-04-24/Round2/L06_billing_e2e.md
- **Purpose**: Full billing state machine: Stripe webhooks + Apple S2S + iOS sync + web actions + admin + promo redemption.
- **Findings (5)**:
  - **L06-001 CRITICAL NEW**: `/api/ios/subscriptions/sync/route.js:178-227` and `/api/ios/appstore/notifications/route.js:287-332` — both call `billing_resubscribe`/`billing_change_plan` RPC (which inserts subscriptions row with `source='manual'` and NO `apple_original_transaction_id`), then unconditionally re-query by `apple_original_transaction_id` (always nil → INSERT). Result: duplicate subscriptions rows for same Apple original transaction. Autonomous-fixable (3 options described).
  - **L06-002 CRITICAL NEW**: `/api/stripe/webhook/route.js:809-853` `handlePaymentSucceeded` directly UPDATEs `users.plan_status` + `plan_grace_period_ends_at` without writing `subscription_events`. Every other billing state change writes the event table. Audit-trail blind spot.
  - **L06-003 CRITICAL NEW**: 4 independent mutation paths (Stripe webhook, Apple S2S, iOS sync, web actions) can write concurrently. RPC FOR UPDATE on users provides ordering, but `subscriptions` table diverges (different `source` values). Multi-provider conflicts. Owner-input — architectural decision required.
  - **L06-004 HIGH EXTENDS_MASTER_ITEM_C20**: `/api/admin/billing/freeze/route.js:52` and `/cancel/route.js:54` — both call destructive RPCs without `recordAdminAction()`. Sibling admin routes audit correctly. C20 unfixed.
  - **L06-005 HIGH NEW**: Stripe webhook `handlePaymentFailed` (lines 770-796), `handleRefundUpdated` (705-768), `handleChargeDispute` (564-611) write `audit_log` only — not `subscription_events`. Subscription timeline incomplete.
- **Outside lens**: H20 promo+web concurrent mutation may already be resolved; kids trial conversion correctness depends on `convert_kid_trial` RPC.
- **Status**: Persisted, high evidence quality. **Note: L06-001 is a NEW production-impacting bug — duplicate subscription rows.**

### /Users/veritypost/Desktop/verity-post/Current Projects/Audit_2026-04-24/Round2/L07_parent_kids_mgmt.md
- **Purpose**: Walks `/profile/kids` web + `FamilyViews` iOS + `/api/kids/*` + cron + COPPA + pair-code + family-plan slot enforcement.
- **Findings (4)**:
  - **L07-001 HIGH EXTENDS_MASTER_ITEM_C25**: `web/src/app/api/cron/sweep-kid-trials/route.js:14-15` exports `dynamic` + `runtime` but no `maxDuration`. C25 lists 4 routes; this one was omitted. Trial sweep can silently time out mid-job leaving inconsistent state. Autonomous-fixable.
  - **L07-002 HIGH NEW**: `/api/kids/household-kpis/route.js:31-33` queries `kid_profiles` without `is_active = true` filter. Soft-deleted kids included in 7-day household KPIs, inflating stats. `/api/kids` GET filters correctly.
  - **L07-003 MEDIUM NEW**: Kid trial COPPA consent — `schema/017_phase9_family.sql:47-52` insert kid with `coppa_consent_given=true` but metadata empty; `route.js:103-126` then merges and updates separately. Race window if update fails: kid exists with `coppa_consent_given=true` but no parent_name/accepted_at/IP for audit. Owner-input.
  - **L07-004 MEDIUM NEW Polish**: `kid_pair_codes` table (schema/095) — every code stored with 15-min expiry but no cleanup cron. Unbounded growth; index `kid_pair_codes_live_idx` becomes less effective; `FOR UPDATE` lock on redeem slows. Suggested: nightly cleanup of rows where `expires_at < now() - 7 days`.
- **Outside lens**: Kids leaderboard opt-in rate-limiting; FamilyDashboardView hardcodes plan→kid-cap mapping in Swift.
- **Status**: Persisted.

### /Users/veritypost/Desktop/verity-post/Current Projects/Audit_2026-04-24/Round2/L09_admin_mod_operator.md
- **Purpose**: Admin/mod/editor operator journey: role assignment, permission grant/revoke, bans, billing freeze/cancel, penalties, appeals, reports, comment mod, categories, breaking news, ad campaigns, broadcasts.
- **Findings (5)**:
  - **L2-L09-01 CRITICAL NEW**: `/api/admin/ad-campaigns/route.js:36-95` (POST) + `[id]/route.js:25-98` (PATCH/DELETE) — all bypass `recordAdminAction()`. Not in C21 (which only cited moderation routes). Ad-spend changes/deletions invisible.
  - **L2-L09-02 HIGH EXTENDS_MASTER_ITEM_C23**: `admin/moderation/page.tsx:326-332` and `admin/reports/page.tsx:352-355` — penalty buttons (Warn, 24h mute, 7-day mute, Ban) render unconditionally. Roles buttons correctly use `outOfScope` (line 341). Penalties don't.
  - **L2-L09-03 HIGH EXTENDS_MASTER_ITEM_C21**: `/api/admin/moderation/users/[id]/penalty/route.js:63-74`, `reports/[id]/resolve/route.js:43-54`, `comments/[id]/hide/route.js:38-48`, `appeals/[id]/resolve/route.js:43-54` — all 4 routes call RPCs without `recordAdminAction()`. C21 still unfixed at anchor.
  - **L2-L09-04 HIGH EXTENDS_MASTER_ITEM_H24**: `components/admin/DestructiveActionConfirm.tsx:59-78` calls `record_admin_action` RPC client-side BEFORE handler runs. Creates dual audit + orphaned entries if mutation fails after audit. Owner-input — design decision: audit should be server-side only.
  - **L2-L09-05 MEDIUM NEW**: `/api/admin/permissions/[id]/route.js:73-78` PATCH calls `recordAdminAction` with `newValue` only, no `oldValue`. Sibling routes (ban, categories) include both. Autonomous-fixable.
- **Outside lens**: H15 send-push Promise.all vs allSettled; breaking-news fan-out semantics; admin session expiry; admin telemetry.
- **Status**: Persisted.

### /Users/veritypost/Desktop/verity-post/Current Projects/Audit_2026-04-24/Round2/L10_pipeline_operator.md
- **Purpose**: Pipeline operator workflow — add-source → discover → cluster → review → generate (adult/kid) → plagiarism → publish → observability → cancel → retry.
- **Findings (5)**:
  - **L2-L10-01 HIGH EXTENDS_MASTER_ITEM_H18**: `web/src/app/api/admin/pipeline/generate/route.ts:1617-1624` finally block updates `discovery_items.state` without status guard. Cancel route (line 135) correctly uses `.eq('state', 'generating')`. Race: concurrent cancel sets state→clustered, then generate finally clobbers to published/ignored.
  - **L2-L10-02 HIGH NEW**: `generate/route.ts:754, 1611-1627` — when `sourceUrlsOverridden=true` (kid runs), finally skips state reset entirely. If kid generation fails, adult discovery_items left in 'generating' indefinitely. Owner-input.
  - **L2-L10-03 MEDIUM EXTENDS_MASTER_ITEM_H17**: `generate/route.ts:500-541` pre-flight cost check uses `today >= cap` only. No margin reserved for run cost. Daily=$10, today=$9.99, run=$0.50 → pre-flight passes, mid-run fails after partial spend.
  - **L2-L10-04 MEDIUM NEW Polish**: `pipeline/runs/[id]/retry/route.ts:127-140` reads `error_type` but doesn't gate retry. cost_cap_exceeded retry → re-fails immediately with same 402.
  - **L2-L10-05 LOW EXTENDS_MASTER_ITEM_H17**: `cost-tracker.ts:46` cache TTL=60s; admin lowering cap mid-run not enforced for up to 60s. H17 already flags this; this is the timing exposure proof.
- **Outside lens**: C24 prompt-preset versioning, M7 cluster unlock audit, prompt-override snapshotting (correct).
- **Status**: Persisted, well-detailed.

### /Users/veritypost/Desktop/verity-post/Current Projects/Audit_2026-04-24/Round2/L14_security_correctness.md
- **Purpose**: Auth/permission gates, rate-limiting, audit logging, RLS, cache invalidation, idempotency, transactional atomicity, input sanitization, CSRF, error handling, observability.
- **Findings (8)**:
  - **L2-14-01 HIGH NEW**: `web/src/app/api/admin/articles/[id]/route.ts:440-512` PATCH does sequential delete-and-reinsert on sources, timelines, quizzes (lines 441, 463, 485) without transaction. Partial failure leaves divergent state. Owner-input — Supabase doesn't expose BEGIN/COMMIT directly; recommend `patch_article_atomic` RPC.
  - **L2-14-02 HIGH NEW**: `web/src/app/api/admin/permissions/route.js:15-79` POST creates permission row without `bump_user_perms_version`. Sibling user-grants route does bump. New permission live in DB but caches stale up to 60s. Autonomous-fixable.
  - **L2-14-03 HIGH EXTENDS_MASTER_ITEM_C3**: Block route audits both directions; unblock direct-delete bypass (settings page line 3281) skips audit entirely. Asymmetric audit on bidirectional security-critical operation.
  - **L2-14-04 HIGH NEW**: `/api/admin/permissions/user-grants/route.js:95-144` DELETE — `recordAdminAction` line 123 sets targetTable='user_permission_sets', targetId=upSet?.id, doesn't capture target user_id in metadata. POST has same issue. "Find all permission-revokes for user X" requires a join. Owner-input.
  - **L2-14-05 HIGH NEW**: `web/next.config.js:16` declares `Strict-Transport-Security: ... preload` but no evidence veritypost.com is on the HSTS Preload List. Header declares preload property that isn't infrastructure-backed. Owner-input.
  - **L2-14-06 MEDIUM NEW**: Permission-set/permission-catalog mutations (POST /api/admin/permissions, PATCH /api/admin/permission-sets/[id]) don't bump perms_version OR a flag_version. PATCH /api/admin/users/[id]/plan does bump. Cache stale for hours. Owner-input.
  - **L2-14-07 MEDIUM NEW Polish**: Stripe webhook STUCK_PROCESSING_SECONDS=5 min (line 61); iOS Apple webhook same (line 99). Stripe retries can be hours; 5-min release risks double-processing in 55-min gap.
  - **L2-14-08 MEDIUM EXTENDS_MASTER_ITEM_H22**: `comments/route.js:70-74` hardcodes `Retry-After: '60'` regardless of window. `/api/admin/users/[id]/plan:367` correctly uses `String(rl.windowSec ?? 60)`. Systematic across multiple routes. Autonomous-fixable.
- **Outside lens**: L13 perf (H5 unbounded fetch + home category filters), L1 usability (429 messaging), L8 audit-completeness (C19 role grant/revoke + C21 moderation).
- **Status**: Persisted, broad cross-cutting coverage.

## What Round 2 added vs Wave A/B

Round 2 lens audits surfaced cross-cutting issues that surface-organized Round 1 missed:
- **Bidirectional/symmetric operation gaps**: block vs unblock, grant vs revoke, payment-succeeded vs other state changes — all audit-trail asymmetries (L14-03, L14-04, L06-002).
- **Cross-provider concurrency**: Stripe + Apple + iOS sync + web all writing subscriptions concurrently with no canonical-source resolution (L06-003).
- **Cross-platform design-token drift**: iOS Theme.swift `dim=#666666` vs web `globals.css` `--dim: #5a5a5a` after DA-054 update (L11-01); 24 files with local `const C` palettes (L11-02).
- **Cross-page accessibility patterns**: ConfirmDialog missing focus trap that Modal/LockModal have (L12-a01); PermissionGateInline missing keyboard handler that other components have (L12-a02).
- **End-to-end auth chain**: `?next=` preservation breaks at email signup, verify-email Continue, signup `onAuthStateChange` (L02 trio).
- **End-to-end permission staleness**: settings save → reloadUser doesn't invalidate permission cache (L5-003); CommentThread realtime subscription set once at mount (L3-005); component-level gate values cached at mount (L5-006).
- **Multi-table atomicity**: PATCH /api/admin/articles/[id] non-transactional sequential write (L14-01); discovery_items state race between cancel and generate finally (L10-01); attempt_number race in quiz submit (L3-004); soft_delete_comment + edit_comment TOCTOU (L3-001).
- **NEW production bugs not in Round 1**: L06-001 duplicate subscription rows; L08-001 kid RLS write blocking (contradicts C15 data-egress claim); L2-L04-01 cross-block DM bypass.

## Within-zone duplicates / overlap

- **C3 unblock bypass** appears in L05 (L5-001), L14 (L14-03), and is referenced by C3 in master list. Same root cause, three lens views (gate consistency, audit asymmetry, security-critical bidirectional op).
- **C15 kid data egress** appears in L08-001, L08-004, L15-01 — three different angles on the same kid-data-before-parental-verification problem. L08-001 also CONTRADICTS C15's data-egress framing (claims writes are blocked, not egressed).
- **H8 permission cache stale** appears in L3-003, L3-005, L5-003, L5-006, L14-02, L14-06 — settings reloadUser, vote endpoint, CommentThread realtime, permission-creation route, permission-set edits. Cross-cutting cache-invalidation pattern.
- **H17 cost-cap TTL** appears in L10-03 (margin reservation) and L10-05 (timing exposure). Same TTL, different consequences.
- **H22 hardcoded Retry-After** appears in L3-002 (vote) and L14-08 (comments). Systematic.
- **C20 admin billing audit gap** appears in L06-004 verbatim.
- **C21 moderation audit gap** appears in L09-03 verbatim.
- **C23 penalty button gating** appears in L09-02 verbatim.
- **C25 maxDuration missing** extended by L07-001 (sweep-kid-trials added to list).

## Within-zone obvious staleness

- **L01-02** in the digest is already fixed in commit `c08e592` per the digest itself; only stale because the lens ran before the fix landed and the digest captured both states.
- **L13-001** explicitly notes Owner already chose Option A, so the Round 2 finding is captured but already in implementation queue.
- The notification digest's closing note acknowledges that 7 of 15 lenses didn't Write to disk — those findings exist only in the digest and risk evaporating without action. **The digest itself is the canonical record for L01, L02, L04, L08, L11, L12, L13, L15.**

## Notable claims worth verifying in later waves

1. **L06-001 duplicate subscriptions rows** — production-impacting; verify by querying `subscriptions` table for duplicate `apple_original_transaction_id` or duplicate (user_id, plan_id, source='manual') rows. If duplicates exist, this is data corruption that needs a backfill cleanup in addition to code fix.
2. **L08-001 kid RLS write blocking** — high-impact contradiction of C15. Verify by either: (a) reading current `reading_log`/`quiz_attempts` RLS policies to see if `auth.uid()` is `kid_profile_id`-aware via custom JWT claim, or (b) live-test a kid quiz submission and check if a row lands. If writes ARE landing, there's an undocumented bypass to find. If writes are NOT landing, MAJOR functional bug masking as a privacy concern.
3. **L08-005 + C26** — `kid_expert_sessions` RLS-enabled-no-policies table. Verify by querying `pg_policies` for `kid_expert_sessions` table in the live DB.
4. **L08-006 articles RLS** — verify whether kid-accessible RLS path includes `is_kids_safe = true` or only `status='published'`. Slug-pattern filter at app level is fragile.
5. **L11-01 design-token drift** — verify Theme.swift line 14 still has `#666666` and globals.css `--dim` value; if synced already, finding is stale.
6. **L14-05 HSTS preload** — verify whether veritypost.com is on the HSTS preload list (https://hstspreload.org/?domain=veritypost.com).
7. **L2-L04-01 + L2-L04-02 block-check on RPCs** — verify `post_message`, `start_conversation`, `toggle_follow` RPC bodies for any block-check; if absent, blocked-but-conversed users can still DM/follow.
8. **L15-02 web-iOS logout sync** — verify whether `/api/auth/logout` triggers any iOS push/Realtime event that revokes the bearer token, or if iOS bearer is signed and self-validating until natural expiry.
9. **L06-005 subscription_events audit completeness** — verify whether `handleRefundUpdated`, `handleChargeDispute` write to `subscription_events` (Round 2 claims they don't); if confirmed, audit chain incomplete.
10. **C25 maxDuration list** — Round 2 (L07-001) adds `sweep-kid-trials` as a 5th route to C25's "4 routes missing maxDuration"; verify the actual count and which routes are still missing.
11. **L5-001 + L5-002** explicitly assert C3 + C4 fixes "have not been implemented" at anchor SHA — verify against current main HEAD whether those two ship blocks were closed in the four days between anchor and now.
12. **Notification digest persistence risk**: The 47 findings from L01/L02/L04/L08/L11/L12/L13/L15 exist only in the digest summary, not as standalone reports. Their evidence file:line claims have not been independently re-verified — the digest itself flags this and recommends "re-run that specific lens with explicit Write enforcement" if deeper triage is needed.
