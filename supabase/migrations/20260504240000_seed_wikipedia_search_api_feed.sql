-- Wave 3 of AI_Redesign.md — Stream C Wikipedia consumer.
--
-- One feed_type='search_api' row pointing at the MediaWiki API. Free, no
-- auth, no env-var work. The Run Feed handler only fetches against this
-- row when a Topic-mode grab plan emits a non-empty wikipedia_topics
-- list — General-mode runs leave it dormant. This row is intentionally
-- excluded from the polling fanout via partition (the run handler
-- buckets feed_type='search_api' separately and only fires it from the
-- grab-plan path).
--
-- Idempotent: NOT EXISTS guard on the canonical endpoint URL so
-- re-running the migration is a no-op. There is no UNIQUE constraint on
-- feeds.url (see migrations 20260504140000+), so we cannot use
-- ON CONFLICT.

INSERT INTO public.feeds (
  name, url, source_name, feed_type, audience, is_active,
  priority_weight, metadata, extraction_config
)
SELECT
  'Wikipedia (Topic Search)',
  'https://en.wikipedia.org/w/api.php',
  'Wikipedia',
  'search_api',
  'adult',
  true,
  3,
  jsonb_build_object(
    'tier', '2-reference',
    'source_class', 'search_api',
    'commercial_ok', true,
    'added_via', 'wave3_research_pipeline_2026-05-04'
  ),
  jsonb_build_object(
    'provider', 'wikipedia',
    'endpoint', 'https://en.wikipedia.org/w/api.php',
    'default_params', jsonb_build_object(
      'format', 'json',
      'action', 'query'
    )
  )
WHERE NOT EXISTS (
  SELECT 1
  FROM public.feeds
  WHERE feed_type = 'search_api'
    AND extraction_config ->> 'provider' = 'wikipedia'
);
