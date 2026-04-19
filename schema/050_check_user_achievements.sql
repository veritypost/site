-- 050_check_user_achievements.sql
-- Bug 92: achievement rollup was a client-side stub returning []. Wire a
-- server-side RPC that checks a small set of well-known criteria shapes
-- against the user's current counters + streak, and inserts any newly-earned
-- rows into user_achievements.
--
-- Supported criteria shapes (all jsonb on achievements.criteria):
--   { "type": "reading_count",   "value": 10 }
--   { "type": "quiz_pass_count", "value": 5  }
--   { "type": "comment_count",   "value": 25 }
--   { "type": "streak_days",     "value": 7  }
--
-- Unknown criteria types are silently skipped — this opens the door for
-- future shapes without breaking the call chain. The RPC is intentionally
-- idempotent: the `ON CONFLICT DO NOTHING` behaviour uses a unique index
-- on (user_id, achievement_id) that we add below for safety.
--
-- Called from lib/scoring.js checkAchievements AND from a daily cron so
-- milestone achievements (e.g., streak_days) land even on zero-activity
-- days when no scoring event fires.
--
-- Idempotent.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS user_achievements_user_ach_unique
  ON public.user_achievements (user_id, achievement_id)
  WHERE kid_profile_id IS NULL;

CREATE OR REPLACE FUNCTION public.check_user_achievements(p_user_id uuid)
RETURNS SETOF user_achievements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reading_count  int;
  v_quiz_pass_count int;
  v_comment_count  int;
  v_streak_days    int;
  v_ach            achievements%ROWTYPE;
  v_threshold      int;
  v_meets          boolean;
  v_row            user_achievements%ROWTYPE;
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
$$;

GRANT EXECUTE ON FUNCTION public.check_user_achievements(uuid) TO authenticated, service_role;

COMMIT;
