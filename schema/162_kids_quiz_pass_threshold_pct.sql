-- 162 — Move the kids quiz pass threshold out of the iOS client and
-- into the DB, plus expose a server-authoritative verdict RPC.
--
-- C14 / Q11+Q12 — pre-fix, `KidQuizEngineView.swift:337` computed
-- `passed = correctCount >= ceil(total * 0.6)` locally. A tampered
-- client could lie, and tuning the threshold required an iOS rebuild.
-- Fix: store the threshold in `settings` and compute is_passed in a
-- SECURITY DEFINER RPC that the client calls after writing its
-- quiz_attempts. Client displays whatever the server says.
--
-- The RPC also becomes the single server-side source of truth so
-- parent dashboards + future analytics see the same pass/fail the
-- kid saw.

BEGIN;

-- Seed the threshold. Idempotent: ON CONFLICT updates only the
-- description + metadata so re-running doesn't clobber operator edits.
INSERT INTO public.settings (key, value, value_type, category, display_name, description, is_public)
VALUES (
  'kids.quiz.pass_threshold_pct',
  '60',
  'number',
  'kids',
  'Kids quiz pass threshold (%)',
  'Minimum percentage of correct answers for a kid to pass an article quiz. Integer 0..100. Default 60 — matches the pre-DB hardcoded client value.',
  false
)
ON CONFLICT (key) DO UPDATE SET
  value_type = EXCLUDED.value_type,
  category = EXCLUDED.category,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description;

-- Server-authoritative verdict. Counts distinct-question correct
-- attempts by this kid on this article, reads the threshold from
-- settings, and returns a JSON verdict. Client must use this verdict
-- for UI state instead of computing its own.
--
-- Security:
-- - SECURITY DEFINER so the function can read settings + quiz_attempts
--   regardless of caller's RLS. Caller authorization is enforced at
--   the top: the caller must either be the parent of this kid, or
--   the kid themselves via kid-JWT delegation. Anything else raises.
-- - GRANT EXECUTE to authenticated only (not anon). The kid JWT is
--   issued as an authenticated session with is_kid_delegated=true, so
--   it qualifies.

CREATE OR REPLACE FUNCTION public.get_kid_quiz_verdict(
  p_kid_profile_id uuid,
  p_article_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

  -- Total questions for this article.
  SELECT COUNT(*) INTO v_total
  FROM public.quiz_questions
  WHERE article_id = p_article_id;

  -- Count distinct correct questions answered by this kid. DISTINCT
  -- on question_id so a retry-within-session doesn't double-count.
  -- FILTER (WHERE is_correct) is the correct-only narrowing.
  SELECT COUNT(DISTINCT question_id) FILTER (WHERE is_correct)
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
$$;

REVOKE ALL ON FUNCTION public.get_kid_quiz_verdict(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_kid_quiz_verdict(uuid, uuid) TO authenticated, service_role;

COMMIT;
