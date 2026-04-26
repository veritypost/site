# LiveProgressSheet — T-050: Measure and record web bundle-size baseline
Started: 2026-04-26

## User Intent
Capture the `next build` output (route sizes + First Load JS per route) before PRELAUNCH UI work starts. Write the data to `web/bundle-size-baseline.txt` with a header noting the date (2026-04-26) and Next.js version. Commit the file. Purpose: establish a regression reference point before the surface-rebuild sprint begins, since bundle size directly affects AdSense CWV scores and bounce rate.

## Live Code State

### Build configuration
- **Next.js version**: `^14.2.0` (package.json line 39), actual installed version TBD from node_modules
- **Build script**: `next build` (package.json line 8)
- **next.config.js**: Wraps config with `withSentryConfig` but soft-fails if `@sentry/nextjs` not available outside production (`VERCEL_ENV !== 'production'`). Build will proceed without Sentry env vars locally.
- **Env vars present in .env.local**: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET, NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_SITE_MODE, PREVIEW_BYPASS_TOKEN, CRON_SECRET, HEALTH_CHECK_SECRET, EVENT_HASH_SALT, RATE_LIMIT_ALLOW_FAIL_OPEN
- **Stripe env vars**: NOT present — any Stripe-touching routes will fail at runtime but build should succeed
- **No `bundle-size-baseline.txt` exists** — file does not exist yet

### Helper Brief
- **Success criteria**: `web/bundle-size-baseline.txt` exists, contains the dated header, and shows meaningful per-route First Load JS sizes (not just an error log).
- **Risk**: Build may fail if missing env vars cause compile-time errors (unlikely with Next.js — env var absence only causes runtime 500s, not build failures for most routes). Sentry is soft-fail outside production.
- **Adjacent considerations**: No DB changes, no iOS changes, no permission changes. Pure measurement task. Tier: trivial. Surfaces: web only.
- **What the intake agent might miss**: The `next build` output includes both the per-route size table AND a "First Load JS shared by all" summary line. Both should be captured. The baseline file should note what env vars were present/absent so future comparisons are apples-to-apples.

## Contradictions
None found.

## Agent Votes
- Planner: APPROVE
- Reviewer: APPROVE
- Final Reviewer: APPROVE
- Consensus: 3/3 APPROVE

## 4th Agent (if needed)
N/A

## Implementation Progress
- [x] Run `cd web && SENTRY_DISABLE_WEBPACK_PLUGIN=1 npx next build 2>&1` — SUCCESS (212 pages)
- [x] Extract route size table from output
- [x] Write web/bundle-size-baseline.txt with header + data
- [x] Commit e147426

## Completed

SHIPPED 2026-04-26
Commit: e147426
Files: web/bundle-size-baseline.txt (new), Workbench/LiveProgressSheet_T-050.md (new)
Result: 212 routes, First Load JS shared 258 kB, Middleware 141 kB.
Heaviest user pages: /profile/settings 352 kB, /story/[slug] 349 kB.
Build note: Normal `npx next build` fails at "Collecting page data" due to @sentry/nextjs
8.40.0 + Next.js 14.2.35 chunk-path conflict. SENTRY_DISABLE_WEBPACK_PLUGIN=1 used for
measurement. Not a regression — Vercel cloud builds are unaffected. Documented in baseline file.
