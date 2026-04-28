-- V1-fix — get_kid_quiz_verdict — fix dangling reference to non-existent
--          public.quiz_questions; rewrite over public.quizzes (1 row per
--          question) + public.quiz_attempts.quiz_id FK.
--
-- Source: V1 verification pass 2026-04-28. S10 agent's final report flagged
-- this; live MCP confirmed:
--   - public.quiz_questions does NOT exist (SELECT FROM information_schema
--     .tables → not present)
--   - public.quizzes IS the questions table — one row per question, with
--     article_id, options, points, is_active, deleted_at, pool_group, etc.
--   - public.quiz_attempts.quiz_id FK → quizzes.id (not question_id)
--
-- Current broken body (verified via pg_get_functiondef 2026-04-28):
--   SELECT COUNT(*) INTO v_total FROM public.quiz_questions
--    WHERE article_id = p_article_id;
--   SELECT COUNT(DISTINCT question_id) FILTER (WHERE is_correct)
--     INTO v_correct
--    FROM public.quiz_attempts
--    WHERE kid_profile_id = p_kid_profile_id
--      AND article_id = p_article_id;
--
-- Both SELECTs throw 42P01 (quiz_questions) / 42703 (question_id column on
-- quiz_attempts). Every kid-quiz verdict call currently errors out — kid
-- discussion-gate / quiz-pass surface is dead.
--
-- Fix:
--   - Total: COUNT(*) FROM public.quizzes WHERE article_id = p_article_id
--     AND is_active = true AND deleted_at IS NULL.
--     (quizzes.is_active and deleted_at filter the active question pool;
--     matches how the rest of the platform reads quiz questions.)
--   - Correct: COUNT(DISTINCT quiz_id) FILTER (WHERE is_correct) FROM
--     quiz_attempts WHERE kid_profile_id = p_kid_profile_id AND
--     article_id = p_article_id. (quiz_id is the question identifier on
--     attempt rows; it FKs to quizzes.id.)
--
-- All other body logic preserved verbatim: auth gate (parent OR kid-JWT),
-- threshold lookup with fallback to 60, integer-safe pass compare,
-- jsonb return shape (is_passed, correct, total, threshold_pct).
--
-- Caller refactor: none. Callers receive the same jsonb shape.

BEGIN;

-- Pre-flight: confirm the broken body is current.
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def FROM pg_proc
   WHERE proname = 'get_kid_quiz_verdict' AND pronamespace = 'public'::regnamespace;
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'V1-fix abort: get_kid_quiz_verdict not found';
  END IF;
  IF v_def NOT LIKE '%quiz_questions%' AND v_def NOT LIKE '%question_id%' THEN
    RAISE NOTICE 'V1-fix no-op: get_kid_quiz_verdict already references quizzes/quiz_id';
  END IF;
  -- Confirm target tables exist.
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='quizzes') THEN
    RAISE EXCEPTION 'V1-fix abort: public.quizzes missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='quiz_attempts'
                   AND column_name='quiz_id') THEN
    RAISE EXCEPTION 'V1-fix abort: quiz_attempts.quiz_id missing';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_kid_quiz_verdict(p_kid_profile_id uuid, p_article_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_threshold int;
  v_total int;
  v_correct int;
  v_is_passed boolean;
  v_parent_user_id uuid;
  v_claim_kid_profile_id uuid;
  v_is_kid_delegated boolean;
BEGIN
  -- Auth gate. Caller must be either (a) the parent of the kid, or
  -- (b) the kid themselves via kid-JWT delegation. Anything else
  -- leaks verdicts across households.
  SELECT parent_user_id INTO v_parent_user_id
  FROM public.kid_profiles
  WHERE id = p_kid_profile_id;

  IF v_parent_user_id IS NULL THEN
    RAISE EXCEPTION 'kid profile not found' USING ERRCODE = 'P0001';
  END IF;

  v_is_kid_delegated := COALESCE(public.is_kid_delegated(), false);
  IF v_is_kid_delegated THEN
    -- Kid JWT sets auth.uid() to the kid_profile_id. Ensure the
    -- delegated kid matches the profile being read.
    v_claim_kid_profile_id := auth.uid();
    IF v_claim_kid_profile_id IS DISTINCT FROM p_kid_profile_id THEN
      RAISE EXCEPTION 'access denied' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    -- Not a kid JWT — must be the parent.
    IF auth.uid() IS DISTINCT FROM v_parent_user_id THEN
      RAISE EXCEPTION 'access denied' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Read threshold. Fall through to 60 if the row is missing or the
  -- value isn't an integer — don't let a misconfigured setting lock
  -- every kid out.
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

  -- Total active questions for this article. quizzes is the questions
  -- table (one row per question); is_active + deleted_at filter the
  -- active pool, matching how the rest of the platform reads it.
  SELECT COUNT(*) INTO v_total
  FROM public.quizzes
  WHERE article_id = p_article_id
    AND is_active = true
    AND deleted_at IS NULL;

  -- Count distinct correct questions answered by this kid. DISTINCT
  -- on quiz_id so a retry-within-session doesn't double-count.
  -- FILTER (WHERE is_correct) is the correct-only narrowing.
  SELECT COUNT(DISTINCT quiz_id) FILTER (WHERE is_correct)
    INTO v_correct
  FROM public.quiz_attempts
  WHERE kid_profile_id = p_kid_profile_id
    AND article_id = p_article_id;

  IF v_total = 0 THEN
    v_is_passed := false;
  ELSE
    -- Integer-safe threshold compare: correct/total * 100 >= threshold
    -- <=> correct * 100 >= threshold * total
    v_is_passed := (COALESCE(v_correct, 0) * 100 >= v_threshold * v_total);
  END IF;

  RETURN jsonb_build_object(
    'is_passed',     v_is_passed,
    'correct',       COALESCE(v_correct, 0),
    'total',         v_total,
    'threshold_pct', v_threshold
  );
END;
$function$;

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def FROM pg_proc
   WHERE proname = 'get_kid_quiz_verdict' AND pronamespace = 'public'::regnamespace;
  IF v_def LIKE '%quiz_questions%' THEN
    RAISE EXCEPTION 'V1-fix post-check failed: quiz_questions still referenced in body';
  END IF;
  RAISE NOTICE 'V1-fix applied: get_kid_quiz_verdict now reads quizzes + quiz_attempts.quiz_id';
END $$;

COMMIT;
