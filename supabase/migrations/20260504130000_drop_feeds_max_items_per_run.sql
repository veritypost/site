-- Drop feeds.max_items_per_run
--
-- This column was added by migration 20260504120000 but never wired end-to-end:
-- no UI input surfaces it, and the ingest worker never enforced the cap.
-- Rolling it back per owner decision (2026-05-04). Revisit when the ingest
-- pipeline is unparked and a noisy-feed throttle problem is real.

ALTER TABLE public.feeds
  DROP CONSTRAINT IF EXISTS feeds_max_items_per_run_range,
  DROP COLUMN IF EXISTS max_items_per_run;
