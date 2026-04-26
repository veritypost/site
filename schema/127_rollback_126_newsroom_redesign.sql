-- Rollback for migration 126

DROP FUNCTION IF EXISTS public.undismiss_cluster(uuid);
DROP FUNCTION IF EXISTS public.dismiss_cluster(uuid,text);
DROP FUNCTION IF EXISTS public.archive_cluster(uuid,text);
DROP FUNCTION IF EXISTS public.split_cluster(uuid,uuid[],text,text);
DROP FUNCTION IF EXISTS public.merge_clusters(uuid,uuid);
DROP FUNCTION IF EXISTS public.reassign_cluster_items(uuid,uuid,text);

DROP TABLE IF EXISTS public.ai_prompt_presets;

DROP INDEX IF EXISTS public.idx_feed_clusters_audience_active;
DROP INDEX IF EXISTS public.idx_feed_clusters_audience_created;

ALTER TABLE public.feed_clusters
  DROP COLUMN IF EXISTS archived_at,
  DROP COLUMN IF EXISTS archived_reason,
  DROP COLUMN IF EXISTS dismissed_at,
  DROP COLUMN IF EXISTS dismissed_by,
  DROP COLUMN IF EXISTS dismiss_reason,
  DROP COLUMN IF EXISTS audience;

DELETE FROM public.permissions WHERE key IN (
  'admin.pipeline.clusters.manage',
  'admin.pipeline.presets.manage',
  'admin.pipeline.categories.manage'
);
