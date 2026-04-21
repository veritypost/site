# Consolidated Tasks — Agent 1

2026-04-20 · Sources: BATCH_FIXES_2026_04_20.md, STATUS.md, WORKING.md, 4 final auditors.
DB (MCP verified): roles=9, permissions=992, permission_sets=21, permission_set_perms=3075, role_permission_sets=53, plan_permission_sets=21, plans=9, plan_features=215, categories=69, achievements=26, **rate_limits=0**, settings=6, email_templates=6, feature_flags=1.

Legend — Effort:1L/S/M/L/OWNER · Priority:P0 blocker→P4 deferred · Lens:CODE/DB-DRIFT/SCHEMA/UX/SECURITY/IOS. Paths absolute from `/Users/veritypost/Desktop/verity-post/`.

## Tasks

### T-001 · P1·L·DB-DRIFT · [VERIFIED rate_limits=0] Seed `rate_limits` + add `getRateLimit()` helper in `web/src/lib/rateLimit.js`; replace inline `{max, windowSec}` across ~10 routes (kids-verify-pin, follows, bookmarks, users-block, account-delete, stripe-checkout, appeals, resend-verify, …) · BATCH_FIXES, Outstanding-1.
### T-002 · P1·M·SECURITY · [VERIFIED] `grep error.message web/src/app/api | wc -l`=125; hotspots `comments/[id]/*`, `recap/*`, `messages/search`, `auth/resend-verification`, `family/*`, `admin/**`. Replace w/ generic string + `console.error('[route]', err)` · Outstanding-1/2, Fresh-Check-1 #16.
### T-003 · P1·S·CODE · [VERIFIED] 9 files have Retry-After; add to 13 more: `auth/login,auth/signup,auth/email-change,auth/resolve-username,auth/resend-verification,kids/pair,ads/click,ads/impression,access-request,support/public,admin/send-email,check-email(×2)` · Outstanding-2 #5.
### T-004 · P1·1L·SECURITY · [VERIFIED] `web/src/app/api/reports/route.js` has no rate-limit; authed user can flood reports and auto-hide comments at threshold 3. Add 10/hr + Retry-After · Fresh-Check-1 #7.
### T-005 · P1·1L·SECURITY · [VERIFIED] `web/src/app/api/expert/apply/route.js` no rate-limit; add 5/hr · Fresh-Check-1 #7.
### T-006 · P1·S·SECURITY · [VERIFIED] `web/src/app/api/kids/[id]/route.js` PATCH/DELETE unbounded; add 30/min per user · Outstanding-2 #9.
### T-007 · P1·S·SECURITY · [VERIFIED partial] normalize `/api/auth/*` rate limits (resend=3/hr; email-change/signup/login/resolve-username/check-email inconsistent) · Outstanding-2 #5.
### T-008 · P1·1L·SECURITY · [VERIFIED] `web/src/app/api/auth/resend-verification/route.js:34` returns `{ok:true, ip}` — drop `ip` · Fresh-Check-1 #8.
### T-009 · P1·S·SECURITY · [UNVERIFIED] `web/src/app/api/kids/[id]/route.js:23` `date_of_birth` in PATCH whitelist without 3–13y bounds · Outstanding-2 #7.
### T-010 · P1·S·UX · [VERIFIED] `web/src/app/admin/page.tsx:95-126` `restrictedRole` state set but no JSX consumes it; editors/mods see full grid · Outstanding-1/2.
### T-011 · P1·1L·SECURITY · [VERIFIED] `web/src/middleware.js:136,139,160` still `Report-Only`; TODO date 2026-04-21 — flip header names · STATUS.md, Fresh-Check-2 #9.
### T-012 · P1·1L·SECURITY · [VERIFIED] `web/src/middleware.js:91-95` `ALLOWED_ORIGINS` missing `https://www.veritypost.com`; `api/account/delete/route.js:24-32` treats www canonical (drift). Add or redirect apex↔www · Fresh-Check-1 #4.
### T-013 · P1·S·SECURITY · [UNVERIFIED] `api/auth/signup/route.js:33`, `reset-password/route.js:31`, `callback/route.js:46` fall back to `http://localhost:3333`; risks localhost links in prod emails · Fresh-Check-2 #4.
### T-014 · P1·OWNER·SCHEMA · [UNVERIFIED] copy `archive/2026-04-19-prelaunch-sprint/round_{a,b}_migration.sql` → `schema/092_…,093_…`; regen `schema/reset_and_rebuild_v2.sql` · STATUS.md, WORKING.md.
### T-015 · P1·L·SECURITY · [VERIFIED] `web/src/app/admin/users/page.tsx:273-290` DELETE still client-side; new `/api/admin/users/[id]` DELETE w/ service-client+audit+rank guard · Outstanding-1.
### T-016 · P2·S·UX · [VERIFIED] `web/src/app/api/auth/callback/route.js:152` + `signup/pick-username/page.tsx:137,147` drop `rawNext` on first-login; carry as signed param · BATCH_FIXES.
### T-017 · P2·M·IOS · [UNVERIFIED] Convert remaining 11 Kids Swift files to Dynamic Type: `VerityPostKids/VerityPostKids/{TabBar,ProfileView,KidQuizEngineView,ExpertSessionsView,ParentalGateModal,LeaderboardView,BadgeUnlockScene,StreakScene,QuizPassScene,GreetingScene,KidPrimitives}.swift` · Outstanding-2 #6.
### T-018 · P1·S·IOS · [UNVERIFIED] `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:228-232` `quiz_attempts` insert silently swallowed; kid score/leaderboard drift · Fresh-Check-2 #1.
### T-019 · P1·S·IOS · [UNVERIFIED] `VerityPostKids/VerityPostKids/KidReaderView.swift:183-190` `reading_log` insert silently swallowed; streak trigger never fires · Fresh-Check-2 #1.
### T-020 · P2·M·IOS · [UNVERIFIED] `KidsAppState.swift:162,169,189` in-memory `completeQuiz` mutator vs DB writes (`KidsAppRoot.swift:144` caller) — rely on DB only · Fresh-Check-2 #7.
### T-021 · P2·L·DB-DRIFT/SCHEMA · [VERIFIED] create `page_access` table, `canAccess(key)` helper, rip `['owner','admin']` allowlists from 33 admin pages; `permissions`=992 populated · BATCH_FIXES Phase B.
### T-022 · P2·M·DB-DRIFT · [VERIFIED] `web/src/lib/plans.js:12-128` PRICING hardcoded; build `planLimit(plan, feature)` reading `plan_features`(215) + `plans.metadata`(9) · Fresh-Check-1 #5.
### T-023 · P2·S·DB-DRIFT · [VERIFIED] `web/src/app/page.tsx:83-108,125` FALLBACK_CATEGORIES hardcoded; build `getCategories()` from `categories`(69) · WORKING.md M-05, Fresh-Check-1 #15.
### T-024 · P2·S·DB-DRIFT · [VERIFIED] `getRoleHierarchy()` from `roles.hierarchy_level`(9) replacing 5-file inline `HIERARCHY`/`ROLE_ORDER` · BATCH_FIXES.
### T-025 · P2·S·DB-DRIFT · [VERIFIED] consolidate `getSettings(key)` callers (already used in `reports/route.js:6`); `settings`=6 · BATCH_FIXES.
### T-026 · P2·S·DB-DRIFT · [VERIFIED] hardcoded `ACHIEVEMENTS` list → DB read; `achievements`=26 · critical-lens.
### T-027 · P3·M·SCHEMA · [VERIFIED missing] new tables `report_reasons`/`support_categories`/`appeal_reasons`; seed + wire forms · BATCH_FIXES.
### T-028 · P3·M·SCHEMA · [VERIFIED missing] new `notification_templates` (`email_templates`=6 placeholder) · BATCH_FIXES.
### T-029 · P3·S·SCHEMA · [VERIFIED missing] new `consent_versions`; COPPA version in `lib/coppaConsent.js` const · BATCH_FIXES.
### T-030 · P3·S·SCHEMA · [VERIFIED missing] new `source_publishers` · BATCH_FIXES.

### T-031 · P2·1L·CODE · `web/src/app/api/admin/stories/route.js:38-40` add `console.error('[admin/stories]', err)` before 500 · [UNVERIFIED] · Fresh-Check-2 #6.
### T-032 · P2·S·UX · `web/src/app/admin/recap/page.tsx:80,118` fetch missing `.ok`/`.catch` · [UNVERIFIED] · Fresh-Check-2 #1.
### T-033 · P2·1L·CODE · `web/src/lib/scoring.js:57` achievements RPC silently returns `[]` · Fresh-Check-2 #1.
### T-034 · P3·S·CODE · `web/src/app/verify-email/page.js:87-93,62-65` interval+unmount setState · Fresh-Check-2 #10/11.
### T-035 · P3·S·CODE · `web/src/app/signup/pick-username/page.tsx:48,87` debounce cleanup · Fresh-Check-2 #10.
### T-036 · P3·S·CODE · `web/src/app/admin/comments/page.tsx:120-173` saveTimeout cleanup · Fresh-Check-2 #11.
### T-037 · P3·S·CODE · `web/src/app/profile/settings/page.tsx:554-557` reschedule tick timers not captured · Fresh-Check-2 #10.
### T-038 · P3·S·UX · profile/settings hash-scroll 1500ms retry fragile · BATCH_FIXES.
### T-039 · P3·M·CODE · 22 `as any` across admin; worst `admin/subscriptions/page.tsx:48,49,51,109,194,298,374,607` · Fresh-Check-2 #5.
### T-040 · P3·S·CODE · `web/src/lib/featureFlags.js:5-22` 30s TTL no invalidation (`clearFlagCache` dead) · Fresh-Check-2 #7.
### T-041 · P2·M·SECURITY · `web/src/lib/permissions.js:34-39,159-163` cache fallthrough can return stale-true · Fresh-Check-2 #7.
### T-042 · P3·S·SECURITY · `web/src/app/api/errors/route.js:36-41` rate-limit fail-open · Fresh-Check-2 #8.
### T-043 · P3·1L·IOS · `VerityPost/VerityPost/ProfileView.swift:1169-1176` dead `addChild()` `#if false` · Fresh-Check-2 #2.
### T-044 · P3·S·IOS · `VerityPost/VerityPost/StoryDetailView.swift:1278-1305` expert Q&A `#if false` stale · Fresh-Check-2 #9.
### T-045 · P3·1L·IOS · `VerityPost/VerityPost/LeaderboardView.swift:358` silent `catch {}` · Fresh-Check-2 #1.
### T-046 · P3·1L·IOS · `VerityPost/VerityPost/StoryDetailView.swift:1261` vote aggregation silent catch · Fresh-Check-2 #1.

### T-047 · P2·S·IOS · `VerityPost/VerityPost/LoginView.swift` accept username-or-email · Fresh-Check-1 #11.
### T-048 · P2·S·SECURITY · `web/src/app/api/kids/verify-pin/route.js:9-10` [VERIFIED] 3-fail 60s lock + counter reset → 10k PIN space crackable in ~5.5h per kid w/ outer 30/min; escalate or force reset · Fresh-Check-1 #6.
### T-049 · P2·S·SECURITY · `web/src/app/api/admin/users/[id]/permissions/route.js:261-263` require non-null reason+expires + transactional audit-log (outranks landed at 80-100) · Fresh-Check-1 #10.
### T-050 · P2·1L·SECURITY · same file `:108` leaks `targetErr.message` · Fresh-Check-1 #16.
### T-051 · P3·S·CODE · `web/src/lib/stripe.js:73-75` UTC-day idempotency edge · Fresh-Check-1 #13.
### T-052 · P3·1L·CODE · `web/src/lib/auth.js:72-73` `requireVerifiedEmail` throws w/o `.status` → 500 fallthrough · Fresh-Check-1 #14.
### T-053 · P3·S·CODE · `@admin-verified` drift on 8 files modified session (subscriptions, webhooks, analytics, users, expert-sessions, moderation, page.tsx, pipeline) — re-stamp or accept · Outstanding-1.
### T-054 · P2·S·UX · `web/src/app/page.tsx` feed null-title guard + `articles.title` audit (LB-016) · WORKING.md.
### T-055 · P2·M·UX · `web/src/app/notifications/*` empty-list bug (LB-006) · WORKING.md.
### T-056 · P3·S·UX · `web/src/app/apply-to-expert/*` confirmation strands user (LB-010) · WORKING.md.
### T-057 · P2·L·UX · Stripe Embedded Checkout (LB-013), `ui_mode:'embedded'` · WORKING.md.
### T-058 · P2·S·CODE · Auth-drop instrumentation (LB-034) → Sentry · WORKING.md.
### T-059 · P3·1L·CODE · `web/src/components/QuizPoolEditor.tsx` orphan · WORKING.md.
### T-060 · P3·S·UX · `web/src/components/VerifiedBadge.tsx` + callers renders null · WORKING.md.

### T-061..T-066 — Deferred from WORKING.md M/L tail
P4 · varies · CODE/UX. (M-02 home `'use client'`, M-04 dual perms cache, M-06 `kids-%` slug, L-07 `navigator.share`, L-10 Interstitial `next=`, L-11 `EXPECTED_BUNDLE_ID`). Sources at `web/src/app/page.tsx:3,278`, `web/src/lib/permissions.js:7,16,160`, `web/src/app/story/[slug]/page.tsx`, `web/src/components/Interstitial.tsx`, `web/src/lib/appleReceipt.js:23`.

### T-067 · P0·OWNER·SECURITY · HIBP toggle in Supabase Auth · STATUS.md.
### T-068 · P0·OWNER·SECURITY · Rotate live secrets (Supabase service-role, Stripe live, Stripe webhook) per `docs/runbooks/ROTATE_SECRETS.md` · STATUS.md.
### T-069 · P0·OWNER·CODE · `SENTRY_DSN`+`NEXT_PUBLIC_SENTRY_DSN` in Vercel — build fails without (`web/next.config.js:61-68`) · WORKING.md.
### T-070 · P0·OWNER·CODE · Confirm `NEXT_PUBLIC_SITE_URL` in Vercel · WORKING.md.
### T-071 · P0·OWNER·UX · Replace 5 `Test:` articles; publish ≥10 real · STATUS.md.
### T-072 · P1·OWNER·IOS · App Store 8 subscription products · WORKING.md.
### T-073 · P1·OWNER·IOS · App Store V2 Server URL (prod+sandbox) · WORKING.md.
### T-074 · P1·OWNER·IOS · APNs `.p8` + Vercel `APNS_KEY_ID/TEAM_ID/AUTH_KEY/ENV/TOPIC` · WORKING.md.
### T-075 · P1·OWNER·IOS · `apple-app-site-association` on `veritypost.com` · WORKING.md.
### T-076 · P1·OWNER·SECURITY · Google OAuth wire-up (GCP + Supabase) LB-036 · WORKING.md.
### T-077 · P1·OWNER·UX · PWA icons in `web/public/` (192/512/512-maskable/apple-touch-icon) · WORKING.md.
### T-078 · P1·OWNER·IOS · Real App Store URL at 3 sites incl. `VerityPost/VerityPost/KidsAppLauncher.swift:11-12` · BATCH_FIXES, Fresh-Check-1 #12.
### T-079 · P2·L·CODE · Stripe-sync pass (admin/subscriptions, plans, promo) wire mutations + price edits + coupons · WORKING.md.
### T-080 · P2·M·CODE · `/admin/features` rebuild vs `feature_flags` schema · WORKING.md.
### T-081 · P2·M·UX · `/admin/breaking` rebuild · WORKING.md.
### T-082..T-085 · P3·OWNER · admin decisions: webhooks retry real?, pipeline display cols, support ChatWidgetConfig, email-templates category tabs · WORKING.md.
### T-086 · P3·S·CODE · Audit-log slug micro-pass (6–7 new) · WORKING.md.
### T-087 · P3·1L·UX · Adult streak-freeze help copy (ghost feature) · BATCH_FIXES.
### T-088 · P2·OWNER·UX · Product decisions: journalist/educator role, Pro vs Verity, co-parent · BATCH_FIXES + WORKING.md.
### T-089 · P3·OWNER·UX · Holding-page blueprint decision · WORKING.md.
### T-090 · P3·OWNER·SECURITY · Billing gate key `billing.stripe.portal` vs `billing.portal.open` · WORKING.md.
### T-091 · P2·OWNER·CODE · Post-deployment validation checklist scope (6 runtime tests) · WORKING.md.
### T-092 · P4·L·SCHEMA · Behavioral anomaly detection (Blueprint 10.3) — no table/RPC today · WORKING.md.
### T-093 · P3·OWNER·UX · Access code / promo launch strategy · WORKING.md.
### T-094 · P1·OWNER·SECURITY · Confirm admin owner seat before opening signups · WORKING.md.
### T-095 · P2·S·IOS · Rebuild adult iOS after middleware + `/api/kids/*` changes · Outstanding-1.
### T-096 · P3·S·CODE · `web/src/middleware.js:178` public-path skip silently expires long-idle sessions · Outstanding-1.
### T-097 · P1·S·SECURITY · Nested `/api/comments/[id]/*` error.message leaks (vote/flag/report/context-tag) — explicit subset of T-002 · Outstanding-2 #4.
### T-098 · P2·S·SECURITY · `web/src/app/api/kids/pair/route.js:69-88` kid-pair JWT trusts RPC `parent_user_id` w/o DB re-verify · Fresh-Check-1 #9.
### T-099 · P3·1L·UX · `web/src/app/page.tsx:27,396-397` `sanitizeIlikeTerm` strips `%` instead of escaping · Fresh-Check-1 #18.
### T-100 · P3·S·IOS · `VerityPostKids/VerityPostKids/ParentalGateModal.swift:26-27` parental gate only 132 unique sums · Fresh-Check-1 #19.
### T-101 · P4·1L·UX · reset-password "check spam" UI hint · Fresh-Check-1 #20.
### T-102 · P4·S·CODE · `web/src/app/messages/page.tsx:267-350` realtime `as unknown as 'system'` coercions · Fresh-Check-2 #5.
### T-103 · P4·S·CODE · `web/src/lib/appleReceipt.js:26` `cachedRootCert` no rotation · Fresh-Check-2 #7.
### T-104 · P2·1L·DB-DRIFT · [UNVERIFIED] verify live-DB `record_admin_action`+`require_outranks` signatures via `SELECT proname, pg_get_function_arguments(oid) FROM pg_proc WHERE proname IN (…)` · Outstanding-1.
### T-105 · P2·S·CODE · Clean git tree (`site/`→`web/` deletion noise) · Outstanding-1.
### T-106 · P3·1L·CODE · `web/src/app/page.tsx:83-125` fake `fb-*` UUIDs footgun (resolves w/ T-023) · Fresh-Check-1 #15.
### T-107 · P4·S·DB-DRIFT · `EXPECTED_BUNDLE_ID` hardcoded → `app_config` (table exists empty) · WORKING.md L-11.
### T-108 · P2·M·SECURITY · RLS multi-user E2E test · WORKING.md.
### T-109 · P3·S·CODE · Realtime disruption recovery test · WORKING.md.
### T-110 · P2·M·SECURITY · Client-cache staleness validation (upgrade/cancel/mute) · WORKING.md.

---

## Summary

**Total tasks:** 110 (T-061..T-066 grouped = 6; T-082..T-085 grouped = 4; all enumerated).
**By priority:** P0 = 5 · P1 = 23 · P2 = 32 · P3 = 36 · P4 = 14
**By lens:** SECURITY ≈ 22 · CODE ≈ 32 · DB-DRIFT ≈ 10 · SCHEMA ≈ 8 · UX ≈ 22 · IOS ≈ 16
**Unverified (Agent 3 to verify):** T-009, T-013, T-014, T-017, T-018, T-019, T-020, T-031, T-032, T-104 — 10 items.

**Cross-cuts Agent 3 should double-check:**
1. T-012 CORS — confirm `PROD_ORIGIN` env across Vercel previews.
2. T-049 — re-read `api/admin/users/[id]/permissions/route.js` lines 200–270 for reason/expires enforcement + audit-log transactional semantics.
3. T-104 — run the pg_proc query.
4. T-013 — open 3 auth route files at named lines.
5. T-017..T-020 — open each Swift file at the claimed line; `xcodebuild` signal confirms only 3 files were converted in Batch 8.
