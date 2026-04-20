# Changelog

All notable changes, newest first. Loosely follows [Keep a Changelog](https://keepachangelog.com/) — Added / Changed / Fixed / Security / Removed sections per dated entry. Commit SHAs reference `git log`.

---

## 2026-04-20 — Post-fired-dev audit + autonomous cleanup

The lead developer was let go mid-project. This session: full read-only audit → 30+ autonomous fixes → consolidation of the TODO/status surface. Every item is verified via tsc / xcodebuild / live-DB query before landing.

### Security

- **Kids Keychain accessibility level fixed** (`9faf136` earlier, commit `7e95976`)
  - `VerityPostKids/VerityPostKids/PairingClient.swift:170` — `kSecAttrAccessibleAfterFirstUnlock` → `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`. Adult app's `Keychain.swift:20` was already correct; kids alone had the weaker value. Kid JWT is no longer readable when the device is locked.
  - TODO item: #14

- **`error.message` leaks closed in 3 admin/auth routes** (`52a11f1`)
  - `web/src/app/api/admin/users/[id]/ban/route.js:38,57` — both rankErr + upErr now routed through `safeErrorResponse`
  - `web/src/app/api/admin/users/[id]/plan/route.js:38,59,68` — rankErr + planErr + upErr same
  - `web/src/app/api/auth/callback/route.js:58` — verified NOT leaking (server-side log only, no response body)
  - TODO item: #19

- **Sentry PII scrubber** (`f5b99e0`)
  - New `web/sentry.shared.js` — scrubs emails, IPs, Authorization/Cookie headers, `password`/`token`/`access_token`/`refresh_token`/`api_key`/`secret`/`stripe-signature`/`pin`/`pin_hash` body fields from every event
  - Wired into `sentry.client.config.js` (and later instrumentation.ts) via `beforeSend: scrubPII`
  - TODO item: #33

- **`/admin` now returns 404 for anon + non-staff** (`9faf136`)
  - Removed `/admin` from `web/src/middleware.js:12-17` `PROTECTED_PREFIXES`
  - `web/src/app/admin/layout.tsx` — `redirect('/login?next=/admin')` + `redirect('/')` → `notFound()` in both branches
  - New `web/src/app/admin/not-found.tsx` — branded "Nothing for you here" page
  - Effect: no more 302-to-login telling passerbys that `/admin` exists

- **Parental gate wired in VerityPostKids** (`91d6191`)
  - `VerityPostKids/VerityPostKids/ProfileView.swift:34,60` — Unpair button gated via `.parentalGate(isPresented:onPass:)`. Only sensitive action in the kids app (no external links, no IAP in binary, no settings changes outside unpair).
  - TODO item: #13

- **Kid PIN weak-pattern helper** (`012f41c`)
  - New `web/src/lib/kidPinValidation.js` — `isPinWeak()` + `validatePin()`. Blocks ~500+ guessable PINs (all-same, sequential ±1, doubled halves, mirrored, birth-year window) vs. the prior 14-entry hardcoded list
  - Replaced local `WEAK_PINS` sets in `api/kids/route.js`, `api/kids/set-pin/route.js`, `api/kids/trial/route.js`, `profile/kids/page.tsx`
  - TODO item: #25

### Database

- **Migration 105 — superadmin role removed** (`57909e6`, already live)
  - `schema/105_remove_superadmin_role.sql` (new) — deletes role + test_superadmin user (auth + public) + role_permission_sets rows. Bumps `perms_global_version`.
  - Code sites stripped: `web/src/lib/roles.js` (4 Sets + HIERARCHY map), `scripts/import-permissions.js:140` (role→set map), `scripts/preflight.js`/`seed-test-accounts.js` ROLE_MAP, `schema/reset_and_rebuild_v2.sql` (7 sites), `web/src/app/admin/layout.tsx`, `admin/moderation/page.tsx`, `api/admin/users/[id]/permissions/route.js`, `test-data/accounts.json`, `test-data/ACCOUNTS.md`
  - Test account count: 20 → 19 (19 test accounts + 30 community + 2 kids)

- **Migration 106 — kid_trial_freeze_notification** (`e8677c8`, NOT yet applied to live DB)
  - `schema/106_kid_trial_freeze_notification.sql` (new) — extends `freeze_kid_trial(uuid)` RPC to call `create_notification('kid_trial_expired', ...)` when the daily sweep cron fires. Parent gets in-app notification when the D44 kid trial auto-freezes.
  - Idempotent via `CREATE OR REPLACE FUNCTION`. Owner needs to paste into Supabase SQL Editor (TODO Owner-#5).
  - TODO item: #41

- **Seeds 101-104 applied to live DB** (`d1c25e3` + `scripts/apply-seeds-101-104.js`)
  - `rate_limits` table: 31 rows (all 31 API policyKeys)
  - `email_templates`: `data_export_ready` template added
  - `reserved_usernames`: 77 rows (system, brand, route names)
  - `blocked_words`: 34 rows (profanity + slurs with severity + action)
  - Applied via supabase-js service-role client, not SQL Editor

- **Settings seeded: `streak.freeze_max_kids`** (`d1c25e3`)
  - Value `2`, category `streaks`. Per D19 — max streak freezes per week for Family-plan kids. Surfaced by preflight as missing.

- **Admin audit trail extended** (`7c52f47`)
  - `api/admin/data-requests/[id]/approve/route.js` — now inserts `audit_log` with `action='data_request.approve'`
  - `api/admin/data-requests/[id]/reject/route.js` — `action='data_request.reject'` with reason in metadata
  - `api/admin/stories/route.js` — POST (`article.create`), PUT (`article.update`), DELETE (`article.delete`) all write audit rows via new `auditStoryAction` helper
  - Coverage: 23/73 → 28/73 admin routes audited. Remaining 12 (ad/recap/sponsor config routes) deferred as #23-partial.

### iOS (adult, `VerityPost/`)

- **StoreManager sync verifies HTTP 2xx** (`7e95976`)
  - `VerityPost/VerityPost/StoreManager.swift:211-252` — prior code logged non-2xx at debug-only and always posted `vpSubscriptionDidChange`. Now checks status code; non-2xx or throw posts the new `vpSubscriptionSyncFailed` notification with `userInfo[statusCode]`/`userInfo[error]`/`userInfo[productID]`; `vpSubscriptionDidChange` only fires on success.
  - New Notification.Name: `vpSubscriptionSyncFailed` at StoreManager.swift:24.
  - TODO item: #21

- **`checkEntitlements()` on scene-phase .active** (`b5b9af1`)
  - `VerityPost/VerityPost/VerityPostApp.swift:8-29` — `@Environment(\.scenePhase)` + `.onChange` block. Cross-device purchases (Stripe web → iOS backgrounded, device switch) now re-sync on foreground.
  - TODO item: #36

### iOS (kids, `VerityPostKids/`)

- **Dynamic Type across 90 call sites** (`d076a09`)
  - New `Font.scaledSystem(size:weight:design:relativeTo:)` helper in `VerityPostKids/VerityPostKids/KidsTheme.swift` uses `UIFontMetrics.default.scaledValue`
  - `sed -i 's/\.system(size:/\.scaledSystem(size:/g'` across all 11 kids Swift files
  - UIKit import added for `UIFontMetrics` + `UIFont.TextStyle`
  - TODO item: #29. App Store accessibility review blocker closed.

- **Silent insert catches now retry + log** (`4002723`)
  - `KidQuizEngineView.swift:228-242` — `quiz_attempts` insert: retry once after 1s, print both attempts' errors
  - `KidReaderView.swift:188-206` — `reading_log` insert: same pattern
  - Prior empty `catch {}` blocks silently lost score+streak data on network blips
  - TODO item: #18

- **`PairingClient.restore` surfaces apply failures** (`7e95976`)
  - `VerityPostKids/VerityPostKids/PairingClient.swift:127-140` — `try? await applySession(token:)` → explicit `do/catch` that clears local state + returns nil. Kid no longer browses anon after a silent session-restore failure.
  - TODO item: #22

- **`PairCodeView` classifies errors + cooldown countdown** (`b5b9af1`)
  - Generic catch no longer leaks raw Swift error descriptions to kid UI; shows "Something went wrong. Please try again."
  - On `PairError.rateLimited`, 1Hz timer displays `Retry in Ns` countdown; Pair button disabled during lockout
  - TODO items: #42 + #43

- **Kid article fetch belt-and-suspenders filter** (`7e95976`)
  - `KidReaderView.swift:154-167` — added `.eq("is_kids_safe", value: true)` to the article fetch. Still relies on RLS; this is defense-in-depth if the policy ever drifts.
  - TODO item: #26

### Web

- **`admin/breaking` direct DB write → /api/admin route** (`f0cadbc`)
  - New `web/src/app/api/admin/broadcasts/alert/route.ts` — full article-creation + audit + push fan-out via canonical admin-mutation shape (requirePermission → checkRateLimit 5/10min → service client → insert article → recordAdminAction → send_breaking_news RPC)
  - `web/src/app/admin/breaking/page.tsx:sendAlert` — ~70 lines of direct client-side insert replaced with ~25 lines fetching the new route
  - Zero admin direct DB writes remain (`grep "supabase\.from\([^)]*\)\.(insert|update|upsert|delete)" web/src/app/admin` = 0)
  - TODO item: #12

- **12 admin pages swapped to `ADMIN_ROLES.has()`** (`a373460`)
  - Inline `['owner', 'admin']` arrays replaced with import from `@/lib/roles`
  - Files: `admin/reader/page.tsx:106`, `admin/words/page.tsx:57`, `admin/plans/page.tsx:100`, `admin/email-templates/page.tsx:63`, `admin/features/page.tsx:159`, `admin/cohorts/page.tsx:157`, `admin/stories/page.tsx:87-89` (plus deleted redundant `const allowed = new Set(...)`), `admin/support/page.tsx:215`, `admin/story-manager/page.tsx:162`, `admin/streaks/page.tsx:83`, `admin/webhooks/page.tsx:95`, `admin/promo/page.tsx:89`
  - TODO item: #17

- **`Retry-After` header on 2 rate-limited routes** (`52a11f1`)
  - `web/src/app/api/messages/route.js:41` — 429 branch now emits `Retry-After: 60`
  - `web/src/app/api/ads/impression/route.js:49` — same
  - TODO item: #30

- **`/api/account/onboarding` routed through `update_own_profile` RPC** (`7e95976`)
  - `web/src/app/api/account/onboarding/route.js:11-23` — prior code wrote to `public.users` directly via service client; now uses authed cookie-scoped client + RPC, matching the 7 other self-profile write sites
  - TODO item: #20

- **Sentry deprecated config → `instrumentation.ts`** (`633ccaa`)
  - New `web/src/instrumentation.ts` — Next.js `register()` hook; both `nodejs` + `edge` runtime init routes live here now
  - Deleted: `web/sentry.server.config.js`, `web/sentry.edge.config.js`
  - Kept: `web/sentry.client.config.js` (still the supported browser entry point)
  - Dev server boot warning gone
  - TODO item: #27

- **`themeColor` moved to viewport export** (`52a11f1`)
  - `web/src/app/layout.js:46-54` — moved from the `metadata` export to the existing `viewport` export per Next 14 deprecation. Dev server warning gone.
  - TODO item: #28

### Scripts

- **3 scripts updated to use `web/` instead of deleted `site/`** (`75760cf`)
  - `scripts/preflight.js` — SITE_DIR, comments, vercel.json warning
  - `scripts/seed-test-accounts.js` — SITE_DIR + comment
  - `scripts/check-stripe-prices.js` — SITE_DIR, 3 error-message strings
  - Fixed preflight display bug: `roles: 8/9` → `roles: 8/8` (hardcoded 9 was leftover)
  - Fixed preflight cron expectation: added `send-push`, `check-user-achievements`, `flag-expert-reverifications`
  - TODO items: #10 + #47

- **`scripts/import-permissions.js` path parameterized** (`f5b99e0`)
  - Line 57 no longer hardcodes `/Users/veritypost/Desktop/verity post/permissions.xlsx`. Resolution order: `PERMISSIONS_XLSX_PATH` env → `matrix/permissions.xlsx` in repo → legacy desktop path. Exits with clear error if none exist.
  - TODO item: #34

- **New: `scripts/apply-seeds-101-104.js`** (`d1c25e3`)
  - Applies seeds 101-104 + streak.freeze_max_kids via supabase-js service-role client. Idempotent. One-shot replacement for needing SQL Editor access on the 4 pure-INSERT migrations.

### Documentation

- **`docs/runbooks/CUTOVER.md` rewritten** (`01ff9d4`)
  - Prior runbook listed 3 crons (actual 9), stopped at phase-12 migrations (actual: 105), all paths referenced deleted `site/` folder. Archived as `archive/2026-04-20-consolidation/CUTOVER.md.old`.
  - New CUTOVER: 7-step ordered checklist (prerequisites → backup → migrations → preflight → deploy → smoke → monitor → rollback). References current cron list + real script paths.
  - TODO item: #37

- **`docs/runbooks/TEST_WALKTHROUGH.md` rewritten** (`01ff9d4`)
  - Prior walkthrough used wrong SQL path (`01-Schema/032_...`), wrong test accounts (`@vp.test` / password `password`). Archived as `.old`.
  - New walkthrough: 13-step smoke path with correct seed data emails + tier-specific passwords from `test-data/accounts.json`.
  - TODO item: #38

- **Doc drift sweep** (`2329147`)
  - `web/src/middleware.js:137` — CSP flip date `2026-04-21` → `2026-04-20`
  - `web/next.config.js:8` — `site/src/middleware.js` → `web/src/middleware.js`
  - `web/src/lib/appleReceipt.js:17,45` — `site/src/lib/certs/` → `web/src/lib/certs/`
  - `web/src/lib/certs/README.md` — 3 site→web path fixes
  - `README.md:16` — "VerityPostKids is a placeholder" → accurate description
  - `docs/reference/Verity_Post_Design_Decisions.md` D33 — dropped `Superadmins` from expert back-channel list
  - `docs/runbooks/ROTATE_SECRETS.md` — 10 `site/.env.local` → `web/.env.local`
  - TODO item: #44

- **Archived 5 obsolete planning/history docs** (`2329147`)
  - `docs/planning/FUTURE_DEDICATED_KIDS_APP.md` → `archive/2026-04-20-consolidation/` (plan for a fork that already happened)
  - `docs/history/PROFILE_FULL_FLOW.md` → archive (references retired community-notes/reactions/Premium/superadmin)
  - `kidsactionplan.md` → archive (Pass 4 "DONE" was misleading)
  - `docs/runbooks/CUTOVER.md.old`, `TEST_WALKTHROUGH.md.old` → archive
  - TODO item: #45

- **TODO.md consolidated** (`dc72237`, `b87925e`, `efa170a`)
  - 5 retired task docs archived: `TASKS.md`, `DONE.md`, `05-Working/NEXT_SESSION.md`, `BATCH_FIXES_2026_04_20.md`, `docs/runbooks/DEPLOY_PREP.md`
  - Renumbered 1–51, then collapsed to a single owner to-do + autonomous list
  - Final state: 10 owner items + 6 autonomous items + post-launch notes

- **`docs/product/FEATURE_LEDGER.md` verified current** — no changes needed.
- **`docs/planning/product-roadmap.md`, `PERMISSION_MIGRATION.md`, `UI_IMPROVEMENTS.md`** — too large to fully read; sampled and left as-is.

### Verified / no change needed

- **`plans.apple_product_id` vs `APP_STORE_METADATA.md`** (`e8677c8`) — all 8 IAP IDs match verbatim in live DB. No drift. TODO #39.
- **Family leaderboard kid-JWT RLS** (`47d71a5`) — live-tested with 8-kid household + simulated kid JWT: siblings ARE visible. Walkthrough agent's claim was wrong. TODO #24.
- **`/search` anon CTA** (`47d71a5`) — anon users have `search.articles.free` permission by design (D26 basic-search). Page IS the anon state; no CTA needed. TODO #50.
- **`story/[slug]` unverified-logged-in CTA** (`cf19cbf`) — traced code; logged-in users hit `ArticleQuiz` which has its own permission-gated flow, not the anon sign-up branch. TODO #51.
- **`story/[slug]` console.error** (`cf19cbf`) — lines flagged as "noise" are on actual error paths; intentional logging. TODO #48.
- **`/api/cron/sweep-kid-trials`** (`e8677c8`) — traced end-to-end; freeze RPC fires correctly. Missing piece was parent notification → migration 106 written.
- **Path/API mismatches** (`e8677c8`) — three claimed mismatches dissolved on investigation. `/profile/settings/notifications` not referenced in live code. `/api/family/weekly-report` vs `/api/reports/weekly-reading-report` — both legit (D24 family vs D25 per-user). `apply-to-expert` — zero references. TODO #40.

### Removed

- `web/sentry.server.config.js` (superseded by instrumentation.ts)
- `web/sentry.edge.config.js` (superseded)
- Inline `WEAK_PINS` Sets in 4 files (replaced by shared helper)
- `const allowed = new Set(['owner', 'admin'])` in `admin/stories/page.tsx` (replaced by `ADMIN_ROLES`)

### Live DB state changes this session

| When | Change | How |
|---|---|---|
| 2026-04-20 | Migration 105 (superadmin removal) committed to git + applied to live DB | Live: via prior dev (pre-session); disk: via `57909e6` |
| 2026-04-20 | Seeds 101-104 applied to live DB | `scripts/apply-seeds-101-104.js` via service-role client |
| 2026-04-20 | Setting `streak.freeze_max_kids` = 2 seeded | Same script |
| 2026-04-20 | Migration 106 (kid_trial freeze notification) **NOT YET APPLIED** to live DB | Waiting on owner SQL Editor paste |

### TODO item reference summary

Closed this session: #10, #11, #12, #13, #14, #15, #17, #18, #19, #20, #21, #22, #23 (partial), #24, #25, #26, #27, #28, #29, #30, #33, #34, #36, #37, #38, #39, #40, #41, #42, #43, #44, #45, #47. Plus false-finding invalidation of #48, #50, #51.

Remaining autonomous: #23 (partial — 12 ad/recap/sponsor routes), #31, #32, #35, #46, #49.

Remaining owner: see TODO.md §Owner to-do (10 items).

---

## Before 2026-04-20

See `archive/2026-04-20-consolidation/DONE.md` for the pre-session shipped log (also contains some claims that turned out stale — see TODO §Reclassified notes in the 2026-04-20 entry). Session commits prior to the fired-dev cleanup are visible via `git log 5efff0e..`.
