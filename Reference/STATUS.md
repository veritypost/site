# STATUS

What the product IS. Not what's left.

- Active work → **`Current Projects/MASTER_TRIAGE_2026-04-23.md`** (FIX_SESSION_1.md retired; absorbed there).
- How to work in this codebase → **`CLAUDE.md`** at repo root.
- Most recent session → **`Sessions/04-25-2026/Session 1/SESSION_LOG_2026-04-25.md`** (bug-hunt + UI polish; 11 commits, 8 bugs closed, schema/177).

## One-line summary

Verity Post is a permission-driven news platform (web + iOS) whose admin console can toggle capabilities on any user and have the change reflect across every product surface on next navigation.

## Platforms

| Platform | Code | Stack |
|---|---|---|
| Web (adult, desktop + mobile) | `web/` | Next.js 14 app router, TypeScript |
| iOS adult | `VerityPost/` | SwiftUI, iOS 17+ |
| iOS kids | `VerityPostKids/` | SwiftUI, iOS 17+ (COPPA, custom JWT) |
| Admin console | `web/src/app/admin/*` + `web/src/app/api/admin/*` | 39 pages + 27 DS components, highest blast radius — every change runs the 6-agent ship pattern |
| Database | Supabase project `fyiwulqphgmoqullmrfn` | 100+ tables (use MCP for live count) |
| Hosting | Vercel | Deploys on push to `main` (verified 2026-04-21) |
| AI pipeline | `web/src/lib/pipeline/` + `web/src/app/api/admin/pipeline/*` + `web/src/app/api/newsroom/*` | F7 — 13 helper files, 12-step orchestrator, end-to-end live; Newsroom redesign 2026-04-22 (`b269e17`): single-page workspace with adult/kid tabs, dynamic taxonomy + prompt-preset library, inline cluster mutations (move/merge/split/dismiss), 14-day auto-archive |
| Profile + Leaderboard | `web/src/app/profile/page.tsx` + `web/src/app/u/[username]/page.tsx` + `web/src/lib/leaderboardPeriod.ts` + `VerityPost/VerityPost/{ProfileView,PublicProfileView,LeaderboardView,LeaderboardPeriod}.swift` | Audit-consensus parity pass 2026-04-23 (SHA TBD), 7-agent review — canonical 5-stat set (Articles read / Quizzes passed / Comments / Followers / Following) on all 4 surfaces with comma-thousands formatting, public-profile stats gated on `users.show_activity`, shared `LeaderboardPeriod` (rolling -7d / -30d / null) replaces inline date math + iOS calendar-bucket shape |
| Home page | `web/src/app/page.tsx` + `VerityPost/VerityPost/HomeView.swift` + `schema/144_articles_hero_pick.sql` | Hand-curated dated front page rebuilt 2026-04-23 per `Future Projects/09_HOME_FEED_REBUILD.md` (staged: hero-pick boolean proxy for `front_page_state` until editor system ships). 1 hero (32pt serif, longer dek) + up to 7 supporting (22pt serif, hairline dividers, no card chrome). Masthead = wordmark + editorial date (America/New_York) + "Today's stories, chosen by an editor." Page ends with "Browse all categories →". Breaking strip kept above masthead per spec. Stripped: category pills, search overlay, ad slots, Load more, RecapCard. iOS streak already moved to ProfileView. Hero toggle in `/admin/story-manager` ("Today's hero" button). Audit trail: `hero_pick_set_by` + `hero_pick_set_at` populated server-side. |

## Permission system (product DNA)

- **928 active permissions** in `permissions`, keys `surface.action[.scope]`
- **10 permission sets:** anon, unverified, free, pro, family, expert, moderator, editor, admin, owner
- **Grants:** role → set, plan → set, direct user grant, per-permission scope override
- **Resolver:** `compute_effective_perms(user_id)` returns every key with `granted` + `granted_via` + source detail
- **Server gate:** `requirePermission('key')`. **Client gate:** `hasPermission('key')`.
- **Invalidation:** admin write bumps `users.perms_version` → clients refetch on next navigation.
- **Matrix source of truth:** `~/Desktop/verity post/permissions.xlsx` (outside repo). Sync: `scripts/import-permissions.js --apply`. xlsx and DB must stay 1:1.

## Architecture

Three apps, one DB, shared Supabase.

- **Web is adult-only.** `/kids/*` on web redirects authed users to `/profile/kids` (parent management) and anon users to `/kids-app` (marketing landing). No kid-facing web UI.
- **Adult iOS + web** use GoTrue sessions.
- **Kids iOS** uses a server-minted custom JWT with `is_kid_delegated: true` + `kid_profile_id` claims; RLS branches on those claims. Kid JWT never touches GoTrue.

## Key machinery (stay fluent)

| File | Purpose |
|---|---|
| `web/src/middleware.js` | auth gate + CORS + CSP (enforce) + `/kids/*` redirect |
| `web/src/lib/auth.js` | `requireAuth`, `requirePermission`, `requireVerifiedEmail`, `requireNotBanned` |
| `web/src/lib/permissions.js` | client `hasPermission` + dual cache + version polling |
| `web/src/lib/roles.js` | canonical role Sets + DB-live `getRoles`/`rolesAtLeast` |
| `web/src/lib/rateLimit.js` | `checkRateLimit(svc, {key, policyKey, max, windowSec})` — fail-closed in prod, fail-open in dev |
| `web/src/lib/supabase/server.ts` | `createClient` (RLS), `createServiceClient` (bypass), `createClientFromToken` (bearer), `createEphemeralClient` |
| `web/src/lib/adminMutation.ts` | canonical admin-mutation shape: `requireAdminOutranks` + `recordAdminAction` |
| `web/src/lib/apiErrors.js` | `safeErrorResponse` — maps Postgres errors to stable client copy |
| `web/src/lib/siteUrl.js` | prod-throw fallback for `NEXT_PUBLIC_SITE_URL` |
| `web/src/lib/stripe.js` | fetch-only Stripe wrapper + HMAC webhook verify |
| `web/src/lib/appleReceipt.js` | Apple StoreKit 2 JWS chain verify (ES256, vendored root CA) |
| `web/src/lib/kidPin.js` | PBKDF2 100k / salted kid PIN hashing + legacy SHA-256 rehash |
| `web/src/lib/cronAuth.js` | `verifyCronAuth` — `x-vercel-cron` header OR constant-time bearer |
| `web/src/lib/pipeline/*` | F7 AI pipeline — 12-step orchestrator helpers (cluster, story-match, scrape, clean-text, editorial-guide, call-model, cost-tracker, persist-article, plagiarism-check, prompt-overrides, render-body, errors, logger) |
| `web/src/app/api/newsroom/ingest/run/route.ts` | F7 ingest — RSS poll → discovery_items → preCluster → story-match → feed_clusters (audience-routed; manual-trigger from /admin/newsroom) |
| `web/src/app/api/admin/pipeline/generate/route.ts` | F7 12-step generate orchestrator — cluster lock → audience_safety_check → headline+summary+categorization → body → grounding → plagiarism → timeline → quiz → quiz_verification → persist |
| `web/src/app/api/cron/pipeline-cleanup/route.ts` | F7 daily cron (Hobby tier) — 4 sweeps: orphan runs > 10 min, items in `generating` > 10 min, expired cluster locks > 15 min, 14-day cluster expiry (skips locked_at + `generation_state='generating'`) |
| `schema/reset_and_rebuild_v2.sql` | canonical DR replay (see `Current Projects/FIX_SESSION_1.md` — drift known) |

## Dev tooling

- **Lint/format/hook:** ESLint 8 + Prettier 3 + Husky 9 (`web/.husky/`) — shipped 2026-04-21 (FIX_SESSION_1 #20). Configs: `web/.eslintrc.json` (legacy `.eslintrc.*` format, forced by Next 14 autodiscover), `web/.prettierrc.json`, `web/.prettierignore` (temporary `src/app/admin/` exclusion until #16). Scripts: `npm run lint`, `lint:fix`, `format`, `format:check`. Pre-commit runs `lint-staged`. `.git-blame-ignore-revs` at repo root for autofix-sweep commits.

## Canonical route shape

Every mutation route:
```
requirePermission → createServiceClient → checkRateLimit → body parse/validate → RPC or direct write → safeErrorResponse on catch → response
```
Admin mutations additionally: `require_outranks(target_user_id)` + `recordAdminAction(...)`.
Rate-limited 429 responses include `Retry-After: <windowSec>`.

## Brand rules

- **No emojis on adult surfaces.** Adult web, adult iOS, admin pages, emails, commit messages, dev docs — all plain text. Kids iOS is the only surface where emojis are intentional.
- **Paid tier names are canonical:** `verity`, `verity_pro`, `verity_family`, `verity_family_xl`. Display labels map from DB.
- **Dates are ISO in code, human-readable in UI.**

## Test accounts

After superadmin removal (TODO #1): **19 test + 30 community + 2 kids** (Emma, Liam under `test_family`). Seeds in `test-data/accounts.json`. Manual SQL is the canonical seed path; `scripts/seed-test-accounts.js` was retired (file already absent on disk; verified 2026-04-23).

## E2E test infrastructure (added 2026-04-25)

- **Web:** Playwright suite at `web/tests/e2e/` — 480+ tests across chromium + mobile-chromium projects. 468 passing, 14 known flakes (mobile auth-form races + 2 dismiss-cluster RPC mismatches), 14 intentional skips.
- **iOS:** XCUITest targets at `VerityPost/VerityPostUITests/` + `VerityPostKids/VerityPostKidsUITests/`. Wired via XcodeGen `project.yml`. 5 + 4 = 9 smoke tests, all green. Both apps `xcodebuild archive` clean.
- **Seed harness:** `web/tests/e2e/_fixtures/seed.ts` deterministically populates 10 roles (owner / admin / editor / moderator / expert / journalist / free / verity / verity_pro / parent) + cross-cutting state (subscriptions, audit_log, reports, expert app, achievements, follows, notifications, bookmarks, kid streak, comments, pair code, article + quiz). Stable IDs across runs; `vp-e2e-seed-*@veritypost.test` emails (excluded from cleanup).
- **Deep specs:** admin-deep (24), admin-deep-batch2 (40), profile-settings-deep (16), kids-deep (17), expert-deep (13), social-deep (16), seeded-reader-flow (5), seeded-roles (18).
- **Run locally:** `cd web && E2E_BASE_URL=http://localhost:3000 npm run test:e2e` (reuses existing dev server on `:3000`). iOS: `xcodebuild test -scheme VerityPost -destination 'platform=iOS Simulator,name=iPhone 17'`.
