-- schema/114_f7_foundation.sql
-- 2026-04-22 — F7 Phase 1 Task 3: AI Pipeline Rebuild foundation
--
-- This migration drafted + reviewed via multi-agent flow on 2026-04-22.
-- Applied via Supabase SQL editor (NOT mcp__supabase__apply_migration —
-- read-only in this session). Owner reviews + runs.
--
-- Rollback: schema/115_rollback_f7_foundation.sql
--
-- Creates: ai_models, ai_prompt_overrides, kid_articles, kid_sources,
--   kid_timelines, kid_quizzes, discovery_items, kid_discovery_items
-- Adds columns: articles (4), pipeline_runs (8), pipeline_costs (7),
--   feeds (audience), categories (category_density)
-- RLS: articles/timelines/sources/quizzes block_kid_jwt RESTRICTIVE +
--   kid-table read/write policies
-- RPC: pipeline_today_cost_usd()
-- Trigger fn: tg_set_updated_at()
-- Seeds: settings 19 rows, ai_models 4 rows, rate_limits 2 rows

BEGIN;

-- ============================================================================
-- 1. Trigger helper (idempotent)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. pipeline_today_cost_usd() RPC — UTC day rollup
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pipeline_today_cost_usd()
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(cost_usd), 0)::numeric
    FROM public.pipeline_costs
    WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC');
$$;

REVOKE ALL ON FUNCTION public.pipeline_today_cost_usd() FROM public;
GRANT EXECUTE ON FUNCTION public.pipeline_today_cost_usd() TO service_role, authenticated;

-- ============================================================================
-- 3. ai_models table + seeds
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('anthropic', 'openai')),
  model text NOT NULL,
  display_name text NOT NULL,
  input_price_per_1m_tokens numeric(10,4) NOT NULL,
  output_price_per_1m_tokens numeric(10,4) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_models_provider_model_unique UNIQUE (provider, model)
);

CREATE INDEX IF NOT EXISTS ai_models_provider_active_idx
  ON public.ai_models (provider) WHERE is_active;

DROP TRIGGER IF EXISTS ai_models_set_updated_at ON public.ai_models;
CREATE TRIGGER ai_models_set_updated_at
  BEFORE UPDATE ON public.ai_models
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.ai_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_models_select_admin ON public.ai_models;
CREATE POLICY ai_models_select_admin ON public.ai_models
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.compute_effective_perms(auth.uid()) p
      WHERE p.permission_key = 'admin.system.view' AND p.granted = true
    )
  );

-- Seed: prices as of 2026-04-22 (verify on apply day vs anthropic.com/pricing, openai.com/pricing)
INSERT INTO public.ai_models (provider, model, display_name, input_price_per_1m_tokens, output_price_per_1m_tokens, is_active)
VALUES
  ('anthropic', 'claude-sonnet-4-6',             'Claude Sonnet 4.6',        3.00, 15.00, true),
  ('anthropic', 'claude-haiku-4-5-20251001',     'Claude Haiku 4.5',         1.00,  5.00, true),
  ('openai',    'gpt-4o',                         'GPT-4o',                   2.50, 10.00, true),
  ('openai',    'gpt-4o-mini',                    'GPT-4o Mini',              0.15,  0.60, true)
ON CONFLICT (provider, model) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  input_price_per_1m_tokens = EXCLUDED.input_price_per_1m_tokens,
  output_price_per_1m_tokens = EXCLUDED.output_price_per_1m_tokens,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- ============================================================================
-- 4. ai_prompt_overrides table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_prompt_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  subcategory_id uuid,  -- no FK: subcategories table doesn't exist yet (verified 2026-04-22)
  step_name text NOT NULL CHECK (step_name IN (
    'audience_safety_check', 'source_fetch', 'headline', 'body', 'summary',
    'timeline', 'categorization', 'kid_url_sanitizer', 'source_grounding',
    'plagiarism_check', 'quiz', 'quiz_verification'
  )),
  audience text NOT NULL CHECK (audience IN ('adult', 'kid', 'both')),
  additional_instructions text NOT NULL CHECK (length(additional_instructions) <= 8000),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Partial unique: no duplicate overrides for the same scope
CREATE UNIQUE INDEX IF NOT EXISTS ai_prompt_overrides_scope_uniq
  ON public.ai_prompt_overrides (
    COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(subcategory_id, '00000000-0000-0000-0000-000000000000'::uuid),
    step_name, audience
  ) WHERE is_active;

CREATE INDEX IF NOT EXISTS ai_prompt_overrides_lookup_idx
  ON public.ai_prompt_overrides (step_name, audience, is_active);

DROP TRIGGER IF EXISTS ai_prompt_overrides_set_updated_at ON public.ai_prompt_overrides;
CREATE TRIGGER ai_prompt_overrides_set_updated_at
  BEFORE UPDATE ON public.ai_prompt_overrides
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.ai_prompt_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_prompt_overrides_select_editor ON public.ai_prompt_overrides;
CREATE POLICY ai_prompt_overrides_select_editor ON public.ai_prompt_overrides
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.compute_effective_perms(auth.uid()) p
      WHERE p.permission_key = 'admin.system.view' AND p.granted = true
    )
  );

COMMENT ON TABLE public.ai_prompt_overrides IS
  'Layer 1 per-category prompt overrides (F7-DECISIONS-LOCKED.md §3.4). Applied at run time on matching (category, subcategory, step, audience). NULL category/subcategory = applies globally within step/audience.';

-- ============================================================================
-- 5. ALTER existing tables — articles / pipeline_runs / pipeline_costs / feeds / categories
-- ============================================================================

-- articles audit columns (F7-DECISIONS-LOCKED.md invariant #10)
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS generated_by_provider text,
  ADD COLUMN IF NOT EXISTS generated_by_model text,
  ADD COLUMN IF NOT EXISTS prompt_fingerprint text;

-- pipeline_runs invariant #5 columns
ALTER TABLE public.pipeline_runs
  ADD COLUMN IF NOT EXISTS cluster_id uuid,
  ADD COLUMN IF NOT EXISTS audience text CHECK (audience IS NULL OR audience IN ('adult','kid')),
  ADD COLUMN IF NOT EXISTS total_cost_usd numeric(10,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS step_timings_ms jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS freeform_instructions text,
  ADD COLUMN IF NOT EXISTS prompt_fingerprint text;

-- pipeline_costs — cache cols (match metadata keys exactly) + audience + retry_count + error_type + cluster_id + prompt_fingerprint
ALTER TABLE public.pipeline_costs
  ADD COLUMN IF NOT EXISTS cache_read_input_tokens int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cache_creation_input_tokens int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cluster_id uuid,
  ADD COLUMN IF NOT EXISTS error_type text,
  ADD COLUMN IF NOT EXISTS retry_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'adult' CHECK (audience IN ('adult','kid')),
  ADD COLUMN IF NOT EXISTS prompt_fingerprint text;

-- Backfill cache + related cols from existing metadata JSONB (rows created by call-model.ts pre-migration)
UPDATE public.pipeline_costs
  SET cache_read_input_tokens = COALESCE((metadata->>'cache_read_input_tokens')::int, 0)
  WHERE metadata ? 'cache_read_input_tokens' AND cache_read_input_tokens = 0;

UPDATE public.pipeline_costs
  SET cache_creation_input_tokens = COALESCE((metadata->>'cache_creation_input_tokens')::int, 0)
  WHERE metadata ? 'cache_creation_input_tokens' AND cache_creation_input_tokens = 0;

UPDATE public.pipeline_costs
  SET cluster_id = (metadata->>'cluster_id')::uuid
  WHERE metadata ? 'cluster_id' AND cluster_id IS NULL
    AND (metadata->>'cluster_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

UPDATE public.pipeline_costs
  SET error_type = (metadata->>'error_type')
  WHERE metadata ? 'error_type' AND error_type IS NULL;

UPDATE public.pipeline_costs
  SET retry_count = COALESCE((metadata->>'retry_count')::int, 0)
  WHERE metadata ? 'retry_count' AND retry_count = 0;

-- feeds.audience — two-step (nullable → backfill → NOT NULL + CHECK, re-run safe)
ALTER TABLE public.feeds ADD COLUMN IF NOT EXISTS audience text;
UPDATE public.feeds SET audience = 'adult' WHERE audience IS NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='feeds' AND column_name='audience' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.feeds ALTER COLUMN audience SET NOT NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='feeds' AND constraint_name='feeds_audience_check'
  ) THEN
    ALTER TABLE public.feeds ADD CONSTRAINT feeds_audience_check CHECK (audience IN ('adult','kid'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS feeds_audience_idx ON public.feeds (audience);

-- categories.category_density
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS category_density jsonb;
COMMENT ON COLUMN public.categories.category_density IS
  'Per-category timeline event-count guidance (snapshot CATEGORY_DENSITY port). Shape: {"min":N,"max":M,"typical":K}. NULL = orchestrator default of 5 events per timeline (Phase 3).';

-- ============================================================================
-- 6. Kid tables — mirrors of adult shape with FK retargets
-- ============================================================================

-- kid_articles — mirror of articles minus is_kids_safe + kids_summary; adds 4 F7 audit cols
CREATE TABLE IF NOT EXISTS public.kid_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar NOT NULL,
  slug varchar NOT NULL,
  subtitle varchar,
  body text NOT NULL,
  body_html text,
  excerpt varchar,
  cover_image_url text,
  cover_image_alt varchar,
  cover_image_credit varchar,
  thumbnail_url text,
  category_id uuid NOT NULL,
  author_id uuid,
  status varchar NOT NULL DEFAULT 'draft',
  visibility varchar NOT NULL DEFAULT 'public',
  is_ai_generated boolean NOT NULL DEFAULT false,
  ai_model varchar,
  ai_provider varchar,
  ai_prompt_id uuid,
  ai_confidence_score double precision,
  is_verified boolean NOT NULL DEFAULT false,
  verified_by uuid,
  verified_at timestamptz,
  is_breaking boolean NOT NULL DEFAULT false,
  is_featured boolean NOT NULL DEFAULT false,
  is_opinion boolean NOT NULL DEFAULT false,
  reading_time_minutes int,
  word_count int,
  difficulty_level varchar,
  language varchar NOT NULL DEFAULT 'en',
  seo_title varchar,
  seo_description varchar,
  seo_keywords text[],
  canonical_url text,
  tags text[],
  source_feed_id uuid,
  source_url text,
  external_id varchar,
  publish_at timestamptz,
  published_at timestamptz,
  unpublished_at timestamptz,
  retraction_reason text,
  view_count int NOT NULL DEFAULT 0,
  share_count int NOT NULL DEFAULT 0,
  comment_count int NOT NULL DEFAULT 0,
  bookmark_count int NOT NULL DEFAULT 0,
  content_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  csam_scanned boolean NOT NULL DEFAULT false,
  nsfw_score double precision,
  moderation_status varchar NOT NULL DEFAULT 'pending',
  moderation_notes text,
  push_sent boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  sponsor_id uuid,
  cluster_id uuid,
  search_vector tsvector,
  search_tsv tsvector,
  subcategory_id uuid,
  is_developing boolean NOT NULL DEFAULT false,
  -- F7 audit cols (invariant #10)
  generated_at timestamptz,
  generated_by_provider text,
  generated_by_model text,
  prompt_fingerprint text
);

CREATE UNIQUE INDEX IF NOT EXISTS kid_articles_slug_uniq ON public.kid_articles (slug);
CREATE INDEX IF NOT EXISTS kid_articles_status_idx ON public.kid_articles (status);
CREATE INDEX IF NOT EXISTS kid_articles_cluster_idx ON public.kid_articles (cluster_id);
CREATE INDEX IF NOT EXISTS kid_articles_published_idx ON public.kid_articles (published_at DESC);

DROP TRIGGER IF EXISTS kid_articles_set_updated_at ON public.kid_articles;
CREATE TRIGGER kid_articles_set_updated_at BEFORE UPDATE ON public.kid_articles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.kid_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kid_articles_read_kid_jwt ON public.kid_articles;
CREATE POLICY kid_articles_read_kid_jwt ON public.kid_articles
  FOR SELECT TO public
  USING (public.is_kid_delegated() AND status = 'published');

DROP POLICY IF EXISTS kid_articles_admin_all ON public.kid_articles;
CREATE POLICY kid_articles_admin_all ON public.kid_articles
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.compute_effective_perms(auth.uid()) p WHERE p.permission_key = 'admin.system.view' AND p.granted = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.compute_effective_perms(auth.uid()) p WHERE p.permission_key = 'admin.system.view' AND p.granted = true));

DROP POLICY IF EXISTS kid_articles_block_adult_jwt ON public.kid_articles;
CREATE POLICY kid_articles_block_adult_jwt ON public.kid_articles AS RESTRICTIVE
  FOR ALL TO public
  USING (
    public.is_kid_delegated()
    OR EXISTS (SELECT 1 FROM public.compute_effective_perms(auth.uid()) p WHERE p.permission_key = 'admin.system.view' AND p.granted = true)
  )
  WITH CHECK (
    public.is_kid_delegated()
    OR EXISTS (SELECT 1 FROM public.compute_effective_perms(auth.uid()) p WHERE p.permission_key = 'admin.system.view' AND p.granted = true)
  );

-- kid_sources — mirror of sources, article_id → kid_articles
CREATE TABLE IF NOT EXISTS public.kid_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.kid_articles(id) ON DELETE CASCADE,
  title varchar,
  url text,
  publisher varchar,
  author_name varchar,
  published_date timestamptz,
  source_type varchar,
  quote text,
  sort_order int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kid_sources_article_idx ON public.kid_sources (article_id);

DROP TRIGGER IF EXISTS kid_sources_set_updated_at ON public.kid_sources;
CREATE TRIGGER kid_sources_set_updated_at BEFORE UPDATE ON public.kid_sources FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.kid_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kid_sources_read_kid_jwt ON public.kid_sources;
CREATE POLICY kid_sources_read_kid_jwt ON public.kid_sources
  FOR SELECT TO public
  USING (public.is_kid_delegated());

DROP POLICY IF EXISTS kid_sources_admin_all ON public.kid_sources;
CREATE POLICY kid_sources_admin_all ON public.kid_sources
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.compute_effective_perms(auth.uid()) p WHERE p.permission_key = 'admin.system.view' AND p.granted = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.compute_effective_perms(auth.uid()) p WHERE p.permission_key = 'admin.system.view' AND p.granted = true));

DROP POLICY IF EXISTS kid_sources_block_adult_jwt ON public.kid_sources;
CREATE POLICY kid_sources_block_adult_jwt ON public.kid_sources AS RESTRICTIVE
  FOR ALL TO public
  USING (
    public.is_kid_delegated()
    OR EXISTS (SELECT 1 FROM public.compute_effective_perms(auth.uid()) p WHERE p.permission_key = 'admin.system.view' AND p.granted = true)
  )
  WITH CHECK (
    public.is_kid_delegated()
    OR EXISTS (SELECT 1 FROM public.compute_effective_perms(auth.uid()) p WHERE p.permission_key = 'admin.system.view' AND p.granted = true)
  );

-- kid_timelines — mirror of timelines, article_id → kid_articles
CREATE TABLE IF NOT EXISTS public.kid_timelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.kid_articles(id) ON DELETE CASCADE,
  title varchar,
  description text,
  event_date timestamptz NOT NULL,
  event_label varchar NOT NULL,
  event_body text,
  event_image_url text,
  source_url text,
  sort_order int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kid_timelines_article_idx ON public.kid_timelines (article_id);

DROP TRIGGER IF EXISTS kid_timelines_set_updated_at ON public.kid_timelines;
CREATE TRIGGER kid_timelines_set_updated_at BEFORE UPDATE ON public.kid_timelines FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.kid_timelines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kid_timelines_read_kid_jwt ON public.kid_timelines;
CREATE POLICY kid_timelines_read_kid_jwt ON public.kid_timelines
  FOR SELECT TO public
  USING (public.is_kid_delegated());

DROP POLICY IF EXISTS kid_timelines_admin_all ON public.kid_timelines;
CREATE POLICY kid_timelines_admin_all ON public.kid_timelines
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.compute_effective_perms(auth.uid()) p WHERE p.permission_key = 'admin.system.view' AND p.granted = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.compute_effective_perms(auth.uid()) p WHERE p.permission_key = 'admin.system.view' AND p.granted = true));

DROP POLICY IF EXISTS kid_timelines_block_adult_jwt ON public.kid_timelines;
CREATE POLICY kid_timelines_block_adult_jwt ON public.kid_timelines AS RESTRICTIVE
  FOR ALL TO public
  USING (
    public.is_kid_delegated()
    OR EXISTS (SELECT 1 FROM public.compute_effective_perms(auth.uid()) p WHERE p.permission_key = 'admin.system.view' AND p.granted = true)
  )
  WITH CHECK (
    public.is_kid_delegated()
    OR EXISTS (SELECT 1 FROM public.compute_effective_perms(auth.uid()) p WHERE p.permission_key = 'admin.system.view' AND p.granted = true)
  );

-- kid_quizzes — mirror of quizzes, article_id → kid_articles, adds retention_policy
CREATE TABLE IF NOT EXISTS public.kid_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.kid_articles(id) ON DELETE CASCADE,
  title varchar NOT NULL,
  description text,
  question_text text NOT NULL,
  question_type varchar NOT NULL DEFAULT 'multiple_choice',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  explanation text,
  difficulty varchar,
  points int NOT NULL DEFAULT 10,
  pool_group int NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  attempt_count int NOT NULL DEFAULT 0,
  correct_count int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  retention_policy text NOT NULL DEFAULT 'delete_on_parent_request_or_12mo_inactive',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS kid_quizzes_article_idx ON public.kid_quizzes (article_id);

DROP TRIGGER IF EXISTS kid_quizzes_set_updated_at ON public.kid_quizzes;
CREATE TRIGGER kid_quizzes_set_updated_at BEFORE UPDATE ON public.kid_quizzes FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.kid_quizzes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kid_quizzes_read_kid_jwt ON public.kid_quizzes;
CREATE POLICY kid_quizzes_read_kid_jwt ON public.kid_quizzes
  FOR SELECT TO public
  USING (public.is_kid_delegated() AND is_active = true);

DROP POLICY IF EXISTS kid_quizzes_admin_all ON public.kid_quizzes;
CREATE POLICY kid_quizzes_admin_all ON public.kid_quizzes
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.compute_effective_perms(auth.uid()) p WHERE p.permission_key = 'admin.system.view' AND p.granted = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.compute_effective_perms(auth.uid()) p WHERE p.permission_key = 'admin.system.view' AND p.granted = true));

DROP POLICY IF EXISTS kid_quizzes_block_adult_jwt ON public.kid_quizzes;
CREATE POLICY kid_quizzes_block_adult_jwt ON public.kid_quizzes AS RESTRICTIVE
  FOR ALL TO public
  USING (
    public.is_kid_delegated()
    OR EXISTS (SELECT 1 FROM public.compute_effective_perms(auth.uid()) p WHERE p.permission_key = 'admin.system.view' AND p.granted = true)
  )
  WITH CHECK (
    public.is_kid_delegated()
    OR EXISTS (SELECT 1 FROM public.compute_effective_perms(auth.uid()) p WHERE p.permission_key = 'admin.system.view' AND p.granted = true)
  );

-- ============================================================================
-- 7. discovery_items + kid_discovery_items
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.discovery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id uuid REFERENCES public.feeds(id) ON DELETE CASCADE,
  cluster_id uuid,
  article_id uuid REFERENCES public.articles(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','clustered','generating','published','ignored')),
  raw_title text,
  raw_url text NOT NULL,
  raw_body text,
  raw_published_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS discovery_items_fetched_idx ON public.discovery_items (fetched_at);
CREATE INDEX IF NOT EXISTS discovery_items_state_fetched_idx ON public.discovery_items (state, fetched_at);
CREATE INDEX IF NOT EXISTS discovery_items_cluster_idx ON public.discovery_items (cluster_id);
CREATE UNIQUE INDEX IF NOT EXISTS discovery_items_url_uniq ON public.discovery_items (raw_url);

DROP TRIGGER IF EXISTS discovery_items_set_updated_at ON public.discovery_items;
CREATE TRIGGER discovery_items_set_updated_at BEFORE UPDATE ON public.discovery_items FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.discovery_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS discovery_items_select_editor ON public.discovery_items;
CREATE POLICY discovery_items_select_editor ON public.discovery_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.compute_effective_perms(auth.uid()) p WHERE p.permission_key = 'admin.system.view' AND p.granted = true));

DROP POLICY IF EXISTS discovery_items_block_kid_jwt ON public.discovery_items;
CREATE POLICY discovery_items_block_kid_jwt ON public.discovery_items AS RESTRICTIVE
  FOR ALL TO public
  USING (NOT public.is_kid_delegated())
  WITH CHECK (NOT public.is_kid_delegated());

-- kid_discovery_items — article_id → kid_articles, kid-only pool
CREATE TABLE IF NOT EXISTS public.kid_discovery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id uuid REFERENCES public.feeds(id) ON DELETE CASCADE,
  cluster_id uuid,
  article_id uuid REFERENCES public.kid_articles(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','clustered','generating','published','ignored')),
  raw_title text,
  raw_url text NOT NULL,
  raw_body text,
  raw_published_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kid_discovery_items_fetched_idx ON public.kid_discovery_items (fetched_at);
CREATE INDEX IF NOT EXISTS kid_discovery_items_state_fetched_idx ON public.kid_discovery_items (state, fetched_at);
CREATE INDEX IF NOT EXISTS kid_discovery_items_cluster_idx ON public.kid_discovery_items (cluster_id);
CREATE UNIQUE INDEX IF NOT EXISTS kid_discovery_items_url_uniq ON public.kid_discovery_items (raw_url);

DROP TRIGGER IF EXISTS kid_discovery_items_set_updated_at ON public.kid_discovery_items;
CREATE TRIGGER kid_discovery_items_set_updated_at BEFORE UPDATE ON public.kid_discovery_items FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.kid_discovery_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kid_discovery_items_select_editor ON public.kid_discovery_items;
CREATE POLICY kid_discovery_items_select_editor ON public.kid_discovery_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.compute_effective_perms(auth.uid()) p WHERE p.permission_key = 'admin.system.view' AND p.granted = true));

DROP POLICY IF EXISTS kid_discovery_items_block_adult_jwt ON public.kid_discovery_items;
CREATE POLICY kid_discovery_items_block_adult_jwt ON public.kid_discovery_items AS RESTRICTIVE
  FOR ALL TO public
  USING (
    public.is_kid_delegated()
    OR EXISTS (SELECT 1 FROM public.compute_effective_perms(auth.uid()) p WHERE p.permission_key = 'admin.system.view' AND p.granted = true)
  )
  WITH CHECK (
    public.is_kid_delegated()
    OR EXISTS (SELECT 1 FROM public.compute_effective_perms(auth.uid()) p WHERE p.permission_key = 'admin.system.view' AND p.granted = true)
  );

-- ============================================================================
-- 8. RESTRICTIVE policies: block kid JWTs from adult-only tables
-- ============================================================================

DROP POLICY IF EXISTS articles_block_kid_jwt ON public.articles;
CREATE POLICY articles_block_kid_jwt ON public.articles AS RESTRICTIVE
  FOR ALL TO public
  USING (NOT public.is_kid_delegated())
  WITH CHECK (NOT public.is_kid_delegated());

DROP POLICY IF EXISTS timelines_block_kid_jwt ON public.timelines;
CREATE POLICY timelines_block_kid_jwt ON public.timelines AS RESTRICTIVE
  FOR ALL TO public
  USING (NOT public.is_kid_delegated())
  WITH CHECK (NOT public.is_kid_delegated());

DROP POLICY IF EXISTS sources_block_kid_jwt ON public.sources;
CREATE POLICY sources_block_kid_jwt ON public.sources AS RESTRICTIVE
  FOR ALL TO public
  USING (NOT public.is_kid_delegated())
  WITH CHECK (NOT public.is_kid_delegated());

DROP POLICY IF EXISTS quizzes_block_kid_jwt ON public.quizzes;
CREATE POLICY quizzes_block_kid_jwt ON public.quizzes AS RESTRICTIVE
  FOR ALL TO public
  USING (NOT public.is_kid_delegated())
  WITH CHECK (NOT public.is_kid_delegated());

-- ============================================================================
-- 9. Settings seeds — 19 rows per F7-DECISIONS-LOCKED.md §4
-- ============================================================================

INSERT INTO public.settings (key, value, value_type, category, display_name, description, is_public, is_sensitive) VALUES
 ('pipeline.daily_cost_usd_cap',          '10',                'number',  'pipeline', 'Daily cost cap (USD)',            'F7 daily cumulative LLM spend ceiling',                    false, false),
 ('pipeline.per_run_cost_usd_cap',        '0.50',              'number',  'pipeline', 'Per-run cost cap (USD)',          'Max cost per single cluster generation',                   false, false),
 ('pipeline.daily_cost_soft_alert_pct',   '50',                'number',  'pipeline', 'Soft alert pct',                  'Dashboard banner triggers at this % of daily cap',         false, false),
 ('pipeline.cluster_lock_minutes',        '10',                'number',  'pipeline', 'Cluster lock (minutes)',          'Cluster cannot be regenerated within this window',         false, false),
 ('pipeline.max_concurrent_generations',  '2',                 'number',  'pipeline', 'Max concurrent generations',      'Global cap on parallel orchestrator runs',                 false, false),
 ('pipeline.llm_retry_attempts',          '3',                 'number',  'pipeline', 'LLM retry attempts',              'Total SDK call attempts per LLM step',                     false, false),
 ('pipeline.llm_retry_backoff_ms_list',   '[1000,4000,15000]', 'json',    'pipeline', 'LLM retry backoff (ms)',          'Wait between retries; list length >= attempts - 1',        false, false),
 ('pipeline.refresh_ratelimit_seconds',   '120',               'number',  'pipeline', 'Refresh button rate limit (s)',   'Min seconds between manual feed refresh clicks',           false, false),
 ('pipeline.cluster_overlap_pct',         '35',                'number',  'pipeline', 'Cluster overlap (%)',             'Keyword-overlap threshold for pre-clustering',             false, false),
 ('pipeline.story_match_overlap_pct',     '40',                'number',  'pipeline', 'Story-match overlap (%)',         'Dedupe vs published articles',                             false, false),
 ('pipeline.plagiarism_ngram_size',       '4',                 'number',  'pipeline', 'Plagiarism n-gram size',          'n for n-gram comparison against source articles',          false, false),
 ('pipeline.plagiarism_flag_pct',         '25',                'number',  'pipeline', 'Plagiarism flag (%)',             'Overlap % that flags for review',                          false, false),
 ('pipeline.plagiarism_rewrite_pct',      '20',                'number',  'pipeline', 'Plagiarism rewrite (%)',          'Overlap % that auto-triggers rewrite step',                false, false),
 ('pipeline.scrape_fallback_char_threshold', '2000',           'number',  'pipeline', 'Scrape fallback (chars)',         'Full-text scrape when source text shorter than this',      false, false),
 ('pipeline.min_scan_interval_seconds',   '60',                'number',  'pipeline', 'Min scan interval (s)',           'Floor on manual refresh (prevents accidental hammering)',  false, false),
 ('pipeline.discovery_retention_hours',   '24',                'number',  'pipeline', 'Discovery retention (h)',         'Unused discovery items purged after this many hours',      false, false),
 ('ai.ingest_enabled',                    'true',              'boolean', 'ai',       'Ingest kill switch',              'Master kill switch for feed ingestion cron/button',        false, false),
 ('ai.adult_generation_enabled',          'true',              'boolean', 'ai',       'Adult generation kill switch',    'Disables all adult article generation',                    false, false),
 ('ai.kid_generation_enabled',            'true',              'boolean', 'ai',       'Kid generation kill switch',      'Disables all kid article generation',                      false, false)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  value_type = EXCLUDED.value_type,
  category = EXCLUDED.category,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  updated_at = now();

-- ============================================================================
-- 10. rate_limits seeds
-- ============================================================================

INSERT INTO public.rate_limits (key, display_name, description, max_requests, window_seconds, scope, is_active) VALUES
 ('newsroom_ingest',   'Newsroom ingest refresh',   'POST /api/newsroom/ingest/run - manual feed polling',  5,   600, 'user', true),
 ('newsroom_generate', 'Newsroom cluster generate', 'POST /api/newsroom/generate/run - cluster to draft',  20, 3600, 'user', true)
ON CONFLICT (key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  max_requests = EXCLUDED.max_requests,
  window_seconds = EXCLUDED.window_seconds,
  scope = EXCLUDED.scope,
  is_active = EXCLUDED.is_active,
  updated_at = now();

COMMIT;
