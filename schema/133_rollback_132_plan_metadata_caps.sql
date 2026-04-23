-- 133_rollback_132.sql — undo 132_plan_metadata_caps_and_achievement_rewrite.sql
--
-- Restores:
--   * enforce_bookmark_cap to the pre-132 hardcoded-10 + check_violation form
--   * enforce_max_kids to the pre-132 form (no ERRCODE)
--   * check_user_achievements to the pre-132 broken form (kept for
--     symmetry; the old function references columns that don't exist —
--     applying this rollback re-introduces that bug)
--   * INSERT RLS policies on reading_log / quiz_attempts / streaks to
--     their pre-132 shape
--   * plans.metadata bookmark + kids keys are NOT removed: they're data
--     and removing them risks unrelated readers; rollback only reverts
--     code paths
--
-- Apply only if 132 misbehaves; the bookmark/kids data backfill is
-- independent and benign.

BEGIN;

-- ----------------------------------------------------------------------
-- Restore enforce_bookmark_cap (hardcoded 10, check_violation errcode)
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_bookmark_cap()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  IF _user_is_paid(NEW.user_id) THEN
    RETURN NEW;
  END IF;
  SELECT COUNT(*) INTO v_count FROM bookmarks WHERE user_id = NEW.user_id;
  IF v_count >= 10 THEN
    RAISE EXCEPTION 'Free accounts are capped at 10 bookmarks. Upgrade to Verity for unlimited.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------------
-- Restore enforce_max_kids (no ERRCODE clause)
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_max_kids()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_max     integer;
  v_current integer;
BEGIN
  SELECT COALESCE((p.metadata->>'max_kids')::integer, 0)
    INTO v_max
    FROM users u
    LEFT JOIN plans p ON p.id = u.plan_id AND u.plan_status IN ('active','trialing')
   WHERE u.id = NEW.parent_user_id;

  SELECT count(*)
    INTO v_current
    FROM kid_profiles
   WHERE parent_user_id = NEW.parent_user_id AND is_active = true;

  IF v_current >= COALESCE(v_max, 0) THEN
    RAISE EXCEPTION 'Kid profile limit reached for this plan (max=%)', COALESCE(v_max, 0);
  END IF;
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------------
-- Restore RLS policies to pre-132 shape
-- ----------------------------------------------------------------------

-- reading_log
DROP POLICY IF EXISTS reading_log_insert         ON public.reading_log;
DROP POLICY IF EXISTS reading_log_insert_kid_jwt ON public.reading_log;

CREATE POLICY reading_log_insert ON public.reading_log
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY reading_log_insert_kid_jwt ON public.reading_log
  FOR INSERT
  WITH CHECK (
    public.is_kid_delegated()
    AND kid_profile_id = auth.uid()
    AND ((user_id IS NULL) OR ((user_id)::text = (auth.jwt() ->> 'parent_user_id')))
  );

-- quiz_attempts
DROP POLICY IF EXISTS quiz_attempts_insert         ON public.quiz_attempts;
DROP POLICY IF EXISTS quiz_attempts_insert_kid_jwt ON public.quiz_attempts;

CREATE POLICY quiz_attempts_insert ON public.quiz_attempts
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_verified_email()
    AND NOT public.is_banned()
  );

CREATE POLICY quiz_attempts_insert_kid_jwt ON public.quiz_attempts
  FOR INSERT
  WITH CHECK (
    public.is_kid_delegated()
    AND kid_profile_id = auth.uid()
    AND ((user_id IS NULL) OR ((user_id)::text = (auth.jwt() ->> 'parent_user_id')))
  );

-- streaks
DROP POLICY IF EXISTS streaks_insert         ON public.streaks;
DROP POLICY IF EXISTS streaks_insert_kid_jwt ON public.streaks;

CREATE POLICY streaks_insert ON public.streaks
  FOR INSERT
  WITH CHECK ((user_id = auth.uid()) OR public.owns_kid_profile(kid_profile_id));

-- ----------------------------------------------------------------------
-- Restore check_user_achievements to pre-132 form
-- (NOTE: this function is structurally broken — references
--  quiz_attempts.passed which does not exist. Rolling back re-introduces
--  the bug; only do this if the new function misbehaves worse.)
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_user_achievements(p_user_id uuid)
  RETURNS SETOF user_achievements
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_reading_count   int;
  v_quiz_pass_count int;
  v_comment_count   int;
  v_streak_days     int;
  v_ach             achievements%ROWTYPE;
  v_threshold       int;
  v_meets           boolean;
  v_row             user_achievements%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;

  SELECT coalesce(count(*), 0) INTO v_reading_count
    FROM reading_log WHERE user_id = p_user_id AND completed = true;
  SELECT coalesce(count(*), 0) INTO v_quiz_pass_count
    FROM quiz_attempts WHERE user_id = p_user_id AND passed = true;
  SELECT coalesce(count(*), 0) INTO v_comment_count
    FROM comments WHERE user_id = p_user_id AND status = 'visible';
  SELECT coalesce(streak_current, 0) INTO v_streak_days
    FROM users WHERE id = p_user_id;

  FOR v_ach IN
    SELECT * FROM achievements
    WHERE is_active = true
      AND criteria ? 'type' AND criteria ? 'value'
      AND (criteria->>'type') IN ('reading_count','quiz_pass_count','comment_count','streak_days')
      AND id NOT IN (
        SELECT achievement_id FROM user_achievements
        WHERE user_id = p_user_id AND kid_profile_id IS NULL
      )
  LOOP
    BEGIN
      v_threshold := (v_ach.criteria->>'value')::int;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;

    v_meets := CASE v_ach.criteria->>'type'
      WHEN 'reading_count'   THEN v_reading_count   >= v_threshold
      WHEN 'quiz_pass_count' THEN v_quiz_pass_count >= v_threshold
      WHEN 'comment_count'   THEN v_comment_count   >= v_threshold
      WHEN 'streak_days'     THEN v_streak_days     >= v_threshold
      ELSE false
    END;

    IF v_meets THEN
      INSERT INTO user_achievements (user_id, achievement_id, points_awarded)
      VALUES (p_user_id, v_ach.id, v_ach.points_reward)
      ON CONFLICT DO NOTHING
      RETURNING * INTO v_row;
      IF v_row.id IS NOT NULL THEN
        UPDATE achievements SET total_earned_count = total_earned_count + 1
          WHERE id = v_ach.id;
        RETURN NEXT v_row;
      END IF;
    END IF;
  END LOOP;

  RETURN;
END;
$function$;

COMMIT;
