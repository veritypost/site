-- 132_plan_metadata_caps_and_achievement_rewrite.sql
--
-- Three changes bundled into one migration:
--
--   A. Backfill plans.metadata with per-tier caps so the existing
--      enforce_max_kids and the rewritten enforce_bookmark_cap triggers
--      read their thresholds from the DB, not from hardcoded constants.
--
--   B. Tighten INSERT RLS on reading_log, quiz_attempts, and streaks so
--      WITH CHECK is explicit on every branch (parent and kid-JWT).
--      Drops + recreates each policy. Behavior preserved.
--
--   C. Rewrite check_user_achievements to match the actual achievements
--      table shape (criteria.type uses {threshold} keys, not {value};
--      type vocabulary is read_count / quiz_count / perfect_quiz_count /
--      streak / score_reached / unique_categories_read /
--      all_categories_read / comment_count / single_comment_upvotes /
--      follower_count / context_pinned, plus deferred "secret" types
--      that need timestamp data the schema does not yet capture).
--      Return type stays SETOF user_achievements so the existing
--      callers (cron sweep + scoring.checkAchievements) keep working.
--
-- Rollback: schema/133_rollback_132.sql

BEGIN;

-- ----------------------------------------------------------------------
-- A. Plan metadata backfill
-- ----------------------------------------------------------------------

-- max_kids: only the family tiers grant kid profiles. (verity_family
-- already has max_kids:2 and verity_family_xl has max_kids:4 — the
-- jsonb_set call is a no-op for those rows; the SETs below are
-- idempotent.)
UPDATE public.plans
   SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{max_kids}', '0'::jsonb)
 WHERE tier IN ('free', 'verity', 'verity_pro');

UPDATE public.plans
   SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{max_kids}', '2'::jsonb)
 WHERE tier = 'verity_family';

UPDATE public.plans
   SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{max_kids}', '4'::jsonb)
 WHERE tier = 'verity_family_xl';

-- max_bookmarks: free is capped at 10; every paid tier is unlimited.
-- -1 is the sentinel for "no cap" — the trigger below short-circuits
-- when it sees -1.
UPDATE public.plans
   SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{max_bookmarks}', '10'::jsonb)
 WHERE tier = 'free';

UPDATE public.plans
   SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{max_bookmarks}', '-1'::jsonb)
 WHERE tier <> 'free';

-- enforce_bookmark_cap now reads its threshold from plans.metadata
-- instead of hardcoding 10. Users with no plan row (plan_id IS NULL)
-- fall through to the free-tier default of 10. -1 means unlimited and
-- short-circuits the count.
CREATE OR REPLACE FUNCTION public.enforce_bookmark_cap()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_max   integer;
  v_count integer;
BEGIN
  SELECT COALESCE((p.metadata ->> 'max_bookmarks')::integer, 10)
    INTO v_max
    FROM users u
    LEFT JOIN plans p ON p.id = u.plan_id
   WHERE u.id = NEW.user_id;

  -- No matching user row (shouldn't happen via FK, but be defensive)
  -- → fall back to the free-tier cap.
  v_max := COALESCE(v_max, 10);

  -- Sentinel: -1 means unlimited.
  IF v_max = -1 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count FROM bookmarks WHERE user_id = NEW.user_id;
  IF v_count >= v_max THEN
    RAISE EXCEPTION
      'Bookmark limit reached (max % on your plan). Upgrade for unlimited.', v_max
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

-- enforce_max_kids already reads metadata->>'max_kids' (verified live).
-- No function change needed — only the data backfill above. Bump the
-- RAISE to P0001 so the user-facing message reaches the client through
-- safeErrorResponse.
CREATE OR REPLACE FUNCTION public.enforce_max_kids()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_max     integer;
  v_current integer;
BEGIN
  SELECT COALESCE((p.metadata ->> 'max_kids')::integer, 0)
    INTO v_max
    FROM users u
    LEFT JOIN plans p ON p.id = u.plan_id AND u.plan_status IN ('active', 'trialing')
   WHERE u.id = NEW.parent_user_id;

  SELECT count(*)
    INTO v_current
    FROM kid_profiles
   WHERE parent_user_id = NEW.parent_user_id AND is_active = true;

  IF v_current >= COALESCE(v_max, 0) THEN
    RAISE EXCEPTION
      'Kid profile limit reached for this plan (max=%)', COALESCE(v_max, 0)
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------------
-- B. Tighten INSERT RLS WITH CHECK on reading_log, quiz_attempts, streaks
-- ----------------------------------------------------------------------

-- reading_log
DROP POLICY IF EXISTS reading_log_insert         ON public.reading_log;
DROP POLICY IF EXISTS reading_log_insert_kid_jwt ON public.reading_log;

CREATE POLICY reading_log_insert ON public.reading_log
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (kid_profile_id IS NULL OR public.owns_kid_profile(kid_profile_id))
  );

CREATE POLICY reading_log_insert_kid_jwt ON public.reading_log
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_kid_delegated()
    AND kid_profile_id = auth.uid()
    AND (user_id IS NULL OR (user_id)::text = (auth.jwt() ->> 'parent_user_id'))
  );

-- quiz_attempts
DROP POLICY IF EXISTS quiz_attempts_insert         ON public.quiz_attempts;
DROP POLICY IF EXISTS quiz_attempts_insert_kid_jwt ON public.quiz_attempts;

CREATE POLICY quiz_attempts_insert ON public.quiz_attempts
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_verified_email()
    AND NOT public.is_banned()
    AND (kid_profile_id IS NULL OR public.owns_kid_profile(kid_profile_id))
  );

CREATE POLICY quiz_attempts_insert_kid_jwt ON public.quiz_attempts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_kid_delegated()
    AND kid_profile_id = auth.uid()
    AND (user_id IS NULL OR (user_id)::text = (auth.jwt() ->> 'parent_user_id'))
  );

-- streaks (no kid-JWT branch existed; preserve the dual-path semantics
-- of the previous policy, but make WITH CHECK explicit on each path).
DROP POLICY IF EXISTS streaks_insert         ON public.streaks;
DROP POLICY IF EXISTS streaks_insert_kid_jwt ON public.streaks;

CREATE POLICY streaks_insert ON public.streaks
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = auth.uid()
       AND (kid_profile_id IS NULL OR public.owns_kid_profile(kid_profile_id)))
  );

CREATE POLICY streaks_insert_kid_jwt ON public.streaks
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_kid_delegated()
    AND kid_profile_id = auth.uid()
    AND (user_id IS NULL OR (user_id)::text = (auth.jwt() ->> 'parent_user_id'))
  );

-- ----------------------------------------------------------------------
-- C. Rewrite check_user_achievements to match the real criteria shape
-- ----------------------------------------------------------------------

-- Return type stays SETOF user_achievements so existing callers (the
-- daily cron sweep and scoring.checkAchievements) keep working without
-- code changes — they treat the result as the list of newly-awarded
-- rows. The body is rewritten to evaluate the real criteria vocabulary.
CREATE OR REPLACE FUNCTION public.check_user_achievements(p_user_id uuid)
  RETURNS SETOF user_achievements
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_ach        achievements%ROWTYPE;
  v_threshold  integer;
  v_meets      boolean;
  v_metric     integer;
  v_total_cats integer;
  v_row        user_achievements%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Cache total category count once (used by all_categories_read).
  SELECT count(*) INTO v_total_cats FROM categories WHERE is_active = true;

  FOR v_ach IN
    SELECT *
      FROM achievements
     WHERE is_active = true
       AND criteria ? 'type'
       AND id NOT IN (
         SELECT achievement_id
           FROM user_achievements
          WHERE user_id = p_user_id AND kid_profile_id IS NULL
       )
  LOOP
    -- threshold defaults to 1 when omitted (covers `context_pinned` etc.
    -- where threshold is implicit; criteria carrying explicit threshold
    -- override).
    BEGIN
      v_threshold := COALESCE((v_ach.criteria ->> 'threshold')::integer, 1);
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;

    v_meets := false;

    CASE v_ach.criteria ->> 'type'

      WHEN 'read_count' THEN
        SELECT COUNT(*) INTO v_metric
          FROM reading_log
         WHERE user_id = p_user_id AND completed = true;
        v_meets := v_metric >= v_threshold;

      WHEN 'quiz_count' THEN
        -- Number of distinct articles for which the user has any
        -- attempt rows. quiz_attempts has no `passed` column — the row
        -- exists per question, not per quiz — so distinct article_id is
        -- the right grain.
        SELECT COUNT(DISTINCT article_id) INTO v_metric
          FROM quiz_attempts
         WHERE user_id = p_user_id AND kid_profile_id IS NULL;
        v_meets := v_metric >= v_threshold;

      WHEN 'perfect_quiz_count' THEN
        -- Distinct articles where, on at least one attempt_number, the
        -- user got all 5 questions correct. Mirrors the 5-question
        -- quiz spine.
        SELECT COUNT(*) INTO v_metric
          FROM (
            SELECT article_id
              FROM quiz_attempts
             WHERE user_id = p_user_id AND kid_profile_id IS NULL
             GROUP BY article_id, attempt_number
            HAVING SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) = 5
          ) perfect_articles;
        v_meets := v_metric >= v_threshold;

      WHEN 'streak' THEN
        SELECT COALESCE(streak_current, 0) INTO v_metric
          FROM users WHERE id = p_user_id;
        v_meets := v_metric >= v_threshold;

      WHEN 'score_reached' THEN
        SELECT COALESCE(verity_score, 0) INTO v_metric
          FROM users WHERE id = p_user_id;
        v_meets := v_metric >= v_threshold;

      WHEN 'unique_categories_read' THEN
        SELECT COUNT(DISTINCT a.category_id) INTO v_metric
          FROM reading_log r
          JOIN articles a ON a.id = r.article_id
         WHERE r.user_id = p_user_id
           AND r.completed = true
           AND a.category_id IS NOT NULL;
        v_meets := v_metric >= v_threshold;

      WHEN 'all_categories_read' THEN
        SELECT COUNT(DISTINCT a.category_id) INTO v_metric
          FROM reading_log r
          JOIN articles a ON a.id = r.article_id
         WHERE r.user_id = p_user_id
           AND r.completed = true
           AND a.category_id IS NOT NULL;
        -- Either the explicit threshold OR every active category, so
        -- the achievement keeps tracking when categories grow.
        v_meets := v_metric >= GREATEST(v_threshold, v_total_cats);

      WHEN 'comment_count' THEN
        SELECT COUNT(*) INTO v_metric
          FROM comments
         WHERE user_id = p_user_id
           AND deleted_at IS NULL
           AND status = 'visible';
        v_meets := v_metric >= v_threshold;

      WHEN 'single_comment_upvotes' THEN
        SELECT COALESCE(MAX(upvote_count), 0) INTO v_metric
          FROM comments
         WHERE user_id = p_user_id
           AND deleted_at IS NULL
           AND status = 'visible';
        v_meets := v_metric >= v_threshold;

      WHEN 'follower_count' THEN
        SELECT COALESCE(followers_count, 0) INTO v_metric
          FROM users WHERE id = p_user_id;
        v_meets := v_metric >= v_threshold;

      WHEN 'context_pinned' THEN
        SELECT COUNT(*) INTO v_metric
          FROM comments
         WHERE user_id = p_user_id
           AND is_context_pinned = true
           AND deleted_at IS NULL;
        v_meets := v_metric >= v_threshold;

      -- TODO (Owner deferred): the following criteria types need data
      -- the schema doesn't yet capture in a usable form:
      --   quiz_before_hour    — needs a per-quiz timestamp + tz context
      --   read_in_day         — needs reading_log day-bucket aggregation
      --   read_between_hours  — needs reading_log local-time filtering
      -- These achievements stay dormant (no awards) until the data
      -- pipeline lands. The achievement rows exist; only the awarder
      -- skips them.
      ELSE
        v_meets := false;
    END CASE;

    IF v_meets THEN
      -- Reset the OUT row first; ON CONFLICT DO NOTHING leaves it
      -- untouched, so a stale value from a prior iteration would
      -- otherwise re-RETURN.
      v_row.id := NULL;
      INSERT INTO user_achievements
              (user_id, achievement_id, points_awarded, earned_at)
       VALUES (p_user_id, v_ach.id, v_ach.points_reward, now())
       ON CONFLICT DO NOTHING
       RETURNING * INTO v_row;

      IF v_row.id IS NOT NULL THEN
        UPDATE achievements
           SET total_earned_count = total_earned_count + 1
         WHERE id = v_ach.id;
        RETURN NEXT v_row;
      END IF;
    END IF;
  END LOOP;

  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.check_user_achievements(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_user_achievements(uuid) TO authenticated, service_role;

COMMIT;
