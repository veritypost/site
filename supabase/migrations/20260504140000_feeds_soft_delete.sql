-- Soft-delete on feeds. Verity is a journalism platform; provenance shouldn't
-- vanish when an admin removes a source. Articles + discovery_items + comments
-- + reading_log + everything downstream survives feed deletion via this column.
-- The destructive CASCADE FKs on articles.source_feed_id, discovery_items.feed_id,
-- pipeline_runs.feed_id remain in place as a safety net for cases where a row
-- is hard-deleted (e.g. via psql), but every code path through the admin UI
-- now uses soft-delete.

ALTER TABLE public.feeds
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

COMMENT ON COLUMN public.feeds.deleted_at IS
  'Soft-delete timestamp. NULL = active row. NON-NULL = hidden from admin UI and ingest. Hard-deletion is reserved for DBA cleanup of long-soft-deleted rows.';

CREATE INDEX IF NOT EXISTS feeds_deleted_at_idx
  ON public.feeds (deleted_at)
  WHERE deleted_at IS NULL;
