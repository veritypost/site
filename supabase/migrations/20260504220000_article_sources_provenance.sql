-- Wave 0 of AI_Redesign.md — `article_sources` permanent provenance log.
--
-- This table is the no-delete twin of `sources`. Editors continue to
-- mutate `sources` via PATCH /api/admin/articles/:id (delete-and-reinsert);
-- this table accumulates every URL we've ever cited on an article and is
-- never updated or deleted outside service_role. The public ethics
-- receipt at /admin/sources will read from here in a later wave.
--
-- Owner-locked design (AI_Redesign.md §Decisions, §Schema A1):
--   - blanket DENY UPDATE + DELETE except service_role; INSERT service_role only
--   - no `story_id` FK — reach the story via `articles.story_id`
--   - feed_id is nullable; outlet_snapshot is denormalized so the row
--     survives feed soft-delete
--   - ON DELETE RESTRICT from articles so a story/article can never be
--     hard-deleted out from under its provenance log
--   - unique (article_id, url_snapshot) so the PATCH hook can do
--     INSERT ... ON CONFLICT DO NOTHING on every save without dupes

CREATE TABLE IF NOT EXISTS public.article_sources (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id       uuid NOT NULL,
  url_snapshot     text NOT NULL,
  title_snapshot   text,
  outlet_snapshot  text NOT NULL,
  fetched_at       timestamptz NOT NULL,
  source_class     text,
  feed_id          uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_article_sources_article
    FOREIGN KEY (article_id) REFERENCES public.articles(id) ON DELETE RESTRICT,
  CONSTRAINT fk_article_sources_feed
    FOREIGN KEY (feed_id) REFERENCES public.feeds(id) ON DELETE RESTRICT,
  CONSTRAINT article_sources_unique_url_per_article
    UNIQUE (article_id, url_snapshot)
);

CREATE INDEX IF NOT EXISTS idx_article_sources_article_id
  ON public.article_sources (article_id);

CREATE INDEX IF NOT EXISTS idx_article_sources_outlet_snapshot
  ON public.article_sources (outlet_snapshot);

CREATE INDEX IF NOT EXISTS idx_article_sources_created_at
  ON public.article_sources (created_at DESC);

ALTER TABLE public.article_sources ENABLE ROW LEVEL SECURITY;

-- service_role bypasses RLS, but we make the deny intent explicit by
-- granting NO public policies. With RLS on and zero policies, every
-- non-service_role request returns zero rows / silently fails the write.
-- That is the blanket DENY UPDATE + DELETE + SELECT + INSERT for
-- everyone except service_role.
--
-- We intentionally do NOT add a SELECT policy in this wave. The public
-- ethics receipt UI at /admin/sources is Wave 6; it will be served via
-- a service-role admin RPC, not a direct PostgREST select.
