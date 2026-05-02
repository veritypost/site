-- Newsroom search indexes
--
-- Adds full-text search capability and query-path indexes for the
-- newsroom cluster browser. All indexes are idempotent via IF NOT EXISTS.
--
-- 1. pg_trgm extension (trigram similarity + GIN text search)
-- 2. Partial GIN trigram indexes on feed_clusters.title and .summary
--    (active clusters only — archived_at IS NULL AND dismissed_at IS NULL)
-- 3. btree index on feed_clusters.category_id (FK column, no index exists)
-- 4. Partial btree index on feed_clusters.is_breaking (breaking rows only)
-- 5. btree index on feed_clusters.created_at DESC (recency sort)

-- -----------------------------------------------------------------------
-- 1. pg_trgm extension
-- -----------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- -----------------------------------------------------------------------
-- 2. Partial GIN trigram indexes on title and summary
--    Scoped to active clusters so the index stays small and the planner
--    can use it as a covering partial scan.
-- -----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_feed_clusters_title_trgm
  ON public.feed_clusters
  USING gin (title gin_trgm_ops)
  WHERE archived_at IS NULL AND dismissed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_feed_clusters_summary_trgm
  ON public.feed_clusters
  USING gin (summary gin_trgm_ops)
  WHERE archived_at IS NULL AND dismissed_at IS NULL;

-- -----------------------------------------------------------------------
-- 3. btree index on category_id
--    The FK fk_feed_clusters_category_id exists but carries no index on
--    the referencing side; joins and equality filters on category_id
--    currently do a seqscan on feed_clusters.
-- -----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_feed_clusters_category_id
  ON public.feed_clusters (category_id);

-- -----------------------------------------------------------------------
-- 4. Partial btree index on is_breaking
--    Only active rows (is_breaking = true) are indexed; the planner uses
--    this for the breaking-news banner query which filters identically.
-- -----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_feed_clusters_is_breaking
  ON public.feed_clusters (is_breaking)
  WHERE is_breaking = true;

-- -----------------------------------------------------------------------
-- 5. btree index on created_at DESC
--    Supports the default newsroom sort and "latest clusters" pagination.
-- -----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_feed_clusters_created_at
  ON public.feed_clusters (created_at DESC);
