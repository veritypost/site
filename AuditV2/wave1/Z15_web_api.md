# Zone Z15: web/src/app/api/

## Summary

200 route files across 28 logical area groupings. Surface is highly mature: the canonical mutation pattern (`requirePermission → createServiceClient → checkRateLimit → body parse/validate → RPC or direct write → audit (admin) → response`) is followed nearly universally. Errors are routed through `safeErrorResponse` / `permissionError` helpers and `record_admin_action` is consistent across admin mutations. Notable strengths: (1) the kid pair-code custom-JWT machinery is well-isolated with rotation, ownership re-checks, and a structured `parental_consents` audit trail; (2) Stripe webhook implements an atomic claim with stuck-row reclaim plus a dedicated `customer_id → user` takeover defense; (3) Apple StoreKit2 routes layer JWS verification + per-IP rate limit + `appAccountToken` ownership check + transactional state. Notable weaknesses: pre-2026-04-25 `error.message`-leak sweep is largely complete (recent commit `29f7a22`) but a handful of routes still echo raw `error.message` (e.g. `kids/pair`'s 500 outer catch is generic, but the inner RPC error mapping reads `error.message`; `messages/route.js` uses it as a routing key; mostly defensible internal use). Two endpoints lack rate limits on writes (notably `/api/expert/queue/[id]/{answer,claim,decline}`, `/api/comments/[id]/{report,flag,context-tag}`, `/api/expert/{ask,back-channel}`, `/api/expert-sessions/[id]/questions` POST and `/answer`), and `/api/admin/notifications/broadcast` uses the over-broad `admin.settings.edit` permission with a self-acknowledged TODO to add `admin.notifications.broadcast`. Several admin route gates skip `require_outranks` because the action is permission-restricted at the role level rather than per-target (fine for the affected actions). 429s consistently include `Retry-After`. The `/api/admin/pipeline/generate` (1877 lines) is the architectural anchor for F7; not all of it was line-by-line read but the header/contract is clear.

## Route count by area

| Area | Files | Notes |
|---|---|---|
| auth | 14 | login, signup, callback, OAuth, password, email-change, etc. |
| account | 4 | data-export, delete, login-cancel-deletion, onboarding |
| kids (parent + iOS) | 11 | including pair, refresh, generate-pair-code, set/reset/verify-pin, trial |
| kids-waitlist | 1 | anon landing-page intake |
| admin | 84 | users, billing, moderation, recap, ads, sponsors, plans, permissions, expert apps, settings, broadcasts, broadcasts/alert, prompt-presets, pipeline (generate/cleanup/runs), newsroom (clusters, sources, articles), categories, words, features, feeds, email-templates, rate-limits, promo, subscriptions, articles, etc. |
| stripe | 3 | checkout, portal, webhook |
| billing | 3 | cancel, change-plan, resubscribe (DB+Stripe-mirrored) |
| comments | 6 | route, [id]/{vote,report,flag,context-tag,route} |
| follows | 1 | toggle |
| bookmarks + bookmark-collections | 5 | CRUD + export |
| reports + appeals + weekly-reading-report | 3 | |
| messages + conversations | 3 | post + search + start |
| expert + expert-sessions | 11 | apply/ask/queue/back-channel/answers + session questions |
| family | 4 | achievements, config, leaderboard, weekly-report |
| notifications + push | 3 | list/patch, prefs, ad-hoc admin send |
| cron | 12 | check-user-achievements, cleanup-data-exports, flag-expert-reverifications, freeze-grace, pipeline-cleanup, process-data-exports, process-deletions, rate-limit-cleanup, recompute-family-achievements, send-emails, send-push, sweep-kid-trials |
| ads | 3 | serve / impression / click |
| ai | 1 | legacy /api/ai/generate (now superseded by F7 pipeline) |
| support | 3 | authed POST/GET, public (anon), [id]/messages |
| access-request | 1 | 410 Gone (retired) |
| errors / csp-report / health / events | 4 | telemetry sinks |
| ios | 2 | StoreKit2 sync, App Store Server Notifications V2 |
| newsroom | 1 | ingest/run |
| promo | 1 | redeem |
| quiz | 2 | start, submit |
| recap | 3 | list, [id], submit |
| search | 1 | basic (anon) + advanced (paid) |
| settings (public) | 1 | password-policy |
| stories | 1 | read-tracking |
| supervisor | 2 | opt-in/out |
| users | 2 | block / blocked list |

Total: 200.

## Per-route index (every endpoint)

Format: `<METHOD> <path> — Auth | Client | Rate-limit | RPC/Tables | Audit | Compliance`

### Auth

- **GET /api/auth/callback** — anon | user(supabase ssr) → service for first-row writes | none | `auth.exchangeCodeForSession`, `users` upsert, `auth_providers` insert, `user_roles` insert, `audit_log` insert, `cancel_account_deletion` RPC, `scoreDailyLogin` | inline audit_log insert (not record_admin_action) | OK — heavy XSS/IdP sanitization for display_name + avatar_url; uses `resolveNext` to block open redirect.
- **POST /api/auth/check-email** — anon | user + service | per-IP 30/3600s + per-email 10/86400s | RPC `is_email_registered` | none | OK
- **POST /api/auth/check-username** — anon | service | per-IP 20/60s | tables `reserved_usernames`, `users` | none | OK
- **POST /api/auth/email-change** — `requireAuth` | user + service | per-user+IP 3/3600s | `supabase.auth.updateUser`, `users.update`, `audit_log` insert | inline | OK
- **POST /api/auth/login-failed** — anon | service + ephemeral client | per-IP 30/3600s + per-email 3/3600s | `record_failed_login_by_email` RPC, ephemeral signInWithPassword for proof | none | OK
- **POST /api/auth/login-precheck** — anon | service | per-IP 30/3600s + per-email 3/3600s | `get_user_lockout_by_email` RPC | none | OK
- **POST /api/auth/login** — user-cookie session | user + service | per-IP 10/900s | service writes `users.last_login_at,last_login_ip`, `increment_field`, `audit_log`, `cancel_account_deletion`, `clear_failed_login`, `scoreDailyLogin` | inline | OK
- **POST /api/auth/logout** — anon-tolerant | user + service | none | invalidates push tokens; supabase.auth.signOut | none | OK
- **POST /api/auth/resend-verification** — `requireAuth` | user | per-user 3/3600s | `auth.resend` | none | OK
- **POST /api/auth/reset-password** — anon | user | per-IP 5/3600s + per-email 3/3600s | `resetPasswordForEmail` | none | OK (uniform 200 response always)
- **POST /api/auth/resolve-username** — anon | service | per-IP 10/60s | `resolve_username_to_email` RPC | none | OK
- **POST /api/auth/signup-rollback** — bearer JWT match (jsonwebtoken.verify against SUPABASE_JWT_SECRET) | service | none | deletes `user_roles`, `users`, `auth.admin.deleteUser`; refuses if `comments` count > 0 | inline `audit_log` | OK — strict `sub === user_id` match
- **POST /api/auth/signup** — anon | user + service | per-IP 5/3600s | `auth.signUp`, `users` upsert, `roles` lookup, `user_roles` upsert, `audit_log`, `trackServer` | inline `audit_log` | OK; full rollback on failure
- **POST /api/auth/verify-password** — `requireAuth` | service + ephemeral | per-user 5/3600s | ephemeral signInWithPassword + `record_failed_login_by_email` | none | OK

### Account

- **POST /api/account/data-export** — `requirePermission('settings.data.request_export')` | service | per-user 2/86400s | dedupes existing pending; `data_requests` insert | none | OK
- **POST /api/account/delete** + **DELETE** — `requireAuth` (cookie origin allowlist OR bearer) + permission `settings.data.request_deletion` / `settings.data.deletion.cancel` | user + service | per-user 5/3600s | RPC `schedule_account_deletion`, `anonymize_user`, `auth.admin.deleteUser`, `cancel_account_deletion` | none (self-action) | OK; CSRF origin allowlist; immediate-delete branch tears down session
- **POST /api/account/login-cancel-deletion** — bearer OR cookie+origin | user + service | none | `cancel_account_deletion` RPC | none | OK
- **POST /api/account/onboarding** — `requireAuth` | user (cookie) | none | RPC `update_own_profile` | telemetry only | OK

### Kids (parent + iOS)

- **GET/POST /api/kids** — `requirePermission('kids.parent.view' / 'kids.profile.create')` | service | none on POST (cap by permission) | `kid_profiles` CRUD | none | Concern: write w/o rate limit (P5)
- **PATCH/DELETE /api/kids/[id]** — `requirePermission('kids.profile.update' / '.delete')` | service | none | `kid_profiles.update` (soft delete) | none | DELETE requires `?confirm=1` query param
- **POST /api/kids/[id]/streak-freeze** — `requirePermission('kids.streak.freeze.use')` | service | none | RPC `use_kid_streak_freeze` | none | Concern: no rate limit on write
- **POST /api/kids/generate-pair-code** — `requireAuth` | user + service | per-user 10/60s | RPC `generate_kid_pair_code` | none | OK
- **GET /api/kids/global-leaderboard** — `requirePermission('kids.leaderboard.global.view')` | service | none | tables `kid_profiles`, `category_scores` | n/a (read) | OK
- **GET /api/kids/household-kpis** — `requirePermission('kids.parent.household_kpis')` | service | none | tables `subscriptions`, `kid_profiles`, `users`, `reading_log`, `quiz_attempts` | n/a (read) | OK
- **POST /api/kids/pair** — anon + JWT mint | service | per-IP 10/60s + per-device 10/60s | RPC `redeem_kid_pair_code` + jsonwebtoken.sign + `parental_consents.upsert` | none | OK; ON CONFLICT replaces stale consent
- **POST /api/kids/refresh** — bearer JWT verify | service | per-IP 30/60s | `kid_profiles` lookup + jsonwebtoken.sign | none | OK; rejects non-kid-delegated tokens
- **POST /api/kids/reset-pin** — `requirePermission('kids.pin.reset')` + parent password proof (ephemeral client) | user + service + ephemeral | per-user 5/3600s | `record_failed_login_by_email` on bad password; `kid_profiles` update | none | OK
- **POST /api/kids/set-pin** — `requirePermission('kids.pin.set')` | user | none | `kid_profiles` update via cookie-scoped client | none | Concern: no rate limit on write (P5); writes through cookie-client (RLS-aware)
- **GET/POST /api/kids/trial** — `requirePermission('kids.parent.view' / 'kids.trial.start')` | service | none | RPC `start_kid_trial`, then update `kid_profiles` | none | Concern: no rate limit on write (POST)
- **POST /api/kids/verify-pin** — `requirePermission('kids.pin.verify')` | service | per-user 30/60s + per-row DB lockout | tables `kid_profiles`, `settings` (DB-tunable lockout) | none | OK; DB-tunable lockout
- **POST /api/kids-waitlist** — anon | service | per-IP 10/3600s + per-email 3/86400s | `kids_waitlist` upsert | none | OK; bot-UA + honeypot + min-time

### Stripe

- **POST /api/stripe/checkout** — `requirePermission('billing.upgrade.checkout')` | service + Stripe SDK | per-user 20/3600s | `users` lookup, `plans` lookup (active+visible), `createCheckoutSession` | none | OK
- **POST /api/stripe/portal** — `requirePermission('billing.portal.open')` | service + Stripe SDK | per-user 20/3600s | `createBillingPortalSession` | none | OK
- **POST /api/stripe/webhook** — Stripe HMAC sig | service | none (signature is the gate) | `verifyWebhook`, `webhook_log` claim, `billing_change_plan`, `billing_resubscribe`, `billing_freeze_profile`, `billing_unfreeze`, `bump_user_perms_version`, `audit_log`, `create_notification` | inline audit | OK; UUID match defense for `client_reference_id`/`metadata.user_id`; refuses to overwrite existing customer_id; idempotent claim with stuck-row reclaim

### Billing (DB+Stripe mirror)

- **POST /api/billing/cancel** — `requirePermission('billing.cancel.own')` | service + Stripe SDK | per-user 5/60s | Stripe-first (cancel_at_period_end), then `billing_cancel_subscription` RPC; inline `audit_log` | inline | OK
- **POST /api/billing/change-plan** — `requirePermission('billing.change_plan')` | service + Stripe SDK | per-user 5/60s | Stripe-first `updateSubscriptionPrice`, then `billing_change_plan` RPC; refuses invisible plans | inline `audit_log` | OK
- **POST /api/billing/resubscribe** — `requirePermission('billing.resubscribe')` | service + Stripe SDK | per-user 5/60s | Stripe-first `resumeSubscription`, then `billing_resubscribe` RPC | inline `audit_log` | OK

### Comments

- **POST /api/comments** — `requireAuth` + `hasPermissionServer('comments.post')` + quiz-pass check | service | per-user 10/60s | RPC `user_passed_article_quiz`, `post_comment`, `scoreCommentPost` | none | OK
- **PATCH/DELETE /api/comments/[id]** — `requirePermission('comments.edit.own' / '.delete.own')` | service | none | RPC `edit_comment` / `soft_delete_comment` | none | Concern: no rate limit on writes (P5)
- **POST /api/comments/[id]/vote** — `requirePermission('comments.upvote' / 'downvote' / 'vote.clear')` + quiz pass | service | none | RPC `toggle_vote`, `scoreReceiveUpvote` | none | Concern: no rate limit on write (P5)
- **POST /api/comments/[id]/report** — `requirePermission('comments.report')` | service | none | direct `reports` insert | none | Concern: no rate limit on write (P5); duplicate of `/api/reports`?
- **POST /api/comments/[id]/flag** — `requirePermission('comments.supervisor_flag')` | service | none | RPC `supervisor_flag_comment` | none | Concern: no rate limit on write (P5)
- **POST /api/comments/[id]/context-tag** — `requirePermission('comments.context_tag')` | service | none | RPC `toggle_context_tag` | none | Concern: no rate limit on write (P5)

### Follows + Bookmarks

- **POST /api/follows** — `requirePermission('profile.follow')` | service | per-user 60/60s | RPC `toggle_follow` | none | OK
- **POST /api/bookmarks** — `requirePermission('article.bookmark.add')` | service | per-user 60/60s | direct `bookmarks` insert + 23505 idempotency | none | OK; uses `safeErrorResponse` for P0001 cap
- **PATCH/DELETE /api/bookmarks/[id]** — perm `bookmarks.note.edit` / `collection.create` / `article.bookmark.remove` | service | none | direct update/delete | none | Concern: no rate limit on writes
- **GET /api/bookmarks/export** — `requirePermission('bookmarks.export')` | service | none | `bookmarks` join `articles` | n/a | OK
- **GET/POST /api/bookmark-collections** + **PATCH/DELETE /[id]** — perms `bookmarks.list.view` / `.collection.create/rename/delete` | service | per-user 20/60s on POST only | RPC `create_bookmark_collection`, `rename_bookmark_collection`, `delete_bookmark_collection` | none | PATCH/DELETE lack rate limits

### Reports + Appeals

- **POST /api/reports** — `requirePermission('article.report')` | user (cookie) | per-user 10/3600s | direct `reports` insert + auto-hide if threshold | none | OK; uses settings table threshold
- **GET /api/reports/weekly-reading-report** — `requirePermission('kids.parent.weekly_report.view')` | service | none | RPC `_user_is_paid`, `weekly_reading_report` | n/a | OK
- **POST /api/appeals** — `requirePermission('settings.appeals.open')` | service | per-user 10/3600s | RPC `submit_appeal` | none | OK

### Messages + Conversations

- **POST /api/messages** — `requirePermission('messages.dm.compose')` | service | none here; RPC enforces rate cap with `[CODE]` prefix | RPC `post_message` | none | OK; 429 mapping
- **GET /api/messages/search** — `requirePermission('messages.search')` | service | none | direct `users` join | n/a | OK
- **POST /api/conversations** — `requirePermission('messages.dm.compose')` | service | per-user 10/60s | RPC `start_conversation` | none | OK; `[CODE]` mapping for 4xx

### Expert + Expert Sessions

- **POST /api/expert/apply** — `requirePermission('expert.application.apply')` | service | per-user 5/3600s | RPC `submit_expert_application` | none | OK
- **POST /api/expert/ask** — `requirePermission('expert.ask')` | service | none | RPC `ask_expert` | none | Concern: no rate limit on write
- **GET/POST /api/expert/back-channel** — `requirePermission('expert.back_channel.read' / 'expert.back_channel.post')` | service | none | RPC `post_back_channel_message` | none | Concern: no rate limit on POST
- **POST /api/expert/answers/[id]/approve** — `requirePermission('admin.expert.answers.approve')` | service | none | RPC `approve_expert_answer` | none | Concern: admin mutation w/o `record_admin_action` and w/o rate limit
- **GET /api/expert/queue** — `requirePermission('expert.queue.view')` | service | none | tables `expert_application_categories`, `expert_queue_items` | n/a | OK
- **POST /api/expert/queue/[id]/answer** — `requirePermission('expert.answer.submit')` | service | none | RPC `post_expert_answer` | none | Concern: no rate limit
- **POST /api/expert/queue/[id]/claim** — `requirePermission('expert.queue.claim')` | service | none | RPC `claim_queue_item` | none | Concern: no rate limit
- **POST /api/expert/queue/[id]/decline** — `requirePermission('expert.queue.decline')` | service | none | RPC `decline_queue_item` | none | Concern: no rate limit
- **GET/POST /api/expert-sessions** — `requirePermission('kids_expert.sessions.list.view' / 'admin.expert_sessions.create')` | service | none | direct `kid_expert_sessions` insert | none | Concern: no rate limit on POST + admin mutation w/o `record_admin_action`
- **GET/POST /api/expert-sessions/[id]/questions** — `requirePermission('expert.session.questions.view' / 'kids_expert.question.ask')` | service | none | direct `kid_expert_questions` insert | none | Concern: no rate limit on POST; PII redaction for non-privileged callers
- **POST /api/expert-sessions/questions/[id]/answer** — `requirePermission('kids_expert.question.answer')` + ownership/role check | service | none | direct `kid_expert_questions` update | none | Concern: no rate limit; per-question scope ownership in code

### Family

- **GET /api/family/achievements** — `requirePermission('kids.achievements.view')` | service | n/a | tables `family_achievements`, `family_achievement_progress` | n/a | OK
- **GET /api/family/config** — `requirePermission('kids.parent.view')` | service | n/a | tables `plans`, `settings` (cached) | n/a | OK; 60s cache header
- **GET /api/family/leaderboard** — `requirePermission('family.view_leaderboard')` | service | n/a | RPC `family_members` | n/a | OK
- **GET /api/family/weekly-report** — `requirePermission('kids.parent.weekly_report.view')` | service | n/a | RPC `family_weekly_report` | n/a | OK

### Notifications + Push

- **GET/PATCH /api/notifications** — `requirePermission('notifications.inbox.view' / '.mark_read')` | service | n/a | direct table | none | PATCH caps `ids[]` at 200
- **GET/PATCH /api/notifications/preferences** — `requirePermission('notifications.prefs.view')` + per-field perm checks | service | n/a | direct upsert | none | OK; per-field `hasPermissionServer` gate
- **POST /api/push/send** — `requirePermission('admin.push.send_test')` | service | n/a | `sendPushToUser` (lib) | none | Concern: admin mutation w/o `record_admin_action`, w/o rate limit (low blast)

### Cron (all use `verifyCronAuth` + `withCronLog` + `logCronHeartbeat`; service client; auth fails closed 403; runtime nodejs; maxDuration=60)

- **GET/POST /api/cron/check-user-achievements** — RPC `check_user_achievements` w/ concurrency=10 worker pool
- **GET /api/cron/cleanup-data-exports** — Storage delete >14d
- **GET/POST /api/cron/flag-expert-reverifications** — RPC `flag_expert_reverifications_due`
- **GET/POST /api/cron/freeze-grace** — RPC `billing_freeze_expired_grace`
- **GET/POST /api/cron/pipeline-cleanup** — 4 sweeps: orphan runs, items, locks, cluster expiry; uses `archive_cluster` RPC
- **GET/POST /api/cron/process-data-exports** — `claim_next_export_request` + `export_user_data` + Storage upload + sign + `create_notification`; with state-machine guard so completed rows aren't reset
- **GET/POST /api/cron/process-deletions** — `sweep_expired_deletions` + per-user `auth.admin.deleteUser`
- **GET /api/cron/rate-limit-cleanup** — RPC `cleanup_rate_limit_events` (7-day retention)
- **GET/POST /api/cron/recompute-family-achievements** — RPC `recompute_family_achievements`
- **GET/POST /api/cron/send-emails** — batches up to 50; honors `alert_preferences.channel_email` + quiet hours; renderTemplate + sendEmail; `absoluteUrl` blocks dangerous schemes
- **GET/POST /api/cron/send-push** — `claim_push_batch` (FOR UPDATE SKIP LOCKED), batched 200/concurrency 20; APNs prod+sandbox split; `invalidate_user_push_token`; per-tier breaking-news daily cap
- **GET/POST /api/cron/sweep-kid-trials** — RPC `sweep_kid_trial_expiries`

### Ads

- **GET /api/ads/serve?placement=...** — anon | user (cookie for auth.uid) + service | none | RPC `serve_ad` | n/a | OK; serve-time URL safety post-process
- **POST /api/ads/click** — anon | service | per-IP 120/60s | RPC `log_ad_click` | none | OK
- **POST /api/ads/impression** — anon | service | per-IP 300/60s | RPC `log_ad_impression` | none | OK

### Telemetry sinks

- **POST /api/csp-report** — anon | n/a | none | logs to console only | n/a | OK
- **POST /api/errors** — anon | service | per-IP 60/60s | direct `error_logs` insert; truncates IPv4 | n/a | OK
- **POST /api/events/batch** — anon | user + service | per-IP 60/60s | direct `events` upsert | n/a | OK; up to 50 events/batch, payload 4KB cap, hashed UA+IP
- **GET /api/health** — anon (detailed view via constant-time `x-health-token` compare) | service | none | trivial `settings` read | n/a | OK

### iOS

- **POST /api/ios/appstore/notifications** — Apple JWS sig | service | none here; idempotent via webhook_log | `verifyNotificationJWS`, `resolvePlanByAppleProductId`, `billing_change_plan`/`resubscribe`/`freeze_profile`, `subscriptions` upsert | inline (webhook_log) | OK; appAccountToken match
- **POST /api/ios/subscriptions/sync** — bearer + Apple JWS | user + service | per-IP 20/60s | `verifyTransactionJWS`, `resolvePlanByAppleProductId`, billing RPCs, `subscriptions` upsert | inline | OK; appAccountToken match (defense layer 1+2)

### Newsroom (F7)

- **POST /api/newsroom/ingest/run** — `requirePermission('admin.pipeline.run_ingest')` | user + service | per-user 5/600s | RSS parser, `discovery_items` upsert, clusters via `preCluster`, `findBestMatch` | `recordAdminAction` | OK; 60s kill-switch cache; 6h cluster window; race-dedup count

### Misc / Public reads

- **POST /api/promo/redeem** — `requirePermission('billing.promo.redeem')` | service | per-user 10/60s | tables `promo_codes`, `promo_uses`, `plans`, `users`; RPCs `billing_change_plan`/`billing_resubscribe`; `audit_log` insert | inline `audit_log` | OK; escapes `%`/`_` in ilike; rolls back counter on failure
- **POST /api/quiz/start** — `requirePermission('quiz.attempt.start')` | service | none | RPC `start_quiz_attempt` | none | Concern: no rate limit
- **POST /api/quiz/submit** — `requirePermission('quiz.attempt.submit')` | service | per-user 30/60s | quiz count validate + RPC `submit_quiz_attempt` + `scoreQuizSubmit` + `checkAchievements` | none | OK
- **GET /api/recap** + **GET /[id]** + **POST /[id]/submit** — `requirePermission('recap.list.view')` | service | none | tables `weekly_recap_quizzes`, `weekly_recap_questions`; RPC `submit_recap_attempt` | none | Concern: no rate limit on submit
- **GET /api/search** — anon (basic) / `hasPermissionServer('search.advanced')` (advanced) | service | none | tables `articles`, `sources`; FTS `search_tsv` | n/a | OK; per-filter perm gates; sanitizes ilike chars
- **GET /api/settings/password-policy** — anon | service | none | settings table | n/a | OK; 5-min cache
- **POST /api/stories/read** — `requirePermission('article.read.log', supabase)` (bearer or cookie) | mixed | none | `reading_log` insert/update; `incrementField`; `scoreReadingComplete`; `checkAchievements` | none | Concern: no rate limit on write
- **POST /api/supervisor/opt-in** + **/opt-out** — `requirePermission('supervisor.opt_in' / '.opt_out')` | service | none | RPC `supervisor_opt_in/out` | none | Concern: no rate limit
- **GET/POST /api/support** + **POST /[id]/messages** — `requireAuth` (cookie or bearer) | user | none | RPC `create_support_ticket`; direct `ticket_messages` insert | none | Concern: no rate limit on creates; /api/support/public IS rate-limited
- **POST /api/support/public** — anon | service + user (for auth.getUser) | per-IP 5/3600s | direct `support_tickets` + `ticket_messages` inserts; rolls back header if body fails | none | OK
- **POST /api/users/[id]/block** + **DELETE** — `requirePermission('settings.privacy.blocked_users.manage')` + verified email | service | per-user 30/60s | direct `blocked_users` insert/delete | none | OK; idempotent
- **GET /api/users/blocked** — `requireAuth` | service | per-user 60/60s | direct `blocked_users` join `users` | n/a | OK
- **POST /api/access-request** — anon | n/a | none | always returns 410 Gone | n/a | Retired endpoint
- **POST /api/ai/generate** — `requirePermission('admin.ai.generate')` | user (cookie) | none | direct `articles` update; OpenAI SDK | inline `pipeline_runs` | Concern: no rate limit; **note: SUPERSEDED** by F7 `/api/admin/pipeline/generate` (1877 lines); appears to be legacy

### Admin (canonical pattern: `requirePermission` → `createServiceClient` → `checkRateLimit` → body parse → RPC/direct write → `recordAdminAction` → response; `requireAdminOutranks` on user-targeted mutations)

All admin routes follow this pattern. Listing the route + `permission key | rate-limit policy/max/win | audit action | rank-guarded?`:

#### admin/users

- DELETE `/admin/users/[id]` — `admin.users.delete_account` | 10/60s | `user.delete` | yes
- POST `/admin/users/[id]/ban` — `admin.users.ban` | 10/60s | `user.ban`/`user.unban` | yes; bumps perms_version
- POST `/admin/users/[id]/permissions` — `admin.permissions.scope_override` | 30/60s | `user_permissions.{action}` | yes; bumps perms_version
- PATCH `/admin/users/[id]/plan` — `admin.billing.override_plan` | 30/60s | `plan.set` | yes; bumps perms_version
- PATCH `/admin/users/[id]/role-set` — `admin.moderation.role.grant` + `caller_can_assign_role` RPC | 30/60s | `role.set` | yes; bumps perms_version
- POST/DELETE `/admin/users/[id]/roles` — `admin.moderation.role.{grant,revoke}` + `caller_can_assign_role` | 30/60s | `user_role.grant`/`.revoke` | yes; bumps perms_version
- DELETE `/admin/users/[id]/sessions/[sessionId]` — `admin.users.devices.unlink` | 30/60s | `user.session.unlink` | yes
- POST `/admin/users/[id]/data-export` — `admin.users.export_data` | 30/60s | `user.data_export.queue` | yes (extra-defensive)
- POST `/admin/users/[id]/mark-quiz` — `admin.users.mark_quiz` | 30/60s | `user.mark_quiz` | yes
- POST `/admin/users/[id]/mark-read` — `admin.users.mark_read` | 30/60s | `user.mark_read` | yes
- POST `/admin/users/[id]/achievements` — `admin.users.award_achievement` | 30/60s | `user.achievement.award` | yes

#### admin/articles + admin/newsroom

- GET/PATCH/DELETE `/admin/articles/[id]` — `admin.articles.detail.view`/`edit.any`/`publish`/`unpublish`/`delete` | 30/60s | `article.{edit,publish,unpublish,delete}` | yes (rank-checked vs author)
- POST `/admin/articles/save` — `admin.articles.create`/`edit.any` | 30/60s | `article.{save,create}` | yes (rank-checked vs author)
- POST `/admin/newsroom/clusters/[id]/archive` — `admin.pipeline.clusters.manage` | shared `admin_cluster_mutate` 60/60s | `cluster.archive` (skipped if already archived) | n/a (cluster, not user)
- POST/DELETE `/admin/newsroom/clusters/[id]/dismiss` — `admin.pipeline.clusters.manage` | 60/60s | `cluster.dismiss`/`undismiss` | n/a
- POST `/admin/newsroom/clusters/[id]/merge` — `admin.pipeline.clusters.manage` | 60/60s | `cluster.merge` | n/a; cross-audience guard
- POST `/admin/newsroom/clusters/[id]/move-item` — `admin.pipeline.clusters.manage` | 60/60s | `cluster.move` | n/a; audience match
- POST `/admin/newsroom/clusters/[id]/split` — `admin.pipeline.clusters.manage` | 60/60s | `cluster.split` | n/a
- POST `/admin/newsroom/clusters/[id]/unlock` — `admin.pipeline.release_cluster_lock` | `newsroom_cluster_unlock` 10/60s | `newsroom.cluster.unlock` | n/a
- POST `/admin/newsroom/clusters/articles` — `admin.pipeline.clusters.manage` | `admin_cluster_read` 120/60s | none (read) | n/a
- POST `/admin/newsroom/clusters/sources` — `admin.pipeline.clusters.manage` | 120/60s | none (read) | n/a

#### admin/pipeline

- GET/POST `/admin/pipeline/cleanup` — `admin.pipeline.clusters.manage` | `admin_pipeline_cleanup` 6/3600s | `pipeline_cleanup.manual_run` | n/a
- POST `/admin/pipeline/generate` — 1877-line F7 anchor; `admin.pipeline.run_generate` | DB `newsroom_generate` 20/3600s | various | kill-switch + cluster lock
- POST `/admin/pipeline/runs/[id]/cancel` — `admin.pipeline.runs.cancel` | 30/60s | `pipeline_cancel` | n/a
- POST `/admin/pipeline/runs/[id]/retry` — `admin.pipeline.runs.retry` | 10/60s | `pipeline_retry` | n/a; forwards to `/api/admin/pipeline/generate`
- GET `/admin/pipeline/runs/[id]` — `admin.pipeline.runs.detail` | n/a (read) | none | n/a

#### admin/billing + admin/subscriptions

- POST `/admin/billing/audit` — `requireAuth` + at-least-one billing-write perm | 60/60s | passthrough | none (helper for the dashboard); arguably misuse but justified inline
- POST `/admin/billing/cancel` — `admin.billing.cancel` | 10/60s | `billing.cancel` | yes (vs target user)
- POST `/admin/billing/freeze` — `admin.billing.freeze` | 10/60s | `billing.freeze` | yes
- POST `/admin/billing/refund-decision` — `admin.billing.refund` | 10/60s | `billing.refund_decision_db_only` | n/a (invoice-scoped)
- POST `/admin/billing/sweep-grace` — `admin.billing.sweep_grace` | 10/60s | none | n/a
- POST `/admin/subscriptions/[id]/extend-grace` — `admin.billing.override_plan` | 10/60s | `subscription.extend_grace` | yes
- POST `/admin/subscriptions/[id]/manual-sync` — `admin.billing.override_plan` | 10/60s | `billing:manual_{action}_db_only` | yes; bumps perms_version

#### admin/moderation + admin/expert/applications + admin/data-requests + admin/appeals + admin/email-templates + admin/words

- POST `/admin/moderation/comments/[id]/hide` — `admin.moderation.comment.remove` | 30/60s | `moderation.comment.hide` | n/a (comment-scoped)
- POST `/admin/moderation/comments/[id]/unhide` — `admin.moderation.comment.approve` | 30/60s | none | n/a; **CONCERN: missing audit on admin mutation**
- GET `/admin/moderation/reports` — `admin.moderation.reports.bulk_resolve` | none | n/a (read) | n/a
- POST `/admin/moderation/reports/[id]/resolve` — `admin.moderation.reports.bulk_resolve` | 30/60s | `moderation.report.resolve` | n/a
- POST `/admin/moderation/users/[id]/penalty` — `admin.moderation.penalty.warn` | 10/60s | `moderation.penalty` | yes
- GET `/admin/expert/applications` — `admin.expert.applications.view` | none | n/a | n/a
- POST `/admin/expert/applications/[id]/approve` — `admin.expert.applications.approve` | 30/60s | none | n/a; **CONCERN: missing audit**
- POST `/admin/expert/applications/[id]/reject` — `admin.expert.applications.reject` | 30/60s | none | n/a; **CONCERN: missing audit**
- POST `/admin/expert/applications/[id]/clear-background` — `admin.expert.applications.clear_background` | 30/60s | `expert.background_check.cleared` | n/a
- POST `/admin/expert/applications/[id]/mark-probation-complete` — `admin.expert.applications.mark_probation_complete` | 30/60s | `expert.probation.complete` | n/a
- GET `/admin/data-requests` — `admin.users.data_requests.view` | none | n/a | n/a
- POST `/admin/data-requests/[id]/approve` — `admin.users.data_requests.process` | 30/60s | `data_request.approve` | n/a
- POST `/admin/data-requests/[id]/reject` — `admin.users.data_requests.process` | 30/60s | `data_request.reject` | n/a; HTML-escapes notes
- POST `/admin/appeals/[id]/resolve` — `admin.moderation.appeal.approve` | 30/60s | `moderation.appeal.resolve` | n/a
- PATCH `/admin/email-templates/[id]` — `admin.email_templates.edit` | 30/60s | `email_template.{edit,toggle}` | n/a
- POST/DELETE `/admin/words` — `admin.{reserved_usernames,blocked_words}.manage` | 30/60s/10/60s | `{reserved_username,banned_word}.{add,delete}` | n/a

#### admin/permissions + admin/permission-sets + admin/plans

- POST `/admin/permissions` — `admin.permissions.set.edit` | 30/60s | `permission.create` | n/a
- PATCH/DELETE `/admin/permissions/[id]` — `admin.permissions.set.edit` | 30/60s & 10/60s | `permission.{update,delete}` | n/a
- POST/DELETE `/admin/permissions/user-grants` — `admin.permissions.assign_to_user` | 30/60s | `user_grant.{add,revoke}` | yes; bumps perms_version
- POST `/admin/permission-sets` — `admin.permissions.set.edit` | 30/60s | `permission_set.create` | n/a
- PATCH/DELETE `/admin/permission-sets/[id]` — `admin.permissions.set.edit` | 30/60s & 10/60s | `permission_set.{update,delete}` | n/a; refuses delete on `is_system`
- POST/DELETE `/admin/permission-sets/members` — `admin.permissions.set.edit` | 30/60s | `permission_set.{add_member,remove_member}` | n/a
- POST `/admin/permission-sets/plan-wiring` — `admin.permissions.assign_to_plan` | 30/60s | `permission_set.plan.{grant,revoke}` | n/a
- POST `/admin/permission-sets/role-wiring` — `admin.permissions.assign_to_role` | 30/60s | `permission_set.role.{grant,revoke}` | n/a
- PATCH `/admin/plans/[id]` — `admin.plans.edit` | 30/60s | `plan.update` | n/a

#### admin/recap + admin/categories + admin/sponsors + admin/ad-* + admin/feeds + admin/promo + admin/features + admin/rate-limits + admin/settings + admin/notifications + admin/broadcasts + admin/prompt-presets

- GET/POST `/admin/recap` — `admin.recap.{edit,create}` | 30/60s | none | **CONCERN: missing audit on POST**
- GET/PATCH/DELETE `/admin/recap/[id]` — `admin.recap.{edit,delete}` | 30/60s & 10/60s | none | **CONCERN: missing audit**
- POST `/admin/recap/[id]/questions` — `admin.recap.questions_manage` | 30/60s | none | **CONCERN: missing audit**
- PATCH/DELETE `/admin/recap/questions/[id]` — `admin.recap.questions_manage` | 30/60s & 10/60s | none | **CONCERN: missing audit**
- POST/PATCH/DELETE `/admin/categories[/...]` — `admin.pipeline.categories.manage` | `admin_categories_mutate` 30/60s | `category.{create,subcategory.create,update,archive,restore}` | n/a; depth/cycle guards
- GET/POST/PATCH/DELETE `/admin/sponsors[/...]` — `admin.ads.sponsors.manage` | 30/60s & 10/60s | none | **CONCERN: missing audit on all sponsor mutations**
- POST/PATCH/DELETE `/admin/ad-campaigns[/...]` — `admin.ads.campaigns.{create,edit,delete}` | 30/60s & 10/60s | none | **CONCERN: missing audit**
- POST/PATCH/DELETE `/admin/ad-placements[/...]` — `admin.ads.placements.{create,edit,delete}` | 30/60s & 10/60s | none | **CONCERN: missing audit**
- POST/PATCH/DELETE `/admin/ad-units[/...]` — `admin.ads.units.{create,edit,delete}` | 30/60s & 10/60s | none | **CONCERN: missing audit; URL safety check on creative_url+click_url**
- POST/PATCH/DELETE `/admin/feeds[/...]` — `admin.feeds.manage` | 30/60s & 10/60s | `feed.{create,toggle,repull,delete}` | n/a; url private-IP block
- POST/PATCH/DELETE `/admin/promo[/...]` — `admin.promo.{create,edit,revoke}` | 30/60s & 10/60s | `promo.{create,toggle,delete}` | n/a
- POST/PATCH/DELETE `/admin/features[/...]` — `admin.features.{create,toggle_enabled,killswitch,delete}` | 30/60s & 10/60s | `feature.{create,toggle,killswitch,edit,delete}` | n/a
- POST `/admin/rate-limits` — `admin.rate_limits.configure` | 30/60s | `rate_limit.{create,update}` | n/a
- GET/PATCH `/admin/settings` — `admin.settings.edit` | 30/60s | `setting.update` | n/a; type-checks value
- POST `/admin/settings/upsert` — `admin.settings.edit` | 30/60s | `setting.{update,create}` | n/a
- POST `/admin/settings/invalidate` — `admin.settings.invalidate` | 30/60s | none | n/a; clears in-process cache
- POST `/admin/notifications/broadcast` — `admin.settings.edit` (TODO: should be dedicated `admin.notifications.broadcast`) | 10/60s | `notification.broadcast` | n/a
- POST `/admin/broadcasts/alert` — `admin.broadcasts.breaking.send` | 5/600s | `breaking_news.send` | n/a; `send_breaking_news` RPC
- POST `/admin/broadcasts/breaking` — `admin.broadcasts.breaking.send` | 10/60s | none | **CONCERN: missing audit; duplicate of /broadcasts/alert?**
- GET/POST `/admin/prompt-presets` + PATCH/DELETE `/[id]` — `admin.pipeline.presets.manage` | `admin_presets_mutate` 30/60s | `ai_prompt_preset.{create,update,archive}` | n/a

## Routes deviating from canonical pattern (flagged)

1. **`/api/admin/notifications/broadcast`** — Uses `admin.settings.edit` instead of dedicated permission key. Self-noted TODO in route.
2. **`/api/expert/answers/[id]/approve`** — Admin mutation (toggles probation→visible) without `record_admin_action` and without rate limit.
3. **`/api/admin/expert/applications/[id]/approve` and `/reject`** — Both call RPCs (`approve_expert_application`/`reject_expert_application`) without `recordAdminAction` audit. The `clear-background` and `mark-probation-complete` siblings DO audit.
4. **`/api/admin/moderation/comments/[id]/unhide`** — No `recordAdminAction` (the sibling `/hide` does audit).
5. **`/api/admin/recap` (POST), `/admin/recap/[id]` (PATCH+DELETE), `/admin/recap/[id]/questions` (POST), `/admin/recap/questions/[id]` (PATCH+DELETE)** — Recap admin mutations consistently miss `recordAdminAction`.
6. **`/api/admin/sponsors`, `/admin/ad-campaigns`, `/admin/ad-placements`, `/admin/ad-units`** (all CRUD) — None call `recordAdminAction`. (Sponsors/ad inventory edits are highly material; absence is meaningful.)
7. **`/api/admin/broadcasts/breaking`** — POST has no audit. (Duplicate-looking with the newer `/broadcasts/alert` which DOES audit.)
8. **`/api/push/send`** — Admin "test" send without rate limit and without audit. Low blast radius (single user). Worth tagging.
9. **`/api/admin/billing/audit`** — Inverts the pattern: it's a PASSTHROUGH for `record_admin_action` calls from the admin dashboard (legacy client-side `audit_log` insert was revoked from `authenticated`). Permission gate is "any of 4 billing-write perms hold", which is a reasonable composite. Documented in route comments.
10. **`/api/ai/generate`** — Older AI path (uses cookie-scoped client, 250-line, OpenAI direct). Likely SUPERSEDED by F7 `/api/admin/pipeline/generate`. Lacks rate limit. Marked as legacy.
11. **`/api/auth/callback`** — Inline writes to `audit_log` instead of via `recordAdminAction` (which is admin-scoped helper). Acceptable: callback path is auth bootstrap, no admin actor.
12. **Self-action audit** — `/api/billing/cancel`, `/billing/change-plan`, `/billing/resubscribe`, `/api/auth/email-change`, `/api/auth/login`, `/api/auth/signup`, `/api/auth/signup-rollback`, `/api/promo/redeem` all use direct `audit_log` insert with `actor_id = user.id`. This is intentional — `recordAdminAction` is for admin-on-target writes via SECURITY DEFINER `record_admin_action` RPC; self-actions correctly avoid it.

## Routes leaking error.message (flagged)

The 2026-04-25 commit `29f7a22` ("fix(api): stop leaking raw error.message to clients") was a sweeping fix. Surface review of all 200 files shows:

- **Pattern is correct** in 195+ routes — `safeErrorResponse` (lib/apiErrors) or `permissionError` (lib/adminMutation) is used; raw `error.message` only appears in `console.error` server-side logs.
- **Internal-routing reads of `error.message` (NOT leaked to client)** in:
  - `/api/messages/route.js`, `/api/conversations/route.js` — read `[CODE]` prefix from RPC error message to map to status code; client gets safe canned `userMsg`. Acceptable.
  - `/api/comments/route.js` — reads error code/message to map RPC failure modes (quiz/duplicate/parent-not-found) to actionable copy. Acceptable.
  - `/api/kids/pair/route.js` — error mapping for "invalid code"/"already used"/"expired" — internal substring match; client gets canned response. Acceptable.
- **Possible residual concerns** (worth Wave 2 verification):
  - `/api/auth/email-change/route.js` — generic "Could not initiate email change. Please try again." used; OK.
  - `/api/admin/pipeline/runs/[id]/cancel/route.ts` and `/retry/route.ts` — surface RPC error via `captureWithRedact` server-side; generic responses to client. OK.
  - `/api/admin/categories/[id]/route.ts` — uses `console.error` plus generic 500 messages. OK.
  - `/api/admin/notifications/broadcast/route.ts` — generic "Could not send notifications". OK.

No clear regression of the fix found. Worth reverifying after Wave 2 file-by-file lint pass: the `safeErrorResponse` helper presumably scrubs error.message; if it ever passes-through, every route using it inherits the leak.

## Routes missing Retry-After on 429

All grep'd 429 responses include `Retry-After` header. Specifically:

- All admin/admin/admin routes set `'Retry-After': String(rate.windowSec ?? 60)` or a hardcoded match.
- `/api/auth/login` (`'900'`), `/auth/signup` (`'3600'`), `/auth/check-email` (`'3600'`/`'86400'`), `/auth/check-username` (`'60'`), `/auth/email-change` (`'3600'`), `/auth/login-failed` and `/login-precheck` (constant 200, no 429 leaked), `/auth/resolve-username` (`'60'`), `/auth/reset-password` (silent 200), `/auth/verify-password` (`String(hit.windowSec ?? 3600)`).
- `/api/account/data-export` (`String(rate.windowSec ?? 86400)`), `/account/delete` (`'3600'`).
- `/api/comments` (`String(rate.windowSec ?? 60)`).
- `/api/kids/*` all set Retry-After.
- `/api/billing/*`, `/stripe/checkout` (`'3600'`), `/stripe/portal` (`'3600'`).
- `/api/promo/redeem` (`String(rate.windowSec ?? 60)`).
- `/api/cron/*` — no 429 paths (cron auth is 403 fail-closed).
- `/api/users/[id]/block` and `/users/blocked`, `/api/notifications`, `/notifications/preferences` — fine.
- `/api/messages` and `/conversations` — `headers = status === 429 ? { 'Retry-After': '60' } : undefined`. OK.
- `/api/quiz/submit` (`'60'`).

**No findings** — every 429 path includes `Retry-After`.

## Admin mutations missing require_outranks or record_admin_action

### Missing `requireAdminOutranks` (against a USER target — should have it):

- `/api/admin/expert/answers/[id]/approve` — flips a user's expert answer status; no rank guard. (Probably acceptable since the comment author isn't necessarily an admin, but the action is admin-targeted at a user-content row — review.)
- `/api/admin/expert/applications/[id]/{approve,reject,clear-background,mark-probation-complete}` — none guard against the application's user_id outranking the actor. Application content carries `user_id`, so an editor approving a journalist who outranks them is technically possible (low likelihood given role hierarchy semantics).

### Missing `record_admin_action`:

(See "Routes deviating" §2-7 above.) Highest material gaps:

1. **All ad-domain admin CRUD** (`sponsors`, `ad-campaigns`, `ad-placements`, `ad-units`) — no audit on mutations. Material because ad inventory directly affects revenue + user-facing creative content.
2. **All recap admin CRUD** — no audit. Less material but still admin actions.
3. `/api/admin/expert/applications/[id]/approve` and `/reject` — no audit on identity-sensitive expert-vetting decisions.
4. `/api/admin/moderation/comments/[id]/unhide` — no audit on moderation reversal.
5. `/api/admin/broadcasts/breaking` — no audit on platform-wide broadcasts (sibling `/alert` does audit).
6. `/api/push/send` — no audit on admin one-off push.

## Duplicate-looking endpoints

1. **`/api/comments/[id]/report` vs `/api/reports`** — Both target reports. The /comments route is the comment-context entry; /api/reports is the generic any-target entry (`target_type: 'comment'|'article'|...`). The /reports route auto-hides at threshold; /comments/[id]/report does NOT. Worth consolidating or documenting the split.
2. **`/api/admin/broadcasts/breaking` vs `/api/admin/broadcasts/alert`** — Both POST. `/breaking` calls `send_breaking_news` RPC by `article_id` and is audit-less. `/alert` creates the article AND fans out. The newer `/alert` route is the unified path; `/breaking` looks like it's the legacy fallback (per its comment: "T-012 server route for sending a breaking-news alert end-to-end. Replaces the direct supabase.from('articles').insert(...)..."). The retry-friendly comment in `/alert` mentions "/api/admin/broadcasts/breaking endpoint with article_id". These are two surfaces of the same intent.
3. **`/api/admin/articles/[id]` PATCH vs `/api/admin/articles/save`** — `/[id]` is the new unified F7 endpoint; `/save` is the legacy cascade-save used by older story-manager pages. Both still alive; the `/save` route documents that intent.
4. **`/api/account/delete` POST (immediate=true) vs the 30-day path** — Same route; intentional branching for Apple-accepted "delete now" path.
5. **`/api/account/login-cancel-deletion` is structurally redundant** with the `/api/auth/login` path's inline `cancel_account_deletion` call. Documented inline: this route exists "primarily for iOS" since iOS bypasses `/api/auth/login` and authenticates directly via Supabase SDK.

## Possibly-orphan endpoints (no obvious caller)

(Cross-ref against pages will be Wave 2; flagged for review:)

1. **`/api/access-request`** — confirmed retired (returns 410). Safe to drop the file in a follow-up if the access-request product is permanently dead.
2. **`/api/ai/generate`** — superseded by F7 `/api/admin/pipeline/generate`. Likely no UI caller anymore. Verify before removal.
3. **`/api/admin/broadcasts/breaking`** — likely supplanted by `/admin/broadcasts/alert`. Verify in /admin/broadcasts UI.
4. **`/api/admin/billing/audit`** — UI-only passthrough for `audit_log` from /admin/subscriptions. Verify caller.
5. **`/api/auth/signup-rollback`** — designed for iOS post-auth-fail cleanup. Check VerityPost iOS client to confirm caller; `/api/auth/signup` route's own rollback path may obviate it.
6. **`/api/account/login-cancel-deletion`** — iOS-only call site (AuthViewModel); web logs in via `/api/auth/login` which inlines the same RPC. Keep.
7. **`/api/promo/redeem`** — used by /pricing & /redeem promo flows; verify both surfaces still call it.
8. **`/api/family/config`** — iOS FamilyDashboardView caller; web likely inlines defaults. Keep.
9. **`/api/ios/appstore/notifications`** — Apple S2S endpoint; configured in App Store Connect, no app/web caller. Keep.

## Notable claims worth verifying in later waves

1. **Admin audit gaps (sponsors, ad-units, recap, broadcasts/breaking, expert app approve/reject, moderation/comments/unhide, push/send, expert/answers approve)** — these material admin mutations leave no audit trail. CLAUDE.md mandates `record_admin_action` on all admin-on-target mutations.

2. **Per-user write rate-limit gaps**: `/api/comments/[id]/{report,flag,context-tag,vote,route(PATCH/DELETE)}`, `/api/expert/{ask,back-channel(POST)}`, `/api/expert/queue/[id]/{answer,claim,decline}`, `/api/expert-sessions[/...] (POST)`, `/api/expert-sessions/questions/[id]/answer`, `/api/expert/answers/[id]/approve`, `/api/quiz/start`, `/api/recap/[id]/submit`, `/api/stories/read`, `/api/supervisor/opt-in`, `/api/supervisor/opt-out`, `/api/support` (POST + GET), `/api/support/[id]/messages`, `/api/kids` (POST), `/api/kids/[id]` (PATCH/DELETE), `/api/kids/[id]/streak-freeze`, `/api/kids/set-pin`, `/api/kids/trial` (POST), `/api/bookmarks/[id]` (PATCH/DELETE), `/api/bookmark-collections/[id]` (PATCH/DELETE), `/api/follows` (has rate limit, mention as exception). CLAUDE.md mandates `checkRateLimit` on every mutation. Many of these are protected by the underlying RPC's own per-row constraint logic, but the route-boundary cap is missing.

3. **`/api/admin/notifications/broadcast` permission key** — Self-noted TODO: should be `admin.notifications.broadcast`, currently `admin.settings.edit`. Wave 2 should verify the permissions matrix (xlsx + Supabase) does not yet contain `admin.notifications.broadcast`, and either land the new key + swap, or document the deferred work.

4. **The `requireAdminOutranks` helper for cluster/article/cluster-member admin actions** — current behavior is to check rank against the article's `author_id` (good) but not against authors of children (sources/timeline/quizzes inserts). For cluster mutations, no user-target exists. Verified consistent.

5. **Stripe `client_reference_id` defense** — claims to UUID-validate AND match against existing `stripe_customer_id → user_id` mapping. Verified in `handleCheckoutCompleted` (lines 332-391). Solid.

6. **Apple `appAccountToken` defense layers** — both at sync (defense layer 1+2) and at S2S notification (B3 hardening). Verified.

7. **`/api/admin/articles/save` uses `@ts-expect-error` 4 times** — ts-expect-error to bypass narrow Insert/Update union types. Documented inline. Wave 2: verify the Database type generation captures the audience-conditional shape.

8. **`/api/admin/pipeline/generate`** — 1877 lines; only the header was deeply read in this audit. Wave 2 should walk the 12-step chain in detail (kill-switch caching, cluster lock release in finally{}, cost cap, retry exhaustion paths). Per the route header it implements the canonical pattern.

9. **`/api/cron/process-data-exports`** — has a careful state machine guarding completed → reset on partial failure. Verify the `data_requests` SQL respects the `status='processing'` guard on the WHERE clause.

10. **`webhook_log` reuse across Stripe + Apple notifications + Apple sync** — the same idempotency table holds 3 source types differentiated by `source` column. Wave 2: verify the unique constraint is on `event_id` only (not `(source, event_id)`); the `apple_notif:<uuid>` / `apple_sync:<originalTxId>` / `<stripe_event_id>` namespacing avoids collisions but the unique key shape matters.

11. **Cron heartbeat visibility** — every cron route uses `logCronHeartbeat`. Wave 2: verify there's an admin surface that reads this and a runbook for what "stale heartbeat" means.

12. **Settings cache invalidation** — `clearSettingsCache()` is called only from `/api/admin/settings/invalidate`. The kill-switch cache in `pipeline/generate` and `newsroom/ingest/run` is a separate 60s in-memory cache. Wave 2: verify there's a separate way to flush the kill-switch cache, or accept the 60s lag.

13. **`/api/auth/callback` permissive `users` upsert** — uses service client to write `email_verified=true` and `email_verified_at`. Comment notes the gated-column bypass. Wave 2: verify `update_own_profile` allowlist matches what cookie-client routes are allowed to write, vs what only service-role should write.

14. **`/api/quiz/submit` rate limit (30/60s)** — comment notes "stop a scripted attempt to brute-force quiz answers". Combined with the per-attempt guard in the RPC, defensive enough.

15. **`/api/auth/check-username` RLS on `reserved_usernames`/`users.username`** — the route uses service client and rate limits. Wave 2: verify direct PostgREST access to either table is gated (since the iOS path was open before #18 fix per route comment).

16. **`/api/admin/articles/save` skips outranks check on CREATE path** — outranks only checks on UPDATE (via the loaded `prior.author_id`). On CREATE, `author_id` is set to `actor.id`, so skipping is correct — but worth a comment in code.

17. **`/api/promo/redeem` two-stage redemption** — partial-discount returns intent without consuming the slot (Q15). Wave 2: verify the checkout/webhook path correctly inserts the `promo_uses` row when the actual purchase completes.

18. **`/api/users/[id]/block` requires `email_verified`** — explicit gate. Documented inline; matches Apple Guideline 1.2.

19. **Push `claim_push_batch` race semantics** — claims via FOR UPDATE SKIP LOCKED with 5-min stuck-claim reclaim. This is the new (L19) atomic claim. Wave 2: verify the RPC actually exists in /schema and that no orphan rows accumulate.

20. **`/api/csp-report`** — currently logs to console.warn only, no DB write. Wave 2: confirm there's no expectation to have a queryable history of CSP violations; if so, add a small write.
