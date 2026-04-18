-- 046_articles_search_fts.sql
-- Bug 70 / CQ-25: add a generated tsvector column + GIN index on articles
-- so paid search stops doing full-body ILIKE scans.
--
-- The column is STORED + GENERATED so Postgres updates it automatically
-- whenever title / excerpt / body change. Search routes can use
-- `to_tsquery` or `websearch_to_tsquery('english', q)` to hit the index.
--
-- Leaves the existing ILIKE paths working — the route can migrate over
-- in the next pass. Falling back to ILIKE when FTS returns nothing is
-- still acceptable short-term.
--
-- Idempotent.

BEGIN;

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' ||
      coalesce(excerpt, '') || ' ' ||
      coalesce(body, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS articles_search_tsv_gin
  ON public.articles
  USING GIN (search_tsv);

COMMIT;
