-- =============================================================================
-- 2026-04-29 — Full consolidated migration
-- Replaces all individual 2026-04-29_session*.sql and 2026-04-29_drop_*.sql
-- files. Safe to run once; fully idempotent throughout.
--
-- Sections:
--   1. Schema additions (columns, indexes)
--   2. Data inserts / deletes (settings rows, owner allowlist, verity tier)
--   3. Function + trigger rewrites (RPCs, users_protect_columns)
--   4. DROP COLUMN cleanup (dead columns, last)
-- =============================================================================


-- =============================================================================
-- 1. SCHEMA ADDITIONS
-- =============================================================================

-- A: users.username — ensure nullable + partial unique index
ALTER TABLE public.users
  ALTER COLUMN username DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_when_set
  ON public.users (lower(username))
  WHERE username IS NOT NULL;

-- E: access_codes — cohort source / medium
ALTER TABLE public.access_codes
  ADD COLUMN IF NOT EXISTS cohort_source text,
  ADD COLUMN IF NOT EXISTS cohort_medium text;

CREATE INDEX IF NOT EXISTS access_codes_cohort_source_idx
  ON public.access_codes (cohort_source) WHERE cohort_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS access_codes_cohort_medium_idx
  ON public.access_codes (cohort_medium) WHERE cohort_medium IS NOT NULL;

-- E: access_requests — referral medium (source already exists)
ALTER TABLE public.access_requests
  ADD COLUMN IF NOT EXISTS referral_medium text;

-- D: access_codes — one active personal code per user
CREATE UNIQUE INDEX IF NOT EXISTS access_codes_one_personal_per_user
  ON public.access_codes (owner_user_id)
  WHERE tier = 'user'
    AND is_active = true
    AND owner_user_id IS NOT NULL;

-- F: users — per-user invite cap override
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS invite_cap_override integer;

-- J: users — per-user trial override columns
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS trial_extension_until timestamptz,
  ADD COLUMN IF NOT EXISTS trial_extended_seen_at timestamptz;

COMMENT ON COLUMN public.users.trial_extension_until IS
  'Admin override: extends/shortens trial expiry beyond comped_until. null = no override. Cron uses coalesce(trial_extension_until, comped_until).';

COMMENT ON COLUMN public.users.trial_extended_seen_at IS
  'Timestamp when user dismissed the one-time "your trial was extended" banner. null = not yet dismissed.';

-- quizzes — drop pool_group (passed through from LLM payload, never read)
ALTER TABLE public.quizzes
  DROP COLUMN IF EXISTS pool_group;


-- =============================================================================
-- 2. DATA INSERTS / DELETES
-- =============================================================================

-- B: Owner allowlist — admin@veritypost.com always bypasses the beta gate
INSERT INTO public.access_requests
  (email, status, type, name, reason, metadata, created_at, updated_at, approved_at)
SELECT
  'admin@veritypost.com', 'approved', 'closed_beta',
  'Cliff (owner)', 'owner allowlist',
  '{"reason":"owner_recovery_safety_net"}'::jsonb,
  now(), now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.access_requests WHERE email = 'admin@veritypost.com'
);

-- F: Global invite cap default
INSERT INTO public.settings
  (key, value, value_type, category, display_name, description)
VALUES (
  'invite_cap_default', '2', 'number', 'beta',
  'Default invite cap (during beta)',
  'Default number of personal-link invitations each user can send during beta. Override per-user via admin user dossier.'
)
ON CONFLICT (key) DO NOTHING;

-- H: Beta trial duration
INSERT INTO public.settings
  (key, value, value_type, category, display_name, description, is_public, is_sensitive)
VALUES (
  'beta_trial_duration', '30', 'number', 'beta',
  'Beta Trial Duration (Days)',
  'Default trial duration (in days) granted to new beta signups. Per-user overrides available on the user dossier.',
  false, false
)
ON CONFLICT (key) DO NOTHING;

-- L: Featured article on /signup
INSERT INTO public.settings
  (key, value, value_type, category, display_name, description, is_public, is_sensitive)
VALUES (
  'signup_featured_article_id', '', 'string', 'general',
  'Featured article on /signup',
  'Story id or slug to render in the /signup sample. Leave blank to auto-pick the most recent verified piece.',
  false, false
)
ON CONFLICT (key) DO NOTHING;

-- K: Drop the verity middle tier (owner confirmed zero users 2026-04-29)
DELETE FROM public.plans WHERE tier = 'verity';


-- =============================================================================
-- 3. FUNCTION + TRIGGER REWRITES
-- =============================================================================

-- persist_generated_article — removes pool_group from quiz insert
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
    IF v_audience IS NULL OR v_audience NOT IN ('adult','kid') THEN
      RAISE EXCEPTION 'persist_generated_article: audience must be adult|kid, got %', v_audience
        USING ERRCODE = '22023';
    END IF;
    IF v_audience = 'kid' AND v_age_band IS NULL THEN
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

    v_slug_base := nullif(regexp_replace(lower(v_title), '[^a-z0-9]+', '-', 'g'), '');
    v_slug_base := nullif(trim(both '-' from coalesce(v_slug_base, '')), '');
    IF v_slug_base IS NULL THEN
      v_slug_base := 'article-' || substr(replace(coalesce(v_run_id::text, gen_random_uuid()::text), '-', ''), 1, 8);
    END IF;
    v_slug := left(v_slug_base, 80);

    <<slug_loop>>
    WHILE v_attempt < 3 LOOP
      BEGIN
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

    INSERT INTO public.sources (
      article_id, title, url, publisher, author_name, published_date,
      source_type, quote, sort_order, metadata
    )
    SELECT v_article_id, s->>'title', s->>'url', s->>'publisher', s->>'author_name',
      public.parse_timeline_event_date(s->>'published_date'),
      s->>'source_type', s->>'quote',
      coalesce(nullif(s->>'sort_order','')::int, (ord - 1)::int),
      coalesce(s - 'title' - 'url' - 'publisher' - 'author_name' - 'published_date'
        - 'source_type' - 'quote' - 'sort_order', '{}'::jsonb)
    FROM jsonb_array_elements(v_sources) WITH ORDINALITY AS t(s, ord);

    INSERT INTO public.timelines (
      article_id, title, description, event_date, event_label,
      event_body, event_image_url, source_url, sort_order, metadata
    )
    SELECT v_article_id, t->>'title', t->>'description',
      coalesce(public.parse_timeline_event_date(t->>'event_date'), now()),
      coalesce(nullif(t->>'event_label',''), 'Event'), t->>'event_body',
      t->>'event_image_url', t->>'source_url',
      coalesce(nullif(t->>'sort_order','')::int, (ord - 1)::int),
      coalesce(t - 'title' - 'description' - 'event_date' - 'event_label'
        - 'event_body' - 'event_image_url' - 'source_url' - 'sort_order', '{}'::jsonb)
    FROM jsonb_array_elements(v_timeline) WITH ORDINALITY AS tb(t, ord);

    INSERT INTO public.quizzes (
      article_id, title, question_text, question_type, options,
      explanation, difficulty, points, sort_order, metadata
    )
    SELECT v_article_id, coalesce(nullif(q->>'title',''), 'Comprehension Quiz'),
      q->>'question_text', coalesce(nullif(q->>'question_type',''), 'multiple_choice'),
      (SELECT coalesce(jsonb_agg(o - 'is_correct'), '[]'::jsonb)
        FROM jsonb_array_elements(q->'options') o),
      q->>'explanation', q->>'difficulty',
      coalesce(nullif(q->>'points','')::int, 10),
      coalesce(nullif(q->>'sort_order','')::int, (ord - 1)::int),
      jsonb_build_object('correct_index', coalesce(nullif(q->>'correct_index','')::int, 0))
    FROM jsonb_array_elements(v_quizzes) WITH ORDINALITY AS tq(q, ord);

    article_id := v_article_id;
    slug := v_slug;
    audience := v_audience;
    RETURN NEXT;
  END;
$function$;

-- get_kid_quiz_verdict — advances streak on pass
CREATE OR REPLACE FUNCTION public.get_kid_quiz_verdict(
  p_kid_profile_id uuid,
  p_article_id     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_threshold            int;
  v_total                int;
  v_correct              int;
  v_is_passed            boolean;
  v_parent_user_id       uuid;
  v_claim_kid_profile_id uuid;
  v_is_kid_delegated     boolean;
BEGIN
  SELECT parent_user_id INTO v_parent_user_id
  FROM public.kid_profiles
  WHERE id = p_kid_profile_id;

  IF v_parent_user_id IS NULL THEN
    RAISE EXCEPTION 'kid profile not found' USING ERRCODE = 'P0001';
  END IF;

  v_is_kid_delegated := COALESCE(public.is_kid_delegated(), false);
  IF v_is_kid_delegated THEN
    v_claim_kid_profile_id := auth.uid();
    IF v_claim_kid_profile_id IS DISTINCT FROM p_kid_profile_id THEN
      RAISE EXCEPTION 'access denied' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF auth.uid() IS DISTINCT FROM v_parent_user_id THEN
      RAISE EXCEPTION 'access denied' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  BEGIN
    SELECT NULLIF(value, '')::int INTO v_threshold
    FROM public.settings
    WHERE key = 'kids.quiz.pass_threshold_pct';
  EXCEPTION WHEN invalid_text_representation THEN
    v_threshold := NULL;
  END;
  IF v_threshold IS NULL OR v_threshold < 0 OR v_threshold > 100 THEN
    v_threshold := 60;
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM public.quizzes
  WHERE article_id = p_article_id
    AND is_active = true
    AND deleted_at IS NULL;

  SELECT COUNT(DISTINCT quiz_id) FILTER (WHERE is_correct)
    INTO v_correct
  FROM public.quiz_attempts
  WHERE kid_profile_id = p_kid_profile_id
    AND article_id = p_article_id;

  IF v_total = 0 THEN
    v_is_passed := false;
  ELSE
    v_is_passed := (COALESCE(v_correct, 0) * 100 >= v_threshold * v_total);
  END IF;

  IF v_is_passed THEN
    PERFORM public.advance_streak(
      p_user_id        := NULL,
      p_kid_profile_id := p_kid_profile_id
    );
  END IF;

  RETURN jsonb_build_object(
    'is_passed',     v_is_passed,
    'correct',       COALESCE(v_correct, 0),
    'total',         v_total,
    'threshold_pct', v_threshold
  );
END;
$$;

-- users_protect_columns — adds invite_cap_override to read-only self-update guard
CREATE OR REPLACE FUNCTION public.users_protect_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_is_admin boolean := false;
  v_auth_sync text := current_setting('app.auth_sync', true);
BEGIN
  IF v_auth_sync = 'true' THEN RETURN NEW; END IF;
  IF v_role = 'service_role' THEN RETURN NEW; END IF;
  BEGIN
    v_is_admin := public.is_admin_or_above();
  EXCEPTION WHEN OTHERS THEN
    v_is_admin := false;
  END;
  IF v_is_admin THEN RETURN NEW; END IF;

  IF NEW.cohort IS DISTINCT FROM OLD.cohort THEN
    RAISE EXCEPTION 'users.cohort is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.cohort_joined_at IS DISTINCT FROM OLD.cohort_joined_at THEN
    RAISE EXCEPTION 'users.cohort_joined_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.comped_until IS DISTINCT FROM OLD.comped_until THEN
    RAISE EXCEPTION 'users.comped_until is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.verify_locked_at IS DISTINCT FROM OLD.verify_locked_at THEN
    RAISE EXCEPTION 'users.verify_locked_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN
    RAISE EXCEPTION 'users.plan_id is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.plan_status IS DISTINCT FROM OLD.plan_status THEN
    RAISE EXCEPTION 'users.plan_status is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.plan_grace_period_ends_at IS DISTINCT FROM OLD.plan_grace_period_ends_at THEN
    RAISE EXCEPTION 'users.plan_grace_period_ends_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN
    RAISE EXCEPTION 'users.stripe_customer_id is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.frozen_at IS DISTINCT FROM OLD.frozen_at THEN
    RAISE EXCEPTION 'users.frozen_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.frozen_verity_score IS DISTINCT FROM OLD.frozen_verity_score THEN
    RAISE EXCEPTION 'users.frozen_verity_score is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.perms_version IS DISTINCT FROM OLD.perms_version THEN
    RAISE EXCEPTION 'users.perms_version is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.perms_version_bumped_at IS DISTINCT FROM OLD.perms_version_bumped_at THEN
    RAISE EXCEPTION 'users.perms_version_bumped_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.referred_by IS DISTINCT FROM OLD.referred_by THEN
    RAISE EXCEPTION 'users.referred_by is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN
    RAISE EXCEPTION 'users.referral_code is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.invite_cap_override IS DISTINCT FROM OLD.invite_cap_override THEN
    RAISE EXCEPTION 'users.invite_cap_override is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
    RAISE EXCEPTION 'users.is_banned is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.is_shadow_banned IS DISTINCT FROM OLD.is_shadow_banned THEN
    RAISE EXCEPTION 'users.is_shadow_banned is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.ban_reason IS DISTINCT FROM OLD.ban_reason THEN
    RAISE EXCEPTION 'users.ban_reason is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.banned_at IS DISTINCT FROM OLD.banned_at THEN
    RAISE EXCEPTION 'users.banned_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.banned_by IS DISTINCT FROM OLD.banned_by THEN
    RAISE EXCEPTION 'users.banned_by is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.email_verified IS DISTINCT FROM OLD.email_verified THEN
    RAISE EXCEPTION 'users.email_verified is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.email_verified_at IS DISTINCT FROM OLD.email_verified_at THEN
    RAISE EXCEPTION 'users.email_verified_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.phone_verified IS DISTINCT FROM OLD.phone_verified THEN
    RAISE EXCEPTION 'users.phone_verified is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at THEN
    RAISE EXCEPTION 'users.phone_verified_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.is_expert IS DISTINCT FROM OLD.is_expert THEN
    RAISE EXCEPTION 'users.is_expert is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.is_verified_public_figure IS DISTINCT FROM OLD.is_verified_public_figure THEN
    RAISE EXCEPTION 'users.is_verified_public_figure is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.expert_title IS DISTINCT FROM OLD.expert_title THEN
    RAISE EXCEPTION 'users.expert_title is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.expert_organization IS DISTINCT FROM OLD.expert_organization THEN
    RAISE EXCEPTION 'users.expert_organization is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.verity_score IS DISTINCT FROM OLD.verity_score THEN
    RAISE EXCEPTION 'users.verity_score is read-only for self-update' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

-- apply_signup_cohort — reads beta_trial_duration from settings
CREATE OR REPLACE FUNCTION public.apply_signup_cohort(
  p_user_id uuid,
  p_via_owner_link boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_signup_cohort text;
  v_beta_active boolean;
  v_beta_cap int;
  v_current_count int;
  v_user record;
  v_pro_plan_id uuid;
  v_now timestamptz := now();
  v_trial_days int;
BEGIN
  IF v_role <> 'service_role' AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'apply_signup_cohort: not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT id, email_verified, cohort, is_kids_mode_enabled, plan_id, verify_locked_at
    INTO v_user
    FROM public.users
   WHERE id = p_user_id
     FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  BEGIN
    SELECT NULLIF(TRIM(value), '')::int INTO v_trial_days
      FROM public.settings WHERE key = 'beta_trial_duration';
  EXCEPTION WHEN OTHERS THEN
    v_trial_days := NULL;
  END;
  IF v_trial_days IS NULL OR v_trial_days <= 0 THEN v_trial_days := 30; END IF;

  IF v_user.cohort IS NOT NULL THEN
    IF v_user.cohort = 'beta'
       AND v_user.plan_id IS NULL
       AND COALESCE(v_user.email_verified, false) = true THEN
      SELECT id INTO v_pro_plan_id FROM public.plans
        WHERE name = 'verity_pro_monthly' LIMIT 1;
      IF v_pro_plan_id IS NOT NULL THEN
        UPDATE public.users
           SET plan_id      = v_pro_plan_id,
               plan_status  = 'active',
               comped_until = COALESCE(comped_until, v_now + (v_trial_days || ' days')::interval)
         WHERE id = p_user_id;
        PERFORM public.bump_user_perms_version(p_user_id);
      END IF;
    END IF;
    RETURN v_user.cohort;
  END IF;

  SELECT value INTO v_signup_cohort FROM public.settings WHERE key = 'signup_cohort';
  IF v_signup_cohort IS NULL OR v_signup_cohort = '' THEN
    RETURN NULL;
  END IF;

  SELECT (value)::boolean INTO v_beta_active FROM public.settings WHERE key = 'beta_active';
  IF v_signup_cohort = 'beta' AND COALESCE(v_beta_active, false) = false THEN
    UPDATE public.users
       SET cohort = v_signup_cohort,
           cohort_joined_at = v_now
     WHERE id = p_user_id;
    RETURN v_signup_cohort;
  END IF;

  SELECT (value)::int INTO v_beta_cap FROM public.settings WHERE key = 'beta_cap';
  IF v_signup_cohort = 'beta' AND COALESCE(v_beta_cap, 0) > 0 THEN
    SELECT count(*)::int INTO v_current_count
      FROM public.users WHERE cohort = 'beta';
    IF v_current_count >= v_beta_cap THEN
      RETURN NULL;
    END IF;
  END IF;

  UPDATE public.users
     SET cohort = v_signup_cohort,
         cohort_joined_at = v_now
   WHERE id = p_user_id;

  IF v_signup_cohort = 'beta' AND COALESCE(v_user.is_kids_mode_enabled, false) = false THEN
    IF p_via_owner_link OR COALESCE(v_user.email_verified, false) = true THEN
      SELECT id INTO v_pro_plan_id FROM public.plans
        WHERE name = 'verity_pro_monthly' LIMIT 1;
      IF v_pro_plan_id IS NOT NULL THEN
        UPDATE public.users
           SET plan_id      = v_pro_plan_id,
               plan_status  = 'active',
               comped_until = COALESCE(comped_until, v_now + (v_trial_days || ' days')::interval)
         WHERE id = p_user_id;
        PERFORM public.bump_user_perms_version(p_user_id);
      END IF;
    ELSE
      UPDATE public.users
         SET verify_locked_at = v_now,
             perms_version = perms_version + 1,
             perms_version_bumped_at = v_now
       WHERE id = p_user_id;
    END IF;
  END IF;

  RETURN v_signup_cohort;
END;
$$;

-- sweep_trial_expiries — daily cron downgrades expired beta pro users
CREATE OR REPLACE FUNCTION public.sweep_trial_expiries()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_free_plan_id uuid;
  v_now timestamptz := now();
  v_user_id uuid;
  v_count int := 0;
BEGIN
  SELECT id INTO v_free_plan_id FROM public.plans WHERE tier = 'free' LIMIT 1;
  IF v_free_plan_id IS NULL THEN
    RAISE EXCEPTION 'sweep_trial_expiries: free plan not found';
  END IF;

  FOR v_user_id IN
    SELECT id FROM public.users
     WHERE cohort = 'beta'
       AND plan_id IN (SELECT id FROM public.plans WHERE tier = 'verity_pro')
       AND COALESCE(trial_extension_until, comped_until) IS NOT NULL
       AND COALESCE(trial_extension_until, comped_until) < v_now
  LOOP
    UPDATE public.users
       SET plan_id     = v_free_plan_id,
           plan_status = 'active',
           updated_at  = v_now
     WHERE id = v_user_id;
    PERFORM public.bump_user_perms_version(v_user_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


-- =============================================================================
-- 4. DROP COLUMN CLEANUP (last — safest to run after everything else)
-- =============================================================================

-- M: Dead access_requests columns from removed two-step email-confirm flow.
-- Dev/legacy rows confirmed present but safe to discard (verified 2026-04-29).
ALTER TABLE public.access_requests
  DROP COLUMN IF EXISTS email_confirm_token,
  DROP COLUMN IF EXISTS email_confirm_expires_at,
  DROP COLUMN IF EXISTS email_confirmed_at;
