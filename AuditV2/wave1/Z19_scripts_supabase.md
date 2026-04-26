# Zone Z19: scripts/ + supabase/

## Summary

Zone Z19 covers `scripts/` (8 scripts: 7 JS, 1 SQL) and `supabase/` (Supabase CLI `.temp/` cache only — no actual config files, no `config.toml`, no migrations folder, no seed.sql; the project is run as a remote-only Supabase project with the local CLI used for project-link metadata). Z10 covered `.gitignore`, `.mcp.json`, `.env.supabase-readonly`, `README.md`, and the symlinks (`STATUS.md` → `Reference/STATUS.md`, `CLAUDE.md` → `Reference/CLAUDE.md`). The only root-level files NOT covered by Z10 are `.git-blame-ignore-revs` (autofix-sweep SHAs ignored in blame, per CLAUDE.md), and `.DS_Store` (Finder metadata, not source). Both are noted but require no audit. The headline finding in this zone is `scripts/smoke-v2.js`: it references `..', 'site'` for SITE_DIR but the project lives in `web/` — this script is broken in its current form. Also `scripts/dev-reset-all-passwords.js` requires `@supabase/supabase-js` from a global require path that won't resolve unless invoked from a directory with the package installed (no `node_modules` walking).

## Scripts

### scripts/import-permissions.js
- **Purpose:** Sync permission matrix from `permissions.xlsx` into Supabase. Replaces stale 81 perms / 11 sets with 927 perms / 10 sets.
- **Invocation:** `node scripts/import-permissions.js` (default = dry-run) or `--apply` to write.
- **Dry-run vs apply:** Defaults to dry-run; prints diff (insert/update/deactivate counts). Only writes with explicit `--apply` flag.
- **DB tables touched:** `permissions` (upsert by key, deactivate absent), `permission_sets` (upsert by key, deactivate absent), `permission_set_perms` (fully rebuilt — DELETE then INSERT), `role_permission_sets` (fully rebuilt), `plan_permission_sets` (fully rebuilt), `perms_global_version` (bumped once at end).
- **Tables NOT touched:** `user_permission_sets`, `permission_scope_overrides` (user-level grants).
- **Side effects:** Bumps `perms_global_version` to invalidate caches. Calls `bump_global_perms_version` RPC which is "may not exist" with a fallback direct UPDATE — see Concerns. Has 3 candidate paths for xlsx (env `PERMISSIONS_XLSX_PATH` → repo `matrix/permissions.xlsx` → legacy `~/Desktop/verity post/permissions.xlsx`). M5 fix derives legacy path from `os.homedir()` so it works for any user.
- **Dependencies:** Requires `python3` + `openpyxl` available in PATH (for xlsx parsing via spawned subprocess). Reads `web/.env.local` for Supabase env. Uses service role key (bypasses RLS).
- **Concerns:**
  1. The "preferred canonical location" `matrix/permissions.xlsx` does not exist in the repo — only the legacy `~/Desktop/verity post/permissions.xlsx` resolves. Already tracked as `R-12-AGR-03` in Audit_2026-04-24/Recon_Group12_DB.md.
  2. RPC `bump_global_perms_version` does not exist — the `.catch()` fallback runs, doing a direct UPDATE that first tries to set `version: 999` (a "signal") and `bumped_at`, then immediately overwrites with `version: gv.version + 1`. The intermediate "signal" UPDATE is dead/confusing code. Tracked as `R-12-UB-01`.
  3. Spawning python3 with the xlsx path in template-literal substitution is fragile — any path with double-quote would break the generated script string. Owner Desktop path is safe but CI / alt machines could break.
  4. Hardcoded role→set and plan→set maps live in JS (lines 156-184). Per CLAUDE.md "DB is the default, always" — this is a cross-source mapping that arguably belongs in DB.

### scripts/apply-seeds-101-104.js
- **Purpose:** Apply seeds 101-104 idempotently via supabase-js service-role client (replicates SQL `INSERT…ON CONFLICT`).
- **Invocation:** `node scripts/apply-seeds-101-104.js` (no flags; always-apply, no dry-run).
- **Dry-run vs apply:** No dry-run mode — every run writes. Uses `upsert` with `onConflict: 'key'` / `'username'` / `'word'` so it's idempotent.
- **DB tables touched:** `rate_limits` (31 rows, upsert), `email_templates` (1 row: `data_export_ready`, upsert), `reserved_usernames` (~80 rows, upsert+ignoreDuplicates), `blocked_words` (~30 rows, upsert+ignoreDuplicates).
- **Side effects:** Verifies counts after upserts. Inline-defined data (large literal arrays) — not reading from any source files.
- **Dependencies:** `web/node_modules/@supabase/supabase-js`, `web/.env.local` for env.
- **Concerns:**
  1. Status: Per CHANGELOG.md "Seeds 101-104 applied to live DB (`d1c25e3` 2026-04-20)" — this script is one-shot and has already executed. It's now mostly a historical artifact / re-run safety net. Mildly stale.
  2. Inline-defined seed data risks drift from any source-of-truth migration files in `schema/` (101_*.sql through 104_*.sql).

### scripts/check-admin-routes.js
- **Purpose:** Drift fence — flags admin mutation routes that violate the canonical pattern.
- **Invocation:** `node scripts/check-admin-routes.js`. Exits 1 if drift found. Note: comment says "Wire this into CI when there's a CI to wire it into" — suggesting it's not yet automated.
- **Dry-run vs apply:** Read-only static analysis; never writes.
- **DB tables touched:** None.
- **Side effects:** None.
- **What it checks per admin POST/PATCH/PUT/DELETE handler:**
  1. No direct `.from('audit_log')` writes (must go through `recordAdminAction` → `admin_audit_log`).
  2. No inline `.rpc('require_outranks', …)` calls (must use `requireAdminOutranks` helper).
  3. Must have `checkRateLimit(` somewhere in the file.
- **Dependencies:** `git ls-files` (must run in repo). Reads route files at `web/src/app/api/admin/**/route.{js,ts}`.
- **Concerns:** Substring grep is brittle — a route that imports `requireAdminOutranks` and uses it correctly but ALSO has an `audit_log` reference in a comment string would false-flag.

### scripts/check-stripe-prices.js
- **Purpose:** Verify `plans.stripe_price_id` is populated for all 8 paid plans; if `STRIPE_SECRET_KEY` set, fetch active Stripe prices and emit suggested SQL UPDATE statements.
- **Invocation:** `node scripts/check-stripe-prices.js`.
- **Dry-run vs apply:** Read-only — never writes to DB or Stripe. Outputs SQL UPDATE statements as text for human paste.
- **DB tables touched:** Reads `plans`. Does not write.
- **Side effects:** Calls Stripe API GET `/v1/prices` (paginated to 100/page).
- **Dependencies:** `web/node_modules/@supabase/supabase-js`, `web/.env.local`. Stripe key optional.
- **Concerns:** Output of UPDATE statements with single-quote SQL escapes — if a plan name contained a quote it would break, but plan names are stable identifiers (no quotes in current names).
- Contains a mild bug at line 107: `${p.price_cents}¢/${p.billing_period.padEnd(5)}` — uses a non-ASCII cent sign. CLAUDE.md says no emojis, but this isn't an emoji and it's CLI-only output, so it's fine in practice.

### scripts/dev-reset-all-passwords.js
- **Purpose:** DEV-ONLY — reset every `auth.users` password to `Password1?` (or fallback `TestPassword1!`).
- **Invocation:** `node scripts/dev-reset-all-passwords.js` with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env vars.
- **Dry-run vs apply:** Always-apply. No flag. No confirmation prompt. Header comment clearly warns "NEVER run against production".
- **DB tables touched:** `auth.users` via `auth.admin.updateUserById`.
- **Side effects:** Loops through all users (perPage 1000 — caps at 1000 users; would silently skip extras at scale), updates each password. No audit log entry.
- **Dependencies:** `@supabase/supabase-js` resolved via plain `require('@supabase/supabase-js')` — fails unless run from a directory with the package in `node_modules` walk path. Inconsistent with sibling scripts that use `web/node_modules/@supabase/supabase-js` explicitly.
- **Concerns:**
  1. Catastrophic if env vars accidentally point at prod Supabase. No `prompt-to-confirm` guard, no `NODE_ENV !== 'production'` check, no project-ref allowlist.
  2. Resolves `@supabase/supabase-js` from default node_modules walk — will fail unless invoked from inside `web/`.
  3. perPage 1000 ceiling — not paginated.

### scripts/generate-apple-client-secret.js
- **Purpose:** Generate Apple Sign In client_secret JWT (signed with `.p8` key) for Supabase's Apple provider config. JWT max lifetime 6 months.
- **Invocation:** `node scripts/generate-apple-client-secret.js --p8 <path> --kid <KeyID> --team <TeamID> --sub <ServiceID>` (or env: `APPLE_P8_PATH`, `APPLE_KID`, `APPLE_TEAM_ID`, `APPLE_SUB`).
- **Dry-run vs apply:** N/A — always prints JWT to stdout. Operator pastes into Supabase dashboard.
- **DB tables touched:** None.
- **Side effects:** Reads `.p8` file from disk; outputs JWT and expiry to stdout. No persistence.
- **Dependencies:** Node built-ins only (`fs`, `path`, `crypto`). Crypto signs with ES256.
- **Operational note:** Listed in `Reference/ROTATIONS.md` — must re-run every 5-6 months.
- **Concerns:** None significant. Uses `~` expansion via `replace(/^~/, process.env.HOME)` — fine.

### scripts/preflight.js
- **Purpose:** Production cutover pre-flight — RPC existence, settings seeds, plan seeds, role seeds, email-template seeds, admin-existence, Stripe price-id population, runtime env presence (warn-only), Stripe webhook endpoint registration, Resend API-key validity, Vercel cron schedule presence.
- **Invocation:** `node scripts/preflight.js`. Exits 0 clean, 1 on hard failure.
- **Dry-run vs apply:** Read-only. No writes.
- **DB tables touched:** Reads `users`, `roles`, `user_roles`, `plans`, `email_templates`, `settings`. Calls many RPCs with bogus args to test existence (Postgres 42883 = "does not exist").
- **Side effects:** Calls Stripe `/v1/webhook_endpoints`, Resend `/domains`. Reads `web/vercel.json` for cron list.
- **Dependencies:** `web/node_modules/@supabase/supabase-js`, `web/.env.local`. Optional `STRIPE_SECRET_KEY`, `RESEND_API_KEY`.
- **Listed in:** `Reference/runbooks/CUTOVER.md` step 3.
- **Concerns:**
  1. Hardcoded RPC list — drifts from schema if RPCs added/renamed without updating the list. Will silently miss newer phases (Phase 12+ not present in checks; only Phases 3-11).
  2. Hardcoded expected cron list (line 263-273) — already updated per CHANGELOG, but pattern is fragile.
  3. Plan seed expects exactly 9 plans (1 free + 8 paid). If plan list grows the assertion text "9/9" needs manual update (current pass-message says `${plans.count}/9` hardcoded).

### scripts/smoke-v2.js
- **Purpose:** v2 end-to-end smoke test — creates disposable user, exercises quiz/comment/vote/bookmark/billing/family/notification/quiet-hours RPCs, tears down.
- **Invocation:** `node scripts/smoke-v2.js`.
- **Dry-run vs apply:** Always writes (creates+deletes test user, article, kid profile, quizzes, comments, etc.). Cleans up in `finally` block.
- **DB tables touched:** Creates: `auth.users`, `articles`, `quizzes`, `comments`, `bookmarks`, `kid_profiles`, `notifications`. RPCs: `start_quiz_attempt`, `submit_quiz_attempt`, `user_passed_article_quiz`, `post_comment`, `toggle_vote`, `toggle_context_tag`, `billing_change_plan`, `billing_cancel_subscription`, `billing_freeze_profile`, `billing_resubscribe`, `create_notification`, `start_kid_trial`, `family_members`, `serve_ad`, `_is_in_quiet_hours`.
- **Side effects:** Creates real auth user; uses `verity.test` email domain. Service-role key — bypasses RLS, can hit prod if pointed there.
- **Dependencies:** **BROKEN**: line 24 — `const SITE_DIR = path.resolve(__dirname, '..', 'site');`. The `site/` directory does not exist. Project is `web/`. Script will fail at line 25 trying to require supabase-js from a nonexistent path.
- **Concerns:**
  1. **Broken — `site/` should be `web/`.** Date `Apr 15 17:05` predates other scripts that say `web/`. Likely never updated when the project was renamed.
  2. No prod-safety guard. Same risk as `dev-reset-all-passwords.js`.
  3. Teardown is in `finally` — but if test fails after partial setup, may leave orphaned data in prod.

### scripts/stripe-sandbox-restore.sql
- **Purpose:** Restore plan `stripe_price_id` columns to TEST-mode Stripe prices captured 2026-04-17.
- **Invocation:** Manual paste into Supabase SQL Editor.
- **Dry-run vs apply:** No dry-run — direct UPDATEs on 8 rows.
- **DB tables touched:** `plans` (8 UPDATE statements).
- **Side effects:** Overwrites whatever is currently in `plans.stripe_price_id` for the 8 paid plans.
- **Concerns:** Hardcoded test-mode price IDs — if Stripe sandbox prices were ever recreated, these IDs go stale silently. Companion to `check-stripe-prices.js` for production restoration.

## supabase/ contents

The folder is just CLI link metadata, not a config dir:

```
supabase/.temp/
├── cli-latest             v2.90.0  (latest CLI version known to local install)
├── gotrue-version         v2.188.1
├── linked-project.json    {"ref":"fyiwulqphgmoqullmrfn","name":"VP Project","organization_id":"mstinzcsdnlolafhwufx","organization_slug":"mstinzcsdnlolafhwufx"}
├── pooler-url             postgresql://postgres.fyiwulqphgmoqullmrfn@aws-1-us-east-1.pooler.supabase.com:5432/postgres
├── postgres-version       17.6.1.104
├── project-ref            fyiwulqphgmoqullmrfn
├── rest-version           v14.5
├── storage-migration      operation-ergonomics
└── storage-version        v1.53.5
```

- **No `config.toml`** — no local Supabase stack config.
- **No `migrations/` folder under supabase/** — the project keeps migrations under top-level `schema/` (per CLAUDE.md).
- **No `seed.sql`** — seeds live as numbered files under `schema/` (e.g., 101-104) plus the `apply-seeds-101-104.js` applier.
- **`linked-project.json` confirms** the live project is `fyiwulqphgmoqullmrfn` ("VP Project") in org `mstinzcsdnlolafhwufx`. This matches the CLAUDE.md project ref.
- **Pooler URL is captured** but the user / password is missing — would need session pooler credentials to actually connect.
- The fact that `supabase/` is just CLI cache means migrations are applied via MCP / SQL Editor / `apply_migration`, not via `supabase db push`. This is the documented pattern (per memory note `feedback_mcp_verify_actual_schema_not_migration_log`).

## import-permissions.js detailed analysis

### Input xlsx path
- **Resolution order** (T-034):
  1. Env var `PERMISSIONS_XLSX_PATH` (CI / alt-machine override).
  2. Repo path `<repo>/matrix/permissions.xlsx` (preferred / canonical — **does not currently exist**, confirmed via `ls`).
  3. Legacy path `~/Desktop/verity post/permissions.xlsx` (the one with the space — confirmed exists at `/Users/veritypost/Desktop/verity post/permissions.xlsx`, 63465 bytes, mtime Apr 18 2026).
- **Today's effective path:** option 3, the legacy owner workflow. Per CLAUDE.md this is the canonical owner workflow. The "preferred canonical" `matrix/` dir doesn't exist — drift between the script's preferred path and the documented "canonical" location.

### DB tables it writes
- `permissions` — upsert by `key`. Deactivates rows whose key is absent from xlsx (sets `is_active=false`, never deletes).
- `permission_sets` — upsert by `key`. Same deactivate-absent behavior.
- `permission_set_perms` — fully rebuilt: `DELETE … WHERE permission_id != '00000000-0000-0000-0000-000000000000'` (effectively delete all), then bulk INSERT.
- `role_permission_sets` — fully rebuilt (delete + insert).
- `plan_permission_sets` — fully rebuilt (delete + insert).
- `perms_global_version` — version + 1 (after RPC try/fallback to direct UPDATE).

### perms_global_version bump
- Tries `supa.rpc('bump_global_perms_version')` first.
- On any RPC error, falls back into `.catch()` block which:
  1. Updates row `id=1` to `version: 999, bumped_at: now()`. (This is dead-on-arrival — overridden 2 lines later.)
  2. Then re-fetches `perms_global_version`, computes `gv.version + 1`, and issues another UPDATE.
- The "999 signal" intermediate UPDATE is unnecessary and obscures intent. CLAUDE.md notes the canonical RPC is `bump_user_perms_version`, not `bump_global_perms_version` — the script may have always been calling a non-existent RPC and silently falling through to direct UPDATE.

### Drift risks vs xlsx
1. **xlsx not in repo** → not version-controlled with code. CLAUDE.md mandates 1:1 sync but the only mechanism to enforce that is human discipline.
2. **No `--check` / drift-detect mode** — there's `--dry-run` (default), but no command that exits non-zero if xlsx and DB differ. CI cannot fail on drift.
3. **Direct DB edits will be reverted** — any `UPDATE permissions` SQL run against Supabase is silently overwritten next time `--apply` runs. CLAUDE.md flags this rule but the tooling doesn't guard it.
4. **role→set and plan→set maps are in JS, not xlsx** — three sources of truth (xlsx for perm-to-set, JS for role-to-set, JS for plan-to-set). If xlsx adds a role-set mapping the script wouldn't pick it up.
5. **Hardcoded plan names** in `planToSets` — 9 specific plan names. Adding a new plan in DB without updating the JS map silently grants `['free']` only.
6. **No backup before destructive rebuild** — script comment says "Backups were taken 2026-04-18 to test-data/backup-2026-04-18/*.json" but that's a one-time historical backup. Each `--apply` deletes `permission_set_perms`, `role_permission_sets`, `plan_permission_sets` with no per-run backup.

## Scripts that look obsolete

- **`scripts/smoke-v2.js`** — references `site/` not `web/`. Either it's pre-rename and broken, or `site/` was renamed to `web/` post-write. **Broken in current form.** Mtime Apr 15 (oldest script in folder). High likelihood it hasn't been run since the rename.
- **`scripts/apply-seeds-101-104.js`** — one-shot applier, already executed per CHANGELOG (`d1c25e3` 2026-04-20). Idempotent so harmless to re-run, but its purpose has been served. Could move to an `archive/` or `Completed Projects/` folder.
- **`scripts/stripe-sandbox-restore.sql`** — companion to `check-stripe-prices.js` but only for restoring TEST-mode price IDs captured at a specific point in time. Useful for sandbox flips between test/live; not obsolete but tightly coupled to a specific Stripe sandbox state from 2026-04-17.

## Notable claims worth verifying in later waves

1. **`scripts/smoke-v2.js` is broken** — the `site/` reference at line 24 means the script cannot run. Verify whether anyone has tried to run it post-rename.
2. **`bump_global_perms_version` RPC may not exist** — the import-permissions fallback chain suggests it doesn't. Also tracked as `R-12-UB-01`. Wave 2 should query `pg_proc` to confirm whether `bump_global_perms_version` or `bump_user_perms_version` (or both) exists.
3. **`matrix/permissions.xlsx` is documented as preferred but does not exist** — already tracked as `R-12-AGR-03`. Owner workflow uses the legacy Desktop path.
4. **`apply-seeds-101-104.js` data-vs-schema drift** — the inline arrays should match `schema/101_*.sql` through `schema/104_*.sql`. Wave 2 should diff the in-script arrays against the migration SQL to confirm parity.
5. **Hardcoded role→set and plan→set mappings** in import-permissions.js (lines 156-184) — duplicate copies of policy that should arguably live in the DB. Already tracked in MASTER_TRIAGE per the "DB is the default" rule.
6. **`dev-reset-all-passwords.js` lacks prod-safety guard** — no env-allowlist check. Critical-risk script with no safety rails. Worth flagging as a hardening task.
7. **`check-admin-routes.js`** is not wired into CI. Its own header acknowledges this. Worth verifying whether `web/.husky/pre-commit` (the hook lives at `web/.husky/`) runs it.
8. **`preflight.js` Phase coverage stops at Phase 11.** If Phase 12+ RPCs exist they're unchecked. Verify against actual RPC list.
9. **`supabase/.temp/`** is the only contents of `supabase/`. There is no local Supabase config (no `config.toml`). Migrations are applied via MCP. Worth confirming this is intentional in Wave 2 against any migration runbooks.
10. **`smoke-v2.js` cron / family-trial / kid-trial flow** — if it ever runs again, it tests `convert_kid_trial` firing on Family upgrade (D44 reference at line 196). That assertion is the only documented integration test for the trial-conversion trigger.
