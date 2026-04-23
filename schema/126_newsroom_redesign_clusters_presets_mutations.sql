-- =============================================================================
-- Migration 126: Newsroom redesign — cluster audience, archive/dismiss,
-- prompt presets, cluster mutation RPCs (move/merge/split/archive/dismiss).
--
-- Stage 1+3 of the Newsroom rewrite. Pairs with /admin/newsroom redesign.
-- =============================================================================

-- 1. feed_clusters.audience (with safe default + backfill)
ALTER TABLE public.feed_clusters
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'adult'
    CHECK (audience IN ('adult','kid'));

-- Backfill existing clusters from their discovery_items membership.
-- Kid clusters have at least one kid_discovery_items row; otherwise adult.
UPDATE public.feed_clusters fc
SET audience = 'kid'
WHERE EXISTS (
  SELECT 1 FROM public.kid_discovery_items kdi WHERE kdi.cluster_id = fc.id
);

-- 2. feed_clusters archive + dismiss columns
ALTER TABLE public.feed_clusters
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text,
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dismissed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dismiss_reason text;

CREATE INDEX IF NOT EXISTS idx_feed_clusters_audience_active
  ON public.feed_clusters (audience, archived_at, dismissed_at)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_feed_clusters_audience_created
  ON public.feed_clusters (audience, created_at DESC)
  WHERE archived_at IS NULL AND dismissed_at IS NULL;

-- 3. ai_prompt_presets — user-curated prompt library for Newsroom prompt picker
CREATE TABLE IF NOT EXISTS public.ai_prompt_presets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  description  text,
  body         text NOT NULL,
  audience     text NOT NULL DEFAULT 'both' CHECK (audience IN ('adult','kid','both')),
  category_id  uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  is_active    boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ai_prompt_presets_name_lower
  ON public.ai_prompt_presets (lower(name)) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_ai_prompt_presets_audience
  ON public.ai_prompt_presets (audience, is_active, sort_order);

ALTER TABLE public.ai_prompt_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_prompt_presets_admin_all ON public.ai_prompt_presets;
CREATE POLICY ai_prompt_presets_admin_all ON public.ai_prompt_presets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND r.name IN ('owner','admin','editor')
    )
  );

DROP TRIGGER IF EXISTS trg_ai_prompt_presets_touch ON public.ai_prompt_presets;
CREATE TRIGGER trg_ai_prompt_presets_touch
  BEFORE UPDATE ON public.ai_prompt_presets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 4. RPC: reassign_cluster_items — move one discovery item to a different cluster
CREATE OR REPLACE FUNCTION public.reassign_cluster_items(
  p_item_id uuid,
  p_target_cluster_id uuid,
  p_audience text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_cluster_id uuid;
  v_target_audience text;
BEGIN
  IF p_audience NOT IN ('adult','kid') THEN
    RAISE EXCEPTION 'invalid audience: %', p_audience USING ERRCODE = '22023';
  END IF;

  IF p_target_cluster_id IS NOT NULL THEN
    SELECT audience INTO v_target_audience
    FROM public.feed_clusters
    WHERE id = p_target_cluster_id;

    IF v_target_audience IS NULL THEN
      RAISE EXCEPTION 'target cluster not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_target_audience <> p_audience THEN
      RAISE EXCEPTION 'audience mismatch: target cluster is %, requested %',
        v_target_audience, p_audience USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_audience = 'adult' THEN
    SELECT cluster_id INTO v_old_cluster_id
    FROM public.discovery_items WHERE id = p_item_id FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'discovery_item not found' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.discovery_items
    SET cluster_id = p_target_cluster_id,
        state = CASE WHEN p_target_cluster_id IS NULL THEN 'pending' ELSE 'clustered' END,
        updated_at = now()
    WHERE id = p_item_id;
  ELSE
    SELECT cluster_id INTO v_old_cluster_id
    FROM public.kid_discovery_items WHERE id = p_item_id FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'kid_discovery_item not found' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.kid_discovery_items
    SET cluster_id = p_target_cluster_id,
        state = CASE WHEN p_target_cluster_id IS NULL THEN 'pending' ELSE 'clustered' END,
        updated_at = now()
    WHERE id = p_item_id;
  END IF;

  RETURN jsonb_build_object(
    'item_id', p_item_id,
    'old_cluster_id', v_old_cluster_id,
    'new_cluster_id', p_target_cluster_id,
    'audience', p_audience
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_cluster_items(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reassign_cluster_items(uuid,uuid,text) TO authenticated, service_role;

-- 5. RPC: merge_clusters — move all items from source into target, soft-archive source
CREATE OR REPLACE FUNCTION public.merge_clusters(
  p_source_id uuid,
  p_target_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_audience text;
  v_target_audience text;
  v_moved_adult int := 0;
  v_moved_kid int := 0;
BEGIN
  IF p_source_id = p_target_id THEN
    RAISE EXCEPTION 'source and target must differ' USING ERRCODE = '22023';
  END IF;

  SELECT audience INTO v_source_audience FROM public.feed_clusters WHERE id = p_source_id FOR UPDATE;
  SELECT audience INTO v_target_audience FROM public.feed_clusters WHERE id = p_target_id FOR UPDATE;

  IF v_source_audience IS NULL OR v_target_audience IS NULL THEN
    RAISE EXCEPTION 'cluster not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_source_audience <> v_target_audience THEN
    RAISE EXCEPTION 'cannot merge across audiences (% vs %)', v_source_audience, v_target_audience USING ERRCODE = '22023';
  END IF;

  IF v_source_audience = 'adult' THEN
    WITH moved AS (
      UPDATE public.discovery_items
      SET cluster_id = p_target_id, state='clustered', updated_at=now()
      WHERE cluster_id = p_source_id
      RETURNING 1
    )
    SELECT count(*) INTO v_moved_adult FROM moved;
  ELSE
    WITH moved AS (
      UPDATE public.kid_discovery_items
      SET cluster_id = p_target_id, state='clustered', updated_at=now()
      WHERE cluster_id = p_source_id
      RETURNING 1
    )
    SELECT count(*) INTO v_moved_kid FROM moved;
  END IF;

  -- Move article-junction rows that point to source over to target
  UPDATE public.feed_cluster_articles
    SET cluster_id = p_target_id
    WHERE cluster_id = p_source_id;

  -- Soft-archive source cluster (preserves audit + FK history)
  UPDATE public.feed_clusters
  SET archived_at = now(),
      archived_reason = 'merged_into:' || p_target_id::text,
      is_active = false,
      updated_at = now()
  WHERE id = p_source_id;

  RETURN jsonb_build_object(
    'source_id', p_source_id,
    'target_id', p_target_id,
    'audience', v_source_audience,
    'items_moved_adult', v_moved_adult,
    'items_moved_kid', v_moved_kid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_clusters(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_clusters(uuid,uuid) TO authenticated, service_role;

-- 6. RPC: split_cluster — create new cluster, move selected items into it
CREATE OR REPLACE FUNCTION public.split_cluster(
  p_source_id uuid,
  p_item_ids uuid[],
  p_new_title text DEFAULT NULL,
  p_new_summary text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_audience text;
  v_source_category uuid;
  v_new_cluster_id uuid;
  v_moved int := 0;
BEGIN
  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL OR array_length(p_item_ids, 1) = 0 THEN
    RAISE EXCEPTION 'item_ids must be non-empty' USING ERRCODE = '22023';
  END IF;

  SELECT audience, category_id INTO v_source_audience, v_source_category
  FROM public.feed_clusters WHERE id = p_source_id FOR UPDATE;

  IF v_source_audience IS NULL THEN
    RAISE EXCEPTION 'source cluster not found' USING ERRCODE = 'P0002';
  END IF;

  -- Create new sibling cluster with same audience + category
  INSERT INTO public.feed_clusters (title, summary, category_id, audience, is_active, created_at, updated_at)
  VALUES (
    COALESCE(p_new_title, 'Split from ' || COALESCE((SELECT title FROM public.feed_clusters WHERE id = p_source_id), 'cluster')),
    p_new_summary,
    v_source_category,
    v_source_audience,
    true, now(), now()
  )
  RETURNING id INTO v_new_cluster_id;

  IF v_source_audience = 'adult' THEN
    WITH moved AS (
      UPDATE public.discovery_items
      SET cluster_id = v_new_cluster_id, state='clustered', updated_at=now()
      WHERE cluster_id = p_source_id AND id = ANY(p_item_ids)
      RETURNING 1
    )
    SELECT count(*) INTO v_moved FROM moved;
  ELSE
    WITH moved AS (
      UPDATE public.kid_discovery_items
      SET cluster_id = v_new_cluster_id, state='clustered', updated_at=now()
      WHERE cluster_id = p_source_id AND id = ANY(p_item_ids)
      RETURNING 1
    )
    SELECT count(*) INTO v_moved FROM moved;
  END IF;

  RETURN jsonb_build_object(
    'source_id', p_source_id,
    'new_cluster_id', v_new_cluster_id,
    'audience', v_source_audience,
    'items_moved', v_moved
  );
END;
$$;

REVOKE ALL ON FUNCTION public.split_cluster(uuid,uuid[],text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.split_cluster(uuid,uuid[],text,text) TO authenticated, service_role;

-- 7. RPC: archive_cluster — soft-archive (hides from default Newsroom view)
CREATE OR REPLACE FUNCTION public.archive_cluster(
  p_cluster_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.feed_clusters
  SET archived_at = COALESCE(archived_at, now()),
      archived_reason = COALESCE(p_reason, archived_reason),
      is_active = false,
      updated_at = now()
  WHERE id = p_cluster_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cluster not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('cluster_id', p_cluster_id, 'archived_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.archive_cluster(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_cluster(uuid,text) TO authenticated, service_role;

-- 8. RPC: dismiss_cluster — operator marked not newsworthy
CREATE OR REPLACE FUNCTION public.dismiss_cluster(
  p_cluster_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.feed_clusters
  SET dismissed_at = COALESCE(dismissed_at, now()),
      dismissed_by = auth.uid(),
      dismiss_reason = COALESCE(p_reason, dismiss_reason),
      updated_at = now()
  WHERE id = p_cluster_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cluster not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('cluster_id', p_cluster_id, 'dismissed_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.dismiss_cluster(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dismiss_cluster(uuid,text) TO authenticated, service_role;

-- 9. RPC: undismiss_cluster — restore to default view
CREATE OR REPLACE FUNCTION public.undismiss_cluster(
  p_cluster_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.feed_clusters
  SET dismissed_at = NULL, dismissed_by = NULL, dismiss_reason = NULL, updated_at = now()
  WHERE id = p_cluster_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cluster not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('cluster_id', p_cluster_id, 'dismissed_at', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.undismiss_cluster(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.undismiss_cluster(uuid) TO authenticated, service_role;

-- 10. Permissions surface — follows established admin.pipeline.<noun>.<verb> convention
INSERT INTO public.permissions (key, display_name, description, category, requires_verified, is_active)
VALUES
  ('admin.pipeline.clusters.manage',   'Manage clusters',       'Move/merge/split/archive/dismiss feed clusters', 'ui', true, true),
  ('admin.pipeline.presets.manage',    'Manage prompt presets', 'CRUD AI prompt presets library',                'ui', true, true),
  ('admin.pipeline.categories.manage', 'Manage categories',     'CRUD content category taxonomy',                'ui', true, true)
ON CONFLICT (key) DO NOTHING;

-- 11. Wire new perms into admin/owner/editor permission sets (same sets that hold the existing admin.pipeline.* perms)
INSERT INTO public.permission_set_perms (permission_set_id, permission_id)
SELECT ps.id, p.id
FROM public.permission_sets ps
CROSS JOIN public.permissions p
WHERE ps.key IN ('owner','admin','editor')
  AND p.key IN (
    'admin.pipeline.clusters.manage',
    'admin.pipeline.presets.manage',
    'admin.pipeline.categories.manage'
  )
ON CONFLICT DO NOTHING;

-- Bust the perms cache so existing sessions pick up the new grants
SELECT public.bump_perms_global_version();
