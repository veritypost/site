-- Advance the kid's streak when get_kid_quiz_verdict confirms a pass.
--
-- The verdict RPC is the server-authoritative pass signal (called by iOS
-- after all quiz_attempts writes land). Firing advance_streak here means
-- kids get streak credit without any iOS changes. advance_streak is
-- idempotent per calendar day, so the A41 verdict-retry path is safe.

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
    v_claim_kid_profile_id := auth.uid();
    IF v_claim_kid_profile_id IS DISTINCT FROM p_kid_profile_id THEN
      RAISE EXCEPTION 'access denied' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF auth.uid() IS DISTINCT FROM v_parent_user_id THEN
      RAISE EXCEPTION 'access denied' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Read threshold from settings. Fall through to 60 if the row is
  -- missing or non-integer — don't let a misconfigured setting lock
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

  -- Total active questions for this article.
  SELECT COUNT(*) INTO v_total
  FROM public.quizzes
  WHERE article_id = p_article_id
    AND is_active = true
    AND deleted_at IS NULL;

  -- Distinct correct questions answered by this kid. DISTINCT on
  -- quiz_id so a retry-within-session doesn't double-count.
  SELECT COUNT(DISTINCT quiz_id) FILTER (WHERE is_correct)
    INTO v_correct
  FROM public.quiz_attempts
  WHERE kid_profile_id = p_kid_profile_id
    AND article_id = p_article_id;

  IF v_total = 0 THEN
    v_is_passed := false;
  ELSE
    -- Integer-safe: correct * 100 >= threshold * total
    v_is_passed := (COALESCE(v_correct, 0) * 100 >= v_threshold * v_total);
  END IF;

  -- Advance streak on pass. Idempotent per day, so the A41 verdict-retry
  -- path (retryVerdictFetch in KidQuizEngineView) is safe.
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
