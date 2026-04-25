-- 169_recap_award_points.sql
-- Ext-AAA.4 — recap pass not wired to award_points.
--
-- The submit_recap_attempt RPC graded the attempt and persisted the row
-- but never called the scoring helper, so weekly recap participation
-- earned nothing toward verity_score even though the rest of the loop
-- (article read, quiz pass, comment post) does. Closes that gap.
--
-- Strategy:
--   1. Seed a score_rules row for action='recap_pass' (idempotent).
--      6 points matches the "moderate-effort engagement" tier the
--      existing rules use (article_read=2, quiz_pass=5, daily_streak=1).
--   2. Re-create submit_recap_attempt to PERFORM award_points after the
--      attempt persists, gated on a 60% pass threshold (matches
--      kids.quiz.pass_threshold_pct + the grade-school standard).
--   3. award_points is idempotent on (user_id, action, source_id) via
--      the existing partial-unique index, so a re-submit (UPSERT
--      branch) won't double-award.

INSERT INTO public.score_rules (
  action, points, max_per_day, max_per_article, cooldown_seconds,
  applies_to_kids, is_active, description
)
VALUES (
  'recap_pass', 6, 1, NULL, NULL,
  false, true, 'Awarded once per weekly recap quiz when the user passes (>=60%).'
)
ON CONFLICT (action) DO NOTHING;


CREATE OR REPLACE FUNCTION public.submit_recap_attempt(
  p_user_id uuid,
  p_recap_quiz_id uuid,
  p_answers jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ans jsonb;
  v_q weekly_recap_questions%ROWTYPE;
  v_correct_idx int;
  v_selected int;
  v_is_correct boolean;
  v_score int := 0;
  v_total int := 0;
  v_results jsonb := '[]'::jsonb;
  v_missed uuid[] := '{}';
  v_attempt_id uuid;
  v_passed boolean := false;
  v_award jsonb;
BEGIN
  FOR v_ans IN SELECT * FROM jsonb_array_elements(p_answers) LOOP
    v_total := v_total + 1;
    SELECT * INTO v_q FROM weekly_recap_questions
      WHERE id = (v_ans->>'question_id')::uuid
        AND recap_quiz_id = p_recap_quiz_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_selected := (v_ans->>'selected_answer')::int;
    SELECT (i - 1)::int INTO v_correct_idx
      FROM jsonb_array_elements(v_q.options) WITH ORDINALITY AS e(opt, i)
     WHERE (opt->>'is_correct')::boolean = true LIMIT 1;

    v_is_correct := (v_selected = v_correct_idx);
    IF v_is_correct THEN v_score := v_score + 1;
    ELSIF v_q.article_id IS NOT NULL THEN
      v_missed := array_append(v_missed, v_q.article_id);
    END IF;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'question_id', v_q.id,
      'article_id', v_q.article_id,
      'selected_answer', v_selected,
      'correct_answer', v_correct_idx,
      'is_correct', v_is_correct,
      'explanation', v_q.explanation,
      'options', (SELECT jsonb_agg(jsonb_build_object('text', opt->>'text'))
                    FROM jsonb_array_elements(v_q.options) AS opt)
    ));
  END LOOP;

  INSERT INTO weekly_recap_attempts
    (recap_quiz_id, user_id, score, total_questions, answers, articles_missed, completed_at)
  VALUES
    (p_recap_quiz_id, p_user_id, v_score, v_total, p_answers, v_missed, now())
  ON CONFLICT (recap_quiz_id, user_id) DO UPDATE
    SET score            = EXCLUDED.score,
        total_questions  = EXCLUDED.total_questions,
        answers          = EXCLUDED.answers,
        articles_missed  = EXCLUDED.articles_missed,
        completed_at     = EXCLUDED.completed_at
  RETURNING id INTO v_attempt_id;

  -- Ext-AAA4 — award points on first pass for this recap. The
  -- partial-unique index on score_events (user_id, action, source_id
  -- WHERE source_id IS NOT NULL) keys idempotency on the attempt row,
  -- so re-submits don't double-award.
  IF v_total > 0 THEN
    v_passed := (v_score::numeric / v_total::numeric) >= 0.6;
  END IF;
  IF v_passed THEN
    SELECT public.award_points(
      p_action       := 'recap_pass',
      p_user_id      := p_user_id,
      p_kid_profile_id := NULL,
      p_article_id   := NULL,
      p_category_id  := NULL,
      p_source_type  := 'recap_attempt',
      p_source_id    := v_attempt_id,
      p_synthetic_key := NULL
    ) INTO v_award;
  END IF;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt_id,
    'score', v_score,
    'total', v_total,
    'passed', v_passed,
    'award', v_award,
    'articles_missed', v_missed,
    'results', v_results
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_recap_attempt(uuid, uuid, jsonb) TO service_role;
