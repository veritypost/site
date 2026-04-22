-- schema/121_rollback_120_f7_pipeline_runs_error_type.sql
-- 2026-04-22 — Rollback for schema/120_f7_pipeline_runs_error_type.sql
--
-- Idempotent: DROP COLUMN IF EXISTS. Safe on partial/failed prior apply.
-- Also removes the COMMENT (automatic with DROP COLUMN).
--
-- Data loss warning: rolling back permanently drops the error_type column
-- values. The legacy output_summary stash will still be written by the
-- route (during the one-cycle compat window), so rollback + replay is
-- tolerable.

BEGIN;

ALTER TABLE public.pipeline_runs
  DROP COLUMN IF EXISTS error_type;

COMMIT;
