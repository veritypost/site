-- pg_trgm_categories
--
-- Enables the pg_trgm extension and adds a GIN trigram index on
-- categories.name for the new /directory surface. Pane 1 filter input
-- runs a fuzzy ILIKE / similarity match against category names; without
-- this index that becomes a sequential scan on every keystroke.
--
-- Idempotent — CREATE EXTENSION IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Partial index excludes soft-deleted rows so the planner never visits
-- the dead tail.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS categories_name_trgm_gin
  ON public.categories USING GIN (name gin_trgm_ops)
  WHERE deleted_at IS NULL;
