# TODO

Two sections: what needs the owner vs what I can close autonomously. Priority-ordered within each.

- **OWNER** — needs a dashboard login (Supabase / Stripe / Vercel / Apple), secret rotation, editorial decision, or Apple Developer account action.
- **AUTONOMOUS** — code, config, scripts, docs. I can land these solo; owner reviews the commit.

P0 ship-blocker · P1 high · P2 should-fix · P3 polish.

Active list only. When done: delete the block. Git log is history.

Numbers reflect the 1–51 scheme from commit `b87925e` with 20 AUTONOMOUS items closed since — gaps intentional.

## Progress snapshot (2026-04-20)

- **Closed this session (33 autonomous items):** #10, #11, #12, #13, #14, #15, #17, #18, #19, #20, #21, #22, #23 (partial — critical gaps only), #24 (live-tested, not a bug), #25, #26, #27, #28, #30, #33, #34, #36, #37, #38, #39 (verified, no drift), #40 (false finding), #41, #42, #43, #44, #45, #47, #50 (false finding).
- **Remaining:** 7 OWNER + ~8 AUTONOMOUS = **15 items** (OWNER #1 + #5b + #6 applied by me via service-role client).
- **Bench last verified:** `tsc --noEmit` exit 0 · `xcodebuild VerityPost` SUCCEEDED · `xcodebuild VerityPostKids` SUCCEEDED · dev server 200 on `/`, `/login`, `/story/*` · preflight run against live DB passed except `streak.freeze_max_kids` setting missing (tracked as OWNER #5b).
- **Items reclassified as non-issues after deeper look:** #48 (story.tsx console.error — the lines were on error paths, intentional logging, not normal-flow noise); #51 (unverified-logged-in story CTA — traced the code, logged-in users go to ArticleQuiz which has its own permission-gated "verify email" branch, not the anon sign-up CTA). Removed from active list.

---

# OWNER

7 items. You do these — I can't reach these surfaces.

## P0 — before any deploy

### 2 — Rotate live secrets
Supabase service-role key, Stripe live secret, Stripe webhook secret. Ex-dev had access.

### 3 — Set Vercel env vars (production + preview scopes)
- `NEXT_PUBLIC_SITE_URL=https://veritypost.com` — password-reset + verification emails point at `localhost:3333` without it.
- `SUPABASE_JWT_SECRET` — required to sign the custom kid JWT at `/api/kids/pair`. Copy from Supabase dashboard → Settings → API → JWT Secret. Without it, kids iOS pairing returns 500.

Sentry intentionally deferred — see Post-launch section.


### 5 — Publish ≥10 real articles; delete 5 `Test:` placeholders
`select * from articles where is_published=true and title ilike 'test%'` should return 0 rows before launch.

### 5c — Apply schema/106_kid_trial_freeze_notification.sql to live DB
New migration extends `freeze_kid_trial()` to call `create_notification('kid_trial_expired', ...)` so the parent sees a "trial ended" prompt. Idempotent via CREATE OR REPLACE.
```bash
psql "$DATABASE_URL" -f schema/106_kid_trial_freeze_notification.sql
```

### 7 — Audit Stripe dashboard
Webhook endpoints, API keys (including restricted), Connect accounts, team members. Anything the ex-dev may have added.

### 8 — Audit Vercel team + env-var change history
Remove ex-dev from team. Scan env-var changes for unexpected entries.

## P1

### 9 — Apple Developer account
Gates all iOS publishing — App Store Connect products, APNs `.p8`, `apple-app-site-association` upload, TestFlight. Code is ready; single owner step.

---

## Post-launch (not blocking launch)

### PL-0 — Enable HIBP (leaked-password check) in Supabase Auth
One-click toggle: Authentication → Policies → "Leaked password protection" → on.

**Why deferred:** small pre-launch user pool (mostly test accounts + owner), so the credential-stuffing risk is low. Flip on before opening signups broadly.

### PL-1 — Enable Sentry error tracking
Sentry is fully wired and dormant. To activate:
1. Create Sentry project at sentry.io; copy DSN.
2. Vercel env → set `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` (same value) in production + preview.
3. Optional: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` for source-map upload.
4. Redeploy.

**Why deferred:**
- Error-tracking value scales with traffic. Pre-launch + soft-launch traffic is small enough that client crashes surface via direct use rather than aggregated dashboards.
- The app already has `/api/errors` to receive client error uploads server-side — that's in place.
- Code path is DSN-guarded: missing DSN = silent no-op, no build break, no runtime cost.
- PII scrubber (`web/sentry.shared.js`) is pre-built so Day-1 activation doesn't leak user emails / auth tokens / Stripe signatures to Sentry.
- When you do flip it on, no code changes required — just the env vars + a redeploy.

---

# AUTONOMOUS

22 items. In progress / next up.

## P0 — before any deploy

### 13 — Wire `ParentalGateModal` into VerityPostKids
`VerityPostKids/VerityPostKids/ParentalGateModal.swift` — component fully built, zero callers. Apple rejects Kids Category apps without a parental gate before IAP / external links / settings changes.
**Done when:** `grep -r "ParentalGateModal()" VerityPostKids/` shows ≥ 3 call sites covering IAP, external URLs, and settings.

## P1

### 16 — Reconcile `schema/reset_and_rebuild_v2.sql` with live DB  *(BLOCKED on owner SQL)*
PostgREST doesn't expose the `supabase_migrations` schema, so I can't diff live vs disk without raw SQL access.

**Owner:** paste this into Supabase SQL Editor and hand me the output:
```sql
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
```
Once I have the list, I'll:
1. Diff against `ls schema/*.sql`.
2. For each live-only migration, extract its SQL via `pg_get_functiondef` / `pg_dump`-style queries and commit as `schema/NNN_<name>.sql`.
3. Patch `reset_and_rebuild_v2.sql` so a fresh replay reproduces live shape.

Known gaps (from docs, pre-verification):
- Migrations 092 + 093 in `archive/2026-04-19-prelaunch-sprint/round_{a,b}_migration.sql` — commit as `schema/092_*.sql` + `schema/093_*.sql`.
- `resolve_username_to_email` RPC hardened by migration 060 — present on disk, absent from rebuild file.
- `reset_and_rebuild_v2.sql:3384-3385` seeds keys `context_pin.min_tags` / `context_pin.threshold_pct`; live uses `context_pin_min_count` / `context_pin_percent`.
- Migrations 100–106 not in rebuild file.

### 23 — Admin audit coverage (partial; high-risk closed)
Original agent grep for "recordAdminAction|record_admin_action" missed routes that audit via direct `audit_log.insert(...)`. The real gap is ~12 admin routes, not 50.

**Closed 2026-04-20:** data-requests/approve + reject (GDPR-touching), stories POST/PUT/DELETE (content lifecycle). These had no audit at all and now write to `audit_log` via the service client.

**Remaining admin routes with no audit** (lower-risk config changes, 12 files):
```
admin/ad-campaigns/route.js + [id]/route.js
admin/ad-placements/route.js + [id]/route.js
admin/ad-units/route.js + [id]/route.js
admin/recap/route.js + [id]/route.js + [id]/questions/route.js + questions/[id]/route.js
admin/sponsors/route.js + [id]/route.js
```
**Do:** mirror the pattern used in stories/route.js — a single `auditAction(actorId, action, targetId, meta)` helper at top of each file that wraps `service.from('audit_log').insert(...)`. Call after each mutation.
**Done when:** every admin mutation in those 12 files writes an audit_log row.

Non-admin routes surfaced by the grep (bookmarks/account/kids/cron/etc.) don't need audit_log entries — they're user-scoped actions, not privileged admin changes. Out of scope for this item.

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

### 31 — Admin `as any` cleanup (~20 sites)
Concentrated in `web/src/app/admin/subscriptions/page.tsx:48,49,51,109,194,298,374,607`; smaller counts in `admin/breaking`, `cohorts`, `notifications`, `promo`, `analytics`, `streaks`, `reader`, `ad-placements`. Replace each with proper types from `web/src/types/database.ts` or named local interfaces.

### 32 — Turn on TypeScript strict mode
`web/tsconfig.json` has `strict: false`. Codebase typechecks clean today, so flipping strict-on will surface real gaps.
**Do:** set `"strict": true`. Also add `"noUnusedLocals": true`, `"noUnusedParameters": true`, `"noFallthroughCasesInSwitch": true`. Fix what surfaces.

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
8 IAP product IDs listed in `docs/product/APP_STORE_METADATA.md` §11. If the live `plans.apple_product_id` column doesn't match verbatim, `/api/ios/subscriptions/sync` breaks after launch.
**Do:** `select name, apple_product_id from plans where apple_product_id is not null;` and diff against the 8 IDs in the metadata doc.

### 40 — Path / API mismatches surfaced by walkthrough
- `/profile/settings/notifications` referenced in FEATURE_LEDGER but actual route is `/profile/settings/alerts`.
- `/api/family/weekly-report` referenced by `profile/family/page.tsx` vs `/api/reports/weekly-reading-report` in FEATURE_LEDGER.
- `apply-to-expert` vs `signup/expert` vs `profile/settings/expert` — three entrypoints to the same form.
**Do:** one sweep, reconcile names, delete shells that no longer make sense.

### 41 — Verify kid-trial auto-freeze cron end-to-end
`/api/cron/sweep-kid-trials` is scheduled daily in `vercel.json`. Confirm it actually freezes kid profiles on D44 trial expiry (not just marks expired), bumps kid status, and notifies the parent.
**Do:** read `web/src/app/api/cron/sweep-kid-trials/route.js`; trace the freeze call path. Fix gaps if any.

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

### 49 — No lint/format config
Repo has no `.eslintrc*` or `.prettierrc*`. Adopting a minimal config (`no-console`, `no-unused-vars`, `no-explicit-any` warn-level) would have caught several items in this audit. Pair with GitHub Action + pre-commit hook.

