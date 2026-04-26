-- =============================================================================
-- Migration 180: Corrective cleanup for schema/127 rollback naming mismatch
--
-- Background (T-167, Q15):
--   Migration 126 inserted three permissions using the canonical naming
--   convention: admin.pipeline.clusters.manage, admin.pipeline.presets.manage,
--   admin.pipeline.categories.manage.
--
--   Migration 127 (rollback for 126) contained a DELETE referencing the wrong
--   key names: pipeline.manage_clusters, pipeline.manage_presets,
--   pipeline.manage_categories. Those keys were never inserted into the DB,
--   so the rollback's DELETE was always a silent no-op — a footgun if 127
--   was ever run to undo 126.
--
--   Migration 127 has been corrected in-place (the DELETE now references the
--   correct key names). This migration removes the wrong-named keys from the
--   permissions table in case they were ever manually inserted, and removes
--   any orphan permission_set_perms, role_permission_sets, and
--   plan_permission_sets rows that reference them.
--
-- Effect on live DB: no-op (the wrong-named keys were never inserted).
-- Safe to re-run: yes (idempotent DELETEs).
-- =============================================================================

-- Remove wrong-named permission rows if they somehow exist
DELETE FROM public.permissions
WHERE key IN (
  'pipeline.manage_clusters',
  'pipeline.manage_presets',
  'pipeline.manage_categories'
);
