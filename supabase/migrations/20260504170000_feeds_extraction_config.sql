-- Phase B of the discovery scraper layer (Finding #20 follow-up).
-- Adds a per-feed JSON-extraction config column for the scrape_json consumer.
-- Shape is enforced in TypeScript (see web/src/lib/pipeline/extraction-config.ts);
-- no CHECK constraint here. Default '{}' means "unconfigured" — the run-route
-- surfaces those rows as unconfigured in the response without erroring.

ALTER TABLE public.feeds
  ADD COLUMN IF NOT EXISTS extraction_config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.feeds.extraction_config IS
  'Per-feed JSON extraction config for scrape_json consumer. Shape enforced in TS (web/src/lib/pipeline/extraction-config.ts). Empty {} = unconfigured.';
