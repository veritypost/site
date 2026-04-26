# LiveProgressSheet — T-002: Fix cleanup_rate_limit_events RPC column mismatch (occurred_at vs created_at)
Started: 2026-04-26

## User Intent
Fix the `cleanup_rate_limit_events` RPC which references a non-existent column `occurred_at` instead of the actual column `created_at` on the `rate_limit_events` table. The result is that the cron cleanup job has never deleted any rows (8,574 rows accumulated, never cleared). The fix is a new migration (`178`) that re-creates the function referencing the correct column name.

## Live Code State

### rate_limit_events table (confirmed via information_schema.columns, DB live)
Columns: id, rule_id, user_id, ip_address, endpoint, action, request_count, window_start, user_agent, metadata, **created_at** (timestamptz NOT NULL DEFAULT now()), key
- NO `occurred_at` column exists on this table.

### cleanup_rate_limit_events (live in pg_proc — BROKEN)
Body references `WHERE occurred_at < now() - make_interval(days => p_retention_days)` — column does not exist.
Origin: schema/170_ext_audit_cc2_cccs2_cccs5.sql line 71–91

### Cron caller (no change needed)
File: web/src/app/api/cron/rate-limit-cleanup/route.ts
Calls: `cleanup_rate_limit_events({ p_retention_days: 7 })` via service role RPC — correct, no code changes needed.

### reset_and_rebuild_v2.sql
Line 4378: existing `purge_rate_limit_events` function uses `created_at` correctly — confirms `created_at` is the canonical column.

### Row count
8,574 rows in rate_limit_events — none ever deleted due to the broken WHERE clause.

### Next migration number
178 (last applied: 177_grant_ai_models_select.sql)

### Helper Brief
Done correctly: a single new migration file `schema/178_fix_cleanup_rate_limit_events_col.sql` that issues `CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_events` with `created_at` in the WHERE clause instead of `occurred_at`. No web/iOS code changes. Verify via pg_proc post-apply. Risk: trivial — single-function correction, no callers change, no RLS impact.

## Contradictions
[filled by any agent that finds a conflict between the plan and live code]
Format: Agent name | File:line | Expected | Actual | Impact

## Agent Votes
- Planner: APPROVE
- Reviewer: APPROVE
- Final Reviewer: APPROVE
- Consensus: 3/3 APPROVE — proceed to implementation

## 4th Agent (if needed)
[filled only if vote is split]

## Implementation Progress
[filled by background agents during execution]

## Completed
[SHIPPED block written here when done]
