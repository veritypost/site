# Zone Z12: web/src/lib + middleware + types + configs

## Summary

The `web/src/lib` machinery is the brains of the Verity Post web app. Permission gating goes through `requirePermission` (auth.js) → `compute_effective_perms` RPC. RLS-bypassing mutations use `createServiceClient` (supabase/server.ts); user-scoped reads use `createClient`; iOS bearer tokens go through `createClientFromToken` with strict JWT shape validation. Rate limiting is DB-RPC-backed (`check_rate_limit`) with fail-closed prod / opt-in fail-open dev. Feature flags live in `feature_flags` table cached 10s. Roles + plans + score-tiers + settings + plan_features all loaded from DB with 60s in-process caches. Middleware is the surface gate: protected-prefix list → `/login?next=`, `/kids/*` 302 → `/profile/kids` (authed) or `/kids-app` (anon), legacy `/admin/{pipeline,ingest}` 301 → `/admin/newsroom`, coming-soon mode redirects everything to `/welcome` with `vp_preview` cookie bypass, CSP+CORS+request-id+nonce, two CSP headers (enforce + strict report-only). The F7 pipeline (`lib/pipeline/*`) ports verbatim prompts + scrape/cluster/match/clean from a snapshot, with new TypeScript wrappers for call-model (anthropic+openai), cost-tracker (DB-cap, fail-closed), persist-article (single-RPC transaction), redact (Sentry PII scrub). Editorial-guide is a 1012-line file of verbatim character-for-character LLM prompts (legitimately excluded from prettier). `database.ts` is 11,304 lines of Supabase-generated types.

## Files

### web/src/middleware.js (367 lines)
- Purpose: per-request gate. Mints request-id + CSP nonce, builds CSP + strict-report CSP, applies CORS allowlist for `/api/*`, handles `OPTIONS` preflight, redirects `/admin/{pipeline,ingest}` → `/admin/newsroom` (301), enforces coming-soon mode (`NEXT_PUBLIC_SITE_MODE=coming_soon` → all public traffic to `/welcome`, bypass cookie `vp_preview=ok` from `/preview?token=`), creates an SSR Supabase server client, calls `auth.getUser()` only on protected paths or `/kids/*`, redirects anon-on-protected to `/login?next=…` (302), redirects `/kids/*` to `/profile/kids` (authed) or `/kids-app` (anon).
- DB tables/RPCs touched: implicit `auth.users` via `supabase.auth.getUser()`.
- Callers: every request.
- Concerns: protected list hardcoded inline; CSP `https:` for `img-src` is broad; CSP allows `https://*.ingest.sentry.io` for `connect-src` even when Sentry not enabled; coming-soon allowlist contains `/admin` so admin routes still work — confirmed intentional comment.
- TODOs: comment notes prior 2026-04-20 enforce flip broke pre-rendered pages — `CSP_ENFORCE` env-gate is the manual switch.

### web/src/lib/auth.js (215 lines)
- Purpose: server-side auth + perm primitives.
- Exports: `getUser`, `requireAuth`, `requireVerifiedEmail`, `requireNotBanned`, `getUserRoles`, `hasRole`, `assertPlanFeature`, `getPlanFeatureLimit`, `requirePermission`, `hasPermissionServer`. Errors thrown carry `.status`.
- DB: `users` (joined with `plans`), `user_roles` (joined `roles`), `plan_features`, RPC `compute_effective_perms`.
- iOS bearer fallback: `resolveAuthedClient()` reads `Authorization: Bearer …` header, validates JWT shape, builds `createClientFromToken`, else falls back to cookie-scoped client.
- Concerns: `requireAuth` does not throw with `.status` per the comment in `requireVerifiedEmail` — but reading the code, `requireAuth` DOES set `err.status = 401`. The comment is stale.
- Note: `requireRole` was removed 2026-04-18 (Phase 5/Track P).
- `assertKidOwnership` moved to `./kids`.

### web/src/lib/permissions.js (225 lines, 'use client')
- Purpose: client-side perm cache with version polling.
- Exports: `invalidate`, `fetchVersion`, `refreshIfStale`, `refreshAllPermissions`, `getCapabilities(section)`, `hasPermission(key)`, `getPermission(key)`, `getCapability(key)`, `hasPermissionServer(key)` (note: name collision with `auth.js` server export — different surface), `hasPermissionFor(key, scopeType, scopeId)`, plus re-exports `SECTIONS`, `DENY_MODE`, `LOCK_REASON`.
- DB RPCs: `my_perms_version`, `compute_effective_perms`, `get_my_capabilities`, `has_permission`, `has_permission_for`.
- Dual-cache architecture (full perms + section perms). Sentinel `-1` initial version state. Hard-clear on bump = synchronous deny during refetch (security posture: deny safe, grant requires positive confirmation). Documented L2 + Ext-C3 fixes.

### web/src/lib/roles.js (90 lines)
- Purpose: canonical role-name Sets + DB-backed hierarchy fetch.
- Exports: `OWNER_ROLES`, `ADMIN_ROLES`, `EDITOR_ROLES`, `MOD_ROLES`, `EXPERT_ROLES` frozen Sets (zero-network); `getRoles(supabase)`, `getRoleNames`, `rolesUpTo`, `rolesAtLeast`, `clearRolesCache`.
- DB: `roles` table.
- Hierarchy: was JS-based, now lives only in DB (`require_outranks`, `caller_can_assign_role` RPCs).
- 60s cache TTL.

### web/src/lib/plans.js (265 lines)
- Purpose: tier catalog + DB lookups + `plan_features` limit reader.
- Exports: `TIER_ORDER`, `TIERS` (tier metadata bag), `PRICING` (cents+plan-name map), `formatCents`, `pricedPlanName`, `annualSavingsPercent`, `getPlans`, `getWebVisibleTiers`, `getPlanLimit`, `getPlanLimitValue`, `getPlanByName`, `getPlanById`, `resolveUserTier`.
- DB: `plans`, `plan_features`.
- Hardcoded constants: `TIER_ORDER`, `TIERS` (per-tier bullet lists, taglines, maxKids), `PRICING` (cents). The `TIERS` feature/missing bullet copy is hardcoded marketing copy and `PRICING` cents are hardcoded — see "Hardcoded values" section. Tracked in MASTER_TRIAGE_2026-04-23.md.
- 60s cache.

### web/src/lib/rateLimit.js (180 lines)
- Purpose: DB-RPC-backed rate limiter with policy table override.
- Exports: `getClientIp`, `getRateLimit(supabase, policyKey, fallback)`, `checkRateLimit(svc, {key, policyKey?, max, windowSec})`.
- DB: `rate_limits` table, RPC `check_rate_limit`.
- Fail-closed in prod (Vercel preview + production); fail-open only when `NODE_ENV=development` AND `RATE_LIMIT_ALLOW_FAIL_OPEN=1`.
- 60s policy cache. Returns `windowSec` in result so callers can build `Retry-After` headers.
- L8 hardening: requires explicit env opt-in for fail-open.

### web/src/lib/featureFlags.js (66 lines)
- Purpose: feature flag reader + v2 cutover guard.
- Exports: `isFlagEnabled`, `clearFlagCache`, `isV2Live`, `v2LiveGuard`.
- DB: `feature_flags` table.
- 10s in-process cache (was 30s; T-073 reduced staleness window).
- L11: real DB errors fail closed; only `data === null` falls through to caller's default. `v2LiveGuard()` returns 503 NextResponse when off.

### web/src/lib/supabase/client.ts (29 lines, 'use client')
- Purpose: browser SSR client.
- Exports: `createClient()`.
- Dev placeholder URL/key to keep `/ideas/*` working without `.env.local`.

### web/src/lib/supabase/server.ts (131 lines)
- Purpose: server-side Supabase clients.
- Exports: `createClient()` (cookie-scoped, RLS-enforced), `createClientFromToken(token)` (bearer-token, JWT-shape validated), `createClientForRequest(request)` (header-passed cookies, no writes), `createServiceClient()` (service-role key, RLS bypass), `createEphemeralClient()` (anon, no cookie writes — for failed-login probe).
- F-123 hardening: cookies always set with `sameSite=lax`, `secure` in prod, `httpOnly`, `path=/`.
- L7: JWT shape regex `^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$` rejects malformed bearers early.

### web/src/lib/permissionKeys.js (35 lines)
- Purpose: SECTIONS / DENY_MODE / LOCK_REASON constants. The `PERM` string-constant map was removed in Round 8 — call-sites pass literal keys.

### web/src/lib/adminMutation.ts (180 lines)
- Purpose: shared admin-mutation helpers + canonical 8-step mutation skeleton documented in header.
- Exports: `requireAdminOutranks(targetUserId, actorId)`, `recordAdminAction({action, targetTable, targetId, reason, oldValue, newValue})`, `permissionError(err)`.
- DB RPCs: `require_outranks`, `record_admin_action`. Cookie-scoped client used (RPCs auth.uid()-check the caller).
- AUTH_ERROR_MAP strips `:permKey` suffix from `PERMISSION_DENIED:<key>` so internal vocab never leaks.
- TODO comment: `recordAdminAction` does not pass `p_ip` / `p_user_agent` yet — last DA-119 gap.

### web/src/lib/apiErrors.js (84 lines)
- Purpose: map Postgres/PostgREST errors to safe client envelopes.
- Exports: `safeErrorResponse(NextResponse, err, options)`, `truncateIpV4(ip)`.
- PG_ERROR_MAP covers P0001 (passthrough trigger msg, sanitized + capped 240 chars), 23505/23503/23514, 22P02, 22023, 42501, 42P01, PGRST116. Logs full server payload with route tag.

### web/src/lib/apns.js (271 lines)
- Purpose: APNs HTTP/2 push delivery, no npm dep.
- Exports: `resolveApnsEnv`, `withApnsSession`, `sendApnsAlert`, `sendPushToUser(service, userId, notification, opts)`.
- Env: `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_AUTH_KEY`, `APNS_ENV`, `APNS_TOPIC` (defaults `com.veritypost.app`).
- ES256 JWT cached 50min. Maps dead-token reasons to invalidation. Per-token environment honored.
- DB: `user_push_tokens`, `push_receipts`, RPC `invalidate_user_push_token`.

### web/src/lib/appleReceipt.js (265 lines)
- Purpose: Apple StoreKit 2 JWS verification (no npm dep, vendored Apple Root CA G3).
- Exports: `verifyJWS`, `verifyTransactionJWS`, `verifyNotificationJWS`, `resolvePlanByAppleProductId`.
- Env: `APPLE_BUNDLE_ID` (defaults `com.veritypost.app`), `APPLE_ROOT_CA_DER_BASE64`.
- Anti-replay: `signedDate` freshness gates — 5min for notifications, 24h for transaction first-pair (B14 hardening).
- DB: `plans` (apple_product_id lookup).

### web/src/lib/authRedirect.js (53 lines)
- Purpose: validate `?next=` param against open-redirect tricks.
- Exports: `resolveNext(raw, fallback)`, `resolveNextForRedirect(siteUrl, raw, fallback)`.
- ASCII-only, regex-whitelisted, rejects `//`, `\\`, `/\\`, control chars, all non-ASCII (covers Unicode slash homoglyphs).

### web/src/lib/botDetect.ts (61 lines)
- Purpose: zero-dep User-Agent crawler detector.
- Exports: `isBotUserAgent(ua)`. Empty/missing UA = bot. ~95% coverage; not a security boundary.

### web/src/lib/coppaConsent.js (28 lines)
- Purpose: COPPA consent text + version + validator.
- Exports: `COPPA_CONSENT_VERSION = '2026-04-15-v1'`, `COPPA_CONSENT_TEXT`, `validateConsentPayload(consent)`.
- Hardcoded version string; bump on text change.

### web/src/lib/counters.js (59 lines)
- Purpose: thin wrapper around counter RPCs (service-role only).
- Exports: `incrementField`, `incrementViewCount`, `incrementCommentCount`, `incrementBookmarkCount`, `incrementCommentVote`, `updateFollowCounts`.
- Migrations 056/057 revoked execute on these from authenticated/anon — service client required.

### web/src/lib/cronAuth.js (46 lines)
- Purpose: cron-handler authn (Vercel-platform `x-vercel-cron: 1` OR constant-time bearer compare).
- Exports: `verifyCronAuth(request)`.
- F-079/F-080/H-21 hardening: timing-safe compare, length-gate before `crypto.timingSafeEqual`.

### web/src/lib/cronHeartbeat.js (31 lines)
- Purpose: write per-phase cron heartbeats to `webhook_log`.
- Exports: `logCronHeartbeat(name, phase, payload)`.
- Split from observability.js to keep `next/headers` out of the client bundle.

### web/src/lib/cronLog.js (88 lines)
- Purpose: wraps cron handlers with start→end webhook_log + Sentry surfacing on failure / >30s duration / 5xx.
- Exports: `withCronLog(name, handler)`.
- Skips logging for 401/403 probe responses to avoid flooding the log.
- DB: `webhook_log`. Uses `captureException` / `captureMessage` from observability.

### web/src/lib/email.js (98 lines)
- Purpose: Resend wrapper + template renderer (no npm dep).
- Exports: `renderTemplate(tpl, variables, opts)`, `sendEmail({...})`.
- HTML-escapes substitutions by default. RFC 8058 List-Unsubscribe + List-Unsubscribe-Post headers (Ext-LL2 — Gmail bulk-sender compliance).
- Env: `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_SITE_URL` (for fallback unsub URL).

### web/src/lib/events/types.ts (112 lines)
- Purpose: `TrackEvent` shape, `EventCategory` union, `KnownEventName` enum, batch request/response shapes.
- Backs the unified analytics pipeline (`/api/events/batch` + `events` table per schema/108).

### web/src/lib/kidPin.js (124 lines)
- Purpose: server-only kid PIN hash + verify with PBKDF2 + legacy SHA-256 transparent-rehash path.
- Exports: `generateSalt`, `hashPinPbkdf2`, `hashPinSha256Legacy`, `verifyPinForRow(pin, row)`, `buildPbkdf2Credential(pin)`.
- 100k iterations PBKDF2-SHA256, 16-byte salt. Constant-time comparison.
- DB: `kid_profiles.pin_hash`, `pin_salt`, `pin_hash_algo`. Migration 058 added salt columns.

### web/src/lib/kidPinValidation.js (74 lines)
- Purpose: pure (no crypto) PIN-strength check; safe to import client + server.
- Exports: `isPinWeak(pin)`, `validatePin(pin)`.
- T-025 — eliminates ~5% trivial PINs (sequences, repeats, doubled halves, mirrors, birth years 1900–2099).

### web/src/lib/kids.js (23 lines)
- Purpose: canonical kid-ownership gate.
- Exports: `assertKidOwnership(kidProfileId, {client?, userId?})`.
- DB: `kid_profiles.parent_user_id`. Throws `NOT_KID_OWNER` on mismatch.

### web/src/lib/leaderboardPeriod.ts (27 lines)
- Purpose: shared This-Week / This-Month / All-Time period model. Mirrors iOS `LeaderboardPeriod.swift`.
- Exports: `PERIOD_LABELS`, `Period` type, `periodSince(period, now)`.

### web/src/lib/mentions.js (1 line)
- `MENTION_RE = /@([a-zA-Z0-9_]{2,30})/g`.

### web/src/lib/observability.js (128 lines)
- Purpose: Sentry capture wrappers + analytics stubs.
- Exports: `captureException(err, context)`, `captureMessage(message, level, context)`, `setUser(userId, extra)`, `track`, `identify`, `resetIdentity` (no-op stubs), `initObservability()`.
- Env: `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`.
- PostHog deferred per owner directive.

### web/src/lib/password.js (91 lines)
- Purpose: shared password rules.
- Exports: `PASSWORD_MIN_LENGTH = 8`, `PASSWORD_REQS`, `PASSWORD_SPECIAL_REQ`, `validatePasswordServer`, `validatePasswordServerWithSettings`, `passwordStrength`.
- Ext-M8: DB-aware variant reads `password.*` settings rows (schema/173) with constants fallback.

### web/src/lib/rlsErrorHandler.js (69 lines, 'use client')
- Purpose: detect Postgres 42501 RLS denial, dispatch global `vp.rls_locked` event for `<LockModal>`.
- Exports: `onRlsLocked`, `isRlsDenial`, `withLockOnRls(callFn, {permission, section, scope})`.

### web/src/lib/scoreTiers.ts (74 lines)
- Purpose: DB-backed score tier reader (replaces drift between hardcoded TIER_META and `score_tiers` table).
- Exports: `ScoreTier` interface, `getScoreTiers(supabase)`, `tierFor(score, tiers)`, `nextTier`, `clearScoreTiersCache`.
- 60s cache. T-001.

### web/src/lib/scoring.js (165 lines)
- Purpose: thin wrappers over scoring RPCs.
- Exports: `scoreQuizSubmit`, `scoreReadingComplete`, `scoreCommentPost`, `advanceStreak`, `checkAchievements`, `awardPoints`, `scoreDailyLogin`, `scoreReceiveUpvote`.
- DB RPCs: `score_on_quiz_submit`, `score_on_reading_complete`, `score_on_comment_post`, `advance_streak`, `check_user_achievements`, `award_points`. Reads `score_events` for upvote dedupe.

### web/src/lib/session.js (32 lines)
- Purpose: client-side session id + per-tab counters.
- Exports: `getSessionId`, `bumpArticleViewCount`, `bumpQuizCount`.

### web/src/lib/settings.js (55 lines)
- Purpose: read `settings` table with type coercion + 10s cache.
- Exports: `getSettings(supabase)`, `clearSettingsCache`, `isEnabled`, `getNumber`, `getString`.

### web/src/lib/siteUrl.js (39 lines)
- Purpose: resolve `NEXT_PUBLIC_SITE_URL` with prod-throw fallback.
- Exports: `getSiteUrl()` (throws in prod when missing), `getSiteUrlOrNull()`.
- T-010 — turns "broken localhost link in prod email" into a 500.

### web/src/lib/stripe.js (188 lines)
- Purpose: minimal Stripe REST wrapper, no npm dep.
- Exports: `createCheckoutSession`, `createBillingPortalSession`, `retrieveSubscription`, `listCustomerSubscriptions`, `cancelSubscriptionAtPeriodEnd`, `resumeSubscription`, `updateSubscriptionPrice`, `verifyWebhook(rawBody, signatureHeader)`.
- F-047 hardening: webhook timestamp gate is one-directional; rejects non-finite `t`.
- Idempotency-Key on checkout (day-bucketed by user+plan).
- Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

### web/src/lib/track.ts (268 lines, 'use client')
- Purpose: client-side analytics buffer-and-flush to `/api/events/batch`.
- Exports: `track(event_name, event_category, opts)`, `flushNow()`.
- 2s flush, 20 events or 32KB buffer cap, sendBeacon on visibility/pagehide. Drops events >4KB.
- Per-event size guard (Ext-Y.2). Auto-listens for visibilitychange + pagehide.

### web/src/lib/trackServer.ts (135 lines)
- Purpose: server-side event writer to `events` table via service-role client.
- Exports: `trackServer(event_name, event_category, opts)`, `ServerTrackOptions` interface.
- Env: `EVENT_HASH_SALT` (rotating invalidates UA+IP joins). Hashes UA + IP before insert.
- Note: cast required because `events` table not yet in `database.ts` types.

### web/src/lib/useFocusTrap.js (101 lines, 'use client')
- Purpose: WCAG 2.1.2 + 2.4.3 focus trap hook.
- Exports: `useFocusTrap(isActive, containerRef, {onEscape})`.
- Stabilizes `onEscape` via ref to prevent thrashing.

### web/src/lib/useTrack.ts (69 lines, 'use client')
- Purpose: hook wrapping `track()` with auto-injected user context.
- Exports: `useTrack()`, `usePageViewTrack(content_type, extra, deps)`.
- Reads `useAuth()` from `app/NavWrapper`.

### web/src/lib/pipeline/call-model.ts (434 lines)
- Purpose: multi-provider LLM dispatch (Anthropic + OpenAI), retries, cost write.
- Exports: `callModel`, plus error class re-exports from ./errors.
- DB: `ai_models` (60s cached pricing), `pipeline_costs` (cost ledger insert in finally).
- Anthropic 5-min ephemeral prompt cache. Cost-cap pre-check via `checkCostCap`. Abort-aware sleep. Structured pipeline log.

### web/src/lib/pipeline/clean-text.ts (43 lines)
- Purpose: HTML/markdown stripper applied to every LLM output before DB write.
- Exports: `cleanText(input)`. Verbatim port — header documents preserved quirks (e.g. `/---+/g` strips mid-prose, multi-line HTML comments survive).

### web/src/lib/pipeline/cluster.ts (168 lines)
- Purpose: pre-cluster discovery items by title-keyword overlap.
- Exports: `STOP_WORDS`, `extractKeywords`, `keywordOverlap`, `preCluster`, `getClusterOverlapPct` (60s settings cache).
- DB: `settings.pipeline.cluster_overlap_pct`.

### web/src/lib/pipeline/cost-tracker.ts (211 lines)
- Purpose: pre-call cost-cap enforcement (per-run + daily).
- Exports: `getTodayCumulativeUsd`, `estimateCostUsd`, `checkCostCap`.
- DB: `settings` (`pipeline.daily_cost_usd_cap`, `pipeline.per_run_cost_usd_cap`, `pipeline.daily_cost_soft_alert_pct`), RPC `pipeline_today_cost_usd`.
- 15s caps cache (lowered from 60s after H17 round-2). Fail-CLOSED with sentinel cap_usd=-1.

### web/src/lib/pipeline/editorial-guide.ts (1012 lines)
- Purpose: verbatim LLM prompt library.
- Exports: `EDITORIAL_GUIDE`, `CATEGORY_PROMPTS`, `HEADLINE_PROMPT`, `QUIZ_PROMPT`, `TIMELINE_PROMPT`, `AUDIENCE_PROMPT`, `KID_ARTICLE_PROMPT`, `KID_TIMELINE_PROMPT`, `KID_QUIZ_PROMPT`.
- All character-for-character ported from snapshot. Excluded from prettier per `.prettierignore` permanent block.
- REVIEW_PROMPT intentionally excluded (out of F7 scope).

### web/src/lib/pipeline/errors.ts (58 lines)
- Purpose: pipeline error classes (extracted from call-model.ts to break circular import).
- Exports: `Provider` type, `ModelNotSupportedError`, `CostCapExceededError`, `ProviderAPIError`, `RetryExhaustedError`, `AbortedError`.

### web/src/lib/pipeline/logger.ts (55 lines)
- Purpose: structured JSON logger for pipeline (`newsroom.<area>.<step>` taxonomy).
- Exports: `pipelineLog.info / warn / error`, `LogShape` type.

### web/src/lib/pipeline/persist-article.ts (159 lines)
- Purpose: typed wrapper around `persist_generated_article(jsonb)` RPC (migration 118).
- Exports: `PersistArticlePayload` etc. interfaces, `PersistArticleError`, `persistGeneratedArticle(service, payload)`.
- DB RPC: `persist_generated_article` — single-transaction insert across articles/kid_articles + sources + timelines + quizzes with slug-collision retry.

### web/src/lib/pipeline/plagiarism-check.ts (142 lines)
- Purpose: n-gram overlap detect + LLM rewrite loop (F7 Phase 3 Task 14).
- Exports: `getNgrams`, `checkPlagiarism`, `rewriteForPlagiarism`.
- Distinguishes `rewritten` / `no_change` / `failed` rewrite states for Q9 Option B manual review flagging.

### web/src/lib/pipeline/prompt-overrides.ts (127 lines)
- Purpose: Layer 1 admin prompt-override fetch + composer.
- Exports: `StepName` union, `PromptOverride`, `PromptOverrideMap`, `fetchPromptOverrides`, `composeSystemPrompt(base, override)`.
- DB: `ai_prompt_overrides` table. UUID-shape gate on `category_id` (PostgREST `.or()` filter strings are not parameterized).

### web/src/lib/pipeline/redact.ts (141 lines)
- Purpose: PII scrubber for Sentry payloads.
- Exports: `redactPayload(input)`, `captureWithRedact(err, ctx)`.
- Patterns: IPv4, email, UA strings, bearer tokens, Stripe/Anthropic/OpenAI key prefixes (`sk-`, `rk_`, `pk_test_`, etc., 8+ char body), keys named password/token/secret/apikey/api_key/cookie/authorization. Recursion guarded by WeakSet. Non-plain objects pass through.

### web/src/lib/pipeline/render-body.ts (21 lines)
- Purpose: markdown → sanitized HTML.
- Exports: `renderBodyHtml(markdown)`. Uses `marked@^18` (sync) + `isomorphic-dompurify`.

### web/src/lib/pipeline/scrape-article.ts (118 lines)
- Purpose: Jina Reader → Cheerio fallback article scraper.
- Exports: `scrapeArticle(url, timeoutMs=15000)`. Hard caps: 200 char min, 10000 char max.
- External network — `https://r.jina.ai/<url>` then direct fetch. Verbatim port; documented quirks preserved.

### web/src/lib/pipeline/story-match.ts (194 lines)
- Purpose: match a fresh cluster against existing articles by keyword overlap.
- Exports: `STORY_MATCH_CANDIDATE_LIMIT`, `findBestMatch`, `loadStoryMatchCandidates`, `loadKidStoryMatchCandidates`, `getStoryMatchOverlapPct`.
- DB: `articles` / `kid_articles` (top 200 published, newest first), `settings.pipeline.story_match_overlap_pct`.

### web/src/lib/certs/apple-root-ca-g3.der + README.md
- Purpose: vendored Apple Root CA G3 cert (DER) used by `appleReceipt.js` for JWS chain verification. Falls back to `APPLE_ROOT_CA_DER_BASE64` env var.

### web/src/lib/.DS_Store
- macOS metadata file. Should be in .gitignore but not blocking.

### web/src/types/database.ts (11,304 lines)
- Auto-generated Supabase types from `npm run types:gen` (script in package.json: `supabase gen types typescript --project-id fyiwulqphgmoqullmrfn`).
- Tables (~155 inventoried — full list in this report's appendix below): access_code_uses, access_codes, access_requests, achievements, ad_campaigns, ad_daily_stats, ad_impressions, ad_placements, ad_units, admin_audit_log, ai_models, ai_prompt_overrides, ai_prompt_presets, alert_preferences, analytics_events, app_config, article_relations, articles, audit_log, auth_providers, behavioral_anomalies, blocked_users, blocked_words, bookmark_collections, bookmarks, campaign_recipients, campaigns, categories, category_scores, category_supervisors, cohort_members, cohorts, comment_context_tags, comment_votes, comments, consent_records, conversation_participants, conversations, data_requests, deep_links, device_profile_bindings, discovery_items, email_templates, error_logs, events, events_default, expert_application_categories, expert_applications, expert_discussion_votes, expert_discussions, expert_queue_items, family_achievement_progress, family_achievements, feature_flags, feed_cluster_articles, feed_clusters, feeds, follows, iap_transactions, invoices, kid_articles, kid_category_permissions, kid_discovery_items, kid_expert_questions, kid_expert_sessions, kid_pair_codes, kid_profiles, kid_quizzes, kid_sessions, kid_sources, kid_timelines, kids_waitlist, media_assets, message_receipts, messages, notifications, permission_scope_overrides, permission_set_perms, permission_sets, permissions, perms_global_version, pipeline_costs, pipeline_runs, plan_features, plan_permission_sets, plans, promo_codes, promo_uses, push_receipts, quiz_attempts, quizzes, rate_limit_events, rate_limits, reading_log, reports, reserved_usernames, role_permission_sets, roles, score_events, score_rules, score_tiers (off-screen), settings (off-screen), sponsors, streaks, subscription_events, subscriptions, support_tickets, ticket_messages, timelines, translations, user_achievements, user_permission_sets, user_preferred_categories, user_push_tokens, user_roles, user_sessions, user_warnings, users, webhook_log, weekly_recap_attempts, weekly_recap_questions, weekly_recap_quizzes.
- Views: public_user_profiles.
- Functions enum lists ~140 RPCs (auth/perm/admin/scoring/billing/kids/cluster/pipeline/quiz/streak/etc.).
- Enums: empty.
- Excluded from ESLint + Prettier (.eslintrc.json + .prettierignore).

### web/src/types/database-helpers.ts (23 lines)
- Purpose: typed aliases.
- Exports: `Tables<T>`, `TableInsert<T>`, `TableUpdate<T>`, `Enums<T>`, `DbClient`, plus re-export `Database`.

### web/next.config.js (86 lines)
- Static security headers (HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy camera=(),microphone=(),geolocation=(),interest-cohort=(), X-DNS-Prefetch-Control on). CSP intentionally NOT set here — middleware emits per-request with nonce.
- Image optimization re-enabled (DA-022/DA-048): AVIF + WebP, remotePatterns gated to Supabase storage hostname.
- **Sentry config M-18: production builds throw if `@sentry/nextjs` fails to load**. Local/preview soft-fail. CONFIRMED present.

### web/package.json (64 lines)
- Next 14.2 (matches CLAUDE.md "version declared in web/package.json"). React 18.3, TS 6.0.3.
- Deps: `@anthropic-ai/sdk@0.90`, `@sentry/nextjs@8.40`, `@supabase/ssr@0.10.2`, `@supabase/supabase-js@2.103`, `cheerio@1.2.0`, `isomorphic-dompurify@3.9`, `jsonwebtoken@9.0.3`, `marked@18.0.2`, `openai@6.34`, `rss-parser@3.13`, `server-only@0.0.1`, `zod@4.3.6`.
- Husky + lint-staged: `next lint --fix --file` + `prettier --write` on `*.{js,jsx,ts,tsx}`.
- Playwright + dotenv as dev deps. Tailwind 4.

### web/tsconfig.json (28 lines)
- target ES2022, strict, allowJs, noEmit, moduleResolution bundler. `@/*` → `./src/*` path alias.

### web/.eslintrc.json (30 lines)
- extends `next/core-web-vitals`, `plugin:@typescript-eslint/recommended`, `prettier`. parser `@typescript-eslint/parser`.
- Rules: `no-explicit-any: warn`, `no-unused-vars` off in JS / `@typescript-eslint/no-unused-vars: warn` (with `_` prefix ignore), `react-hooks/exhaustive-deps: warn`, `react/no-unescaped-entities: warn`, `@next/next/no-img-element: warn`.
- ignorePatterns: `node_modules`, `.next`, `src/types/database.ts`, `next-env.d.ts`, `*.tsbuildinfo`.

### web/.prettierrc.json (10 lines)
- semi+singleQuote+tabWidth=2+trailingComma=es5+arrowParens=always+printWidth=100+endOfLine=lf.

### web/.prettierignore (19 lines)
- standard ignores + temporary `src/app/admin` block (per #20 plan, removed once #16 ships) + permanent `src/lib/pipeline` (verbatim prompt content).

### web/.husky/pre-commit (1 line)
- `cd web && npx lint-staged`.

### web/playwright.config.ts (80 lines)
- testDir `./tests/e2e`. baseURL from `E2E_BASE_URL` else `http://localhost:3000`. Loads `web/.env.local` via dotenv (so SUPABASE_SERVICE_ROLE_KEY available for createTestUser).
- Projects: chromium + mobile-chromium (Pixel 5).
- Pre-drops `vp_preview=ok` cookie via `tests/e2e/.auth/preview.json` storageState (coming-soon-mode bypass).
- Auto-spawns `npm run dev` if no E2E_BASE_URL provided.

### web/vercel.json (45 lines)
- 10 cron paths: `/api/cron/sweep-kid-trials` (3:00 daily), `recompute-family-achievements` (3:30), `check-user-achievements` (3:45), `process-deletions` (4:00), `freeze-grace` (4:15), `process-data-exports` (4:30), `send-emails` (4:45), `send-push` (5:00), `flag-expert-reverifications` (Mon 4:30), `pipeline-cleanup` (6:00 daily).
- Note: `pipeline-cleanup` scheduled but the route was not in this zone — verify in API zone.

### web/.env.example (129 lines)
- Comprehensive doc of every env var with prod-or-dev guidance. Notes:
  - 8 Stripe price ID env entries deleted — DB is source of truth (`plans.stripe_price_id`).
  - SENTRY_DSN required in prod (next.config refuses to build).
  - APPLE_BUNDLE_ID env override exists (defaults `com.veritypost.app`).
  - APPLE_ROOT_CA_DER_BASE64 fallback for vendored cert.
  - `NEXT_PUBLIC_SITE_MODE=coming_soon` flips middleware to /welcome redirect.
  - PREVIEW_BYPASS_TOKEN gates the bypass cookie.

### web/.env.local
- Present — contains live Supabase keys. **Do not print contents in audit deliverables.** RATE_LIMIT_ALLOW_FAIL_OPEN=1 set, NEXT_PUBLIC_SITE_MODE=coming_soon set.

## Permission helpers consolidated view

- **`requireAuth(client?)`** (auth.js:62) — server-side. Reads cookie OR bearer (resolveAuthedClient). Throws Error with `.status=401` ('UNAUTHENTICATED') when no user.
- **`requireVerifiedEmail(client?)`** (auth.js:72) — wraps requireAuth, then checks `.email_verified`. Throws 403 ('EMAIL_NOT_VERIFIED'). T-076 fix: now sets `.status` (was missing).
- **`requireNotBanned(client?)`** (auth.js:85) — wraps requireAuth, throws 403 BANNED / MUTED.
- **`requirePermission(permissionKey, client?)`** (auth.js:170) — wraps requireAuth, calls RPC `compute_effective_perms(p_user_id)`, returns user when row.granted=true. Throws 403 `PERMISSION_DENIED:<key>` with `.detail` (granted_via, source_detail, deny_mode, lock_message) for resolver context.
- **`hasPermissionServer(permissionKey, client?)`** (auth.js:201) — non-throwing variant. Returns false on any failure.
- **`hasPermission(key)`** (permissions.js:174, client) — synchronous read of full-perms cache, falls back to section cache. Returns false when not cached.
- **`hasPermissionServer(key)`** (permissions.js:207, **client-side, name collision**) — calls RPC `has_permission(p_key)`. Different from `auth.js`'s server-side variant.
- **Role Sets** (roles.js): `OWNER_ROLES`, `ADMIN_ROLES`, `EDITOR_ROLES`, `MOD_ROLES`, `EXPERT_ROLES` — frozen, no DB call. For zero-network coarse layout gates only. Also DB-live: `getRoles`, `getRoleNames`, `rolesUpTo`, `rolesAtLeast`. Hierarchy lives in `public.roles.hierarchy_level`; enforced via `require_outranks` / `caller_can_assign_role` RPCs.

Name-collision risk: `hasPermissionServer` is exported from BOTH `auth.js` (server, calls compute_effective_perms via authed client) and `permissions.js` (client, calls has_permission RPC). Different semantics, same name. Worth flagging in a future sweep.

## Hardcoded values that should be DB-driven (per "DB is default" rule)

1. **`web/src/lib/plans.js` TIERS catalog (lines 14-98)** — bullet lists, taglines, maxKids hardcoded for each of 5 tiers. Marketing copy + per-tier feature bullets are pure constants, not derived from `plan_features`. Likely should pull from `plans.description`+`plan_features.is_enabled` at minimum. Tracked in MASTER_TRIAGE_2026-04-23.md.
2. **`web/src/lib/plans.js` PRICING (lines 101-118)** — cents per tier × cycle. DB has `plans.unit_amount_cents` per migration history; this constant duplicates. Tracked.
3. **`web/src/lib/plans.js` TIER_ORDER (line 12)** — list of 5 tier slugs. Could be derived from `getPlans()` ordered by sort_order.
4. **`web/src/lib/permissionKeys.js` SECTIONS** — six hardcoded section names (HOME, PROFILE, ARTICLE, COMMENTS, KIDS, LEADERBOARD). DB column is `permissions.ui_section`; could be enum-derived.
5. **`web/src/lib/permissionKeys.js` LOCK_REASON / DENY_MODE** — hardcoded enums mirroring DB resolver values. Acceptable since they are stable contract strings; DB drift would surface immediately.
6. **`web/src/lib/coppaConsent.js` COPPA_CONSENT_VERSION + TEXT** — hardcoded; DB column `kid_profiles.metadata.coppa_consent` stamps the version. Could live in `email_templates`/`settings` table for owner-edit-without-deploy.
7. **`web/src/lib/observability.js` 7-day retention claim** — comment only, no constant.
8. **`web/src/middleware.js` PROTECTED_PREFIXES** (lines 30-42) — hardcoded list of 9 path prefixes. Adding/removing surfaces requires code edit. Could live in `settings` table.
9. **`web/src/middleware.js` ALLOWED_ORIGINS** (lines 156-163) — CORS allowlist. PROD_ORIGIN comes from env, but veritypost.com / www.veritypost.com are hardcoded.
10. **`web/src/middleware.js` CSP allowlist** (`https://js.stripe.com`, `https://api.stripe.com`, `https://api.openai.com`, `https://*.ingest.sentry.io`) — hardcoded vendor domains. Acceptable for security (DB-driven CSP would itself be an injection vector) but worth noting.
11. **`web/src/lib/apns.js` APNS_TOPIC_DEFAULT = 'com.veritypost.app'`** (line 20) — hardcoded bundle id default. Already env-overridable.
12. **`web/src/lib/appleReceipt.js` EXPECTED_BUNDLE_ID = 'com.veritypost.app'`** (line 27) — env-overridable via APPLE_BUNDLE_ID.
13. **`web/src/lib/featureFlags.js` TTL_MS = 10_000`** — hardcoded cache window.
14. **`web/src/lib/pipeline/cluster.ts` THRESHOLD_FALLBACK = 0.35`** — only used when settings row missing; the DB-driven path is correct.
15. **`web/src/lib/pipeline/story-match.ts` STORY_MATCH_CANDIDATE_LIMIT = 200`** + `THRESHOLD_FALLBACK = 0.4` — header explicitly notes this is intentionally constant per F7-DECISIONS-LOCKED. Documented as not-settings-driven.
16. **`web/src/lib/kidPin.js` PBKDF2_ITERATIONS = 100_000`** — hardcoded. Bumping requires code change + transparent rehash. Acceptable for security primitives.

## ESLint rules-of-hooks disables (file + line)

`web/src/lib/*` and `web/src/middleware.js` contain ZERO `react-hooks/rules-of-hooks` disables. The CLAUDE.md "23 rules-of-hooks disables parked for prelaunch" all live OUTSIDE this zone — they are concentrated in:

- `web/src/app/recap/page.tsx` (4 disables)
- `web/src/app/recap/[id]/page.tsx` (10 disables)
- `web/src/app/welcome/page.tsx` (10+ disables, file truncated in grep)
- `web/src/app/u/[username]/page.tsx` (1 region-disable, kill-switched until PUBLIC_PROFILE_ENABLED flips)

The only `eslint-disable` line I touched in the lib zone is:
- `web/src/lib/useTrack.ts:66` — `// eslint-disable-next-line react-hooks/exhaustive-deps` (intentional spreading of `deps` rest array into the effect array).

The other zones own the 23-count. Worth surfacing to the lib-focused auditor: this zone is clean.

## Middleware behaviors (auth, CORS, CSP, /kids redirect, public-path gate)

1. **Request-id propagation (DA-141)** — honors inbound `x-request-id` if shaped `[A-Za-z0-9_-]{8,128}`, else mints UUID. Forwarded to handlers via inbound `x-request-id` header + emitted on every response.
2. **CSP nonce** — minted per request via `getRandomValues(16)` → base64url. Forwarded as `x-nonce` header so server components / framework bootstrap pick it up.
3. **CSP build** — primary header (env-gated `CSP_ENFORCE=true` for enforce, else Report-Only). `default-src 'self'`, `script-src 'self' 'nonce-…' 'strict-dynamic' js.stripe.com`, `style-src 'self' 'unsafe-inline' fonts.googleapis.com`, `img-src 'self' data: blob: https:`, `font-src 'self' data: fonts.gstatic.com`, `connect-src 'self' <supabase> <wss://> stripe openai sentry`, `frame-src js.stripe.com hooks.stripe.com`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`, `report-uri /api/csp-report`. **Second always-Report-Only CSP shipped** (Ext-OO.2) with stricter `style-src 'self' 'nonce-…' fonts.googleapis.com` (no unsafe-inline) → `report-uri /api/csp-report?policy=strict` for migration tracking.
4. **CORS allowlist** (M-17) — `NEXT_PUBLIC_SITE_URL` (defaults `https://veritypost.com`) + `https://www.veritypost.com` + `http://localhost:3000` + `http://localhost:3333`. Methods `GET,POST,PATCH,DELETE,OPTIONS`. Headers `authorization, content-type, x-health-token, x-request-id, x-vercel-cron`. Preflight short-circuits to 204.
5. **Standalone-preview short-circuit** — `/ideas/*` returns early before any Supabase call, so the surface keeps working without env vars.
6. **Legacy-admin 301s** — `/admin/pipeline` and `/admin/ingest` (exact match only) → `/admin/newsroom`.
7. **Coming-soon mode** — when `NEXT_PUBLIC_SITE_MODE=coming_soon`: redirect every public path to `/welcome` (307). Allowlist `/welcome`, `/preview`, `/api/*`, `/admin*`, `/ideas*`, `/_next/*`, `/favicon.ico`, `/robots.txt`, `/sitemap.xml`. Cookie `vp_preview=ok` bypass (set by visiting `/preview?token=PREVIEW_BYPASS_TOKEN`). All non-bypass responses get `X-Robots-Tag: noindex, nofollow`.
8. **Skip GoTrue on public** — `auth.getUser()` only called when `pathname` matches a protected prefix or `/kids/*`. Cuts middleware p50 on home/story/api/login.
9. **Protected-prefix gate** — `/profile, /messages, /bookmarks, /notifications, /leaderboard, /recap, /expert-queue, /billing, /appeal`. Anon → 302 to `/login?next=…`. NOT in list (intentional): `/notifications` (anon CTA in-page), `/admin` (404 from layout for anon), `/preview` (bypass route), `/u` (own kill-switch), home, story, browse, category, card, search.
10. **`/kids` and `/kids/*`** — 302. authed → `/profile/kids` (parent management), anon → `/kids-app` (marketing). No kid-facing web routes.
11. **Matcher** — every route except `_next/static`, `_next/image`, `favicon.ico`, common image suffixes.

## Notable claims worth verifying in later waves

1. **`requireAuth` `.status` claim drift** — the comment in `requireVerifiedEmail` (auth.js:75-78) says "prior code threw without `.status`, breaking the idiomatic `if (err.status) return …` branch that requireAuth callers rely on." But `requireAuth` itself (auth.js:62-69) DOES set `.status=401`. Comment may be referring to historical state. Verify in router-handler zone whether all callers correctly branch on `.status` vs `.message`.
2. **Stripe webhook timestamp window** (stripe.js:179-185) — accepts -30s future skew, rejects >300s old. Verify Stripe webhook handler is wrapping into try/catch that returns 400 not 500.
3. **`recordAdminAction` p_ip + p_user_agent gap** — adminMutation.ts:84-88 explicit FOLLOW-UP that the helper doesn't pass IP/UA through to the RPC. If the underlying RPC has `p_ip TEXT, p_user_agent TEXT` columns, those land NULL today. Audit zone for /api/admin route to confirm none try to pass them and crash.
4. **Permissions cache name collision** — `hasPermissionServer` exported from both `lib/auth.js` (server) and `lib/permissions.js` (client). Verify imports are not mixing the two — a client component importing the wrong one would silently fail.
5. **`v2LiveGuard` lazy-imports** — verify it's actually invoked in routes that need v2-cutover gating (search routes for `v2LiveGuard` import).
6. **Image remotePatterns gating** — only Supabase storage hostname in `next.config.js` `imageRemotePatterns`. Verify there are no `<Image src="https://other-cdn/..."/>` callers that would now 400.
7. **Sentry M-18 prod build gate** — confirm `VERCEL_ENV=production` is actually set on Vercel prod (and not just `NODE_ENV=production`). next.config.js:66 only checks `VERCEL_ENV`. Wave-checking the deploy pipeline can confirm.
8. **DB-driven plan tier copy** — TIERS bullet lists in plans.js drift from any DB-side feature flags. Verify what /pricing page actually reads.
9. **Coming-soon mode in middleware** — current `.env.local` has `NEXT_PUBLIC_SITE_MODE=coming_soon` set locally. Verify Vercel prod env DOES NOT have it set, or launch will silently 307 every visitor to /welcome.
10. **F7 prompt-overrides UUID gate** — only `category_id` is shape-validated (prompt-overrides.ts:51-57). `clusterSubcategoryId` is NOT validated before being passed to `.filter` (line 86). Confirm subcategory_id is never user-supplied in this code path. Currently always null per the comment, but Phase 4 will derive it.
11. **CSP `'unsafe-inline'` style-src** — primary CSP keeps unsafe-inline because of inline styles across the codebase. Strict-Report-Only CSP is the migration tracker. Confirm /api/csp-report aggregates `policy=strict` reports separately so the owner can plan the cutover.
12. **`featureFlags.js` 10s TTL** — across multiple serverless instances, an admin flag toggle takes up to 10s + cold-start to propagate. Comment acknowledges true cross-process invalidation requires pub/sub.
13. **Editorial-guide CATEGORY_PROMPTS** — line 345, 290+ lines of category-keyed prompt strings. Verify the CATEGORIES enum used at the call-site matches `categories.name` values in DB (drift would cause `undefined` prompt and silent fallback).
14. **vercel.json `pipeline-cleanup` cron** — schedule references `/api/cron/pipeline-cleanup` daily at 6:00 — verify route exists in API zone.
15. **`apns.js` `APNS_BUNDLE_ID` env var** — `.env.example` mentions `APNS_BUNDLE_ID=com.veritypost.app` (line 52) but apns.js code uses `APNS_TOPIC` (with default `com.veritypost.app`) — `APNS_BUNDLE_ID` env var is set but never read by the apns module. Possible dead env var.
