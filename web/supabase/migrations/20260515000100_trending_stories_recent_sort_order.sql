-- Wave 0 follow-up: sources subquery in trending_stories_recent picks the
-- canonical publisher by editorial sort_order, not by row insert order.
-- Caught by post-impl adversary: sources has a sort_order column that
-- editorial uses to mark the primary source; honoring it surfaces the
-- right publisher when an article has multiple source rows.

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
    ORDER BY src.sort_order NULLS LAST, src.id
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
