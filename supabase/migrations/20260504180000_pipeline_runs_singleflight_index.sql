-- Phase C — singleflight enforcement for the manual ingest run.
--
-- Today the "runs are single-flighted via pipeline_runs" claim in
-- /api/newsroom/ingest/run/route.ts is a comment, not a constraint. Two
-- admins clicking "Refresh feeds" within 60s both succeed; the
-- read-modify-write of feeds.error_count loses increments under that race.
--
-- This migration adds a partial unique index that allows at most one
-- pipeline_runs row with status='running' AND pipeline_type='ingest'.
-- A second insert while one is in flight raises 23505 (unique_violation),
-- which the route catches and converts to HTTP 409 Conflict.
--
-- Pre-flight cleanup: any stale 'running' ingest rows older than 10
-- minutes are reset to 'failed' before the index is built so the index
-- creation can't fail on existing data. The 10-minute threshold matches
-- the route's maxDuration=300s plus a 5-minute grace buffer (same
-- convention as /api/cron/pipeline-cleanup). The route itself runs an
-- equivalent in-route sweep on every POST so a Vercel-killed lambda
-- doesn't block the next operator click — the daily cron is a safety
-- net for the in-route sweep, not the primary path.

UPDATE public.pipeline_runs
SET
  status = 'failed',
  completed_at = COALESCE(completed_at, NOW()),
  error_message = COALESCE(error_message, 'orphan run reaped — singleflight migration'),
  error_type = COALESCE(error_type, 'abort')
WHERE status = 'running'
  AND pipeline_type = 'ingest'
  AND started_at < NOW() - INTERVAL '10 minutes';

CREATE UNIQUE INDEX IF NOT EXISTS pipeline_runs_singleflight_ingest
  ON public.pipeline_runs (pipeline_type)
  WHERE status = 'running' AND pipeline_type = 'ingest';

COMMENT ON INDEX public.pipeline_runs_singleflight_ingest IS
  'Phase C — at most one running ingest run at a time. Insert collisions raise 23505; route converts to HTTP 409.';

-- Defense against IF NOT EXISTS silently keeping a previously-named
-- index with a different WHERE clause: assert the live indexdef matches
-- the expected shape. If a future replay encounters a same-name index
-- with a different definition the migration aborts loudly here.
DO $$
DECLARE
  live_def text;
BEGIN
  SELECT indexdef INTO live_def
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname = 'pipeline_runs_singleflight_ingest';

  IF live_def IS NULL THEN
    RAISE EXCEPTION 'pipeline_runs_singleflight_ingest index missing after CREATE';
  END IF;

  IF live_def NOT LIKE '%(pipeline_type)%' OR
     live_def NOT LIKE '%status = ''running''::text%' OR
     live_def NOT LIKE '%pipeline_type = ''ingest''::text%' THEN
    RAISE EXCEPTION 'pipeline_runs_singleflight_ingest index has unexpected definition: %', live_def;
  END IF;
END $$;
