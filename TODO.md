# TODO

Two sections: what needs the owner vs what I can close autonomously. Priority-ordered within each.

- **OWNER** — needs a dashboard login (Supabase / Stripe / Vercel / Apple), secret rotation, editorial decision, or Apple Developer account action.
- **AUTONOMOUS** — code, config, scripts, docs. I can land these solo; owner reviews the commit.

P0 ship-blocker · P1 high · P2 should-fix · P3 polish.

Active list only. When done: delete the block. Git log is history.

Items renumbered 1–51 on 2026-04-20 when this split landed; commits before `f98cb76` reference the old numbering.

## Bench verification (2026-04-20)

- `cd web && npx tsc --noEmit` → exits 0. Typecheck clean.
- `xcodebuild VerityPost -destination 'name=iPhone 17'` → BUILD SUCCEEDED.
- `xcodebuild VerityPostKids -destination 'name=iPhone 17'` → BUILD SUCCEEDED.
- `dev server` → up on `http://localhost:3000` with `/`, `/login`, `/story/*` → 200; `/profile` → 302; `/kids` → 302 to `/kids-app`.
- Secrets: `git ls-files | grep .env` = 0. `.gitignore` covers `.env*`, `*.p8`, `*.pem`, `*.key`.
- 172 API routes: no critical RLS / auth / money bypasses.
- 105 migrations: no destructive SQL patterns, all `IF NOT EXISTS`.
- Both iOS apps: no third-party analytics, no IDFA, no hardcoded secrets.
- 0 `'superadmin'` references; 0 `dangerouslySetInnerHTML` in non-admin pages.

---

# OWNER

9 items. You do these — I can't reach these surfaces.

## P0 — before any deploy

### 1 — Apply seed SQLs 101–104 to live DB
```
schema/101_seed_rate_limits.sql
schema/102_seed_data_export_ready_email_template.sql
schema/103_seed_reserved_usernames.sql
schema/104_seed_blocked_words.sql
```
All idempotent. Until applied: signup accepts `admin`/`root`/`owner` as usernames, profanity filter is a no-op, `data_export_ready` emails silently drop, no DB-side rate-limit overrides.

### 2 — Rotate live secrets
Supabase service-role key, Stripe live secret, Stripe webhook secret. Ex-dev had access.

### 3 — Set Vercel env vars (production + preview scopes)
- `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` — build fails hard without these.
- `NEXT_PUBLIC_SITE_URL=https://veritypost.com` — password-reset + verification emails point at `localhost:3333` without it.
- `SUPABASE_JWT_SECRET` — required to sign the custom kid JWT at `/api/kids/pair`. Copy from Supabase dashboard → Settings → API → JWT Secret. Without it, kids iOS pairing returns 500.

### 4 — Enable HIBP in Supabase Auth dashboard
Without it, signup accepts known-leaked passwords.

### 5 — Publish ≥10 real articles; delete 5 `Test:` placeholders
`select * from articles where is_published=true and title ilike 'test%'` should return 0 rows before launch.

### 5b — Seed `streak.freeze_max_kids` setting (surfaced by preflight run)
Preflight flagged this as missing from the `settings` table. Other `streak.*` settings exist. Run:
```sql
INSERT INTO settings (key, value, description)
VALUES ('streak.freeze_max_kids', '2', 'Max streak freezes per week for Family-plan kids per D19')
ON CONFLICT (key) DO NOTHING;
```
Without it, kid streak-freeze feature falls back to code default (may be undefined).

### 6 — Audit Supabase admin/owner seats
```sql
select u.email, r.name, ur.granted_at
from user_roles ur
join users u on u.id = ur.user_id
join roles r on r.id = ur.role_id
where r.name in ('owner', 'admin')
order by r.name, ur.granted_at;
```
Revoke anyone you don't personally recognize.

### 7 — Audit Stripe dashboard
Webhook endpoints, API keys (including restricted), Connect accounts, team members. Anything the ex-dev may have added.

### 8 — Audit Vercel team + env-var change history
Remove ex-dev from team. Scan env-var changes for unexpected entries.

## P1

### 9 — Apple Developer account
Gates all iOS publishing — App Store Connect products, APNs `.p8`, `apple-app-site-association` upload, TestFlight. Code is ready; single owner step.

---

# AUTONOMOUS

42 items. I can close these without blocking on you.

## P0 — before any deploy

### 10 — Fix scripts pointing at the deleted `site/` folder
`scripts/preflight.js:25`, `scripts/seed-test-accounts.js:17`, `scripts/check-stripe-prices.js:4,35,67`. Change `'../site'` → `'../web'`. Until fixed, `preflight.js` (advertised as the cutover gate in `CUTOVER.md`) exits 1 before contacting the DB.
**Done when:** `grep -rn "'\.\./site'" scripts/` returns 0.

### 11 — Run fixed preflight.js against live DB
After #10 lands. Capture output. Every failure becomes a new item below.
**Done when:** preflight exits 0, or every reported failure has a block here.

### 12 — Migrate `admin/breaking/page.tsx:136` off direct DB write
Only surviving admin page that calls `supabase.from(...).insert(...)` directly from the browser. No rank guard, no audit. Mirror the canonical admin-mutation shape via a new route under `/api/admin/broadcasts/`.
**Done when:** `grep "supabase\.from\([^)]*\)\.(insert|update|upsert|delete)" web/src/app/admin` = 0.

### 13 — Wire `ParentalGateModal` into VerityPostKids
`VerityPostKids/VerityPostKids/ParentalGateModal.swift` — component fully built, zero callers. Apple rejects Kids Category apps without a parental gate before IAP / external links / settings changes.
**Done when:** `grep -r "ParentalGateModal()" VerityPostKids/` shows ≥ 3 call sites covering IAP, external URLs, and settings.

### 14 — Fix kids Keychain accessibility level
`VerityPostKids/VerityPostKids/PairingClient.swift:170` — kid JWT stored with `kSecAttrAccessibleAfterFirstUnlock`. Token is accessible after first unlock even when device currently locked. Adult app's `Keychain.swift:20` uses the correct `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` — kids must match.
**Done when:** `grep kSecAttrAccessible VerityPostKids/` shows only `WhenUnlockedThisDeviceOnly`.

## P1

### 15 — Fix `package.json` TypeScript pin
`web/package.json:25` — `"typescript": "6.0.3"` — that version does not exist. Fresh `npm install` fails. Also `@types/react: 19.2.14` with `react: ^18.3.0` — types ahead of runtime.
**Done when:** `rm -rf web/node_modules && cd web && npm install && npx tsc --noEmit` succeeds.

### 16 — Reconcile `schema/reset_and_rebuild_v2.sql` with live DB
DR-replay from scratch produces a weaker DB than live:
- Migrations 092 (RLS lockdown) + 093 (RPC actor lockdown) live in `archive/2026-04-19-prelaunch-sprint/round_{a,b}_migration.sql`, not in `schema/` as numbered files.
- Several live-only migrations never hit disk (`grant_anon_free_comments_view`, `add_require_outranks_rpc`, etc.).
- `resolve_username_to_email` RPC definition (hardened by migration 060) is missing from the DR replay.
- `reset_and_rebuild_v2.sql:3384-3385` seeds settings keys `context_pin.min_tags` / `context_pin.threshold_pct`; live uses `context_pin_min_count` / `context_pin_percent`.
- Migrations 100–105 missing from rebuild file entirely.
**Done when:** a fresh Supabase project replayed from disk matches live shape.

### 17 — Swap 12 admin pages off inline `['owner', 'admin']` arrays
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

### 18 — Fix silent insert failures in VerityPostKids (data loss)
`VerityPostKids/VerityPostKids/KidQuizEngineView.swift:228-232` — quiz_attempts insert in empty `catch {}`.
`VerityPostKids/VerityPostKids/KidReaderView.swift:183-190` — reading_log insert same pattern.
On network failure: kid sees their score go up locally, server sees nothing, leaderboard + streak silently drift. Add logging, retry, and a parent-visible telemetry path.

### 19 — Fix `error.message` leaks in 3 admin/auth routes
Prior sweep missed these (catch-block message pass-through vs. `{error}` destructure):
- `web/src/app/api/admin/users/[id]/ban/route.js:57` — returns `upErr.message` in body.
- `web/src/app/api/admin/users/[id]/plan/route.js:59,68` — returns `planErr.message` + `upErr.message`.
- `web/src/app/api/auth/callback/route.js:47` — auth path leaks error.message.
**Do:** route through `safeErrorResponse` with a `[route-tag]` + generic client copy.

### 20 — `/api/account/onboarding` uses direct `users.update()`
`web/src/app/api/account/onboarding/route.js:17` — writes to `public.users` directly. Should go through `public.update_own_profile(p_fields jsonb)` like the 7 other self-profile write sites.
**Done when:** route uses the RPC, not a direct `.update()`.

### 21 — `StoreManager.swift` syncPurchaseToServer doesn't verify HTTP 200
`VerityPost/VerityPost/StoreManager.swift:211-250` — logs non-2xx responses to debug only; local flow continues as if purchase synced. User paid but stays on prior tier.
**Do:** check `httpResponse.statusCode` in 200..<300; retry or surface error otherwise.

### 22 — `PairingClient.swift:132` silent JWT apply failure
`restore()` calls `try? await applySession(token:)`. If token injection fails, session silently reverts to anon; kid browses unauthenticated with no warning.
**Do:** surface the failure. Either show "couldn't restore session, re-pair device" or retry with backoff.

### 23 — `record_admin_action` audit coverage gap
Only **23 of 73** admin API routes call `recordAdminAction` or `record_admin_action`. Everything under `/api/admin/**` that mutates state should audit. Missing ~50 are concentrated in: ad-campaigns/placements/units, appeals, data-requests, expert/applications, moderation/comments+reports, permission-sets, permissions, plans, recap, sponsors, subscriptions, users/[id]/{ban,data-export,mark-quiz,mark-read,plan,role-set,roles}.
**Do:** sweep every admin route; add `await recordAdminAction({...})` from `lib/adminMutation.ts` where the mutation has meaningful state change.
**Done when:** every admin-route mutation either audits or has an inline exception comment.

### 24 — Family leaderboard may show only the paired kid
`VerityPostKids/VerityPostKids/LeaderboardView.swift:218-229` — Family scope query on `kid_profiles` filters by `parent_user_id`. Under kid JWT, RLS returns only the paired kid's own row (migration 096). Siblings under the same parent won't appear.
**Do:** verify with ≥2 kid profiles under one parent. If broken, either relax the SELECT policy (siblings-under-same-parent when `is_kid_delegated()=true`), or add a `kid_family_leaderboard(kid_profile_id)` SECDEF RPC.

### 25 — Kid PIN weak-pattern check incomplete + client-side only
`web/src/app/profile/kids/page.tsx:12` — `WEAK_PINS` blocks specific strings like `'0000'`, `'1111'`. Sequential (`1234`), reverse (`4321`), doubles (`1212`), other repeats (`2222`, `3333`) may slip through. Bigger concern: check is React-only. `/api/kids/route.js` + `/api/kids/set-pin/route.js` don't validate weakness server-side.
**Do:** extend the weak list programmatically (all-same, sequential ±1, mirrored halves). Move to a shared helper + enforce on the server.

### 26 — Kid article fetch trusts RLS only
`VerityPostKids/VerityPostKids/KidReaderView.swift:156` — `.from("articles").select(...).eq("id", id)` has no `.eq("is_kids_safe", true)` filter. Relies on RLS. If policy drifts, a kid could fetch an adult article by known UUID.
**Do:** add `.eq("is_kids_safe", true)` belt-and-suspenders filter. Verify the live RLS policy on `articles` requires `is_kids_safe=true` when `is_kid_delegated()=true`.

### 27 — Sentry SDK using deprecated config pattern
Dev server boot logs warn `sentry.server.config.js` and `sentry.edge.config.js` should move to `instrumentation.ts`. Current pattern works but a future Next upgrade breaks it.
**Do:** create `web/src/instrumentation.ts` per Sentry's Next.js App Router guide. Keep `sentry.client.config.js`.

### 28 — `themeColor` metadata deprecation warning
Dev server emits `⚠ Unsupported metadata themeColor is configured in metadata export in /`. Per Next 14 change.
**Do:** move `themeColor` from the `metadata` export in `app/layout.js` to a new `viewport` export.

## P2

### 29 — Dynamic Type migration in VerityPostKids (86 sites, 11 files)
`.font(.system(size: N))` hardcodes that ignore accessibility settings. App Store accessibility review blocker; Kids Category is stricter. Distribution:
```
KidQuizEngineView 13, ParentalGateModal 11, ExpertSessionsView 11,
QuizPassScene 10, GreetingScene 9, KidPrimitives 7, ProfileView 6,
BadgeUnlockScene 6, StreakScene 6, LeaderboardView 5, TabBar 2
```
Swap to `.font(.title)` / `.font(.headline)` / `@ScaledMetric var size: CGFloat = N`.
**Done when:** `grep -r "\.font(\.system(size:" VerityPostKids/` = 0.

### 30 — Add `Retry-After` header on 2 routes
`web/src/app/api/messages/route.js:34`, `web/src/app/api/ads/impression/route.js:49`. Match the pattern in the ~20 other rate-limited routes.

### 31 — Admin `as any` cleanup (~20 sites)
Concentrated in `web/src/app/admin/subscriptions/page.tsx:48,49,51,109,194,298,374,607`; smaller counts in `admin/breaking`, `cohorts`, `notifications`, `promo`, `analytics`, `streaks`, `reader`, `ad-placements`. Replace each with proper types from `web/src/types/database.ts` or named local interfaces.

### 32 — Turn on TypeScript strict mode
`web/tsconfig.json` has `strict: false`. Codebase typechecks clean today, so flipping strict-on will surface real gaps.
**Do:** set `"strict": true`. Also add `"noUnusedLocals": true`, `"noUnusedParameters": true`, `"noFallthroughCasesInSwitch": true`. Fix what surfaces.

### 33 — Sentry configs missing `beforeSend` PII stripping
All three Sentry configs send raw error payloads — including user emails, IPs, request bodies.
**Do:** add `beforeSend(event) { /* scrub emails, IPs, body.password, body.token */ return event; }` hook. Verify in Sentry project settings that PII retention is off.

### 34 — `scripts/import-permissions.js` hardcodes desktop path
Line 57 points at `/Users/veritypost/Desktop/verity post/permissions.xlsx`. Works only on the owner's machine; breaks CI and every other developer.
**Do:** accept via `process.env.PERMISSIONS_XLSX_PATH` with a default, OR copy the xlsx to a stable repo path (`matrix/permissions.xlsx`).

### 35 — ParentalGate lockout stored in `UserDefaults`
`VerityPostKids/VerityPostKids/ParentalGateModal.swift:203` — 5-min lockout persists in `UserDefaults`. Bypassable by uninstall/reinstall, device restore, dev tools.
**Do:** move timestamp to Keychain.

### 36 — Call `StoreManager.checkEntitlements()` on app foreground
Cross-device purchases (Stripe on web while iOS backgrounded, or device switch) leave stale entitlements until manual restore.
**Do:** in `VerityPostApp.swift`, observe `ScenePhase.active` transitions and trigger `await StoreManager.shared.sync()` + `checkEntitlements()`.

### 37 — Rewrite or archive `docs/runbooks/CUTOVER.md`
Currently dangerous if followed. Lists 3 crons (actual: 9), stops at migration `020_phase12_cutover.sql` (actual: 105), all paths reference deleted `site/`.
**Do:** rewrite top-to-bottom, OR archive and write a short new CUTOVER with: backup prod → apply disk migrations → `node scripts/preflight.js` → `vercel --prod` → smoke test.

### 38 — Rewrite or archive `docs/runbooks/TEST_WALKTHROUGH.md`
References wrong SQL path (`01-Schema/032_...`), wrong test account emails (`@vp.test`), wrong password (`password`). Would fail for anyone running it today.
**Do:** rewrite against current seed data from `test-data/accounts.json`, OR archive + replace with a thinner smoke-test walkthrough matching `scripts/smoke-v2.js`.

### 39 — Verify `plans.apple_product_id` matches `APP_STORE_METADATA.md` IAP ids
8 IAP product IDs listed in `docs/product/APP_STORE_METADATA.md` §11. If the live `plans.apple_product_id` column doesn't match verbatim, `/api/ios/subscriptions/sync` breaks after launch — receipts won't resolve to a plan row.
**Do:** `select name, apple_product_id from plans where apple_product_id is not null;` and diff against the 8 IDs in the metadata doc.

### 40 — Path / API mismatches surfaced by walkthrough
- `/profile/settings/notifications` referenced in FEATURE_LEDGER but actual route is `/profile/settings/alerts`.
- `/api/family/weekly-report` referenced by `profile/family/page.tsx` vs `/api/reports/weekly-reading-report` in FEATURE_LEDGER.
- `apply-to-expert` vs `signup/expert` vs `profile/settings/expert` — three entrypoints to the same form.
**Do:** one sweep, reconcile names, delete shells that no longer make sense.

### 41 — Verify kid-trial auto-freeze cron end-to-end
`/api/cron/sweep-kid-trials` is scheduled daily in `vercel.json`. Confirm it actually freezes kid profiles on D44 trial expiry (not just marks expired), bumps kid status, and notifies the parent.
**Do:** read `web/src/app/api/cron/sweep-kid-trials/route.js`; trace the freeze call path. Fix gaps if any.

### 42 — `PairCodeView.swift:138-142` unclassified errors surface to kid UI
Generic `catch` block shows raw Swift error descriptions to the kid. Only typed `PairError` cases should reach the UI layer; everything else logs via `Log.e` and shows a friendly "Something went wrong, try again."

### 43 — Missing countdown UI during pair-code cooldown
`PairCodeView` shows "Too many tries. Wait a minute" but no countdown timer. Kids may tap retry during the 60s lockout.
**Do:** add `Text("Retry in \(seconds)s")` bound to a `@State` timer.

## P3

### 44 — Doc drift sweep
Grouped cleanups. One commit.

- `web/src/middleware.js:137` — comment dates CSP enforce flip as `2026-04-21` (future).
- `web/src/lib/apiErrors.js`, `web/src/lib/appleReceipt.js:17,45`, `web/next.config.js:8` — comments still reference the deleted `site/` path.
- `README.md:16` — "VerityPostKids is a placeholder" — wrong, it's a real 25-file SwiftUI app.
- `docs/reference/Verity_Post_Design_Decisions.md` D33 — lists `Superadmins` in expert back-channel visibility. Strip the word.
- `docs/runbooks/ROTATE_SECRETS.md` — references `site/.env.local` in post-rotation cleanup. Change to `web/.env.local`.

### 45 — Archive obsolete planning/history docs
Premise is retired, actively misleading:
- `docs/planning/FUTURE_DEDICATED_KIDS_APP.md` — plans a fork that already happened (VerityPostKids exists).
- `docs/history/PROFILE_FULL_FLOW.md` — references community notes (cut per D15), reactions (cut per D29), "Premium" tier (renamed D10), `superadmin` (removed).
- `kidsactionplan.md` at repo root — marks "Pass 4 DONE" but admits parental-gate wrap was deferred; item #13 captures real remaining work.
**Do:** `git mv` all three to `archive/2026-04-20-consolidation/`.

### 46 — Pre-launch holding page (optional)
`docs/planning/PRELAUNCH_HOME_SCREEN.md` blueprint is a 30-min task: `middleware.ts` + `/preview` bypass route + env toggle `NEXT_PUBLIC_SITE_MODE=coming_soon`. Implement when you want a public-facing "coming soon" during final QA.

### 47 — `preflight.js` expected-cron list out of sync with `vercel.json`
`scripts/preflight.js:263-270` expects 6 crons. `web/vercel.json` declares 9. After #10 lands, preflight will emit spurious warnings for the extra 3 (`send-push`, `check-user-achievements`, `flag-expert-reverifications`). Add them.

### 48 — Two `console.error` calls in `story/[slug]/page.tsx`
Lines 225-226, 326, 357 log `[stories] fetch error` on the normal fetch path; every anonymous article load writes a line to prod logs. Wrap in `if (process.env.NODE_ENV !== 'production')` or remove.

### 49 — No lint/format config
Repo has no `.eslintrc*` or `.prettierrc*`. Adopting a minimal config (`no-console`, `no-unused-vars`, `no-explicit-any` warn-level) would have caught several items in this audit. Pair with GitHub Action + pre-commit hook.

### 50 — `/search` page doesn't render anon CTA in-place
Anonymous visitors to `/search` should either redirect to `/login?next=/search` or render an in-place CTA (like `/notifications` does). Today it loads a blank search UI that won't return results. Per middleware, `/search` isn't in `PROTECTED_PREFIXES` — intentional for basic-search gate, but the anon fallback is inconsistent.

### 51 — Unverified-but-logged-in users see anon "Sign up" CTA on `/story/[slug]`
Lines 618-641 show the anon sign-up CTA; unverified-logged-in users hit the same branch and don't get a clear "Verify your email to take the quiz" message. Copy change only.
