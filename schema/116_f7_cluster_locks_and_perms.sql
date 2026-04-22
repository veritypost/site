-- schema/116_f7_cluster_locks_and_perms.sql
-- 2026-04-22 — F7 Phase 3 Task 11: cluster review + lock/unlock RPCs
--
-- Drafted + reviewed via 4-agent pre-impl flow on 2026-04-22. Every finding
-- resolved before implementation.
--
-- Applied via Supabase SQL editor (NOT mcp__supabase__apply_migration —
-- read-only in this session). Owner reviews + runs.
--
-- Rollback: schema/117_rollback_116_f7_cluster_locks.sql
--
-- Adds:
--   feed_clusters: locked_by, locked_at, last_generation_run_id, generation_state
--   RPCs: claim_cluster_lock, release_cluster_lock
--   permissions: admin.pipeline.run_generate, admin.pipeline.release_cluster_lock
--     (mirrored into same permission_sets as admin.pipeline.run_ingest)
--   rate_limits: newsroom_cluster_unlock (10 / 60s)
--   settings: pipeline.default_category_id (fallback when writer+cluster yield none)
--   UNIQUE partial indexes: uniq_articles_cluster_active, uniq_kid_articles_cluster_active
--     (belt-and-suspenders guard against duplicate published articles per cluster)
--
-- Pre-flight verified against live DB (2026-04-22):
--   - bump_user_perms_version(uuid) is PER-USER; global equivalent is
--     bump_perms_global_version() — this migration uses the latter (spec fix).
--   - permissions.display_name + category are NOT NULL — seeded.
--   - rate_limits.display_name is NOT NULL — seeded.
--   - settings.value_type has no CHECK, but 'text' is not in existing rows;
--     using 'string' (the column default) for the UUID-string fallback.
--   - articles + kid_articles currently have 0 (cluster_id,deleted_at IS NULL)
--     duplicates — unique partial indexes are safe.

BEGIN;

-- ============================================================================
-- 1. feed_clusters lock columns + FKs + partial index
-- ============================================================================

ALTER TABLE public.feed_clusters
  ADD COLUMN IF NOT EXISTS locked_by uuid,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_generation_run_id uuid,
  ADD COLUMN IF NOT EXISTS generation_state text;

-- FK guard block — ADD COLUMN IF NOT EXISTS + REFERENCES can silently skip
-- the FK on re-run. Add the constraints only if not already present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feed_clusters_locked_by_fkey'
  ) THEN
    ALTER TABLE public.feed_clusters
      ADD CONSTRAINT feed_clusters_locked_by_fkey
      FOREIGN KEY (locked_by) REFERENCES public.pipeline_runs(id) ON DELETE NO ACTION;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feed_clusters_last_gen_run_fkey'
  ) THEN
    ALTER TABLE public.feed_clusters
      ADD CONSTRAINT feed_clusters_last_gen_run_fkey
      FOREIGN KEY (last_generation_run_id) REFERENCES public.pipeline_runs(id) ON DELETE SET NULL;
  END IF;
END$$;

-- Partial index — only locked rows, for expired-lock sweeps.
CREATE INDEX IF NOT EXISTS idx_feed_clusters_locked_at
  ON public.feed_clusters (locked_at)
  WHERE locked_at IS NOT NULL;

-- ============================================================================
-- 2. claim_cluster_lock RPC
-- ============================================================================
-- Atomic claim: UPDATE ... WHERE lock-free OR stale (TTL elapsed) RETURNING.
-- Returns (acquired bool, locked_by uuid, locked_at timestamptz).
-- On miss, returns the current owner's state so the caller can distinguish
-- "not found" vs "held by another run".

CREATE OR REPLACE FUNCTION public.claim_cluster_lock(
  p_cluster_id uuid,
  p_locked_by  uuid,
  p_ttl_sec    int DEFAULT 600
) RETURNS TABLE (acquired boolean, locked_by uuid, locked_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rows int;
BEGIN
  UPDATE public.feed_clusters
     SET locked_by        = p_locked_by,
         locked_at        = now(),
         generation_state = 'generating'
   WHERE id = p_cluster_id
     AND (feed_clusters.locked_by IS NULL
          OR feed_clusters.locked_at < now() - make_interval(secs => p_ttl_sec))
  RETURNING feed_clusters.locked_by, feed_clusters.locked_at
       INTO claim_cluster_lock.locked_by, claim_cluster_lock.locked_at;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    -- Either the cluster doesn't exist OR it's currently locked by someone else.
    -- Return the current state so the caller can render a useful message.
    SELECT fc.locked_by, fc.locked_at
      INTO claim_cluster_lock.locked_by, claim_cluster_lock.locked_at
      FROM public.feed_clusters fc
     WHERE fc.id = p_cluster_id;
    acquired := false;
    RETURN NEXT;
    RETURN;
  END IF;

  acquired := true;
  RETURN NEXT;
END$$;

REVOKE ALL ON FUNCTION public.claim_cluster_lock(uuid, uuid, int) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_cluster_lock(uuid, uuid, int) TO service_role;

-- ============================================================================
-- 3. release_cluster_lock RPC
-- ============================================================================
-- Normal release: pass p_locked_by = the run's id; only that owner can release.
-- Admin override: pass p_locked_by = NULL — unconditional release.
-- Returns true iff a row was updated.

CREATE OR REPLACE FUNCTION public.release_cluster_lock(
  p_cluster_id uuid,
  p_locked_by  uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rows int;
BEGIN
  UPDATE public.feed_clusters
     SET locked_by        = NULL,
         locked_at        = NULL,
         generation_state = CASE
           WHEN generation_state = 'generating' THEN NULL
           ELSE generation_state
         END
   WHERE id = p_cluster_id
     AND (p_locked_by IS NULL OR feed_clusters.locked_by = p_locked_by);

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END$$;

REVOKE ALL ON FUNCTION public.release_cluster_lock(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.release_cluster_lock(uuid, uuid) TO service_role;

-- ============================================================================
-- 4. Seed new permissions (match the shape of admin.pipeline.run_ingest)
-- ============================================================================

INSERT INTO public.permissions (key, display_name, description, category, ui_section, is_active, requires_verified, deny_mode, sort_order, is_public)
VALUES
  ('admin.pipeline.run_generate',
    'Start pipeline run (generate)',
    'Trigger article generation for a feed cluster',
    'ui', 'admin_pipeline', true, false, 'locked', 0, false),
  ('admin.pipeline.release_cluster_lock',
    'Release cluster lock',
    'Manually unlock a stuck feed_clusters row',
    'ui', 'admin_pipeline', true, false, 'locked', 0, false)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- 5. Mirror permission_set_perms from admin.pipeline.run_ingest
-- ============================================================================
-- Same sets that can run ingest can also run generate + release lock.

INSERT INTO public.permission_set_perms (permission_set_id, permission_id)
SELECT DISTINCT psp.permission_set_id, new_p.id
  FROM public.permission_set_perms psp
  JOIN public.permissions src ON src.id = psp.permission_id
 CROSS JOIN public.permissions new_p
 WHERE src.key = 'admin.pipeline.run_ingest'
   AND new_p.key IN ('admin.pipeline.run_generate', 'admin.pipeline.release_cluster_lock')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 6. Bump global perms version so all clients invalidate their cache
-- ============================================================================

SELECT public.bump_perms_global_version();

-- ============================================================================
-- 7. rate_limits seed — admin cluster-unlock override
-- ============================================================================

INSERT INTO public.rate_limits (key, display_name, description, max_requests, window_seconds, scope, is_active)
VALUES (
  'newsroom_cluster_unlock',
  'Newsroom cluster unlock',
  'Admin cluster-lock override endpoint (F7 Phase 3 Task 11).',
  10, 60, 'user', true
)
ON CONFLICT (key) DO UPDATE SET
  display_name   = EXCLUDED.display_name,
  description    = EXCLUDED.description,
  max_requests   = EXCLUDED.max_requests,
  window_seconds = EXCLUDED.window_seconds,
  scope          = EXCLUDED.scope,
  is_active      = EXCLUDED.is_active,
  updated_at     = now();

-- ============================================================================
-- 8. pipeline.default_category_id fallback — markets (evergreen default)
-- ============================================================================
-- Used when the generate step yields no category match. Insert-only: if the
-- key already exists, leave whatever the owner set in place.

INSERT INTO public.settings (key, value, value_type, category, display_name, description, is_public, is_sensitive)
SELECT 'pipeline.default_category_id',
       (SELECT id::text FROM public.categories WHERE slug = 'markets' LIMIT 1),
       'string',
       'pipeline',
       'Default category fallback',
       'Fallback category_id when writer+cluster yield none (F7 Phase 3 Task 11).',
       false, false
WHERE NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'pipeline.default_category_id');

-- ============================================================================
-- 9. UNIQUE partial indexes — belt+suspenders vs the row-level lock
-- ============================================================================
-- A concurrency bug that slips past claim_cluster_lock will still hit a
-- unique-violation here, preventing silent dupes from landing.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_articles_cluster_active
  ON public.articles (cluster_id)
  WHERE cluster_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_kid_articles_cluster_active
  ON public.kid_articles (cluster_id)
  WHERE cluster_id IS NOT NULL AND deleted_at IS NULL;

COMMIT;
