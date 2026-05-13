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
-- Note: an earlier draft of this file added a partial UNIQUE index on
-- categories.slug WHERE deleted_at IS NULL. Dropped before apply
-- (2026-05-13 pre-apply panel): categories_slug_key is already a
-- GLOBAL UNIQUE on slug, which is strictly stronger; the partial
-- couldn't deliver the soft-delete slug-reuse it claimed. If the
-- product ever wants slug reuse after soft-delete, that's a separate
-- migration that drops the global + idx_categories_slug.

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
