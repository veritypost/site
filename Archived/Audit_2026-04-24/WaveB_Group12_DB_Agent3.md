---
wave: B
group: 12 (DB schema + RLS + RPCs + perm matrix)
agent: 3/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24T13:03:54Z
---

# Findings — DB Schema + RLS + RPCs + Perm Matrix, Wave B, Agent 3

## CRITICAL

### F-B12-3-01 — Reset scaffold severely outdated; 55 migrations newer than reset_and_rebuild_v2.sql
**File:line:** `/Users/veritypost/Desktop/verity-post/schema/reset_and_rebuild_v2.sql` (last updated Apr 20 12:29); migrations 105–160 dated Apr 22–24.
**Evidence:**
```
File timestamp: Apr 20 12:29
Last migration in reset_and_rebuild_v2.sql: 020_test_data.sql
Current migration count: 160 total (.sql files in schema/)
Migrations dated AFTER rebuild file: 105_remove_superadmin_role.sql through 160_create_avatars_bucket.sql (55 files)
```
**Impact:** Any schema reset or clean-slate deployment will omit 55 migrations worth of schema, RLS, RPCs, and constraints. This breaks data integrity, security, and feature availability. Developers or CI running `reset_and_rebuild_v2.sql` get a stale schema.
**Reproduction:** List files: `find schema -name '*.sql' -newer reset_and_rebuild_v2.sql | wc -l` → 55. Inspect migration content dates.
**Suggested fix direction:** Regenerate reset_and_rebuild_v2.sql by concatenating migrations 001–160 in order (or use Supabase CLI to export current schema).
**Confidence:** HIGH

### F-B12-3-02 — RLS enabled but no policies on 14 production tables (all DML blocked)
**File:line:** Schema files: `019_cross_platform.sql`, `109_verity_score_events.sql`, `114_f7_foundation.sql`, etc. Evidence via grep across schema/*.sql.
**Evidence:**
```
Tables with ENABLE ROW LEVEL SECURITY but zero CREATE POLICY statements:
  - weekly_recap_quizzes
  - weekly_recap_questions
  - weekly_recap_attempts
  - behavioral_anomalies
  - bookmark_collections
  - category_supervisors
  - comment_context_tags
  - expert_queue_items
  - family_achievement_progress
  - family_achievements
  - kid_expert_questions
  - kid_expert_sessions
  - sponsored_quizzes
  - user_warnings
```
**Impact:** Any SELECT, INSERT, UPDATE, or DELETE on these tables is silently blocked by RLS (default-deny without explicit policies). Writes fail without error feedback. Reads return zero rows. Kid expert sessions, family achievements, and recap attempts are user-facing features—this causes silent failures.
**Reproduction:** Code-reading only. Query `weekly_recap_quizzes` as authenticated user in production → zero rows returned, no error. Any INSERT attempt → transaction succeeds but row never visible.
**Suggested fix direction:** Add SELECT/INSERT/UPDATE/DELETE policies to each table matching their role/user semantics (e.g., weekly_recap_* readable by quiz participant user, expert tables readable by expert/moderator/kids).
**Confidence:** HIGH

### F-B12-3-03 — 5 public RPCs without SECURITY DEFINER not in internal helper category
**File:line:** `/Users/veritypost/Desktop/verity-post/schema/051_user_category_metrics_rpc.sql:41`, `/065_restrict_users_table_privileged_updates_2026_04_19.sql`, `/083_restrict_users_table_privileged_inserts_2026_04_19.sql`, `/084_restrict_users_table_privileged_inserts_v2_2026_04_19.sql`, `/111_rollback_parallel_score_ledger.sql`
**Evidence:**
```
Schema 051: CREATE OR REPLACE FUNCTION public.get_user_category_metrics(...) SECURITY INVOKER
Schema 065: CREATE OR REPLACE FUNCTION public.reject_privileged_user_updates() RETURNS trigger SECURITY INVOKER
Schema 083-084: CREATE OR REPLACE FUNCTION public.reject_privileged_user_inserts(...) SECURITY INVOKER
```
**Impact:** SECURITY INVOKER is correct for 051 (reads only, uses caller's RLS context) and for 065/083/084 (triggers that enforce constraints, not exposed as callable RPCs). Confirming: none of these are user-facing mutations. No HIGH risk, but 083/084 are defensive triggers and should verify they're not callable from client.
**Reproduction:** Code-reading only.
**Suggested fix direction:** Verify 065/083/084/111 are used only as triggers (not direct RPC calls). No action needed if confirmed internal-only.
**Confidence:** MEDIUM

## HIGH

### F-B12-3-04 — import-permissions.js hardcodes legacy permissions.xlsx path as fallback
**File:line:** `/Users/veritypost/Desktop/verity-post/scripts/import-permissions.js:62`
**Evidence:**
```javascript
const legacyPath = '/Users/veritypost/Desktop/verity post/permissions.xlsx';
const candidates = [process.env.PERMISSIONS_XLSX_PATH, repoPath, legacyPath].filter(Boolean);
const xlsxPath = candidates.find(p => fs.existsSync(p));
```
**Impact:** CI/CD or multi-user environment will fail silently if permissions.xlsx is in the Desktop location (space-padded directory name). Path resolution is fragile: env var > repo path > hardcoded home-relative path. The fallback path is machine-specific and will fail on any non-owner machine.
**Reproduction:** Run `scripts/import-permissions.js --dry-run` on a CI agent or second developer machine without the Desktop file → will look for `matrix/permissions.xlsx` in repo (preferred, but may not exist in all branches).
**Suggested fix direction:** Remove Desktop fallback; enforce permissions.xlsx in `matrix/permissions.xlsx` or via explicit PERMISSIONS_XLSX_PATH env var. Log an error listing candidate paths if all fail.
**Confidence:** HIGH

## MEDIUM

### F-B12-3-05 — perms_global_version table missing RLS (system table, but unguarded)
**File:line:** `schema/` – grep shows 113 tables with ENABLE ROW LEVEL SECURITY; perms_global_version has none.
**Evidence:**
```
Tables without RLS: perms_global_version (only one)
All other 113 tables have RLS enabled
```
**Impact:** perms_global_version is system-level (used only by bump_global_perms_version RPC and import script). No user data; no privacy breach. However, inconsistent: if every other table has RLS, this one should too (or documented as exception). If any code tries to read or update it as a normal table (not via RPC), it's unguarded.
**Reproduction:** Code-reading only. Check if any client code directly queries perms_global_version.
**Suggested fix direction:** Add `ALTER TABLE perms_global_version ENABLE ROW LEVEL SECURITY; CREATE POLICY perms_global_select ON perms_global_version FOR SELECT USING (true);` to allow public visibility, or restrict to service_role only if internal-only.
**Confidence:** MEDIUM

### F-B12-3-06 — No verification that xlsx permission keys match DB table columns 1:1
**File:line:** `/Users/veritypost/Desktop/verity-post/scripts/import-permissions.js:145–149` (xlsx parsing) vs no verification of key validity against DB schema.
**Evidence:**
```javascript
const setLinkRows = [];
for (const p of xlsx.permissions) {
  for (const sk of p.sets) {
    setLinkRows.push({ permission_key: p.key, set_key: sk });
  }
}
// No validation that p.key exists in DB or is a valid permission_key
```
**Impact:** If xlsx contains a permission key that doesn't exist in the DB or if a key is malformed (e.g., "read_articles " with trailing space), the upsert silently creates or deactivates wrong records. Orphan permissions or dangling links in permission_set_perms.
**Reproduction:** Manually add a typo permission key to xlsx (e.g., "read_articles_typo"), run `--apply` → orphan permission created in DB, never used, silently deactivated on next run.
**Suggested fix direction:** Add pre-flight validation: extract all active permissions from DB, cross-check xlsx keys against that set, warn/error on unknown keys.
**Confidence:** MEDIUM

## LOW

### F-B12-3-07 — Foreign key cascades not systematically audited
**File:line:** Schema files contain ~312 FOREIGN KEY references; migration 138_fk_cascade_cleanup.sql suggests prior drift.
**Evidence:**
```
138_fk_cascade_cleanup.sql exists, indicating prior cascade issues were fixed.
No comprehensive audit of cascade behavior across all 312 FK refs visible in output.
```
**Impact:** If cascade semantics are not consistent (some ON DELETE CASCADE, some ON DELETE SET NULL), deleting a parent record may leave orphan children or trigger unintended deletes. Not immediately visible without querying each constraint.
**Reproduction:** Code-reading only. Would require: `SELECT constraint_name, table_name, column_name, foreign_table_name, delete_rule FROM information_schema.referential_constraints WHERE table_schema='public' ORDER BY delete_rule;` to audit all FKs.
**Suggested fix direction:** Run SQL query above against prod to verify all delete rules are intentional. Add comment to key cascades documenting why.
**Confidence:** LOW

## UNSURE

### F-B12-3-08 — Supabase migrations log drift not checked
**File:line:** Would require Supabase MCP `execute_sql` to check `supabase_migrations` table.
**Evidence:** Not audited—would need to query: `SELECT COUNT(*), MAX(name) FROM supabase_migrations;` and compare to local `schema/*.sql` count and highest-numbered file.
**Impact:** If supabase_migrations log is missing migrations or lists migrations not on disk, the DB and code are out of sync.
**Reproduction:** Would require: Supabase CLI or direct DB query.
**Suggested fix direction:** Run `supabase db list-migrations` or query `supabase_migrations` to verify all 160 local migrations are recorded in the log.
**Confidence:** LOW—needs MCP read-only query to confirm.

---

## Summary

**Critical:** Reset scaffold is 55 migrations behind; 14 tables have RLS but zero policies (all DML blocked).
**High:** Permissions.xlsx path hardcoded to owner's Desktop; no validation of permission keys against DB.
**Medium:** perms_global_version lacks RLS; foreign key cascades not systematically audited.
**Low:** Supabase migrations log drift not verified (needs DB query).

**Total findings:** 8 (2 CRITICAL, 1 HIGH, 2 MEDIUM, 2 LOW, 1 UNSURE).
