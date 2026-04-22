-- schema/120_f7_pipeline_runs_error_type.sql
-- 2026-04-22 — F7 Phase 3 Task 16: add error_type column to pipeline_runs + backfill
--
-- Before this migration, Task 10's generate route stashed error_type inside
-- output_summary jsonb because pipeline_runs.error_type did not exist. Now
-- promoted to a real text column so Task 12 observability + Phase 4 admin UI
-- can filter/group by error_type without jsonb extraction.
--
-- Route (web/src/app/api/admin/pipeline/generate/route.ts) writes BOTH the
-- real column AND the legacy output_summary keys for one cycle — backward
-- compat for any in-flight consumers. Task 16 follow-up removes the legacy
-- stash.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + WHERE error_type IS NULL guard.
-- STAGED pending owner apply (no MCP apply_migration per §3i).
-- Rollback: schema/121_rollback_120_f7_pipeline_runs_error_type.sql
--
-- No CHECK constraint on error_type: vocabulary may extend (Phase 4 may
-- introduce 'cluster_locked', 'permission_denied', etc. from statusForError
-- switch). Application layer is source of truth; DB stores whatever string
-- the app writes.
--
-- No index on error_type v1: Task 12 observability queries are per-run (key
-- lookup), not per-error_type aggregation. Phase 4 dashboard (Task 26) may
-- want a partial index — tracked as follow-up.

BEGIN;

ALTER TABLE public.pipeline_runs
  ADD COLUMN IF NOT EXISTS error_type text;

COMMENT ON COLUMN public.pipeline_runs.error_type IS
  'Error taxonomy string. Vocabulary owned by classifyError() + statusForError() in web/src/app/api/admin/pipeline/generate/route.ts. NULL for successful runs.';

-- Backfill from legacy output_summary stash. Covers both key names in use:
--   output_summary.error_type        (failRun helper — early failures)
--   output_summary.final_error_type  (main finally — catch block)
UPDATE public.pipeline_runs
   SET error_type = coalesce(
         output_summary->>'error_type',
         output_summary->>'final_error_type'
       )
 WHERE error_type IS NULL
   AND (output_summary ? 'error_type' OR output_summary ? 'final_error_type')
   AND coalesce(
         output_summary->>'error_type',
         output_summary->>'final_error_type'
       ) IS NOT NULL;

COMMIT;
