-- ============================================================
-- T-006 + Q39: Make quiz pass threshold DB-driven
--
-- Seeds quiz_pass_threshold in settings so the pass gate can be
-- tuned without a migration. Replaces both hardcoded >= 3 literals
-- in user_passed_article_quiz and submit_quiz_attempt with
-- _setting_int('quiz_pass_threshold', 3) calls.
-- ============================================================

INSERT INTO settings (key, value, value_type, category, display_name, description, is_public)
VALUES (
  'quiz_pass_threshold', '3', 'integer', 'quiz',
  'Quiz pass threshold',
  'Minimum correct answers out of 5 required to unlock article discussion.',
  false
)
ON CONFLICT (key) DO NOTHING;


-- ------------------------------------------------------------
-- user_passed_article_quiz(user, article) -> bool
-- Reads pass threshold from settings instead of hardcoding 3.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_passed_article_quiz(
  p_user_id uuid,
  p_article_id uuid
) RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM (
        SELECT SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct_sum
          FROM quiz_attempts
         WHERE user_id = p_user_id
           AND article_id = p_article_id
           AND kid_profile_id IS NULL
         GROUP BY attempt_number
      ) t
     WHERE t.correct_sum >= _setting_int('quiz_pass_threshold', 3)
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_passed_article_quiz(uuid, uuid) TO authenticated, service_role;


-- ------------------------------------------------------------
-- submit_quiz_attempt(user, article, answers jsonb, kid_profile) -> jsonb
-- Reads pass threshold from settings instead of hardcoding 3.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(
  p_user_id uuid,
  p_article_id uuid,
  p_answers jsonb,
  p_kid_profile_id uuid DEFAULT NULL,
  p_time_taken_seconds int DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user users%ROWTYPE;
  v_tier text;
  v_is_paid boolean;
  v_attempts_used int;
  v_attempt_number int;
  v_total int;
  v_correct int := 0;
  v_passed boolean;
  v_pass_threshold int;
  v_results jsonb := '[]'::jsonb;
  v_percentile int;
  v_questions_served uuid[] := '{}';
  v_answer jsonb;
  v_quiz quizzes%ROWTYPE;
  v_selected int;
  v_correct_index int;
  v_is_correct boolean;
  v_points int;
BEGIN
  v_pass_threshold := _setting_int('quiz_pass_threshold', 3);

  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
  IF NOT v_user.email_verified THEN
    RAISE EXCEPTION 'verify email before submitting quizzes';
  END IF;

  v_total := jsonb_array_length(p_answers);
  IF v_total <> 5 THEN
    RAISE EXCEPTION 'expected 5 answers, got %', v_total;
  END IF;

  -- Tier / attempt-limit check (re-check; client can't bypass).
  v_attempts_used := user_article_attempts(p_user_id, p_article_id, p_kid_profile_id);

  SELECT p.tier INTO v_tier FROM plans p WHERE p.id = v_user.plan_id;
  v_is_paid := v_tier IN ('verity','verity_pro','verity_family','verity_family_xl');

  IF p_kid_profile_id IS NULL AND NOT v_is_paid AND v_attempts_used >= 2 THEN
    RAISE EXCEPTION 'attempt limit reached';
  END IF;

  v_attempt_number := v_attempts_used + 1;

  -- Grade each answer.
  FOR v_answer IN SELECT * FROM jsonb_array_elements(p_answers) LOOP
    SELECT * INTO v_quiz FROM quizzes
      WHERE id = (v_answer->>'quiz_id')::uuid
        AND article_id = p_article_id
        AND is_active = true
        AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'quiz question % does not belong to article %',
        v_answer->>'quiz_id', p_article_id;
    END IF;

    v_selected := (v_answer->>'selected_answer')::int;
    SELECT (i - 1)::int INTO v_correct_index
      FROM jsonb_array_elements(v_quiz.options) WITH ORDINALITY AS e(opt, i)
     WHERE (opt->>'is_correct')::boolean = true
     LIMIT 1;
    IF v_correct_index IS NULL THEN
      RAISE EXCEPTION 'question % has no correct answer configured', v_quiz.id;
    END IF;

    v_is_correct := (v_selected = v_correct_index);
    v_points := CASE WHEN v_is_correct THEN v_quiz.points ELSE 0 END;
    IF v_is_correct THEN v_correct := v_correct + 1; END IF;

    v_questions_served := v_questions_served || v_quiz.id;

    -- Insert the attempt row.
    INSERT INTO quiz_attempts
      (quiz_id, user_id, kid_profile_id, article_id, attempt_number,
       questions_served, selected_answer, is_correct, points_earned, time_taken_seconds)
    VALUES
      (v_quiz.id, p_user_id, p_kid_profile_id, p_article_id, v_attempt_number,
       ARRAY[]::uuid[], (v_selected)::text, v_is_correct, v_points, p_time_taken_seconds);

    -- Update per-question analytics.
    UPDATE quizzes
       SET attempt_count = attempt_count + 1,
           correct_count = correct_count + CASE WHEN v_is_correct THEN 1 ELSE 0 END,
           updated_at = now()
     WHERE id = v_quiz.id;

    -- Accumulate the D41 explanation payload.
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'quiz_id', v_quiz.id,
      'question_text', v_quiz.question_text,
      'selected_answer', v_selected,
      'correct_answer', v_correct_index,
      'is_correct', v_is_correct,
      'explanation', v_quiz.explanation,
      'options', (SELECT jsonb_agg(jsonb_build_object('text', opt->>'text'))
                    FROM jsonb_array_elements(v_quiz.options) AS opt)
    ));
  END LOOP;

  -- Backfill questions_served on all 5 rows we just inserted.
  UPDATE quiz_attempts
     SET questions_served = v_questions_served
   WHERE user_id = p_user_id
     AND article_id = p_article_id
     AND attempt_number = v_attempt_number
     AND (p_kid_profile_id IS NULL AND kid_profile_id IS NULL
          OR kid_profile_id = p_kid_profile_id);

  v_passed := (v_correct >= v_pass_threshold);

  -- Live percentile: what % of all attempts (grouped) on this
  -- article scored <= this one. Includes the just-inserted attempt.
  WITH attempt_scores AS (
    SELECT user_id, attempt_number,
           SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct_sum
      FROM quiz_attempts
     WHERE article_id = p_article_id
     GROUP BY user_id, attempt_number
  )
  SELECT ROUND(
           (COUNT(*) FILTER (WHERE correct_sum <= v_correct))::numeric
             / GREATEST(COUNT(*), 1) * 100
         )::int
    INTO v_percentile
    FROM attempt_scores;

  -- Bump quizzes_completed_count on first pass only is ambiguous;
  -- we bump on every attempt for simplicity (matches the old behaviour).
  UPDATE users
     SET quizzes_completed_count = quizzes_completed_count + 1,
         updated_at = now()
   WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'passed', v_passed,
    'correct', v_correct,
    'total', v_total,
    'attempt_number', v_attempt_number,
    'attempts_used', v_attempt_number,
    'attempts_remaining',
       CASE WHEN p_kid_profile_id IS NOT NULL THEN NULL
            WHEN v_is_paid THEN NULL
            ELSE GREATEST(2 - v_attempt_number, 0)
       END,
    'percentile', v_percentile,
    'results', v_results
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_quiz_attempt(uuid, uuid, jsonb, uuid, int) TO service_role;
