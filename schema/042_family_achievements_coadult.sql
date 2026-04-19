-- 042_family_achievements_coadult.sql
-- Extends recompute_family_achievements to include the co-adult
-- (D34 Family = up to 2 adults + up to 2 kids; Family XL = up to
-- 2 adults + up to 4 kids). Mirrors the household-membership shape
-- already used by the family_members() RPC in 017_phase9_family.sql.
-- CREATE OR REPLACE only; no schema change; no destructive edits.

BEGIN;

CREATE OR REPLACE FUNCTION public.recompute_family_achievements()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_ach family_achievements%ROWTYPE;
  v_crit jsonb;
  v_type text;
  v_threshold int;
  v_window_days int;
  v_streak_min int;
  v_count int;
  v_members uuid[];
  v_kid_ids uuid[];
  v_earned boolean;
  v_existing family_achievement_progress%ROWTYPE;
  v_families_seen int := 0;
  v_newly_earned int := 0;
BEGIN
  FOR v_owner_id IN
    SELECT u.id FROM users u JOIN plans p ON p.id = u.plan_id
     WHERE p.tier IN ('verity_family', 'verity_family_xl')
       AND u.is_active = true
  LOOP
    v_families_seen := v_families_seen + 1;

    -- D34: Family members = owner + any co-adult attached to this
    -- family plan (via subscriptions.family_owner_id + status='active',
    -- same shape used by family_members() in 017_phase9_family.sql)
    -- + all active kid profiles under the owner.
    v_members := ARRAY[v_owner_id];
    SELECT v_members || COALESCE(array_agg(s.user_id), '{}'::uuid[])
      INTO v_members
      FROM subscriptions s
     WHERE s.family_owner_id = v_owner_id
       AND s.status = 'active';

    SELECT COALESCE(array_agg(id), '{}') INTO v_kid_ids
      FROM kid_profiles WHERE parent_user_id = v_owner_id AND is_active = true;

    FOR v_ach IN
      SELECT * FROM family_achievements WHERE is_active = true
    LOOP
      v_crit := v_ach.criteria;
      v_type := v_crit->>'type';
      v_threshold := NULLIF(v_crit->>'threshold', '')::int;
      v_window_days := COALESCE(NULLIF(v_crit->>'window_days', '')::int, 30);
      v_streak_min := COALESCE(NULLIF(v_crit->>'streak_min', '')::int, 1);
      v_count := 0;

      IF v_type = 'family_articles_read' THEN
        SELECT COUNT(*)::int INTO v_count FROM reading_log
         WHERE completed = true
           AND created_at >= now() - make_interval(days => v_window_days)
           AND (user_id = ANY(v_members) OR kid_profile_id = ANY(v_kid_ids));

      ELSIF v_type = 'family_quizzes_completed' THEN
        SELECT COUNT(DISTINCT (COALESCE(user_id::text, kid_profile_id::text) ||
                               ':' || article_id::text ||
                               ':' || attempt_number::text))::int
          INTO v_count
          FROM quiz_attempts
         WHERE created_at >= now() - make_interval(days => v_window_days)
           AND (user_id = ANY(v_members) OR kid_profile_id = ANY(v_kid_ids));

      ELSIF v_type = 'members_with_streak_min' THEN
        SELECT
          (SELECT COUNT(*) FROM users
            WHERE id = ANY(v_members) AND COALESCE(streak_current, 0) >= v_streak_min)
          +
          (SELECT COUNT(*) FROM kid_profiles
            WHERE id = ANY(v_kid_ids) AND COALESCE(streak_current, 0) >= v_streak_min)
          INTO v_count;

      ELSE
        CONTINUE;
      END IF;

      v_earned := v_threshold IS NOT NULL AND v_count >= v_threshold;

      SELECT * INTO v_existing FROM family_achievement_progress
       WHERE family_owner_id = v_owner_id AND family_achievement_id = v_ach.id;

      IF NOT FOUND THEN
        INSERT INTO family_achievement_progress
          (family_owner_id, family_achievement_id, progress, earned_at)
        VALUES
          (v_owner_id, v_ach.id,
           jsonb_build_object('count', v_count, 'threshold', v_threshold),
           CASE WHEN v_earned THEN now() ELSE NULL END);
        IF v_earned THEN v_newly_earned := v_newly_earned + 1; END IF;
      ELSE
        UPDATE family_achievement_progress
           SET progress = jsonb_build_object('count', v_count, 'threshold', v_threshold),
               earned_at = COALESCE(earned_at, CASE WHEN v_earned THEN now() ELSE NULL END),
               updated_at = now()
         WHERE id = v_existing.id;
        IF v_earned AND v_existing.earned_at IS NULL THEN
          v_newly_earned := v_newly_earned + 1;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'families_processed', v_families_seen,
    'newly_earned', v_newly_earned
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_family_achievements() TO service_role;

COMMIT;

-- Verify (manual):
-- SELECT public.recompute_family_achievements();
-- For a family with 2 adults + 1 kid, progress counts should now include
-- reading_log / quiz_attempts rows from the second adult. Re-run should
-- yield identical totals (deterministic).
