-- ============================================================================
-- 20260504160000_feed_type_scraper_values.sql
--
-- Extends public.feeds.feed_type beyond the historical RSS-only default to
-- support the discovery scraper layer. The column is character varying NOT NULL
-- DEFAULT 'rss' with NO CHECK constraint, so this migration is data-only:
-- no schema change, no constraint add, just a one-time reclassify of the
-- ~129 active not-soft-deleted rows whose URL is not RSS-shaped.
--
-- Reclassify rule (matches the preview at
-- Ongoing Projects/Current/scraper_reclassify_preview_2026-05-04.md):
--   * Scope: deleted_at IS NULL AND is_active = true AND URL is not
--     RSS-shaped (URL does not contain '/rss', '/feed', '.xml', or '.atom').
--   * scrape_json if URL contains '/api/' OR host starts with 'api.'
--     (matched via ~* '://api\.') OR name ends in ' API' OR name starts
--     with 'API '.
--   * Otherwise scrape_html.
--   * metadata is merged (jsonb ||) so the reclassify stamps land alongside
--     existing keys without clobbering tier / source_class / etc.
--   * Already scrape_* rows are excluded so re-running this migration is a
--     no-op (defensive idempotency).
--
-- Touched-row counts at apply time (verified against MCP preview):
--   total_touched = 129  (96 -> scrape_html, 33 -> scrape_json)
-- ============================================================================

-- 1. JSON-API rows --> scrape_json
-- Defensive: only reclassify rows that came from the legacy RSS-only default set. Never touch bespoke feed_type values (e.g. youtube, atom) that an admin may have set by hand.
UPDATE public.feeds
SET
  feed_type = 'scrape_json',
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'reclassified_at', '2026-05-04',
    'reclassified_from_pipeline', 'rss_only_default'
  )
WHERE deleted_at IS NULL
  AND is_active = true
  AND feed_type IN ('feed', 'rss')
  AND feed_type NOT IN ('scrape_html', 'scrape_json')
  AND NOT (
    url ILIKE '%/rss%'
    OR url ILIKE '%/feed%'
    OR url ILIKE '%.xml%'
    OR url ILIKE '%.atom%'
  )
  AND (
    url ILIKE '%/api/%'
    OR url ~* '://api\.'
    OR upper(name) ~ ' API$'
    OR upper(name) ~ '^API '
  );

-- 2. Remaining non-RSS-shaped rows --> scrape_html
-- Defensive: only reclassify rows that came from the legacy RSS-only default set. Never touch bespoke feed_type values (e.g. youtube, atom) that an admin may have set by hand.
UPDATE public.feeds
SET
  feed_type = 'scrape_html',
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'reclassified_at', '2026-05-04',
    'reclassified_from_pipeline', 'rss_only_default'
  )
WHERE deleted_at IS NULL
  AND is_active = true
  AND feed_type IN ('feed', 'rss')
  AND feed_type NOT IN ('scrape_html', 'scrape_json')
  AND NOT (
    url ILIKE '%/rss%'
    OR url ILIKE '%/feed%'
    OR url ILIKE '%.xml%'
    OR url ILIKE '%.atom%'
  );
