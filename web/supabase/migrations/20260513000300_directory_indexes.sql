-- directory_indexes
--
-- Composite indexes for the new /directory hot path. Pane 3 fetches
-- articles by category (or subcategory) ordered by published_at DESC
-- for the Latest sort and by view_count DESC for the Trending sort.
-- Without these the planner falls back to a single-column index +
-- in-memory sort which gets expensive once a category accumulates a
-- few thousand published rows.
--
-- All indexes are partial (status='published' AND deleted_at IS NULL)
-- so the dead tail and drafts stay out. Trending is filtered to the
-- last 7 days at query time, not in the index predicate, because the
-- 7-day window slides and a partial-on-date would invalidate weekly.
--
-- Also: ensure categories.slug is UNIQUE among live rows. /directory/
-- routes on the slug, so a collision would silently fork URL state.

-- Latest sort by category.
CREATE INDEX IF NOT EXISTS articles_directory_category_idx
  ON public.articles (category_id, published_at DESC)
  WHERE status = 'published' AND deleted_at IS NULL;

-- Latest sort by subcategory.
CREATE INDEX IF NOT EXISTS articles_directory_subcategory_idx
  ON public.articles (subcategory_id, published_at DESC)
  WHERE status = 'published' AND deleted_at IS NULL AND subcategory_id IS NOT NULL;

-- Trending sort by category (view_count DESC; published_at as tiebreak).
CREATE INDEX IF NOT EXISTS articles_directory_trending_idx
  ON public.articles (category_id, view_count DESC, published_at DESC)
  WHERE status = 'published' AND deleted_at IS NULL;

-- Slug uniqueness for live categories. Partial so soft-deleted rows
-- can keep their (now-historical) slug without blocking a re-use.
CREATE UNIQUE INDEX IF NOT EXISTS categories_slug_unique
  ON public.categories (slug)
  WHERE deleted_at IS NULL;
