-- Wave 0 redesign — trending feed primitive.
--
-- Provides a generic 7-day trending list shaped to match DirectoryArticle
-- (web/src/lib/directory/types.ts) so the iOS client can use one decoder
-- for /api/directory/articles and /api/directory/trending in Wave 8.
--
-- Window matches the convention used by /category/ trending (7 days).
-- security_invoker=true so RLS on `articles` / `stories` is enforced
-- against the caller, not the view owner.

CREATE OR REPLACE VIEW public.trending_stories_recent
WITH (security_invoker = true) AS
SELECT
  a.id,
  a.story_id,
  s.slug                                  AS story_slug,
  a.title,
  a.excerpt,
  a.published_at,
  a.reading_time_minutes,
  a.is_verified,
  a.view_count,
  a.category_id,
  a.subcategory_id,
  (
    SELECT src.publisher
    FROM public.sources src
    WHERE src.article_id = a.id
    ORDER BY src.id
    LIMIT 1
  )                                       AS source_name,
  NULL::integer                           AS expert_count,
  FALSE                                   AS is_editors_edge
FROM public.articles a
LEFT JOIN public.stories s ON s.id = a.story_id
WHERE a.status = 'published'
  AND a.is_kids_safe = FALSE
  AND a.deleted_at IS NULL
  AND a.published_at >= NOW() - INTERVAL '7 days'
ORDER BY a.view_count DESC NULLS LAST,
         a.published_at DESC NULLS LAST;

COMMENT ON VIEW public.trending_stories_recent IS
  'Wave 0 — 7d trending feed. Shape matches DirectoryArticle. expert_count and is_editors_edge are placeholders; route handler may enrich.';

-- Partial index supports the cross-category recent window.
CREATE INDEX IF NOT EXISTS articles_trending_recent_idx
  ON public.articles (view_count DESC NULLS LAST, published_at DESC NULLS LAST)
  WHERE status = 'published'
    AND is_kids_safe = FALSE
    AND deleted_at IS NULL;

GRANT SELECT ON public.trending_stories_recent TO service_role;
