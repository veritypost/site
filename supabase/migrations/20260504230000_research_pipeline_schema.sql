-- Wave 1 of AI_Redesign.md — Stream A1 schema reshape.
--
-- Adds the four remaining tables (`research_queries`, `discovery_runs`,
-- `story_observations`, `research_jobs`), the six new `stories` columns,
-- the one `discovery_items` column, plus the GIN and partial-unique
-- indexes that Stream B's handler depends on.
--
-- Owner-locked design (AI_Redesign.md §Schema reshape, §Stream A1):
--   - research_queries: 4 cols only (id, name, query_text, created_at)
--   - research_queries hard-delete allowed; lineage survives via the
--     query_name_snapshot + query_text_snapshot pair on discovery_runs,
--     so the FK on discovery_runs.research_query_id is ON DELETE SET NULL
--   - story_observations / discovery_runs are append-only audit; UPDATE
--     and DELETE are denied to non-service_role via blanket RLS (no
--     policies, RLS on)
--   - feeds.id from story_observations is ON DELETE RESTRICT — feeds
--     can never be hard-deleted out from under provenance
--   - GIN index on stories.keywords powers the unbounded story-match
--     lookup in Stream B (replaces the top-200 candidate scan)
--   - partial unique on research_jobs WHERE status='running' enforces
--     singleflight so a second Run Feed click 409s instead of racing

----------------------------------------------------------------------
-- 1. research_queries — operator-typed prompts, persistent.
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.research_queries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text,
  query_text  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.research_queries ENABLE ROW LEVEL SECURITY;

----------------------------------------------------------------------
-- 2. research_jobs — one row per Run Feed click, in-flight + history.
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.research_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status            text NOT NULL,
  request_body      jsonb NOT NULL DEFAULT '{}'::jsonb,
  grab_plan         jsonb,
  phase             text,
  items_fetched     int  NOT NULL DEFAULT 0,
  items_kept        int  NOT NULL DEFAULT 0,
  stories_formed    int  NOT NULL DEFAULT 0,
  stories_extended  int  NOT NULL DEFAULT 0,
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  started_at        timestamptz,
  finished_at       timestamptz,
  CONSTRAINT research_jobs_status_check
    CHECK (status IN ('running','done','failed','cancelled')),
  CONSTRAINT research_jobs_phase_check
    CHECK (phase IS NULL OR phase IN ('planning','fetching','forming','finalizing'))
);

CREATE INDEX IF NOT EXISTS idx_research_jobs_status_started_at
  ON public.research_jobs (status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_jobs_created_at
  ON public.research_jobs (created_at DESC);

-- Singleflight: at most one row with status='running' across the table.
-- Stream B's handler relies on this to 409 the second concurrent click.
CREATE UNIQUE INDEX IF NOT EXISTS research_jobs_singleflight
  ON public.research_jobs ((true))
  WHERE status = 'running';

ALTER TABLE public.research_jobs ENABLE ROW LEVEL SECURITY;

----------------------------------------------------------------------
-- 3. discovery_runs — immutable audit row per Run Feed click.
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.discovery_runs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_run_id       uuid NOT NULL,
  research_query_id     uuid,
  query_name_snapshot   text,
  query_text_snapshot   text,
  lookback_ms           bigint NOT NULL,
  items_fetched         int NOT NULL DEFAULT 0,
  items_kept            int NOT NULL DEFAULT 0,
  stories_formed        int NOT NULL DEFAULT 0,
  stories_extended      int NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_discovery_runs_pipeline_run
    FOREIGN KEY (pipeline_run_id) REFERENCES public.pipeline_runs(id) ON DELETE RESTRICT,
  CONSTRAINT fk_discovery_runs_research_query
    FOREIGN KEY (research_query_id) REFERENCES public.research_queries(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_discovery_runs_research_query_id
  ON public.discovery_runs (research_query_id);

CREATE INDEX IF NOT EXISTS idx_discovery_runs_created_at
  ON public.discovery_runs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_runs_pipeline_run_id
  ON public.discovery_runs (pipeline_run_id);

ALTER TABLE public.discovery_runs ENABLE ROW LEVEL SECURITY;

----------------------------------------------------------------------
-- 4. stories ALTER — six new cols + GIN index on keywords.
----------------------------------------------------------------------

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS keywords          text[],
  ADD COLUMN IF NOT EXISTS first_seen_at     timestamptz,
  ADD COLUMN IF NOT EXISTS last_observed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS generation_state  text,
  ADD COLUMN IF NOT EXISTS research_query_id uuid,
  ADD COLUMN IF NOT EXISTS is_locked         boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public'
      AND table_name='stories'
      AND constraint_name='stories_generation_state_check'
  ) THEN
    ALTER TABLE public.stories
      ADD CONSTRAINT stories_generation_state_check
        CHECK (generation_state IS NULL OR generation_state IN
               ('forming','ready','generating','published','rejected','archived'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public'
      AND table_name='stories'
      AND constraint_name='fk_stories_research_query'
  ) THEN
    ALTER TABLE public.stories
      ADD CONSTRAINT fk_stories_research_query
        FOREIGN KEY (research_query_id) REFERENCES public.research_queries(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Unbounded story-match lookup runs `keywords && $1::text[]` on every
-- new observation, so the GIN index is on the hot path.
CREATE INDEX IF NOT EXISTS idx_stories_keywords_gin
  ON public.stories USING GIN (keywords);

CREATE INDEX IF NOT EXISTS idx_stories_research_query_id
  ON public.stories (research_query_id);

CREATE INDEX IF NOT EXISTS idx_stories_generation_state
  ON public.stories (generation_state);

----------------------------------------------------------------------
-- 5. story_observations — every story↔source hit, never deleted.
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.story_observations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id          uuid NOT NULL,
  discovery_item_id uuid,
  observed_at       timestamptz NOT NULL DEFAULT now(),
  match_score       numeric,
  url_snapshot      text NOT NULL,
  title_snapshot    text,
  excerpt_snapshot  text,
  outlet_snapshot   text,
  source_class      text,
  feed_id           uuid,
  detached_at       timestamptz,
  CONSTRAINT fk_story_observations_story
    FOREIGN KEY (story_id) REFERENCES public.stories(id) ON DELETE RESTRICT,
  CONSTRAINT fk_story_observations_discovery_item
    FOREIGN KEY (discovery_item_id) REFERENCES public.discovery_items(id) ON DELETE SET NULL,
  CONSTRAINT fk_story_observations_feed
    FOREIGN KEY (feed_id) REFERENCES public.feeds(id) ON DELETE RESTRICT,
  CONSTRAINT story_observations_match_score_check
    CHECK (match_score IS NULL OR (match_score >= 0 AND match_score <= 1)),
  CONSTRAINT story_observations_source_class_check
    CHECK (source_class IS NULL OR source_class IN
           ('rss','scrape_html','scrape_json','search_api'))
);

CREATE INDEX IF NOT EXISTS idx_story_observations_story_id_observed_at
  ON public.story_observations (story_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_story_observations_discovery_item_id
  ON public.story_observations (discovery_item_id);

CREATE INDEX IF NOT EXISTS idx_story_observations_feed_id
  ON public.story_observations (feed_id);

ALTER TABLE public.story_observations ENABLE ROW LEVEL SECURITY;

----------------------------------------------------------------------
-- 6. discovery_items ALTER — one column: research_job_id.
----------------------------------------------------------------------

ALTER TABLE public.discovery_items
  ADD COLUMN IF NOT EXISTS research_job_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public'
      AND table_name='discovery_items'
      AND constraint_name='fk_discovery_items_research_job'
  ) THEN
    ALTER TABLE public.discovery_items
      ADD CONSTRAINT fk_discovery_items_research_job
        FOREIGN KEY (research_job_id) REFERENCES public.research_jobs(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_discovery_items_research_job_id
  ON public.discovery_items (research_job_id);

-- RLS posture: all four new tables run with RLS on and zero public
-- policies. service_role bypasses RLS, so the handler still reads and
-- writes freely; PostgREST requests from anon / authenticated return
-- nothing and silently fail writes. This matches the article_sources
-- pattern from Wave 0. SELECT policies will be added per-surface in
-- Wave 4 (Run Feed UI) and Wave 5 (Stories list rebuild).
