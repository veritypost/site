-- Feeds: priority weight, topic allowlist, and muted outlets
--
-- 1. feeds.priority_weight smallint (1-10, default 5)
--    Controls how heavily a feed's articles are weighted during cluster
--    formation. Higher = more likely to anchor a cluster.
--
-- 2. feeds.allowed_category_slugs text[] (default '{}')
--    When non-empty, ingest only assigns clusters to categories whose
--    slug appears in this array. Empty array = no restriction.
--    GIN index for containment operators (@> / <@).
--
-- 3. muted_outlets table
--    Temporary per-outlet mute used by the pipeline to suppress a noisy
--    source for a defined window without deactivating the feed itself.
--    RLS: service_role has full access; authenticated + is_admin_or_above()
--    can SELECT (newsroom UI shows the mute list).

-- -----------------------------------------------------------------------
-- 1. priority_weight column
-- -----------------------------------------------------------------------
ALTER TABLE public.feeds
  ADD COLUMN IF NOT EXISTS priority_weight smallint NOT NULL DEFAULT 5
    CONSTRAINT feeds_priority_weight_range CHECK (priority_weight BETWEEN 1 AND 10);

-- -----------------------------------------------------------------------
-- 2. allowed_category_slugs column + GIN index
-- -----------------------------------------------------------------------
ALTER TABLE public.feeds
  ADD COLUMN IF NOT EXISTS allowed_category_slugs text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_feeds_allowed_category_slugs
  ON public.feeds
  USING gin (allowed_category_slugs);

-- -----------------------------------------------------------------------
-- 3. muted_outlets table
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.muted_outlets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_name text        NOT NULL,
  muted_until timestamptz NOT NULL,
  muted_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_muted_outlets_outlet_name
  ON public.muted_outlets (outlet_name);

CREATE INDEX IF NOT EXISTS idx_muted_outlets_muted_until
  ON public.muted_outlets (muted_until);

-- -----------------------------------------------------------------------
-- RLS on muted_outlets
-- -----------------------------------------------------------------------
ALTER TABLE public.muted_outlets ENABLE ROW LEVEL SECURITY;

-- service_role full access (pipeline reads/writes mutes)
CREATE POLICY muted_outlets_service_role_all
  ON public.muted_outlets
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- admins can read the mute list in the newsroom UI
CREATE POLICY muted_outlets_admin_select
  ON public.muted_outlets
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_above());
