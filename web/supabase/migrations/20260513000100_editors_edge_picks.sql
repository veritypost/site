-- editors_edge_picks
--
-- Curated "Editor's Edge" article picks surfaced at the top of pane 3
-- on the new /directory surface (web) and the Browse tab (iOS adult).
-- One pick at a time per (category, subcategory, slot, valid window).
-- Picks have an explicit valid_from / valid_to (default 48h window set
-- in the admin POST handler) and a soft-delete column (removed_at) so
-- audit history is preserved.
--
-- Read path: public SELECT for currently-valid, non-removed rows
-- (matches the daily_features pattern). Writes happen via the
-- service-role client from the admin curation UI, so we do not need
-- INSERT / UPDATE / DELETE row policies.
--
-- Same article MAY appear as Edge in multiple categories simultaneously
-- (no article-level UNIQUE); collision is only blocked within
-- (category, subcategory, slot, exact-window).

CREATE TABLE IF NOT EXISTS public.editors_edge_picks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id      UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  category_id     UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  subcategory_id  UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  slot            SMALLINT NOT NULL DEFAULT 0,
  valid_from      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to        TIMESTAMPTZ NOT NULL,
  curator_note    TEXT,
  created_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at      TIMESTAMPTZ,
  CONSTRAINT editors_edge_picks_valid_window_ck
    CHECK (valid_from < valid_to)
);

-- Prevents two picks landing on the same (category, subcategory, slot,
-- exact window). Subcategory is normalized to the zero-UUID when NULL so
-- the UNIQUE constraint treats "category-level" picks as a distinct
-- bucket from each subcategory bucket.
CREATE UNIQUE INDEX IF NOT EXISTS editors_edge_picks_unique_window
  ON public.editors_edge_picks (
    category_id,
    COALESCE(subcategory_id, '00000000-0000-0000-0000-000000000000'::uuid),
    slot,
    valid_from,
    valid_to
  )
  WHERE removed_at IS NULL;

-- Hot-path index for the per-category fetch in the public API.
CREATE INDEX IF NOT EXISTS editors_edge_picks_category_window_idx
  ON public.editors_edge_picks (category_id, valid_from DESC, valid_to)
  WHERE removed_at IS NULL;

-- Hot-path index for the per-subcategory fetch (preferred over the
-- category-level pick when present).
CREATE INDEX IF NOT EXISTS editors_edge_picks_subcategory_window_idx
  ON public.editors_edge_picks (subcategory_id, valid_from DESC, valid_to)
  WHERE removed_at IS NULL AND subcategory_id IS NOT NULL;

-- Admin timeline view (most-recent first across all categories).
CREATE INDEX IF NOT EXISTS editors_edge_picks_timeline_idx
  ON public.editors_edge_picks (valid_from DESC, created_at DESC)
  WHERE removed_at IS NULL;

-- RLS — public read of currently-valid picks only. Writes go through
-- the service-role client from /api/admin/editors-edge, so no
-- INSERT / UPDATE / DELETE policies for authenticated users.
ALTER TABLE public.editors_edge_picks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS editors_edge_picks_public_read ON public.editors_edge_picks;
CREATE POLICY editors_edge_picks_public_read ON public.editors_edge_picks
  FOR SELECT
  USING (
    removed_at IS NULL
    AND NOW() >= valid_from
    AND NOW() <  valid_to
  );

-- ---------------------------------------------------------------------------
-- Permission seed — admin curate key + attach to admin + owner sets.
-- ---------------------------------------------------------------------------
INSERT INTO public.permissions (
  key, display_name, description, category, is_active, deny_mode, sort_order
) VALUES (
  'admin.curate.editors_edge',
  E'Curate Editor’s Edge',
  E'Create, schedule, and remove Editor’s Edge picks shown on /directory and the iOS Browse tab.',
  'admin',
  TRUE,
  'locked',
  100
) ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_set_perms (permission_set_id, permission_id)
SELECT ps.id, p.id
FROM public.permission_sets ps, public.permissions p
WHERE p.key = 'admin.curate.editors_edge'
  AND ps.key IN ('admin', 'owner')
ON CONFLICT DO NOTHING;
