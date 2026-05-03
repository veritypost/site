-- Owner Audit Finds #2 — pipeline writers (ingest + generate) used to default
-- source outlet to the literal string 'Unknown', which then propagated to both
-- title and publisher columns and rendered as "Unknown" on every article.
--
-- Writers are now fixed to leave the columns NULL when the upstream feed has
-- no source_name. This migration backfills the rows already persisted with the
-- sentinel so the render layers fall through to a hostname derived from URL.
--
-- Idempotent: a re-run after this lands is a no-op.

UPDATE public.sources
   SET title = NULL,
       publisher = NULL
 WHERE title = 'Unknown'
   AND publisher = 'Unknown';
