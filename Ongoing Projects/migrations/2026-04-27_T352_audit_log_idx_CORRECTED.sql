-- =====================================================================
-- 2026-04-27_T352_audit_log_idx_CORRECTED.sql
-- T352 — re-apply the missing audit_log retention index
-- =====================================================================
-- Why this supersedes the original T352 migration's index step:
--   The original migration ended with `CREATE INDEX CONCURRENTLY ...` after
--   the BEGIN/COMMIT block, expecting the apply tool to honor the comment
--   and run it standalone. Most apply paths (Supabase SQL editor, the
--   apply_migration RPC) wrap the whole file in a single transaction,
--   which makes CONCURRENTLY illegal (Postgres errors with
--   `CREATE INDEX CONCURRENTLY cannot run inside a transaction block`).
--
--   audit_log isn't large enough that the brief write-block from a
--   non-CONCURRENTLY index is meaningful. Falling back to a regular
--   CREATE INDEX IF NOT EXISTS — idempotent on re-apply, single
--   transaction, lands cleanly.
--
-- The two functions from the original T352 (anonymize_audit_log_pii,
-- purge_audit_log) DID land successfully — verified via pg_proc 2026-04-27.
-- This file only re-applies the missed index.
-- =====================================================================

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx
  ON public.audit_log (created_at);
