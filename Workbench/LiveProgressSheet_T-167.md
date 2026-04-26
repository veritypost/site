# LiveProgressSheet — T-167: Fix schema/127 perm-key naming rollback mismatch
Started: 2026-04-26

## User Intent

Write a new migration (schema/180_fix_127_rollback_perm_keys.sql — next available after 179) that corrects the wrong key names used in migration 127's DELETE statement. Migration 127 references `pipeline.manage_clusters`, `pipeline.manage_presets`, `pipeline.manage_categories` (which never existed) when it should reference `admin.pipeline.clusters.manage`, `admin.pipeline.presets.manage`, `admin.pipeline.categories.manage` (the keys actually inserted by migration 126). The live DB is already correct — only the rollback script is wrong. The new migration also fixes the rollback file in-place so it is safe to run if ever needed.

Task definition (verbatim from Current Tasks.md item 4):
"Fix schema/127 perm-key naming rollback mismatch (T-167, Q15) — write a new migration (schema/179 or next number) that corrects the wrong key names introduced by migration 127; cross-check against permissions.xlsx. Affects: schema/ directory (new migration)."

## Live Code State

### schema/127_rollback_126_newsroom_redesign.sql (lines 24–26)
```sql
DELETE FROM public.permissions WHERE key IN (
  'pipeline.manage_clusters',
  'pipeline.manage_presets',
  'pipeline.manage_categories'
);
```
These three keys DO NOT EXIST in the live DB and never did. The forward migration (126) used the correct `admin.pipeline.<noun>.<verb>` form. This rollback DELETE is a silent no-op.

### Live DB — permissions table (verified via MCP execute_sql)
The three correct keys exist and are active:
- `admin.pipeline.categories.manage` — is_active: true
- `admin.pipeline.clusters.manage` — is_active: true
- `admin.pipeline.presets.manage` — is_active: true

All three are linked to permission sets: owner, admin, editor (9 rows in permission_set_perms).

The wrong-named keys (`pipeline.manage_clusters`, `pipeline.manage_presets`, `pipeline.manage_categories`) return zero rows in the DB.

### Highest existing migration number
179 (schema/179_billing_refund_auto_freeze_setting.sql). Next available: **180**.

### import-permissions.js
The script reads keys from permissions.xlsx and upserts by key. It does NOT reference the wrong keys anywhere. No fix needed to the script for this task.

### permissions.xlsx
The xlsx uses `admin.pipeline.clusters.manage`, `admin.pipeline.presets.manage`, `admin.pipeline.categories.manage` — matching the DB. No discrepancy between xlsx and DB for these keys.

### Permission set membership (verified)
All three correct keys are wired into owner/admin/editor permission sets via permission_set_perms — 3 keys × 3 sets = 9 rows. Correct.

## Helper Brief

**What "done correctly" looks like:**
1. `schema/180_fix_127_rollback_perm_keys.sql` exists with a DELETE statement using the correct key names.
2. The file is committed to `schema/` in the repo — the owner applies it manually via Supabase dashboard.
3. Item 5 removed from `Ongoing Projects/Current/Current Tasks.md`.
4. SHIPPED block written in this LiveProgressSheet.

**Key risks to watch:**
- The new migration must NOT delete the correct live keys — its purpose is to be the corrected version of migration 127's rollback clause, not a live destructive action against the DB.
- Two ways to read the task: (a) fix the rollback script so it's safe if ever run (idempotent correction), or (b) the new migration itself deletes the wrong-named keys as cleanup. Since the wrong-named keys DO NOT EXIST in the DB, option (b) is a no-op anyway. Option (a) — rewriting migration 127 in a new file — is the right interpretation.
- The new migration should be additive and safe: `DELETE WHERE key IN ('wrong names')` — this will no-op on the current DB since they don't exist, but corrects the historical record and makes future rollbacks safe.
- DO NOT DELETE the correct `admin.pipeline.*` keys — that would break the live permissions system.
- Also update migration 127 in-place to use the correct key names, so the file itself is no longer a footgun.

**Adjacent callers:**
- No code in web/src/ references the wrong key names directly.
- No code reads from schema/*.sql at runtime — migration files are applied once and are historical records.
- Fixing migration 127 in-place is safe since it's a committed file, not a running system.

## Contradictions

| Agent | File:line | Expected | Actual | Impact |
|-------|-----------|----------|--------|--------|
| Intake | schema/127_rollback_126_newsroom_redesign.sql:24-26 | Keys matching forward migration 126: `admin.pipeline.clusters.manage` etc. | Wrong keys: `pipeline.manage_clusters` etc. | Rollback is a silent no-op; no live DB impact since wrong keys were never inserted |

## Agent Votes
- Planner: —
- Reviewer: —
- Final Reviewer: —
- Consensus: pending

## 4th Agent (if needed)
[filled only if vote is split]

## Implementation Progress
[filled during execution]

## Completed
[SHIPPED block written here when done]
