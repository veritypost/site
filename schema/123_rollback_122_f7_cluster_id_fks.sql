-- schema/123_rollback_122_f7_cluster_id_fks.sql
-- 2026-04-22 — Rollback for schema/122_f7_cluster_id_fks.sql
--
-- Idempotent: DROP CONSTRAINT IF EXISTS on all 5 new FKs + the 2 indexes.
-- Restores feed_clusters.locked_by to ON DELETE NO ACTION to match the
-- post-116 state exactly.
--
-- Data loss caveat: SET NULL behavior that occurred between 122 and rollback
-- cannot be undone. Pipeline_runs / pipeline_costs / discovery_items rows
-- that had cluster_id NULL'd by a cluster delete remain NULL'd.

BEGIN;

ALTER TABLE public.kid_articles        DROP CONSTRAINT IF EXISTS kid_articles_cluster_id_fkey;
ALTER TABLE public.pipeline_costs      DROP CONSTRAINT IF EXISTS pipeline_costs_cluster_id_fkey;
ALTER TABLE public.pipeline_runs       DROP CONSTRAINT IF EXISTS pipeline_runs_cluster_id_fkey;
ALTER TABLE public.kid_discovery_items DROP CONSTRAINT IF EXISTS kid_discovery_items_cluster_id_fkey;
ALTER TABLE public.discovery_items     DROP CONSTRAINT IF EXISTS discovery_items_cluster_id_fkey;

DROP INDEX IF EXISTS public.pipeline_costs_cluster_idx;
DROP INDEX IF EXISTS public.pipeline_runs_cluster_idx;

-- Restore feed_clusters.locked_by to ON DELETE NO ACTION (post-116 state)
ALTER TABLE public.feed_clusters DROP CONSTRAINT IF EXISTS feed_clusters_locked_by_fkey;
ALTER TABLE public.feed_clusters
  ADD CONSTRAINT feed_clusters_locked_by_fkey
  FOREIGN KEY (locked_by) REFERENCES public.pipeline_runs(id) ON DELETE NO ACTION;

COMMIT;
