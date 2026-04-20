# TODO

Single source of truth for remaining work. Verified against code 2026-04-20, post lead-dev exit.

The prior task docs (`TASKS.md`, `DONE.md`, `05-Working/NEXT_SESSION.md`, `05-Working/BATCH_FIXES_2026_04_20.md`, `docs/runbooks/DEPLOY_PREP.md`) were archived to `archive/2026-04-20-consolidation/`. Do not trust them as an active work list — use this file.

## Rules

- Active work only. When done: delete the block. `git log` is the history.
- Numbered 1..N. Never reused.
- P0 ship-blocker · P1 high · P2 should-fix · P3 polish · OWNER = non-engineering.
- File:line specificity is mandatory. Every item must cite evidence.

---

## P0 — before any deploy

### 1 — Commit + push the 25 unpushed commits (incl. superadmin removal)
**Where:** repo root.
**Why:** `git status` shows 11 modified files + untracked `schema/105_remove_superadmin_role.sql`. The prior DONE.md already claimed "superadmin role removed (T-107) shipped" but nothing is in git history. Any careless reset / checkout nukes the work. Local `main` is also 25 commits ahead of `origin/main`.
**Do:** Review migration 105 once more (deletes 1 row from `auth.users` — `superadmin@test.veritypost.com` — safe, idempotent). Commit the 11 modified + 1 new file as `T-107: remove superadmin role`. Then `git push`.
**Accept:** `git log origin/main..HEAD` returns 0 commits. `schema/105_remove_superadmin_role.sql` is tracked.

### 2 — Fix cutover gate scripts (site/ → web/)
**Where:** `scripts/preflight.js:25`, `scripts/seed-test-accounts.js:17`, `scripts/check-stripe-prices.js:4,35,67`.
**Why:** All three still reference the deleted `site/` folder. `scripts/preflight.js` exits 1 at line 28 (`@supabase/supabase-js` existence check) before it contacts the DB. `CUTOVER.md` advertises it as the launch-readiness gate — the gate is a no-op. Only `scripts/import-permissions.js` was fixed.
**Do:** `'../site'` → `'../web'` in each. Check the full files for any other `site/` references in comments or paths.
**Accept:** `node scripts/preflight.js` reaches the DB checks. `grep -r "'\.\./site'" scripts/` = 0.

### 3 — Run fixed preflight.js against live DB
**Where:** local env with `web/.env.local` present.
**Why:** After #2 lands, use preflight's output as the authoritative list of real drift — not the lead dev's notes. Expect new items to surface here (missing RPCs, settings, seeds, cron scheduling).
**Do:** Run it. Capture output. File new entries in this TODO for any failures.
**Accept:** Preflight exits 0, OR every listed failure has a numbered TODO block below.

### 4 — Migrate admin/breaking/page.tsx off direct DB write
**Where:** `web/src/app/admin/breaking/page.tsx:136`.
**Why:** Only surviving admin direct write. Calls `supabase.from('articles').insert(newAlert as any)` from the browser — no rank guard, no `record_admin_action` trail, no service-role separation. The prior "T-005 closed" claim is contradicted by this one site.
**Do:** Create `/api/admin/broadcasts/alert/route.ts` (or re-use `/api/admin/broadcasts/breaking/route.js`) following the canonical shape: `requirePermission` → `createServiceClient` → `checkRateLimit` → `require_outranks` (if target-user) → insert → `record_admin_action` → response. Migrate the page's submit handler to POST that route.
**Accept:** `grep "supabase\.from\([^)]*\)\.(insert|update|upsert|delete)" web/src/app/admin` returns 0 matches.

### 5 — (OWNER) Apply seed SQLs 101–104 to live DB
**Where:** `schema/101_seed_rate_limits.sql`, `102_seed_data_export_ready_email_template.sql`, `103_seed_reserved_usernames.sql`, `104_seed_blocked_words.sql`.
**Why:** All four tables currently empty or partial in live DB. Code defaults carry the app in the meantime, but:
  - empty `reserved_usernames` → signup accepts `admin`, `root`, `owner`, `veritypost`, URL-route names
  - empty `blocked_words` → profanity filter is a no-op
  - missing `data_export_ready` email template → the send-emails cron silently skips that notification type
  - empty `rate_limits` rows → no DB-side override of code-default ceilings
  All are idempotent (`ON CONFLICT` guards).
**Accept:** `select count(*) from reserved_usernames;` ≥ 76. `select count(*) from blocked_words;` ≥ 30. `select key from email_templates where key='data_export_ready';` returns a row.

### 6 — (OWNER) Rotate live secrets
**Where:** Supabase service-role, Stripe live secret, Stripe webhook secret.
**Why:** Secrets may have been exposed to the fired dev's tools / local env. Rotate before re-enabling paid flows.
**Do:** Follow `docs/runbooks/ROTATE_SECRETS.md`.
**Accept:** Old keys revoked. New keys in Vercel env. Webhook test event still processes.

### 7 — (OWNER) Vercel env wire-up
**Where:** Vercel project settings.
**Why:** Build hard-fails without `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` (`web/next.config.js:61-68`). Email-link routes (signup, reset, callback) throw in prod without `NEXT_PUBLIC_SITE_URL` (`web/src/lib/siteUrl.js:26`).
**Do:** Set all three in production + preview scopes.
**Accept:** `next build` succeeds in prod. Password-reset email has `https://veritypost.com` links, not `localhost:3333`.

### 8 — (OWNER) HIBP compromised-password toggle
**Where:** Supabase Auth dashboard.
**Why:** Without it, signup accepts known-leaked passwords.
**Accept:** Known-pwned password rejected at signup.

### 9 — (OWNER) Publish ≥10 real articles; delete 5 `Test:` placeholders
**Where:** `articles` table.
**Why:** Home feed + OG previews currently show `Test: ...` headlines.
**Accept:** `select count(*) from articles where is_published=true and title not ilike 'test%'` ≥ 10. `select count(*) ... title ilike 'test%' and is_published=true` = 0.

### 10 — (OWNER) Audit Supabase admin/owner seats
**Where:** live DB.
**Why:** Trust calibration. A rogue admin seat is the most direct escalation path left.
**Do:** Run:
```sql
select u.email, r.name, ur.granted_at
from user_roles ur
join users u on u.id = ur.user_id
join roles r on r.id = ur.role_id
where r.name in ('owner', 'admin')
order by r.name, ur.granted_at;
```
Revoke any row you do not personally recognize.
**Accept:** Every row in the query result is you or a test account you recognize.

### 11 — (OWNER) Audit Stripe dashboard
**Where:** dashboard.stripe.com.
**Why:** Out-of-band audit for anything the fired dev may have added.
**Do:** Check webhook endpoints, API keys (including restricted keys), Connect accounts, payout destinations, team members.
**Accept:** Every entry is recognized. Unrecognized keys revoked.

### 12 — (OWNER) Audit Vercel team + env-var change history
**Where:** vercel.com project dashboard.
**Do:** Check team members (remove the ex-dev), env-var audit log for recent unexpected changes.
**Accept:** Ex-dev removed from team. No suspicious env-var history.

---

## P0 — Kids App Store submission

### 13 — Wire `ParentalGateModal` into VerityPostKids
**Where:** `VerityPostKids/VerityPostKids/ParentalGateModal.swift` (component exists), zero callers across the 25 Swift files.
**Why:** COPPA requires a parental gate before IAP, external links, and sensitive settings changes. Kids Category review will reject without it. The component's math-challenge UI is already built — it's orphaned.
**Do:** Identify every external link, IAP trigger, and settings-change entry point in kids app (search for `openURL`, `Product.purchase`, `Link(destination:`, profile-edit flows). Gate each with `.sheet` presentation of `ParentalGateModal`. 3 attempts / 5-min lockout already in the component.
**Accept:** Every external-destination / IAP / settings action launches the gate first. `grep -r "ParentalGateModal()" VerityPostKids/` ≥ 3 call sites.

---

## P1

### 14 — Fix `package.json` TypeScript version typo
**Where:** `web/package.json:25`.
**Why:** `"typescript": "6.0.3"` — that version does not exist. TypeScript is at 5.x. `npm install` on a clean checkout fails. Also: `"@types/react": "19.2.14"` with `"react": "^18.3.0"` — types v19 ahead of runtime v18.
**Do:** Pin TS to the real installed version (check `web/node_modules/typescript/package.json` for what's actually on disk). Decide whether to downgrade `@types/react` to `^18.3.x` or upgrade React to 19.
**Accept:** `rm -rf web/node_modules && cd web && npm install && npx tsc --noEmit` succeeds.

### 15 — Reconcile `schema/reset_and_rebuild_v2.sql` with live DB
**Where:** `schema/reset_and_rebuild_v2.sql` + `archive/2026-04-19-prelaunch-sprint/round_{a,b}_migration.sql`.
**Why:** DR-replay from scratch produces a less-secure DB than live.
  - Migrations 092 (RLS lockdown) and 093 (RPC actor lockdown) live in `archive/`, not in `schema/` as numbered files.
  - Several live-only migrations are not on disk at all (`grant_anon_free_comments_view`, `add_require_outranks_rpc`, etc. — prior T-004 list).
  - `resolve_username_to_email` RPC (hardened in migration 060) is missing from the DR replay entirely.
  - Seed keys drift: `reset_and_rebuild_v2.sql:3384-3385` seeds `context_pin.min_tags` / `context_pin.threshold_pct` but live DB uses `context_pin_min_count` / `context_pin_percent`.
**Do:** Pull live state via `select statements from supabase_migrations.schema_migrations order by version`. Commit missing migrations as `schema/092_...`, `schema/093_...` etc. Regenerate or patch `reset_and_rebuild_v2.sql` so a fresh replay matches live. Fix the settings-key drift.
**Accept:** `select ... from supabase_migrations.schema_migrations` rows all have disk twins. A clean Supabase project replayed from `reset_and_rebuild_v2.sql` + disk migrations matches prod shape.

### 16 — Swap 12 admin pages off inline `['owner', 'admin']` role arrays
**Where:**
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
**Why:** All 12 use `['owner', 'admin']` (2-wide). Canonical helper `ADMIN_ROLES` in `web/src/lib/roles.js` is `{owner, admin}` after superadmin removal (once #1 commits). Mechanical swap. Drift = guaranteed if left.
**Do:** After #1 lands, swap each to `ADMIN_ROLES.has(role)`.
**Accept:** `grep -E "\['owner',\s*'admin'\]" web/src/app/admin/` returns 0 matches.

### 17 — Silent insert failures in VerityPostKids (data loss)
**Where:** `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:228-232` (quiz_attempts); `VerityPostKids/VerityPostKids/KidReaderView.swift:183-190` (reading_log).
**Why:** Both `catch { }` blocks swallow insert errors silently. On any network blip: quiz scores lost, leaderboard drifts; reading_log rows lost, streak DB trigger never fires. Kids see scores increase locally, server sees nothing.
**Do:** Replace each empty catch with: log via `Log.e`, POST to `/api/errors`, surface a non-blocking parent-side telemetry entry. Optional: local SQLite queue for offline retry.
**Accept:** Forced network failure produces a server-visible error event. Kid sees "Try again" toast (not silent).

### 18 — (OWNER) Apple Developer account
**Where:** developer.apple.com.
**Why:** Gates all iOS publishing (App Store Connect, APNs `.p8`, `apple-app-site-association`, TestFlight, StoreKit products). Code is ready; every Apple-dependent task waits on this single step.
**Accept:** Account active, team ID available.

---

## P2

### 19 — Dynamic Type migration across 11 VerityPostKids files (86 sites)
**Where:** 86 occurrences of `.font(.system(size: N))` across:
```
KidQuizEngineView(13), KidPrimitives(7), ExpertSessionsView(11),
ParentalGateModal(11), LeaderboardView(5), BadgeUnlockScene(6),
StreakScene(6), QuizPassScene(10), GreetingScene(9), TabBar(2),
ProfileView(6)
```
**Why:** App Store accessibility review blocker; Kids Category is held to stricter standard.
**Do:** Swap each to `.font(.title)` / `.font(.headline)` / `@ScaledMetric var size: CGFloat = N`.
**Accept:** `grep -r "\.font(\.system(size:" VerityPostKids/` = 0.

### 20 — `Retry-After` header missing on 2 routes
**Where:** `web/src/app/api/messages/route.js:34`, `web/src/app/api/ads/impression/route.js:49`.
**Why:** 429 responses on these routes return no `Retry-After`. Clients can't back off correctly.
**Do:** Add `'Retry-After': String(windowSec)` to the 429 headers, matching the pattern in ~20 other rate-limited routes.
**Accept:** Forcing a 429 on either route returns the header.

### 21 — Admin `as any` cleanup (~20 sites)
**Where:** concentrated in `web/src/app/admin/subscriptions/page.tsx:48,49,51,109,194,298,374,607`, plus `breaking`, `cohorts`, `notifications`, `promo`, `analytics`, `streaks`, `reader`, `ad-placements`.
**Why:** Type-safety drift; `as any` hides real type mismatches. None are auth-critical but several are on billing/plan shapes.
**Do:** Replace each with a proper type import from `web/src/types/database.ts` or a named local interface.
**Accept:** `grep -c "as any" web/src/app/admin/` decreases to ≤ 3 (with remaining cases commented with rationale).

---

## P3

### 22 — Doc drift cleanup
**Where:**
- `README.md:16` — "Placeholder for the kids iOS build once split from VerityPost" — wrong, VerityPostKids is a real app with 25 Swift files.
- `STATUS.md` — any remaining stale claims after the consolidation trim (Next version, cron counts, etc.).
- `web/src/middleware.js:137` — comment says "Flipped 2026-04-21" (future date).
- `web/src/lib/apiErrors.js`, `web/src/lib/appleReceipt.js` — comments still reference `site/src/lib/...`.
- `web/next.config.js:8` — comment says `site/src/middleware.js`.
**Why:** Small comments that drift compound into distrust over time.
**Do:** One sweep, one commit.
**Accept:** `grep -rn "site/" web/ README.md STATUS.md --include='*.{md,js,ts,tsx}'` returns only intentional historical references.
