# TODO

Outstanding work. P0 ship-blocker · P1 high · P2 should-fix · P3 polish · OWNER = non-engineering.

Active list only. When done: delete the block. Git log is the history.

## Latest bench verification (2026-04-20, full developer-style audit)

- `cd web && npx tsc --noEmit` → exits 0. Typecheck clean.
- `xcodebuild VerityPost -destination 'name=iPhone 17'` → BUILD SUCCEEDED.
- `xcodebuild VerityPostKids -destination 'name=iPhone 17'` → BUILD SUCCEEDED.
- Secrets: `git ls-files | grep .env` = 0. `.gitignore` covers `.env*`, `*.p8`, `*.pem`, `*.key`, `node_modules/`, `.next/`, `.DS_Store`, `.vercel/`.
- No hardcoded credentials found in web source, scripts, or either iOS app.
- Zero `'superadmin'` references in `web/src/types/database.ts`.
- Zero `dangerouslySetInnerHTML` across non-admin pages.
- 172 API routes: no critical RLS/auth/money bypasses found. Canonical shape followed in ≥97% of routes.
- 105 migrations: no `DELETE`/`UPDATE` without `WHERE`, no `DROP CASCADE` unsafe, `CREATE INDEX IF NOT EXISTS` everywhere.
- Both iOS apps: no third-party analytics linked, no IDFA usage, no hardcoded secrets.

Remaining items below are real defects + remaining launch work.

---

## P0 — before any deploy

### 1 — Fix scripts pointing at the deleted `site/` folder
`scripts/preflight.js:25`, `scripts/seed-test-accounts.js:17`, `scripts/check-stripe-prices.js:4,35,67`. Change `'../site'` → `'../web'`. Until this is fixed, `preflight.js` (advertised as the cutover gate in `CUTOVER.md`) exits 1 before contacting the DB.
**Done when:** `grep -rn "'\.\./site'" scripts/` returns 0.

### 2 — Run fixed preflight.js against live DB
Capture output. Every failure becomes a new item below.
**Done when:** preflight exits 0, or every reported failure has a block here.

### 3 — Migrate `admin/breaking/page.tsx:136` off direct DB write
Only surviving admin page that calls `supabase.from(...).insert(...)` directly from the browser. No rank guard, no audit. Mirror the canonical admin-mutation shape via a new route under `/api/admin/broadcasts/`.
**Done when:** `grep "supabase\.from\([^)]*\)\.(insert|update|upsert|delete)" web/src/app/admin` = 0.

### 4 — Wire `ParentalGateModal` into VerityPostKids
`VerityPostKids/VerityPostKids/ParentalGateModal.swift` — component fully built, zero callers. Apple rejects Kids Category apps without a parental gate before IAP / external links / settings changes.
**Done when:** `grep -r "ParentalGateModal()" VerityPostKids/` shows ≥ 3 call sites covering IAP, external URLs, and settings.

### 4b — Fix kids Keychain accessibility level
`VerityPostKids/VerityPostKids/PairingClient.swift:170` — kid JWT is stored with `kSecAttrAccessibleAfterFirstUnlock`. This means the token is accessible by processes whenever the device has been unlocked once since boot, even when currently locked. Adult app's `Keychain.swift:20` already uses the correct `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` — kids must match.
**Done when:** `grep kSecAttrAccessible VerityPostKids/` shows only `WhenUnlockedThisDeviceOnly`. COPPA audit bar.

### 5 — (OWNER) Apply seed SQLs 101–104 to live DB
```
schema/101_seed_rate_limits.sql
schema/102_seed_data_export_ready_email_template.sql
schema/103_seed_reserved_usernames.sql
schema/104_seed_blocked_words.sql
```
All idempotent. Until applied: signup accepts `admin`/`root`/`owner` as usernames, profanity filter is a no-op, `data_export_ready` emails silently drop, no DB-side rate-limit overrides.

### 6 — (OWNER) Rotate live secrets
Supabase service-role key, Stripe live secret, Stripe webhook secret. Ex-dev had access.

### 7 — (OWNER) Vercel env vars
Set in production + preview scopes:
- `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` — build fails hard without these.
- `NEXT_PUBLIC_SITE_URL=https://veritypost.com` — password-reset + verification emails point at `localhost:3333` without it.
- `SUPABASE_JWT_SECRET` — required to sign the custom kid JWT at `/api/kids/pair`. Copy from Supabase dashboard → Settings → API → JWT Secret. Without it, kids iOS pairing returns 500.

### 8 — (OWNER) Enable HIBP in Supabase Auth dashboard
Without it, signup accepts known-leaked passwords.

### 9 — (OWNER) Publish ≥10 real articles; delete 5 `Test:` placeholders
`select * from articles where is_published=true and title ilike 'test%'` should return 0 rows before launch.

### 10 — (OWNER) Audit Supabase admin/owner seats
```sql
select u.email, r.name, ur.granted_at
from user_roles ur
join users u on u.id = ur.user_id
join roles r on r.id = ur.role_id
where r.name in ('owner', 'admin')
order by r.name, ur.granted_at;
```
Revoke anyone you don't personally recognize.

### 11 — (OWNER) Audit Stripe dashboard
Webhook endpoints, API keys (including restricted), Connect accounts, team members. Anything the ex-dev may have added.

### 12 — (OWNER) Audit Vercel team + env-var change history
Remove ex-dev from team. Scan env-var changes for unexpected entries.

---

## P1

### 13 — Fix `package.json` TypeScript pin
`web/package.json:25` — `"typescript": "6.0.3"` — that version does not exist. Fresh `npm install` fails. Also `@types/react: 19.2.14` with `react: ^18.3.0` — types ahead of runtime.
**Done when:** `rm -rf web/node_modules && cd web && npm install && npx tsc --noEmit` succeeds.

### 14 — Reconcile `schema/reset_and_rebuild_v2.sql` with live DB
DR-replay from scratch produces a weaker DB than live:
- Migrations 092 (RLS lockdown) + 093 (RPC actor lockdown) live in `archive/2026-04-19-prelaunch-sprint/round_{a,b}_migration.sql`, not in `schema/` as numbered files.
- Several live-only migrations never hit disk (`grant_anon_free_comments_view`, `add_require_outranks_rpc`, etc.).
- `resolve_username_to_email` RPC definition (hardened by migration 060) is missing from the DR replay.
- `reset_and_rebuild_v2.sql:3384-3385` seeds settings keys `context_pin.min_tags` / `context_pin.threshold_pct`; live uses `context_pin_min_count` / `context_pin_percent`.
**Done when:** a fresh Supabase project replayed from disk matches live shape.

### 15 — Swap 12 admin pages off inline `['owner', 'admin']` arrays
```
web/src/app/admin/reader/page.tsx:106
web/src/app/admin/words/page.tsx:57
web/src/app/admin/plans/page.tsx:100
web/src/app/admin/email-templates/page.tsx:63
web/src/app/admin/features/page.tsx:159
web/src/app/admin/cohorts/page.tsx:157
web/src/app/admin/stories/page.tsx:87
web/src/app/admin/support/page.tsx:215
web/src/app/admin/story-manager/page.tsx:162
web/src/app/admin/streaks/page.tsx:83
web/src/app/admin/webhooks/page.tsx:95
web/src/app/admin/promo/page.tsx:89
```
Mechanical: import `ADMIN_ROLES` from `web/src/lib/roles.js`, swap to `ADMIN_ROLES.has(role)`.

### 16 — Fix silent insert failures in VerityPostKids (data loss)
`VerityPostKids/VerityPostKids/KidQuizEngineView.swift:228-232` — quiz_attempts insert in empty `catch {}`.
`VerityPostKids/VerityPostKids/KidReaderView.swift:183-190` — reading_log insert same pattern.
On network failure: kid sees their score go up locally, server sees nothing, leaderboard + streak silently drift. Add logging, retry, and a parent-visible telemetry path.

### 17 — (OWNER) Apple Developer account
Gates all iOS publishing — App Store Connect products, APNs `.p8`, `apple-app-site-association` upload, TestFlight. Code is ready; single owner step.

### 17b — Fix `error.message` leaks in 3 admin/auth routes
Prior T-013 sweep missed these (different pattern — catch-block message pass-through vs. `{error}` destructure):
- `web/src/app/api/admin/users/[id]/ban/route.js:57` — returns `upErr.message` in body.
- `web/src/app/api/admin/users/[id]/plan/route.js:59,68` — returns `planErr.message` + `upErr.message`.
- `web/src/app/api/auth/callback/route.js:47` — auth path leaks error.message (more sensitive).
**Do:** route through `safeErrorResponse` with a `[route-tag]` + generic client copy.
**Done when:** `grep "NextResponse.json.*error.*message" web/src/app/api/admin/users/[id]/ban web/src/app/api/admin/users/[id]/plan web/src/app/api/auth/callback` = 0.

### 17c — `/api/account/onboarding` uses direct `users.update()`
`web/src/app/api/account/onboarding/route.js:17` — writes to `public.users` directly. The `reject_privileged_user_updates` trigger now blocks non-privileged-column updates from non-admins, but the route should also go through `public.update_own_profile(p_fields jsonb)` like the 7 other self-profile write sites.
**Done when:** route uses the RPC, not a direct `.update()`.

### 17d — `StoreManager.swift` syncPurchaseToServer doesn't verify HTTP 200
`VerityPost/VerityPost/StoreManager.swift:211-250` — `syncPurchaseToServer` logs non-2xx responses to debug only; the local flow continues as if purchase synced. A 4xx/5xx means the server never recorded entitlement, user paid but stays on prior tier.
**Do:** check `httpResponse.statusCode` in 200..<300; retry or surface error otherwise.

### 17e — `PairingClient.swift:132` silent JWT apply failure
`VerityPostKids/VerityPostKids/PairingClient.swift:132` — `restore()` calls `try? await applySession(token:)`. If the token injection fails (e.g., network blip during restore), the session silently reverts to anon; kid browses as unauthenticated with no warning to parent.
**Do:** surface the failure. Either show a "couldn't restore session, re-pair device" screen or retry with backoff.

---

## P2

### 18 — Dynamic Type migration in VerityPostKids (86 sites, 11 files)
`.font(.system(size: N))` hardcodes that ignore accessibility settings. App Store accessibility review blocker; Kids Category is stricter. Distribution:
```
KidQuizEngineView 13, ParentalGateModal 11, ExpertSessionsView 11,
QuizPassScene 10, GreetingScene 9, KidPrimitives 7, ProfileView 6,
BadgeUnlockScene 6, StreakScene 6, LeaderboardView 5, TabBar 2
```
Swap to `.font(.title)` / `.font(.headline)` / `@ScaledMetric var size: CGFloat = N`.
**Done when:** `grep -r "\.font(\.system(size:" VerityPostKids/` = 0.

### 19 — Add `Retry-After` header on 2 routes
`web/src/app/api/messages/route.js:34`, `web/src/app/api/ads/impression/route.js:49`. Match the pattern in the ~20 other rate-limited routes.

### 20 — Admin `as any` cleanup (~20 sites)
Concentrated in `web/src/app/admin/subscriptions/page.tsx:48,49,51,109,194,298,374,607`; smaller counts in `admin/breaking`, `cohorts`, `notifications`, `promo`, `analytics`, `streaks`, `reader`, `ad-placements`. Replace each with proper types from `web/src/types/database.ts` or named local interfaces.

### 20b — Turn on TypeScript strict mode
`web/tsconfig.json` currently has `strict: false`. Codebase typechecks clean today (`npx tsc --noEmit` exits 0), so flipping strict-on will surface real gaps — `any`-typed values, implicit-any params, unused locals.
**Do:** set `"strict": true`. Also add `"noUnusedLocals": true`, `"noUnusedParameters": true`, `"noFallthroughCasesInSwitch": true`. Fix (or explicitly `// @ts-expect-error` with reason) whatever surfaces.

### 20c — Sentry configs missing `beforeSend` PII stripping
`web/sentry.client.config.js`, `sentry.server.config.js`, `sentry.edge.config.js` send raw error payloads — which can include user emails (from auth flows), IPs, request bodies — to Sentry. No `beforeSend` hook strips these.
**Do:** add a `beforeSend(event) { /* scrub emails, IPs, body.password, body.token */ return event; }` hook to each config. Verify in Sentry project settings that PII retention is off.

### 20d — `scripts/import-permissions.js` hardcodes desktop path
Line 57 points at `/Users/veritypost/Desktop/verity post/permissions.xlsx`. Works only on the owner's machine; breaks CI and every other developer.
**Do:** accept the path via `process.env.PERMISSIONS_XLSX_PATH` with a default fallback, OR copy the xlsx to a stable location (`matrix/permissions.xlsx` or `test-data/permissions.xlsx`) and update the script + any references in `CLAUDE.md`.

### 20e — ParentalGate lockout stored in `UserDefaults`
`VerityPostKids/VerityPostKids/ParentalGateModal.swift:203` — the 5-min lockout after 3 failed attempts persists in `UserDefaults`. A kid can bypass by: uninstalling and reinstalling, device restore, or dev tools.
**Do:** move the lockout timestamp to Keychain (survives reinstalls via iCloud Keychain and isn't user-writable from outside the app).

### 20f — Call `StoreManager.checkEntitlements()` on app foreground
Cross-device purchases (Stripe checkout on web while iOS backgrounded, or switching devices) leave the iOS app with stale entitlements until manual restore.
**Do:** in `VerityPostApp.swift`, observe `ScenePhase.active` transitions and trigger `await StoreManager.shared.sync()` + `checkEntitlements()`.

---

## P2

### 22 — Rewrite or archive `docs/runbooks/CUTOVER.md`
Currently dangerous if followed. Stale claims:
- Lists 3 Vercel crons; actual `web/vercel.json` has 9.
- Migration sequence stops at `020_phase12_cutover.sql`; actual disk reaches 105.
- All paths reference deleted `site/` folder.
- "Pre-flight verifies every RPC…" — references the broken preflight from #1.
**Do:** either rewrite top-to-bottom matching current state (crons, migrations, paths, 9 env vars from TODO #7), OR archive to `archive/2026-04-20-consolidation/` and write a short new `CUTOVER.md` with: backup prod → apply disk migrations → `node scripts/preflight.js` → `vercel --prod` → smoke test.

### 23 — Rewrite or archive `docs/runbooks/TEST_WALKTHROUGH.md`
References `01-Schema/032_seed_test_articles.sql` (wrong path — it's `schema/032_...`), test accounts `<username>@vp.test` with shared password `password` (actual seeds use `<username>@test.veritypost.com` with tier-specific passwords like `TestOwner1!`). Steps would fail for anyone running them today.
**Do:** rewrite against current seed data from `test-data/accounts.json`, OR archive and write a thinner smoke-test walkthrough matching `scripts/smoke-v2.js`.

### 24 — Verify `plans.apple_product_id` matches `APP_STORE_METADATA.md` IAP ids
8 IAP product IDs listed in `docs/product/APP_STORE_METADATA.md` §11 (e.g., `com.veritypost.verity.monthly`, `com.veritypost.verity_pro.annual`, etc.). If the live `plans.apple_product_id` column doesn't match verbatim, `/api/ios/subscriptions/sync` breaks after launch — Apple receipts won't resolve to a plan row.
**Do:** `select name, apple_product_id from plans where apple_product_id is not null;` and diff against the 8 IDs in the metadata doc. Reconcile whichever is wrong.

---

## P3

### 25 — Doc drift sweep
Grouped cleanups. One commit.

**Code/config comments:**
- `web/src/middleware.js:137` — comment dates CSP enforce flip as `2026-04-21` (future).
- `web/src/lib/apiErrors.js`, `web/src/lib/appleReceipt.js:17,45`, `web/next.config.js:8` — comments still reference the deleted `site/` path.

**Root-level docs:**
- `README.md:16` — "VerityPostKids is a placeholder" — wrong, it's a real 25-file SwiftUI app.

**Design Decisions:**
- `docs/reference/Verity_Post_Design_Decisions.md` D33 — lists `Superadmins` in expert back-channel visibility. Superadmin was removed (the functional access via admin is preserved; only doc is stale). Strip the word.

**Runbook nits:**
- `docs/runbooks/ROTATE_SECRETS.md` — references `site/.env.local` in the post-rotation cleanup block. Change to `web/.env.local`.

### 26 — Archive obsolete planning/history docs
These actively mislead because their premise is retired:
- `docs/planning/FUTURE_DEDICATED_KIDS_APP.md` — plans a fork that already happened (VerityPostKids exists).
- `docs/history/PROFILE_FULL_FLOW.md` — references community notes (cut per D15), reactions (cut per D29), "Premium" tier name (renamed per D10), `superadmin` role (removed).
- `kidsactionplan.md` at repo root — marks "Pass 4 DONE" but admits the parental-gate-wrap was deferred; #4 in this TODO captures the real remaining work.

**Do:** `git mv` all three to `archive/2026-04-20-consolidation/`.

### 27 — Pre-launch holding page
`docs/planning/PRELAUNCH_HOME_SCREEN.md` blueprint is a 30-min task: new `middleware.ts` + `/preview` bypass route + env toggle `NEXT_PUBLIC_SITE_MODE=coming_soon`. Implement when you want a public-facing "coming soon" screen during final QA. Optional.

### 28 — `preflight.js` expected-cron list out of sync with `vercel.json`
`scripts/preflight.js:263-270` expects 6 crons. `web/vercel.json` declares 9. After TODO #1 fixes the `site/` path bug, the script will run but emit spurious warnings for the extra 3 (`send-push`, `check-user-achievements`, `flag-expert-reverifications`). Add them to the expected list.

### 29 — Two `console.error` calls in `story/[slug]/page.tsx`
Lines 225-226, 326, 357 log `[stories] fetch error` on the normal fetch path; every anonymous article load writes a line to prod logs. Wrap in `if (process.env.NODE_ENV !== 'production')` or remove.

### 30 — No lint/format config
Repo has no `.eslintrc*` or `.prettierrc*`. Adopting even a minimal config (`no-console`, `no-unused-vars`, `no-explicit-any` warn-level) would have caught several items from this audit. Low priority but valuable long-term. GitHub Action + pre-commit hook would pair well.
