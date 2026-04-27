-- =====================================================================
-- 2026-04-27_phase1_persist_article_consolidation.sql
-- Phase 1 of AI + Plan Change Implementation: kid_articles consolidation
-- =====================================================================
-- Context:
--   The kid iOS app (VerityPostKids/ArticleListView.swift) reads from
--   `articles` filtered by is_kids_safe=true. The admin tool
--   (admin/kids-story-manager) reads + writes the same. The pipeline,
--   however, has been writing kid runs to a separate `kid_articles` table
--   that nothing reads. Path A from the planning docs: kill the dead
--   tables and consolidate kid runs into `articles` with is_kids_safe=true
--   and age_band tagged.
--
--   Pre-condition verified: zero rows in kid_articles, kid_sources,
--   kid_timelines, kid_quizzes, kid_discovery_items at time of migration.
--
-- Steps:
--   A. Add articles.age_band column (nullable; future Phase 3 will band-
--      split kid content into 'kids' 7-9 and 'tweens' 10-12, while adult
--      stays 'adult' or null).
--   B. Rewrite persist_generated_article RPC to write all audiences into
--      `articles` + sources/timelines/quizzes (no audience branch on
--      tables). Set is_kids_safe + age_band + kids_summary from payload.
--   C. Drop kid_* RLS policies (14 policies across 5 tables).
--   D. Drop kid_articles, kid_sources, kid_timelines, kid_quizzes,
--      kid_discovery_items tables.
--
-- Rollback:
--   Code rolls back via git revert. Tables cannot be restored without DB
--   backup. Verified zero rows pre-migration as the safety net.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- A. Add age_band column on articles
-- ---------------------------------------------------------------------
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS age_band text
    CHECK (age_band IS NULL OR age_band IN ('kids', 'tweens', 'adult'));

CREATE INDEX IF NOT EXISTS idx_articles_kid_feed
  ON public.articles (is_kids_safe, age_band, status, published_at DESC)
  WHERE is_kids_safe = true AND status = 'published';

-- ---------------------------------------------------------------------
-- B. Rewrite persist_generated_article RPC
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.persist_generated_article(p_payload jsonb)
RETURNS TABLE(article_id uuid, slug text, audience text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  DECLARE
    v_audience           text   := p_payload->>'audience';
    v_age_band           text   := nullif(p_payload->>'age_band', '');
    v_is_kids_safe       boolean := (v_audience = 'kid');
    v_kids_summary       text   := p_payload->>'kids_summary';
    v_cluster_id         uuid   := nullif(p_payload->>'cluster_id','')::uuid;
    v_run_id             uuid   := nullif(p_payload->>'pipeline_run_id','')::uuid;
    v_title              text   := coalesce(nullif(trim(p_payload->>'title'),''), '');
    v_subtitle           text   := p_payload->>'subtitle';
    v_body               text   := p_payload->>'body';
    v_body_html          text   := p_payload->>'body_html';
    v_excerpt            text   := p_payload->>'excerpt';
    v_category_id        uuid   := nullif(p_payload->>'category_id','')::uuid;
    v_ai_provider        text   := p_payload->>'ai_provider';
    v_ai_model           text   := p_payload->>'ai_model';
    v_prompt_fingerprint text   := p_payload->>'prompt_fingerprint';
    v_source_feed_id     uuid   := nullif(p_payload->>'source_feed_id','')::uuid;
    v_source_url         text   := p_payload->>'source_url';
    v_word_count         int    := nullif(p_payload->>'word_count','')::int;
    v_reading_min        int    := nullif(p_payload->>'reading_time_minutes','')::int;
    v_tags               text[] := CASE WHEN jsonb_typeof(p_payload->'tags') = 'array' THEN
      array(SELECT jsonb_array_elements_text(p_payload->'tags')) ELSE NULL END;
    v_seo_keywords       text[] := CASE WHEN jsonb_typeof(p_payload->'seo_keywords') = 'array' THEN
      array(SELECT jsonb_array_elements_text(p_payload->'seo_keywords')) ELSE NULL END;
    v_seo_title          text   := p_payload->>'seo_title';
    v_seo_description    text   := p_payload->>'seo_description';
    v_metadata           jsonb  := coalesce(p_payload->'metadata','{}'::jsonb);
    v_sources            jsonb  := coalesce(p_payload->'sources','[]'::jsonb);
    v_timeline           jsonb  := coalesce(p_payload->'timeline','[]'::jsonb);
    v_quizzes            jsonb  := coalesce(p_payload->'quizzes','[]'::jsonb);
    v_slug_base          text;
    v_slug               text;
    v_attempt            int    := 0;
    v_article_id         uuid;
  BEGIN
    -- Validation
    IF v_audience IS NULL OR v_audience NOT IN ('adult','kid') THEN
      RAISE EXCEPTION 'persist_generated_article: audience must be adult|kid, got %', v_audience
        USING ERRCODE = '22023';
    END IF;
    IF v_audience = 'kid' AND v_age_band IS NULL THEN
      -- Backstop: kid runs without explicit age_band default to 'tweens'
      -- (closer to current single-tier kid voice; Phase 3 will require
      -- explicit kids/tweens band).
      v_age_band := 'tweens';
    END IF;
    IF v_age_band IS NOT NULL AND v_age_band NOT IN ('kids','tweens','adult') THEN
      RAISE EXCEPTION 'persist_generated_article: age_band must be kids|tweens|adult, got %', v_age_band
        USING ERRCODE = '22023';
    END IF;
    IF v_body IS NULL OR length(v_body) = 0 THEN
      RAISE EXCEPTION 'persist_generated_article: body required' USING ERRCODE = '22023';
    END IF;
    IF v_body_html IS NULL OR length(v_body_html) = 0 THEN
      RAISE EXCEPTION 'persist_generated_article: body_html required' USING ERRCODE = '22023';
    END IF;
    IF v_category_id IS NULL THEN
      RAISE EXCEPTION 'persist_generated_article: category_id required' USING ERRCODE = '22023';
    END IF;

    -- Slug computation (slug-collision retry preserved)
    v_slug_base := nullif(regexp_replace(lower(v_title), '[^a-z0-9]+', '-', 'g'), '');
    v_slug_base := nullif(trim(both '-' from coalesce(v_slug_base, '')), '');
    IF v_slug_base IS NULL THEN
      v_slug_base := 'article-' || substr(replace(coalesce(v_run_id::text, gen_random_uuid()::text), '-', ''), 1, 8);
    END IF;
    v_slug := left(v_slug_base, 80);

    <<slug_loop>>
    WHILE v_attempt < 3 LOOP
      BEGIN
        -- Single insert path: articles. Kid runs flag is_kids_safe + age_band
        -- + kids_summary; adult runs leave kids_summary null and is_kids_safe=false.
        INSERT INTO public.articles (
          title, slug, subtitle, body, body_html, excerpt, category_id, status,
          is_ai_generated, ai_provider, ai_model, generated_at, generated_by_provider,
          generated_by_model, prompt_fingerprint, source_feed_id, source_url,
          cluster_id, word_count, reading_time_minutes, tags, seo_keywords,
          seo_title, seo_description, metadata,
          is_kids_safe, kids_summary, age_band
        )
        VALUES (
          v_title, v_slug, v_subtitle, v_body, v_body_html, v_excerpt, v_category_id, 'draft',
          true, v_ai_provider, v_ai_model, now(), v_ai_provider, v_ai_model, v_prompt_fingerprint,
          v_source_feed_id, v_source_url, v_cluster_id, v_word_count, v_reading_min, v_tags, v_seo_keywords,
          v_seo_title, v_seo_description, v_metadata,
          v_is_kids_safe,
          CASE WHEN v_is_kids_safe THEN coalesce(v_kids_summary, v_excerpt) ELSE NULL END,
          v_age_band
        )
        RETURNING id INTO v_article_id;
        EXIT slug_loop;
      EXCEPTION WHEN unique_violation THEN
        v_attempt := v_attempt + 1;
        v_slug := left(v_slug_base, 72) || '-' ||
          lower(to_hex((extract(epoch from clock_timestamp())*1000)::bigint & 65535));
        IF v_attempt >= 3 THEN RAISE; END IF;
      END;
    END LOOP;

    -- Sources / timelines / quizzes — single insert path now (no kid_* tables)
    INSERT INTO public.sources (
      article_id, title, url, publisher, author_name, published_date,
      source_type, quote, sort_order, metadata
    )
    SELECT v_article_id, s->>'title', s->>'url', s->>'publisher', s->>'author_name',
      nullif(s->>'published_date','')::timestamptz, s->>'source_type', s->>'quote',
      coalesce(nullif(s->>'sort_order','')::int, (ord - 1)::int),
      coalesce(s - 'title' - 'url' - 'publisher' - 'author_name' - 'published_date'
        - 'source_type' - 'quote' - 'sort_order', '{}'::jsonb)
    FROM jsonb_array_elements(v_sources) WITH ORDINALITY AS t(s, ord);

    INSERT INTO public.timelines (
      article_id, title, description, event_date, event_label,
      event_body, event_image_url, source_url, sort_order, metadata
    )
    SELECT v_article_id, t->>'title', t->>'description',
      coalesce(nullif(t->>'event_date','')::timestamptz, now()),
      coalesce(nullif(t->>'event_label',''), 'Event'), t->>'event_body',
      t->>'event_image_url', t->>'source_url',
      coalesce(nullif(t->>'sort_order','')::int, (ord - 1)::int),
      coalesce(t - 'title' - 'description' - 'event_date' - 'event_label'
        - 'event_body' - 'event_image_url' - 'source_url' - 'sort_order', '{}'::jsonb)
    FROM jsonb_array_elements(v_timeline) WITH ORDINALITY AS tb(t, ord);

    INSERT INTO public.quizzes (
      article_id, title, question_text, question_type, options,
      explanation, difficulty, points, pool_group, sort_order, metadata
    )
    SELECT v_article_id, coalesce(nullif(q->>'title',''), 'Comprehension Quiz'),
      q->>'question_text', coalesce(nullif(q->>'question_type',''), 'multiple_choice'),
      (SELECT coalesce(jsonb_agg(o - 'is_correct'), '[]'::jsonb)
        FROM jsonb_array_elements(q->'options') o),
      q->>'explanation', q->>'difficulty',
      coalesce(nullif(q->>'points','')::int, 10),
      coalesce(nullif(q->>'pool_group','')::int, 0),
      coalesce(nullif(q->>'sort_order','')::int, (ord - 1)::int),
      jsonb_build_object('correct_index', coalesce(nullif(q->>'correct_index','')::int, 0))
    FROM jsonb_array_elements(v_quizzes) WITH ORDINALITY AS tq(q, ord);

    article_id := v_article_id;
    slug := v_slug;
    audience := v_audience;
    RETURN NEXT;
  END;
$function$;

-- ---------------------------------------------------------------------
-- C. Drop kid_* RLS policies (14 policies)
--
-- IDEMPOTENT: each DROP POLICY is guarded by to_regclass(...) so a
-- partial-replay (where the table itself was already dropped in a prior
-- run) doesn't error on the missing relation.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.kid_articles') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS kid_articles_admin_all ON public.kid_articles';
    EXECUTE 'DROP POLICY IF EXISTS kid_articles_block_adult_jwt ON public.kid_articles';
    EXECUTE 'DROP POLICY IF EXISTS kid_articles_read_kid_jwt ON public.kid_articles';
  END IF;
  IF to_regclass('public.kid_sources') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS kid_sources_admin_all ON public.kid_sources';
    EXECUTE 'DROP POLICY IF EXISTS kid_sources_block_adult_jwt ON public.kid_sources';
    EXECUTE 'DROP POLICY IF EXISTS kid_sources_read_kid_jwt ON public.kid_sources';
  END IF;
  IF to_regclass('public.kid_timelines') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS kid_timelines_admin_all ON public.kid_timelines';
    EXECUTE 'DROP POLICY IF EXISTS kid_timelines_block_adult_jwt ON public.kid_timelines';
    EXECUTE 'DROP POLICY IF EXISTS kid_timelines_read_kid_jwt ON public.kid_timelines';
  END IF;
  IF to_regclass('public.kid_quizzes') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS kid_quizzes_admin_all ON public.kid_quizzes';
    EXECUTE 'DROP POLICY IF EXISTS kid_quizzes_block_adult_jwt ON public.kid_quizzes';
    EXECUTE 'DROP POLICY IF EXISTS kid_quizzes_read_kid_jwt ON public.kid_quizzes';
  END IF;
  IF to_regclass('public.kid_discovery_items') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS kid_discovery_items_block_adult_jwt ON public.kid_discovery_items';
    EXECUTE 'DROP POLICY IF EXISTS kid_discovery_items_select_editor ON public.kid_discovery_items';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- D. Drop tables (verify zero rows once more inline; CASCADE for FK refs)
--
-- IDEMPOTENT: each table is checked-then-dropped via to_regclass(...) so
-- partial-replay scenarios (table already dropped in a prior partial run)
-- don't error out. Safe to re-run end-to-end.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_kid_articles_count int := 0;
  v_kid_sources_count int := 0;
  v_kid_timelines_count int := 0;
  v_kid_quizzes_count int := 0;
  v_kid_discovery_count int := 0;
BEGIN
  IF to_regclass('public.kid_articles') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.kid_articles' INTO v_kid_articles_count;
  END IF;
  IF to_regclass('public.kid_sources') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.kid_sources' INTO v_kid_sources_count;
  END IF;
  IF to_regclass('public.kid_timelines') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.kid_timelines' INTO v_kid_timelines_count;
  END IF;
  IF to_regclass('public.kid_quizzes') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.kid_quizzes' INTO v_kid_quizzes_count;
  END IF;
  IF to_regclass('public.kid_discovery_items') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.kid_discovery_items' INTO v_kid_discovery_count;
  END IF;
  IF v_kid_articles_count + v_kid_sources_count + v_kid_timelines_count
     + v_kid_quizzes_count + v_kid_discovery_count > 0 THEN
    RAISE EXCEPTION
      'Refusing to drop: rows present (kid_articles=%, kid_sources=%, kid_timelines=%, kid_quizzes=%, kid_discovery_items=%)',
      v_kid_articles_count, v_kid_sources_count, v_kid_timelines_count,
      v_kid_quizzes_count, v_kid_discovery_count;
  END IF;
END $$;

DROP TABLE IF EXISTS public.kid_quizzes CASCADE;
DROP TABLE IF EXISTS public.kid_timelines CASCADE;
DROP TABLE IF EXISTS public.kid_sources CASCADE;
DROP TABLE IF EXISTS public.kid_articles CASCADE;
DROP TABLE IF EXISTS public.kid_discovery_items CASCADE;

COMMIT;
