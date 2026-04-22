-- schema/117_rollback_116_f7_cluster_locks.sql
-- 2026-04-22 — Rollback for schema/116_f7_cluster_locks_and_perms.sql
--
-- Idempotent: every statement tolerates partial prior application.
-- Reverses exactly the additions in 116 and nothing more. Existing
-- permission_set_perms rows pointing at the two new permissions are
-- deleted first (FK constraint), then the permissions, then the lock
-- columns/constraints/index, then the RPCs, then the seed rows.
--
-- Pre-existing (un-related) articles/kid_articles are not mutated.

BEGIN;

-- Partial unique indexes
DROP INDEX IF EXISTS public.uniq_kid_articles_cluster_active;
DROP INDEX IF EXISTS public.uniq_articles_cluster_active;

-- Settings row (seeded by migration 116)
DELETE FROM public.settings WHERE key = 'pipeline.default_category_id';

-- Rate-limit seed (migration 116)
DELETE FROM public.rate_limits WHERE key = 'newsroom_cluster_unlock';

-- Revoke perms from permission_set_perms first (FK → permissions.id)
DELETE FROM public.permission_set_perms
 WHERE permission_id IN (
   SELECT id FROM public.permissions
    WHERE key IN ('admin.pipeline.run_generate', 'admin.pipeline.release_cluster_lock')
 );

-- Then delete the permission rows themselves
DELETE FROM public.permissions
 WHERE key IN ('admin.pipeline.run_generate', 'admin.pipeline.release_cluster_lock');

-- RPCs
DROP FUNCTION IF EXISTS public.release_cluster_lock(uuid, uuid);
DROP FUNCTION IF EXISTS public.claim_cluster_lock(uuid, uuid, int);

-- feed_clusters — drop FKs before columns (Postgres tolerates either order,
-- but making it explicit keeps the rollback obvious).
ALTER TABLE public.feed_clusters DROP CONSTRAINT IF EXISTS feed_clusters_last_gen_run_fkey;
ALTER TABLE public.feed_clusters DROP CONSTRAINT IF EXISTS feed_clusters_locked_by_fkey;
DROP INDEX IF EXISTS public.idx_feed_clusters_locked_at;
ALTER TABLE public.feed_clusters
  DROP COLUMN IF EXISTS generation_state,
  DROP COLUMN IF EXISTS last_generation_run_id,
  DROP COLUMN IF EXISTS locked_at,
  DROP COLUMN IF EXISTS locked_by;

-- Bump global perms version so clients re-read the now-shrunken matrix
SELECT public.bump_perms_global_version();

COMMIT;
