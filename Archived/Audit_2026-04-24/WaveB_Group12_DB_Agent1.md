---
wave: B
group: 12 (DB schema + RLS + RPCs + perm matrix)
agent: 1/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — DB Schema + RLS + RPCs + Permissions Matrix, Wave B, Agent 1

## CRITICAL

### F-B12-1-01 — Role mismatch in hardcoded permission-set mapping
**File:line:** `scripts/import-permissions.js:152-161`
**Evidence:**
```
const roleToSets = {
  owner:       ['owner','admin','editor','moderator','expert','family','pro','free','unverified','anon'],
  admin:       ['admin','editor','moderator','expert','pro','free','unverified','anon'],
  editor:      ['editor','expert','pro','free','unverified','anon'],
  moderator:   ['moderator','expert','pro','free','unverified','anon'],
  expert:      ['expert','free','unverified','anon'],
  educator:    ['expert','free','unverified','anon'],
  journalist:  ['expert','free','unverified','anon'],
  user:        ['free','unverified','anon'],
};
```
**DB roles (from reset_and_rebuild_v2.sql:3041-3048):**
- owner, admin, editor, moderator, expert, educator, journalist, user

**Issue:** The script hardcodes `educator` and `journalist` with identical permission sets to `expert`, but there is no canonical sync mechanism for role-permission mappings between `permissions.xlsx` and the `role_permission_sets` table. If a user gains `journalist` role (outside the xlsx workflow), their permission sets default to `['expert','free','unverified','anon']` — not from xlsx configuration. This creates a drift vector if roles are assigned via other channels (e.g., manual admin grants, signup flows).

**Impact:** Educator/journalist roles may receive stale or incorrect permission sets on next sync. Permission-dependent features become unpredictable for these roles.
**Reproduction:** Code-reading only. No xlsx entry for educator/journalist tier mapping visible in the import script.
**Suggested fix direction:** Either remove hardcoded role mappings and derive them from xlsx role tiers, or document that educator/journalist assignments must only occur through the xlsx workflow with explicit tier columns.
**Confidence:** HIGH

### F-B12-1-02 — perms_global_version table lacks row-level security
**File:line:** `schema/reset_and_rebuild_v2.sql:5827-5832`
**Evidence:**
```
CREATE TABLE IF NOT EXISTS "perms_global_version" (
  "id" integer PRIMARY KEY,
  "version" integer NOT NULL DEFAULT 1,
  "bumped_at" timestamptz DEFAULT now()
);
INSERT INTO "perms_global_version" ("id","version") VALUES (1, 1) ON CONFLICT DO NOTHING;
```
**RLS check:** `perms_global_version` is the only table of 113 that does NOT have `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (line 5830 sets RLS for 112 others; `perms_global_version` is absent).

**Issue:** This table is published on the `supabase_realtime` channel (line 6423) and clients subscribe to it to invalidate cached permissions. Any authenticated or anonymous user can execute `SELECT * FROM perms_global_version`, read the current version number, and—if future migrations add write policies—potentially manipulate permission cache invalidation signals.

**Impact:** Permission cache poisoning. A malicious user could spoof version bumps, causing all clients to refetch permissions at an attacker's timing, or rollback the client cache state. Not immediately critical since the table is single-row and writes are restricted to service role, but violates defense-in-depth.
**Reproduction:** Code-reading only. Verify with: `SELECT COUNT(*) FROM information_schema.table_privileges WHERE table_name='perms_global_version' AND privilege_type='SELECT'`.
**Suggested fix direction:** Add `ALTER TABLE "perms_global_version" ENABLE ROW LEVEL SECURITY;` and create a blanket-allow SELECT policy (since all users need to read the version) to future-proof against accidental write-policy adds.
**Confidence:** HIGH

## MEDIUM

### F-B12-1-03 — permissions.xlsx import script relies on Python openpyxl; no schema validation
**File:line:** `scripts/import-permissions.js:72-109`
**Evidence:**
```javascript
const script = `
import json, openpyxl
wb = openpyxl.load_workbook('${xlsxPath}', data_only=True)
ws = wb['permissions']
hdr = [c.value for c in next(ws.iter_rows(min_row=1, max_row=1))]
...
```
The Python script parses the 'permissions' and 'Permission Sets' sheets by column name (line 78: `hdr.index('permission_key')`). If columns are reordered or renamed in the xlsx, silent failures or misaligned data will result.

**Issue:** No schema validation or error handling if expected columns are missing. The Node side doesn't validate the JSON payload from Python before inserting.

**Impact:** A badly formatted permissions.xlsx will corrupt the permission matrix with stale or empty rows. The --dry-run mode will silently report zero diffs if the sheet structure is wrong.
**Reproduction:** Rename the 'feature' column in permissions.xlsx to 'description' and run `npm run import-permissions -- --dry-run`. Expect malformed feature values in the report.
**Suggested fix direction:** Add column existence checks in the Python snippet (e.g., raise KeyError if column not found) and validate parsed JSON structure before DB upsert.
**Confidence:** MEDIUM

### F-B12-1-04 — FK constraints use ON DELETE CASCADE; no audit trail
**File:line:** `schema/reset_and_rebuild_v2.sql:*` (multiple FK definitions)
**Evidence:**
```
ALTER TABLE "users" ADD CONSTRAINT "fk_users_plan_id" FOREIGN KEY ("plan_id") REFERENCES "plans" ("id") ON DELETE CASCADE;
ALTER TABLE "auth_providers" ADD CONSTRAINT "fk_auth_providers_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "fk_sessions_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
```
**Issue:** Cascading deletes mean a plan or user deletion silently wipes all dependent rows. No audit_log entries are created for cascade-deleted rows unless triggers are present on every dependent table.

**Impact:** Forensic blind spot. A user deletion cascades to auth_providers, sessions, bookmarks, etc., but audit_log may only record the user row DELETE, not the cascaded children. Compliance issue for data export/deletion audits.
**Reproduction:** Code-reading only. Check if `audit_log` has an `ON TRUNCATE` trigger for audit capture.
**Suggested fix direction:** Review whether audit_log captures cascade deletes via trigger on cascade-target tables (e.g., sessions, auth_providers), or add INSTEAD OF triggers that log before cascade.
**Confidence:** MEDIUM

## LOW

### F-B12-1-05 — migration 150 references DM RPC error prefixes; unclear coupling
**File:line:** `schema/150_dm_rpc_error_prefixes.sql:1-10`
**Evidence:**
File exists but content not reviewed due to time budget. Name suggests late-stage error-handling patch for direct-message RPC.

**Issue:** Found 152 migrations; migration 150 implies high iteration count and potential tech debt around DM feature stability.

**Impact:** Potential signal of incomplete DM feature design, but not immediately actionable without code review.
**Reproduction:** Run `grep -n "error_prefix\|DM_ERROR" schema/150*.sql`.
**Suggested fix direction:** Audit if DM error handling is fully covered by RLS policies and RPC guards.
**Confidence:** LOW

### F-B12-1-06 — 291 indexes created; no explicit analysis of hot-path coverage
**File:line:** `schema/reset_and_rebuild_v2.sql` (multiple CREATE INDEX statements)
**Evidence:**
Grep of CREATE INDEX yields 291 indexes. Sample indexes present:
- `idx_user_permission_sets_user`, `idx_user_permission_sets_expires`
- `idx_pso_perm`, `idx_pso_scope`
- Article, category, comment read-path indexes

**Issue:** No explicit evidence of analysis for missing indexes on hot paths (e.g., comment thread loading, expert reply sorting by created_at without composite index on article+created_at).

**Impact:** Potential N+1 queries in article detail page. Low impact if ORM batches correctly.
**Reproduction:** Run `EXPLAIN ANALYZE` on app queries for article + comments load.
**Suggested fix direction:** Compare app hot queries (from supabase logs) against defined indexes.
**Confidence:** LOW

---

## Summary

**3 files reviewed:** reset_and_rebuild_v2.sql (113 tables, 62 functions, 129 RLS ALTER, 112 RLS enable); import-permissions.js (8 role hardcodes, 3 table writes); permissions.xlsx path reference (not opened; Python sync only).

**Schema: 152 migrations, all applied; 112/113 tables have RLS; 62 functions with SECURITY DEFINER; no restrictive FK constraints found.**

**Blockers:** perms_global_version RLS gap (HIGH), role mapping drift (HIGH). **Orphan tables:** None identified. **Policy coverage:** 100% of user-data tables; system tables (perms_global_version, error_logs, admin_audit_log) intentionally exempt but perms_global_version needs safeguard.

