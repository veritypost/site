# STATE — Verity Post Current Product State

**Last verified:** 2026-04-17 (post Q&A breakout — all 18 accumulated owner clarifications triaged. All 12 queued migrations applied to Supabase in this session after 051 self-heal fixes for two schema drifts. Sentry staged for `npm install`; secret rotation + PWA icons + Google OAuth config remain owner-pending).

**Pass 99 summary:** Two independent audits (`99-Archive/audits/DEEP_AUDIT.md` 188 findings, `99-Archive/audits/FRESH_AUDIT.md` 240 findings, plus the review adjudication) were integrated into a single 13-chunk repair pass. Every P0 / launch-blocker is either closed or routed to the owner rotation checklist. ~70 unique findings closed; transformative initiatives (TypeScript, test suite, design system) and iOS work remain queued. Full canonical narrative in `Verity_Post_Phase_Log.md` `## Pass 99` section; per-chunk execution detail in `REPAIR_LOG.md`.

**Kids Audit + Repair summary:** Scoped audit + repair of V1 in-app kid mode on web. 7 chunks + 1 addendum (6a). Added 3 migrations (061 paused_at, 062 leaderboard opt-in, 063 kid_expert_* RLS). 9 new files: kidTheme.js + 5 kid-scoped components + kids/layout.js + kid-safe article reader + household KPIs endpoint. Content safety hardened (kid `/story/*` redirect to kid reader; expert-session identity masking; assertNotKidMode coverage across 9 adult routes). Parental dashboard rebuilt as hero surface. Kid visual system tokenized with WCAG AA contrast verified. Always-visible top chrome + exit-PIN. D12 compliance swept (29 query sites, 1 leak fixed + RLS policies added). Streak + achievement celebration live. iOS deferred pending DUNS. Full canonical narrative in `Verity_Post_Phase_Log.md` `## Kids Audit + Repair Pass` section; per-chunk detail in `KIDS_AUDIT_AND_REPAIR_LOG.md`.

**Q&A breakout summary (2026-04-17):** 18 owner clarifications triaged in one session. Six iOS-scope LBs deferred (DUNS). Five LBs scoped with owner specifics for next coding pass. Four LBs closed (two converted to features, two not reproducible, one config task). Seven product decisions locked (see "Q&A-locked product decisions" section below). Three strategic directions set (iOS shell builds in parallel, no TypeScript migration, minimal Playwright E2E only).

**Admin surface sweep summary (2026-04-17):** Multi-session PM-driven audit of the admin surface. /admin/users + 15 Tier 1 pages + 14 Tier 2 pages = 29 admin pages audited for 7 bug patterns (column drift, wrong INSERT shape, dead UI, missing audit log, bypassable role check, Stripe de-sync, schema drift). ~40 line-level bugs FIXED with re-read verification. 4 whole-file structural rebuilds completed for `/admin/plans`, `/admin/promo`, `/admin/access`, plus the initial `/admin/users` fixes. Audit-log retrofits applied across 13 destructive paths in 7 files using `record_admin_action` + `DestructiveActionConfirm`. Remaining follow-ups queued in "Admin surface audit follow-ups" section below.

Canonical current-state snapshot. Describes the product as it is NOW, not how it got here. History lives in `Verity_Post_Phase_Log.md`. Refresh this file's "Last verified" date + relevant sections after every pass close or audit.

---

## One-paragraph summary

Verity Post is a quiz-gated news discussion platform. Web frontend (Next.js 14 App Router + React 18) is substantially launch-ready: every P0 from audit closed, five architectural patterns (auth gating, account state surfacing, admin destructive-action confirm + audit, session hardening, kid-mode lifecycle + content filter) have canonical shared components in place, 36 admin pages on a unified palette, all major unhappy-path state flows handled via a single `AccountStateBanner`. All 12 queued migrations applied to Supabase. iOS app (SwiftUI) is code-complete for core flows but launch-blocked on Apple Developer DUNS; owner direction is to build the iOS shell in parallel now (SwiftUI scaffolding + stubbed StoreKit IDs + stubbed APNs) so the app ships on DUNS-clear day. Backend schema-complete with all incremental migrations applied through 063. Content is zero — editorial team needs to publish 10+ articles with 10+ quiz questions each before launch. Remaining owner work tracked in `OWNER_TO_DO.md`.

---

## Platform readiness

| Platform | State |
|---|---|
| **Web** | Substantially launch-ready. Feature-complete for every Design Decision that has shipping code. All five architectural refactors done. Q&A breakout closed the 18 accumulated clarifications. Next coding pass scopes the triaged fixes (LB-006/010/013/016/034) plus the Q&A-locked feature decisions. |
| **iOS (SwiftUI)** | Code-complete for core flows. `xcodegen generate` clean. `xcodebuild` verified in prior launch-prep session. Blocked on Apple Developer DUNS. Owner direction: build iOS shell in parallel now (SwiftUI scaffolding for every screen, stubbed StoreKit product IDs, stubbed APNs registration, stubbed Apple Team ID) so DUNS-clear day = swap stubs for real values + TestFlight + submit. ATT prompt + PrivacyInfo.xcprivacy manifest + `VPUser` model D40 fields still queued for the dedicated iOS pass. |
| **Backend (Supabase)** | Schema canonical at `01-Schema/reset_and_rebuild_v2.sql` plus all incremental migrations 005–063 applied. 051 includes self-healing preamble for `articles.subcategory_id` and rewritten quiz-attempts CTE for v2 shape. RLS policies shipped; runtime verification deferred until next pass / post-launch. |
| **Stripe** | Live prices created, script-validated, `plans.stripe_price_id` populated. Webhook pipeline (including `invoice.payment_failed` alert) live. **Pending:** migrate from redirect Checkout to Embedded Checkout (Q&A-locked, LB-013). Keeps users on-site. |
| **APNs** | Pipeline code shipped (token storage, cron, session management). Apple key + Vercel env vars pending DUNS. |
| **Content** | Zero articles published. Editorial dependency for launch. |

---

## Feature areas — what works, what's deferred, what's blocked

### Authentication & sessions
- Email + password auth via Supabase.
- OAuth providers — Google config pending owner (GCP OAuth credentials → Supabase Auth → Providers → Google). Apple queued with iOS DUNS. See `OWNER_TO_DO.md`.
- Login via email OR username (Pass 16). Username resolves to email via SECURITY DEFINER RPC (migration 053 applied).
- Server-side auth middleware (`site/src/middleware.js`) protects `/admin/*`, `/profile/*`, `/notifications/*`, `/messages/*`, `/bookmarks/*` — unauthenticated visitors 302'd to `/login?next=<path>`.
- Role-specific gating via `requireRole()` in server components, consistent across all admin pages + mirrored on API routes.
- Password change / reset invalidate other sessions (`signOut({scope:'others'})`).
- Account lockout — 5 failed attempts → 15-minute lockout via `users.locked_until` + `record_failed_login` RPC (migration 054 applied).
- Email enumeration protected — forgot-password responds identically for existing vs non-existent emails.
- Rate limiter hardened (fail-closed in prod, fail-open in dev for unapplied-migration dev-ergonomics). Per-key via `check_rate_limit` RPC with `pg_advisory_xact_lock`.
- **Session drops (LB-034):** Instrumentation-first — scope next pass is to add session-lifecycle telemetry (auth state changes, middleware cookie clears, token refresh attempts) to Sentry. No root-cause patching until telemetry captures the actual trigger.
- **Deferred:** 2FA / MFA (own feature scope, not yet on a pass plan).

### Articles, content, discovery
- Home feed (`/`), browse (`/browse`), category pages (`/category/[id]`), article page (`/story/<slug>`).
- **Feed order:** chronological (Q&A-locked, UJ-716). No personalization for launch. Revisit post-launch if engagement data warrants.
- Adult surfaces filter `slug NOT LIKE 'kids-%'` AND `articles.status = 'published'` — no kid categories leaking, no drafts visible.
- Search — keyword (free) + advanced filters (paid, D26). Full-text search via GIN index on `articles.search_tsv`.
- Timelines render on article pages as visual elements.
- **D37 timelines:** click-through to related articles — **owner deferred in Q&A**. No decision locked; not shipped. Schema does not support it (`timelines` table has no `related_article_id`).
- **Feed card title guard (LB-016):** next pass scopes a render guard that drops feed cards with NULL/empty title + a data audit for any existing title-less articles.
- **Blocked:** zero published articles. Editorial team task.

### Discussion & comments
- Quiz-gated per D1 + D6. Discussion fully invisible until user scores 3/5+ on the article quiz.
- Comments support upvote/downvote per D29 (no emoji reactions).
- @ mentions paid-only per D21.
- Context-tagging (organic community notes) per D15/D16 — anyone who passed the quiz can tag.
- Mute enforcement blocks posting only (not reading/voting/tagging/reporting).
- CommentComposer reads mute state from the shared `AccountStateBanner` user row; stays disabled when muted.
- Report button hides for unverified users.
- Mobile HIG touch targets on comment buttons (44×44 minimum).
- **Staff override (Q&A-locked):** Admin/moderator roles bypass D1 (quiz gate) and D6 (comment lock) for moderation and normal posting. Stats stay honest — `quiz_attempts`, `reading_log`, category scores, badges, streaks only update from actual activity. Engineering impact: staff-role check on gate-enforcement path; stats logic unchanged. Scoped for next pass.
- **Deferred:** 2 bare `confirm()` sites in timeline-entry delete (story-manager, kids-story-manager) — trivial cleanup, bundle into next pass.

### Quizzes
- 5-question quiz per article, 3/5 passing (D1). 10–15 question pool per article required.
- Free users: 2 attempts, non-overlapping question sets. Paid users: unlimited attempts with non-repeat logic.
- Server-graded (iOS + web). Explanations shown after every attempt per D41.
- Sponsored quizzes supported (D35 — all tiers see them; double points).
- Shared `QuizPoolEditor.jsx` component embedded in `admin/story-manager`. Supports multiple-choice AND true/false question types.
- Anonymous user sees "sign up to take quiz" CTA when quiz pool is populated.
- **Deferred (feature scope):** AI-assisted quiz generation (LB-015c). Own planning cycle.

### Profile & settings
- Profile hub with per-category score breakdown. Drill-in route `/profile/category/[id]/page.js` shows 4 metrics per subcategory: reads, quizzes passed, comments, upvotes received. Metrics via `get_user_category_metrics` RPC (migration 051 applied with self-heal preamble).
- Profile Card link hidden entirely for free users (D10 invisible + D32 paid-only). Paid users see the card surface.
- Settings tree: profile, password, email, alerts, billing, data (export/delete), privacy, blocked users.
- Blocked users page (`/profile/settings/blocked`) — D39 safety surface, list + unblock per row.
- Expert signup captures 3 sample responses per D3.
- Profile save button has busy state. Privacy toggles wrapped in try/catch with optimistic rollback.
- Supervisor opt-in surfaces pending / cooldown states.
- Username immutable (correct per design — confirmed compliant in audit).
- Data export via `/admin/data-requests` flow (admin approves + sends). Owner-side "Export User Data" admin button wired.
- **Apply-to-expert post-submit (LB-010):** next pass scopes preserving global header + adding explicit "Back to profile / settings" link on the confirmation state.
- **Notifications page (LB-006):** loads empty on web. Next pass scopes a query audit for RLS / user_id scoping / kid_profile_id filter.

### Billing & subscriptions
- Stripe checkout for web (redirect today; **Embedded Checkout migration scoped for next pass** per Q&A LB-013 decision). StoreKit 2 for iOS (deferred pending DUNS).
- 4 tiers × 2 billing periods = 8 paid plans + Free (D10 + D42 pricing).
- Plan-change admin tool uses 9 canonical plan names (Pass 16 fix).
- D40 cancellation flow: DMs revoke immediately, 7-day grace, then frozen profile. Surfaces via `AccountStateBanner` component.
- D44 one-time kid trial (7 days, one per account).
- Invoice history table. Billing cancel modal explains grace period + freeze + resubscribe.
- Mobile billing invoices reshape to card layout below 680px viewport.
- **Deferred:** UJ-1310 admin settings batch-transaction semantics (partial fix shipped — batch-validation; full transaction rollback deferred).

### Kids & family (adult app + web)
- Kid profile creation requires DOB (D34 lock — NULL rejected server-side).
- D9 no-social — kids have no DMs / follows / comments.
- D12 undiscoverability — kid profiles excluded from adult search/suggestions.
- Kids global leaderboard separate from adults per D12 2026-04-16 clarification.
- Family leaderboard + weekly family report per D24.
- Parental dashboard for kid activity oversight.
- Co-adult achievements (Pass 5 Task 50 — migration 042).
- `/logout` and kid-profile deletion call `clearKidMode()` helper to clean `vp_active_kid_id` + dispatch `vp:kid-mode-changed`.
- Adult routes detect kid-mode and bounce via `assertNotKidMode(router)` helper.
- Kid streak-freeze button debounced.
- PROFILE_KIDS permission gated to Family / Family XL plans only (schema-enforced via `family_perks` permission set).
- **Deferred:** Verity Post Kids sister app (see `KIDS_SISTER_APP_PLAN.md`). Post-launch work; triggers on family plan traction.

### Admin
- Admin hub with 8 groups, 38 pages. All pages gated by `requireRole('admin')` or `requireRole('editor')`.
- Admin banner renders only on `/admin/*` paths (consistent across nav state).
- Moderator role cannot grant admin/superadmin (hierarchy-bounded grantRole).
- Shared `DestructiveActionConfirm.jsx` component — typed confirmation + reason capture + `admin_audit_log` record for every destructive action. Audit log via migration 055 (applied).
- Plans edit warns when active subscribers exist ("changes won't affect them; grandfathered").
- Breaking news pre-send shows estimated reach + enforces D14 free-tier 1/day cap client-side.
- Access code edit-expiry UI per row.
- Supervisor-flag filter reorders by urgency.
- 36 admin pages on `ADMIN_C` (dark theme) or `ADMIN_C_LIGHT` (light theme editorial) palette.
- **Feature backlog (from LB-019 Q&A conversion):** **Admin Ad Manager** — configurable placement (which pages, which slots: feed, article body, homepage hero, category page, sidebar) + targeting (category / subcategory) + D23 tier gate (free only). Not launch-tagged; owner sequences.

### Notifications
- Breaking news push (D14: 1/day free, unlimited paid).
- In-app notifications surface.
- APNs pipeline: `user_push_tokens` table, send-push cron, sandbox/production partition.
- **Q&A-locked (2026-04-17):** **In-app only. No email digests ever.** Transactional emails (verify, password reset, receipts) stay. Alerts-settings email-toggles to be audited and disabled/removed on next pass.
- Stripe `invoice.payment_failed` fires billing-alert notification.
- Expert reverification weekly cron.
- Email worker (Resend) verified end-to-end for transactional paths.

### Expert system
- Expert queue — questions routed to @category or @expert-name per D20 + D33.
- Paid users see full expert responses; free users see blurred responses per D20.
- Expert back-channel (private expert/editor/admin chat) wired.
- Expert signup captures 3 sample responses per D3.
- Annual expert re-verification cron (Blueprint 2.4) runs Mondays 4:30am UTC.
- Journalist role has additional background-check gate; admin verification UI supports notes capture + audit log.
- Kid profile info stripped from expert-session endpoint for non-privileged callers (D12 privacy).

### Leaderboards & achievements
- Global leaderboard (free+ per D31).
- Category + subcategory leaderboards (paid per D31).
- Kids global leaderboard separate from adults per D12.
- Family leaderboard per D24.
- Teen leaderboard reserved for KIDS_SISTER_APP_PLAN (post-launch).
- Frozen users (D40) excluded from all leaderboards.
- 35 achievements across reading / quiz / comment / streak criteria. `check_user_achievements` RPC (migration 050) applied; daily cron sweeps.
- Achievement surfaces display with proper title-case per Pass 16 fix.

---

## Admin surface audit follow-ups (2026-04-17)

The 29-page admin sweep closed most line-level bugs. The items below remain as discrete follow-up work. None are launch-blockers — admin is staff-only.

### Whole-file structural rebuilds needed

Each of these has a v1-vs-v2 schema mismatch across the entire CRUD surface. Patching in place moves bugs without fixing them. Each needs a dedicated rebuild pass in the style of the `/admin/plans`, `/admin/promo`, `/admin/access` rebuilds already completed.

| File | Why |
|---|---|
| ~~`/admin/features`~~ | REBUILT 2026-04-17 against v2 feature_flags (key / display_name / is_enabled / rollout_percentage / target_*). |
| `/admin/breaking` | Inserts into `articles` with non-existent columns (`text`, `story`, `sent_by`, `target`), missing NOT NULL `title` / `slug` / `body` / `category_id`. The entire breaking-news feature has no valid insert path. Needs product decision: own table or real article fields. |
| `/admin/analytics` | `quiz_attempts.passed` doesn't exist (v2 is per-question rows); articles have no `quiz_pass_rate` or `avg_read_time` columns. Pass-rate is an aggregate over grouped per-question rows. Needs an `attempt_pass_rate(quiz_id)` RPC + denormalized per-article stats (or per-article aggregation query). Out of rename scope. |
| `/admin/system` rate limits | UI writes to `feature_flags` with v1 columns. v2 has a dedicated `rate_limits` table (schema L202) with completely different shape (`key` / `max_requests` / `window_seconds` / `scope` / `applies_to_plans` / `burst_max` / `penalty_seconds` / `is_active`). Full rebuild needed in the style of plans/promo/access/features. |
| `/admin/ingest` | Queries non-existent `story_clusters` table. v2 has `feed_clusters` (schema L1911) with different shape (no audience/confidence/story_id, different column names). File comment already acknowledges the backend pipeline is missing. Either rebuild against `feed_clusters` + a cluster↔article junction, or wait for the backend. |
| `/admin/webhooks` retry | Writes to non-existent `webhooks` table (schema only has `webhook_log`). Marks failed webhook as success without actually retrying. Needs a backend retry endpoint (`/api/admin/webhooks/:id/retry`). |
| `/admin/pipeline` display | `pipeline_runs` doesn't have columns the admin expects (`story`, `steps`, `cost`, `violations`). Most run-row data reads blank. Needs schema widening or `output_summary` denormalization. |
| `/admin/support` ChatWidgetConfig | ~120 lines of toggles that never persist anywhere. Needs a persistence decision: wire to `settings` / `feature_flags`, or rip out. |
| `/admin/feeds` | **Entire page queries non-existent `rss_feeds` table.** Real schema table is `feeds` (reset_and_rebuild_v2.sql:786) with a completely different column set (`name`, `url`, `feed_type`, `is_active`, `error_count`, `last_polled_at`, `articles_imported_count`, `source_name`, `poll_interval_minutes`, etc.). Every CRUD operation on the page 500s. Full rebuild needed matching plans/promo/access/features pattern. |

### Latent safety-net issues (from verification sweep)

Surfaced by Layer 3 (silent-error, optimistic-state, busy-guard) pattern hunt. All REPORT-ONLY; low-priority but real.

- **Silent saveAll swallows** — `/admin/story-manager` (~L259-312) and `/admin/kids-story-manager` (~L267-329). 7-8 sequential supabase writes per save, only the first destructures `error`, `setIsDirty(false)` fires unconditionally. Admin sees "saved" while writes fail silently on RLS denial. Fix: accumulate errors through the chain, preserve isDirty on any failure.
- **Fire-and-forget settings upserts** — `/admin/streaks` (~L114, L124) and `/admin/comments` (~L144-157 debounced persistSettings). Writes not checked for error, no revert, no audit log, no user-visible feedback. Fix bundles with a slug-table extension for `setting.update`.
- **Missing busy guards on single-click destructive toggles** — `/admin/email-templates:152` toggleStatus, `/admin/categories:50` toggleVisibility, `/admin/stories:210-223` publish/unpublish. Double-click races two concurrent UPDATE calls. Fix: add togglingId / actioningId state + disabled prop on the button.

### Correctness issues (single-file, require owner decisions)

- `/admin/webhooks` retry path writes to non-existent `webhooks` table (schema only has `webhook_log`). Marks failed webhook as success without actually retrying. Needs a backend retry endpoint (`/api/admin/webhooks/:id/retry`) that re-invokes the handler and increments `retry_count` on success. Audit wrapper is already in place, would persist across the rewrite.
- `/admin/pipeline` display columns on `pipeline_runs` that don't exist (`story`, `steps`, `cost`, `violations`). Most run-row data reads blank. Needs product decision: widen `pipeline_runs` schema or denormalize story title into `output_summary`.

### Audit-log slug gaps (mechanical follow-up)

Six destructive admin paths are currently bare because the action slug was not in the approved table. Next micro-pass: extend the slug table with six new entries then retrofit the six paths using Pattern A or B.

| File | Path | Proposed slug |
|---|---|---|
| `/admin/ad-placements` | `deleteUnit` | `ad_unit.delete` |
| `/admin/email-templates` | `toggleStatus` | `email_template.toggle` |
| `/admin/pipeline` | `handleRunCustomIngest` | `pipeline.run` |
| `/admin/recap` | `deleteQuestion` | `recap_question.delete` |
| `/admin/words` | reserved_usernames add | `reserved_username.add` |
| `/admin/words` | reserved_usernames delete | `reserved_username.delete` |
| `/admin/verification` | `approve` (warmup pass landed this) | `expert_application.approve` (already wired) |

Plus: `webhooks` retry modal currently uses invented slug `webhook.retry` not in the approved table — either add to table or change to `webhook.toggle` / a new slug.

### Stripe-sync gaps (owner-paired session required)

Any write that flips DB subscription state or price without a matching Stripe API call risks billing drift. These paths were flagged REPORT-ONLY by prior passes; each needs an owner-paired session because integration decisions (when to cancel, how grace periods map, how promo codes map to `stripe_coupon_id`, refund reconciliation) are product calls not mechanical fixes.

- `/admin/subscriptions` — `manualDowngrade`, `resumeAccount`, `processRefund`, `handleAdminFreeze`.
- `/admin/plans` — price edit paths update `price_cents` without updating `stripe_price_id`. Current UI shows a warning banner; no auto-sync.
- `/admin/promo` — promo code create/update does not create/update `stripe_coupon_id`.
- **`/api/billing/cancel`** — DB-only `billing_cancel_subscription` RPC. Stripe keeps billing user at next cycle. Surfaced by Tier S audit 2026-04-17. In-file comment already acknowledges the gap.
- **`/api/billing/change-plan`** — DB-only flip. Stripe continues charging old price after downgrade, or user not charged for upgrade. Surfaced by Tier S audit 2026-04-17.
- **`/api/billing/resubscribe`** — DB-only. Uncancel happens on DB but Stripe subscription stays cancelled. Surfaced by Tier S audit 2026-04-17.

### Tier S audit follow-ups (billing + auth surface, 2026-04-17)

35 files audited. Zero P0 findings (no auth bypass, no ownership gaps, no webhook-signature or idempotency holes, no service-role leaks). 1 FIXED (`reserved_usernames` column rename in `signup/pick-username/page.js`). Two REPORT-ONLY items beyond the billing-sync gaps above:

- **Stripe checkout open-redirect adjacent-surface** — `/api/stripe/checkout/route.js:12,36-37` accepts `success_url` / `cancel_url` from the client body and passes them to Stripe without same-origin validation. Attacker-supplied URL returns user to phishing domain after payment with a legitimate Stripe referrer. Fix: validate supplied URLs against `request.nextUrl.origin`, or drop the body-supplied params entirely and always use the internal fallback URLs.
- **Password re-auth rate-limit bypass** — `/profile/settings/password/page.js:83-91` calls `supabase.auth.signInWithPassword` directly from the browser. The app-layer account lockout counter (migration 054) only fires from `/api/auth/login-failed`. Compromised session could grind current-password guesses on the password-change form without tripping lockout. Fix: add `/api/auth/reauth` route wrapping `checkRateLimit` + server-side probe; replace the client-side `signInWithPassword` call with a fetch to this route.

### Tier A audit follow-ups (user CRUD + RLS, 2026-04-17)

30 files audited (11 user-facing pages + 19 API routes). 1 P0 FIXED (described below). 4 REPORT-ONLY items.

**P0 closed this pass: PII leak on public profile view.** `site/src/app/profile/[id]/page.js` was calling `supabase.from('users').select('*')` for any public profile. The `users_select` RLS policy (v2 schema L3735-3737) permits reads when `profile_visibility = 'public'`, and RLS is row-level not column-level — so `select('*')` returned the entire user row (including `email`, `stripe_customer_id`, `last_login_ip`, `plan_status`, `frozen_at`, `is_banned`, `is_muted`, `metadata`) to any authenticated browser visiting `/profile/<any-public-user-uuid>`. Fixed by introducing a `PUBLIC_USER_FIELDS` constant with only safe public fields + in-code comment explaining the RLS gap. Grep confirms no residual `select('*')` on users anywhere in `site/src/app`.

Remaining Tier A REPORT-ONLY items:

- **Kid-mode bypass across `/profile/**`** — subtree doesn't call `assertNotKidMode(router)`. P1 (adult UI elements shown in kid sessions, not data leak). Per-page audit needed to add guards to `/profile/page.js`, `/profile/[id]/page.js`, `/profile/settings/blocked/page.js`, and other adult-scope mounts.
- **`verity_rank_percentile` dead render** — `profile/[id]/page.js:372-374` renders a "Top X%" block conditionally on `user?.verity_rank_percentile`. Column doesn't exist in v2 schema; conditional always falsy. Remove the dead block or compute percentile from `users.verity_score` rankings.
- **D10+D11 UI leak on public profile** — `profile/[id]/page.js:317-320` renders unconditional "Message" button to all viewers. Per D10 (invisible gate) + D11 (DMs paid-only), free users shouldn't see it. Fix: wrap in `{viewerIsPaid && currentUser?.id !== user?.id && ...}` matching the FollowButton pattern.
- **Client-side follow/block writes trusting RLS** — `profile/[id]/page.js:196-231` uses direct `supabase.from('follows').insert(...)` and `supabase.from('blocked_users').insert(...)` from the browser instead of routing through `/api/follows` and `/api/users/[id]/block`. Inconsistent with the rest of the codebase; optimistic state may not revert on RLS rejection.

### Cross-tier observations flagged during Tier A (for later sweeps)

- `/leaderboard/page.js` — needs D12 (no kids) + D40 (no frozen) verification. Tier B scope.
- `/api/reports/route.js` — doesn't validate `target_type` against an enum; accepts any varchar(50). Moderation-surface concern.
- `/search/route.js` — applies `is_kids_safe` filtering per D12 but warrants Tier B re-verification in context of the full search flow.

### Dead UI pockets (require layout/product decisions)

- `/admin/support` ChatWidgetConfig — ~120 lines of toggles that never persist anywhere. Either wire to `settings` table or `feature_flags`, or rip out.
- `/admin/email-templates` category tabs — `email_templates` has no `category` column; tabs filter on a non-existent field. Either delete the tab filter or move category into `metadata`.
- `/admin/feeds` decorative threshold inputs (already triaged separately) — three numeric inputs with no save path. Delete or wire to ingestion config.
- `/admin/stories` "+ New Article" button — decorative toast, no navigation.
- `/admin/stories` "Find Articles" Clear / Scan New buttons — no `onClick` handlers.

### Client-only role checks (RLS hardening — separate migration pass)

Every admin page gates via `requireRole('admin')` client-side. RLS on sensitive tables (`user_roles`, `plans`, `plan_features`, `admin_audit_log` write path) needs hierarchy-aware policies so that bypassing the UI (direct Supabase call) can't escalate privileges. This is a migration-pass scope: add hierarchy checks to each policy body. Not urgent pre-launch (staff-only surfaces) but should happen before external admin accounts are issued.

---

## Q&A-locked product decisions (2026-04-17)

| Area | Decision |
|---|---|
| **D10 enforcement** | Fully invisible gates for free users. No teasers, no "upgrade to unlock" callouts on paid features. Free users never see the paid UI. Revisit if post-launch conversion data suggests the invisible gate hurts upgrades. |
| **Notifications channel** | In-app only. No email digests ever. Transactional emails (verify, reset, receipts) are distinct from digests and remain. |
| **Feed ordering** | Chronological only for launch. No personalization / category-weighting / engagement-weighting / tabs. Add post-launch if engagement data warrants. |
| **D37 timelines** | Owner deferred — no decision locked. Feature not shipped. |
| **Staff override** | Admin/moderator roles bypass D1 + D6 gates. Stats stay honest (only actual quiz attempts / reads / etc. count). |
| **Ad placement control** | New feature: Admin Ad Manager — admin picks placement (which page / which slot) + targeting (category / subcategory) + tier gate (free only per D23). No launch tag. |
| **Stripe checkout flow** | Swap from redirect to Embedded Checkout. User stays on-site. |
| **iOS timing strategy** | Build the iOS shell in parallel now with stubbed StoreKit IDs + APNs. DUNS-clear day = swap stubs for real values + submit to App Store. |
| **TypeScript migration** | No. Codebase stays JavaScript. New files may be TS if a pass needs it; no forced migration. Post-launch decision, if ever. |
| **Test suite** | Minimal Playwright E2E only — ~12-15 smoke tests covering auth, email verify, quiz gate (D1), comment lock (D6), Stripe checkout, kid-PIN, password reset. Run in CI on deploy. No comprehensive unit/integration coverage pre-launch. |
| **CQ cleanup** | All 16 structural CQ items stay deferred. No pull-forward. |
| **PM framing** | Don't frame work as "launch-blocking vs post-launch". Owner sequences features; PM logs flat. |

---

## Deferred — explicitly not launch-blocking

### Post-launch code quality backlog (16 structural CQ items)
All 16 items stay deferred per Q&A. Listed in `99-Archive/working-docs/Z - Code Quality Recommendations.md`. Representative items: StoryDetailView.swift 1796-LOC split (CQ-14), iOS quiz architecture rework (CQ-15), auth view duplication (CQ-4), palette duplication across 10 auth pages (CQ-1), inline styles pervasive on web (CQ-2/16), mobile tab duplication (CQ-20), PIN hashing inconsistency (CQ-22), lock-copy dictionary centralization (CQ-28).

### UI redesign bucket (separate design effort)
- Date pickers platform-wide (LB-018).
- Mobile profile submenus + settings visual redesign (LB-022).
- Mobile signup flow polish (LB-037) — also iOS-deferred.

### Feature scopes — separate planning
- AI-assisted quiz generation (LB-015c).
- **Admin Ad Manager** (from LB-019 Q&A conversion) — placement + targeting + tier gate.
- Behavioral anomaly detection per Blueprint 10.3 (z-Remaining item 30).
- Verity Post Kids sister app per `KIDS_SISTER_APP_PLAN.md`.

### Strategic initiatives (Q&A-locked as not-happening)
- TypeScript migration — no.
- Comprehensive unit/integration test coverage — no. Minimal Playwright E2E instead.
- Email digests — no, ever.

### iOS prelaunch pass (DUNS-blocked, owner wants parallel shell build now)
Scope when DUNS clears: swap placeholders for real App Store Connect product IDs, real APNs cert, real Apple Team ID, submit TestFlight → App Store review. Pre-DUNS shell-build work covers:
- ATT prompt (UJ-900) — write it now with placeholder copy.
- PrivacyInfo.xcprivacy manifest (UJ-905) — write it now.
- `VPUser` model D40 field additions (UJ-913).
- Biometric login (UJ-901).
- Password autofill (UJ-902).
- UIActivityViewController share sheet (UJ-903).
- Deep link handler (UJ-904).
- 401 retry after token refresh (UJ-908).
- Pull-to-refresh on major surfaces (UJ-906).
- D-rule parity: streak-freeze count UI, supervisor flag button, family leaderboard polish, expert back-channel completion, TTS interruption handling, mention-autocomplete tier gate.
- Accessibility: Dynamic Type, VoiceOver labels.
- Force-unwrap sweep + Task cancellation cleanup.
- Six Q1-deferred iOS bugs: LB-028, LB-031, LB-032, LB-033, LB-037 (nav parity, scroll cutoffs, whitespace, grey strip, signup UX).

---

## Blocked — owner / external dependencies

### Owner launch prep (see `OWNER_TO_DO.md` for the canonical checklist)
- Apple Developer DUNS (D&B pending).
- App Store Connect: 8 subscription products, V2 Server URL, APNs auth key, universal links.
- APNs Vercel env vars.
- **Google OAuth config** (new from Q&A LB-036): GCP OAuth credentials → Supabase Auth → Providers → Google → callback URLs.
- Secret rotation (Supabase service role, Stripe secret, Stripe webhook secret, Resend, OpenAI, APNs, CRON_SECRET) — see `ROTATE_SECRETS.md`.
- PWA icon generation.
- `npm install` for Sentry package staged during Pass 99.
- Sentry DSN configuration in Vercel env.
- 10+ published articles with 10+ quiz questions each.

### Migrations applied (0 pending)
All 12 queued migrations applied 2026-04-17 in Supabase SQL Editor after 051 self-heal fixes:
- 051, 053, 054, 055, 056, 057, 058, 059, 060, 061, 062, 063 — all applied in order. 052 intentionally skipped (reserved, never used).

### Post-deployment operational verification (once web is live on veritypost.com)
- RLS multi-user E2E test.
- Scale / load smoke test.
- Realtime disruption recovery.
- Storage bucket audit (avatars / banners / data-exports).
- Client-cache staleness check (web + iOS post-deploy).
- Cross-session state consistency.

---

## Reference — where to look for what

| Need | Where |
|---|---|
| Canonical product rules | `00-Reference/Verity_Post_Design_Decisions.md` (D1–D44, plus proposed D45+ in sister-app plan) |
| Narrative history | `05-Working/Verity_Post_Phase_Log.md` (every pass summarized) |
| Per-task receipts | `05-Working/AUTONOMOUS_FIXES.md` (150 entries, append-only) |
| Owner launch checklist | `05-Working/OWNER_TO_DO.md` |
| Active bug intake | `05-Working/LIVE_TEST_BUGS.md` (condensed — OPEN entries only get detail) |
| Sister app planning | `05-Working/KIDS_SISTER_APP_PLAN.md` |
| Pass 99 per-chunk log | `05-Working/REPAIR_LOG.md` |
| Kids pass per-chunk log | `05-Working/KIDS_AUDIT_AND_REPAIR_LOG.md` |
| Secret rotation checklist | `05-Working/ROTATE_SECRETS.md` |
| Historical working docs | `99-Archive/working-docs/` (Passes 1–17, Bug Triage, CQ, Launch Confidence, PM Handoff) |
| Historical audit snapshots | `99-Archive/audits/` (HEALTH_CHECK, FULL_AUDIT, LIVE_TEST_BUGS_DIAGNOSIS, USER_JOURNEY_DISCOVERY, REMAINING_WORK) |

---

## How to use this doc

- Drop-in starting point for anyone new to the project. Read top-to-bottom.
- Refreshed after every pass close (PM updates Last verified date + section deltas).
- Not a narrative. If a feature works, it's listed under "what works" — no history of how it got fixed.
- Audit trail lives in the phase log. If you need "when did X ship?", look there.
- Source of truth for "where do things stand."

---

*2026-04-17 refresh: Q&A breakout closed 18 accumulated clarifications; all 12 migrations applied to Supabase; 13 Q&A-locked decisions captured as a first-class section.*
