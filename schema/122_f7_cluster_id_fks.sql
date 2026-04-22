-- schema/122_f7_cluster_id_fks.sql
-- 2026-04-22 — F7 follow-up: close 5 missing cluster_id FKs + symmetrize locked_by ON DELETE
--
-- Background: migration 114 declared `cluster_id uuid` on discovery_items,
-- kid_discovery_items, pipeline_runs, pipeline_costs, kid_articles without a
-- REFERENCES clause, silently skipping 5 foreign keys. Separately, 116 wired
-- feed_clusters.locked_by with ON DELETE NO ACTION while its sibling
-- last_generation_run_id got SET NULL — an asymmetry that blocks pipeline_runs
-- deletion whenever a stale lock is held.
--
-- This migration:
--   1. Adds 5 FKs from *.cluster_id → feed_clusters(id) with the ON DELETE
--      behavior matching each table's lifecycle role:
--        discovery_items.cluster_id      SET NULL  (preserve raw item)
--        kid_discovery_items.cluster_id  SET NULL  (parity w/ adult twin)
--        pipeline_runs.cluster_id        SET NULL  (preserve audit row)
--        pipeline_costs.cluster_id       SET NULL  (preserve billing row)
--        kid_articles.cluster_id         CASCADE   (parity w/ articles.cluster_id)
--   2. Flips feed_clusters.locked_by from NO ACTION to SET NULL so that
--      deleting a pipeline_runs row auto-clears a stale lock (symmetry with
--      last_generation_run_id).
--   3. Adds two supporting indexes on pipeline_runs.cluster_id +
--      pipeline_costs.cluster_id (the other 3 tables already have one from 114).
--
-- Pre-flight verified against live DB fyiwulqphgmoqullmrfn (2026-04-22):
--   - 0 rows in all 5 affected tables (no orphan cleanup needed).
--   - All 5 cluster_id columns are nullable (SET NULL legal).
--   - feed_clusters_locked_by_fkey currently has confdeltype='a' (NO ACTION).
--   - articles.cluster_id FK (fk_articles_cluster_id) NOT touched.
--
-- Idempotent: every ALTER guarded by pg_constraint existence check or
-- IF NOT EXISTS. BEGIN/COMMIT wrapped.
--
-- Rollback: schema/123_rollback_122_f7_cluster_id_fks.sql

BEGIN;

-- 1. discovery_items.cluster_id → feed_clusters(id) ON DELETE SET NULL
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discovery_items_cluster_id_fkey') THEN
    ALTER TABLE public.discovery_items
      ADD CONSTRAINT discovery_items_cluster_id_fkey
      FOREIGN KEY (cluster_id) REFERENCES public.feed_clusters(id) ON DELETE SET NULL;
  END IF;
END$$;

-- 2. kid_discovery_items.cluster_id → feed_clusters(id) ON DELETE SET NULL
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kid_discovery_items_cluster_id_fkey') THEN
    ALTER TABLE public.kid_discovery_items
      ADD CONSTRAINT kid_discovery_items_cluster_id_fkey
      FOREIGN KEY (cluster_id) REFERENCES public.feed_clusters(id) ON DELETE SET NULL;
  END IF;
END$$;

-- 3. pipeline_runs.cluster_id → feed_clusters(id) ON DELETE SET NULL
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_runs_cluster_id_fkey') THEN
    ALTER TABLE public.pipeline_runs
      ADD CONSTRAINT pipeline_runs_cluster_id_fkey
      FOREIGN KEY (cluster_id) REFERENCES public.feed_clusters(id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS pipeline_runs_cluster_idx
  ON public.pipeline_runs (cluster_id) WHERE cluster_id IS NOT NULL;

-- 4. pipeline_costs.cluster_id → feed_clusters(id) ON DELETE SET NULL
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_costs_cluster_id_fkey') THEN
    ALTER TABLE public.pipeline_costs
      ADD CONSTRAINT pipeline_costs_cluster_id_fkey
      FOREIGN KEY (cluster_id) REFERENCES public.feed_clusters(id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS pipeline_costs_cluster_idx
  ON public.pipeline_costs (cluster_id) WHERE cluster_id IS NOT NULL;

-- 5. kid_articles.cluster_id → feed_clusters(id) ON DELETE CASCADE
--    (parity with articles.cluster_id — fk_articles_cluster_id already CASCADE)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kid_articles_cluster_id_fkey') THEN
    ALTER TABLE public.kid_articles
      ADD CONSTRAINT kid_articles_cluster_id_fkey
      FOREIGN KEY (cluster_id) REFERENCES public.feed_clusters(id) ON DELETE CASCADE;
  END IF;
END$$;

-- 6. Flip feed_clusters.locked_by from NO ACTION → SET NULL
--    Drop + re-add under the same name so the relationship in pg_constraint
--    stays identifiable (and the 116 rollback still finds it by name).
ALTER TABLE public.feed_clusters DROP CONSTRAINT IF EXISTS feed_clusters_locked_by_fkey;
ALTER TABLE public.feed_clusters
  ADD CONSTRAINT feed_clusters_locked_by_fkey
  FOREIGN KEY (locked_by) REFERENCES public.pipeline_runs(id) ON DELETE SET NULL;

COMMIT;
