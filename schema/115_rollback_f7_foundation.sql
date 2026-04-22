-- schema/115_rollback_f7_foundation.sql
-- 2026-04-22 — Rollback for F7 Phase 1 Task 3 foundation (114).
--
-- Reverse order of 114. All statements use IF EXISTS. Safe to run multiple
-- times. Wrapped in a single transaction. Removes seeds, policies, tables,
-- columns, RPC, and trigger function.
--
-- NOTE: Seeds deleted by explicit key list so we don't blast unrelated rows.

BEGIN;

-- ============================================================================
-- 1. Delete seed rows (settings + rate_limits + ai_models)
-- ============================================================================

DELETE FROM public.rate_limits WHERE key IN ('newsroom_ingest','newsroom_generate');

DELETE FROM public.settings WHERE key IN (
  'pipeline.daily_cost_usd_cap',
  'pipeline.per_run_cost_usd_cap',
  'pipeline.daily_cost_soft_alert_pct',
  'pipeline.cluster_lock_minutes',
  'pipeline.max_concurrent_generations',
  'pipeline.llm_retry_attempts',
  'pipeline.llm_retry_backoff_ms_list',
  'pipeline.refresh_ratelimit_seconds',
  'pipeline.cluster_overlap_pct',
  'pipeline.story_match_overlap_pct',
  'pipeline.plagiarism_ngram_size',
  'pipeline.plagiarism_flag_pct',
  'pipeline.plagiarism_rewrite_pct',
  'pipeline.scrape_fallback_char_threshold',
  'pipeline.min_scan_interval_seconds',
  'pipeline.discovery_retention_hours',
  'ai.ingest_enabled',
  'ai.adult_generation_enabled',
  'ai.kid_generation_enabled'
);

-- ai_models seeds will be dropped with the table.

-- ============================================================================
-- 2. Drop RESTRICTIVE kid-blocking policies on adult-only tables
-- ============================================================================

DROP POLICY IF EXISTS articles_block_kid_jwt   ON public.articles;
DROP POLICY IF EXISTS timelines_block_kid_jwt  ON public.timelines;
DROP POLICY IF EXISTS sources_block_kid_jwt    ON public.sources;
DROP POLICY IF EXISTS quizzes_block_kid_jwt    ON public.quizzes;

-- ============================================================================
-- 3. Drop child tables (FK children first) — triggers + policies drop with table
-- ============================================================================

DROP TABLE IF EXISTS public.kid_discovery_items;
DROP TABLE IF EXISTS public.discovery_items;

DROP TABLE IF EXISTS public.kid_quizzes;
DROP TABLE IF EXISTS public.kid_timelines;
DROP TABLE IF EXISTS public.kid_sources;
DROP TABLE IF EXISTS public.kid_articles;

DROP TABLE IF EXISTS public.ai_prompt_overrides;
DROP TABLE IF EXISTS public.ai_models;

-- ============================================================================
-- 4. Drop columns added to existing tables
-- ============================================================================

-- categories.category_density
ALTER TABLE public.categories DROP COLUMN IF EXISTS category_density;

-- feeds.audience (drop CHECK + column)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='feeds' AND constraint_name='feeds_audience_check'
  ) THEN
    ALTER TABLE public.feeds DROP CONSTRAINT feeds_audience_check;
  END IF;
END $$;
DROP INDEX IF EXISTS public.feeds_audience_idx;
ALTER TABLE public.feeds DROP COLUMN IF EXISTS audience;

-- pipeline_costs additions
ALTER TABLE public.pipeline_costs
  DROP COLUMN IF EXISTS cache_read_input_tokens,
  DROP COLUMN IF EXISTS cache_creation_input_tokens,
  DROP COLUMN IF EXISTS cluster_id,
  DROP COLUMN IF EXISTS error_type,
  DROP COLUMN IF EXISTS retry_count,
  DROP COLUMN IF EXISTS audience,
  DROP COLUMN IF EXISTS prompt_fingerprint;

-- pipeline_runs additions
ALTER TABLE public.pipeline_runs
  DROP COLUMN IF EXISTS cluster_id,
  DROP COLUMN IF EXISTS audience,
  DROP COLUMN IF EXISTS total_cost_usd,
  DROP COLUMN IF EXISTS step_timings_ms,
  DROP COLUMN IF EXISTS provider,
  DROP COLUMN IF EXISTS model,
  DROP COLUMN IF EXISTS freeform_instructions,
  DROP COLUMN IF EXISTS prompt_fingerprint;

-- articles audit columns
ALTER TABLE public.articles
  DROP COLUMN IF EXISTS generated_at,
  DROP COLUMN IF EXISTS generated_by_provider,
  DROP COLUMN IF EXISTS generated_by_model,
  DROP COLUMN IF EXISTS prompt_fingerprint;

-- ============================================================================
-- 5. Drop RPC
-- ============================================================================

DROP FUNCTION IF EXISTS public.pipeline_today_cost_usd();

-- ============================================================================
-- 6. Drop trigger helper LAST (only if no other tables still reference it)
--    Leave in place if any non-F7 table uses it by virtue of a trigger;
--    Postgres will block the drop automatically via dependency check.
-- ============================================================================

DROP FUNCTION IF EXISTS public.tg_set_updated_at();

COMMIT;
