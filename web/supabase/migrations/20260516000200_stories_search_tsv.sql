-- TODO-SEARCH Session A: stories.search_tsv via trigger + GIN index.
-- Story search corpus = title (A) + keywords (B). Article-level prose stays
-- searchable via the existing articles.search_tsv column; UI surfaces those
-- as Article result rows with a "Part of: <story>" backref.
--
-- Trigger-maintained instead of GENERATED because array_to_string() is
-- STABLE in this PG version and PG rejects non-IMMUTABLE expressions in
-- generated columns.

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS search_tsv tsvector;

CREATE OR REPLACE FUNCTION public.stories_search_tsv_refresh()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(
      to_tsvector(
        'english',
        coalesce(array_to_string(NEW.keywords, ' '), '')
      ),
      'B'
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stories_search_tsv_trg ON public.stories;
CREATE TRIGGER stories_search_tsv_trg
  BEFORE INSERT OR UPDATE OF title, keywords
  ON public.stories
  FOR EACH ROW
  EXECUTE FUNCTION public.stories_search_tsv_refresh();

UPDATE public.stories
SET title = title
WHERE search_tsv IS NULL;

CREATE INDEX IF NOT EXISTS stories_search_tsv_gin
  ON public.stories
  USING GIN (search_tsv);
