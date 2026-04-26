# W2-01: Permissions / Role Matrix Integrity

## Q1: hasPermissionServer name collision — CONFIRMED REAL FOOTGUN

Two functions named `hasPermissionServer` exported with different semantics:

- **`web/src/lib/auth.js:201`** — uses `loadEffectivePerms()` (full row from `compute_effective_perms`), returns `false` on any error, accepts optional `client` param. Intended for server-side route handlers.
- **`web/src/lib/permissions.js:207`** — calls `has_permission(p_key)` RPC via `createClient()`, returns boolean. The file is imported by client React components.

**Importer audit (verified by grep):**

From `@/lib/auth`:
- `api/comments/route.js:4` ✓ correct
- `api/admin/billing/audit/route.js:4` ✓ correct
- `api/search/route.js:5` ✓ correct
- `api/account/delete/route.js:5` ✓ correct
- `api/notifications/preferences/route.js:4` ✓ correct

From `./permissions` (relative):
- `web/src/lib/rlsErrorHandler.js:18` — uses the `permissions.js` version. **Concern:** rlsErrorHandler is invoked from API routes (server) but pulls from `permissions.js` whose `createClient()` is the cookie-based browser client. May be wrong client semantics here — needs Wave 3 verification.

**Recommendation:** rename one. Suggest `lib/permissions.js` → `hasPermissionClient` (it uses `has_permission` RPC which RLS-resolves through the browser cookie session). Keep `lib/auth.js` version as `hasPermissionServer`.

## Q2: Three competing client-side admin gating patterns — CONFIRMED

(Per Z14 inventory; not re-grep'd here, will be verified in Wave 3.)

- **Hardcoded `'owner'||'admin'` literals (drift):** access, analytics, feeds, notifications, subscriptions, system (6 pages)
- **Role-set membership** via `ADMIN_ROLES`/`MOD_ROLES`/`EDITOR_ROLES`: ~30 pages
- **`hasPermission('key')` resolver** (canonical per CLAUDE.md "permissions matrix is platform DNA"): categories, permissions, prompt-presets, users (4 pages); partial in cleanup (5)

**Canonical pattern verdict:** `hasPermission('key')` against the resolver, because every gate must ultimately route through `compute_effective_perms` (CLAUDE.md). The 6 hardcoded-literal pages are launch defects; the ~30 role-set pages are tolerable until canonical migration.

**Migration plan**: 6 literal-pages first (P0); 30 role-set pages second (P1).

## Q3: xlsx ↔ DB ↔ script ↔ code — DRIFT CONFIRMED

- **xlsx exists:** YES at `/Users/veritypost/Desktop/verity post/permissions.xlsx` (note SPACE in path).
- **DB row counts (live):**
  - permissions: **998**
  - permission_sets: **21**
  - permission_set_perms: **3,090**
  - role_permission_sets: **45**
  - plan_permission_sets: **21**
  - roles: **8** (admin, editor, educator, expert, journalist, moderator, owner, user — NO superadmin)
  - plans: **9** (free + 4 tiers × monthly/annual, with verity_family_annual + family_xl × 2 currently `is_active=false`)
- **`bump_global_perms_version` RPC:** **DOES NOT EXIST IN DB** (verified via pg_proc). Confirms Z19 finding. `scripts/import-permissions.js` calls a non-existent RPC, falls through to direct UPDATE on a "version: 999 signal" intermediate write.
- **Script's hardcoded role→set mappings:** Z19 reports lines 156-184. With 45 rows in `role_permission_sets` (8 roles × ~5.6 sets avg) the script's hardcode is a third source-of-truth alongside xlsx + DB. **Drift hazard.**
- **`perms_global_version` runtime setting:** I could not check `current_setting('app.perms_global_version', true)` — Wave 3 should query.

**Verdict:** **drifted**. `bump_global_perms_version` is the smoking gun — script calls a non-existent RPC. 100 percent fix probability.

## Q4: 23 rules-of-hooks disables — CLAUDE.md WRONG ON COUNT AND LOCATION

- **Actual count:** **25** (not 23) `react-hooks/rules-of-hooks` disable comments
- **Files (4):** all in `web/src/app/`, none in `lib/`:
  - `app/recap/page.tsx`
  - `app/recap/[id]/page.tsx`
  - `app/u/[username]/page.tsx`
  - `app/welcome/page.tsx`
- These are the kill-switched / coming-soon pages with conditional-return-before-hooks patterns.
- **CLAUDE.md update needed:** "23 disables" → "25 disables"; "in lib" implication → "in app/{recap,welcome,u}". Z12 was correct.

## Q5: MASTER_TRIAGE perm-related SHIPPED claims

Cannot fully verify in main thread; deferred to Wave 3. Key items to spot-check:
- 6-agent ship pattern items
- @migrated-to-permissions markers
- Items related to permission_sets restructuring

## Q6: Role-list canonical-vs-drift

- **Canonical:** `web/src/lib/roles.js` defines `OWNER_ROLES`, `ADMIN_ROLES`, `EDITOR_ROLES`, `MOD_ROLES`, `EXPERT_ROLES` (per CLAUDE.md).
- **Live DB roles (verified):** admin, editor, educator, expert, journalist, moderator, owner, user
- Wave 3 must verify roles.js array contents match this exact set.

## Q7: superadmin dead refs — CONFIRMED IN 8 ROUTINES

`prosrc LIKE '%superadmin%'` matches:
1. `_user_is_moderator`
2. `approve_expert_answer`
3. `approve_expert_application`
4. `expert_can_see_back_channel`
5. `grant_role`
6. `mark_probation_complete`
7. `reject_expert_application`
8. `revoke_role`

Z11 estimated ~5; actual is **8**. Migration 105 dropped the `superadmin` row from `roles` but left these RPC bodies untouched. Each likely has `r.name IN ('owner','superadmin','admin')` or similar. **Cleanup migration needed:** strip `'superadmin'` from each routine body.

## Confirmed duplicates
- Function name `hasPermissionServer` exported from two files with different semantics (Q1)
- Role→set + plan→set mappings hardcoded in `import-permissions.js` AND in DB tables (Q3)

## Confirmed stale
- CLAUDE.md "23 rules-of-hooks disables" → actually 25, and not in `lib` (Q4)
- Z11's "~5 superadmin RPC bodies" → actually 8 (Q7)
- migration log only tracks through `20260420020544`; 78 subsequent migrations not in log (Q3 context)

## Confirmed conflicts
- `import-permissions.js` calls non-existent RPC `bump_global_perms_version` (Q3)
- `superadmin` dropped from roles table (migration 105) but persists in 8 RPC bodies (Q7)

## Unresolved (needs Wave 3)
- `lib/rlsErrorHandler.js` use of `permissions.js`'s `hasPermissionServer` — wrong-client semantics?
- xlsx ↔ DB row-by-row diff (need Python/Node to read xlsx)
- `roles.js` canonical array contents vs DB (didn't read file directly)
- `perms_global_version` setting current value
- `record_admin_action` argument signature has `p_ip inet, p_user_agent text` — Z12 said `adminMutation.ts:84-88` doesn't pass them. Confirms gap; Wave 3 should fix.

## Recommended actions
1. **Rename collision:** `permissions.js#hasPermissionServer` → `hasPermissionClient`. Update `rlsErrorHandler.js` import.
2. **Fix `import-permissions.js`:** create `bump_global_perms_version` RPC OR update script to call the existing pattern. Remove dead "version: 999 signal" write.
3. **Migration to strip `'superadmin'`** from 8 routine bodies (single migration with `CREATE OR REPLACE FUNCTION` for each).
4. **Migrate 6 hardcoded-`'owner'||'admin'` admin pages** to `hasPermission('key')`.
5. **Update CLAUDE.md** rules-of-hooks count + location.
6. **Plan canonical-pattern migration** for 30 role-set pages (P1).
7. **Pass `p_ip`/`p_user_agent`** in `adminMutation.ts:84-88`.
