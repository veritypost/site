-- ============================================================
-- Phase 9 — Family
-- Decisions: D9 (kids: no discussions, expert sessions instead),
-- D12 (kid profiles undiscoverable), D19 (kid streak freezes 2/wk),
-- D24 (family leaderboard, shared achievements, weekly report),
-- D34 (family plan tiers, max-kids enforcement), D44 (1-week trial).
-- ============================================================

-- ------------------------------------------------------------
-- kid_profiles.streak_freeze_remaining — D19 (2/week).
-- Column was listed in the schema-guide xlsx but didn't land
-- in the SQL file; adding it idempotently here.
-- ------------------------------------------------------------
ALTER TABLE kid_profiles
  ADD COLUMN IF NOT EXISTS streak_freeze_remaining integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_freeze_week_start date;


-- ------------------------------------------------------------
-- start_kid_trial — D44. Any verified account can create one
-- kid profile for 7 days, once ever. Converts seamlessly to a
-- real Family kid on subscription; otherwise freezes (like the
-- adult cancellation freeze — profile visible but locked).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_kid_trial(
  p_user_id uuid,
  p_display_name text,
  p_avatar_color text DEFAULT NULL,
  p_pin_hash text DEFAULT NULL,
  p_date_of_birth date DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user users%ROWTYPE;
  v_kid_id uuid;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
  IF NOT v_user.email_verified THEN RAISE EXCEPTION 'verify email first'; END IF;
  IF v_user.kid_trial_used THEN
    RAISE EXCEPTION 'kid trial already used (one per account, ever — D44)';
  END IF;

  INSERT INTO kid_profiles
    (parent_user_id, display_name, avatar_color, pin_hash, date_of_birth,
     coppa_consent_given, coppa_consent_at, metadata)
  VALUES
    (p_user_id, p_display_name, p_avatar_color, p_pin_hash, p_date_of_birth,
     true, now(), jsonb_build_object('trial', true))
  RETURNING id INTO v_kid_id;

  UPDATE users
     SET kid_trial_used = true,
         kid_trial_started_at = now(),
         kid_trial_ends_at = now() + interval '7 days',
         has_kids_profiles = true,
         updated_at = now()
   WHERE id = p_user_id;

  RETURN v_kid_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_kid_trial(uuid, text, text, text, date) TO service_role;


-- ------------------------------------------------------------
-- freeze_kid_trial — called by the sweeper when the clock runs
-- out and the parent hasn't converted. Kid profile stays visible
-- but is_active=false (mirror of D40 adult freeze).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.freeze_kid_trial(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE kid_profiles
     SET is_active = false,
         metadata = metadata || jsonb_build_object('trial_frozen_at', now()),
         updated_at = now()
   WHERE parent_user_id = p_user_id
     AND (metadata->>'trial')::boolean = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.freeze_kid_trial(uuid) TO service_role;


-- ------------------------------------------------------------
-- sweep_kid_trial_expiries — nightly cron entry point.
-- Freezes every trial whose window has closed.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sweep_kid_trial_expiries()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_count int := 0;
BEGIN
  FOR v_user_id IN
    SELECT id FROM users
     WHERE kid_trial_used = true
       AND kid_trial_ends_at IS NOT NULL
       AND kid_trial_ends_at < now()
       AND EXISTS (
         SELECT 1 FROM kid_profiles
          WHERE parent_user_id = users.id
            AND (metadata->>'trial')::boolean = true
            AND is_active = true
       )
  LOOP
    PERFORM freeze_kid_trial(v_user_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sweep_kid_trial_expiries() TO service_role;


-- ------------------------------------------------------------
-- convert_kid_trial — called when a parent subscribes to Family.
-- Clears the trial metadata flag so the kid becomes a full
-- family member; reactivates if the trial was already frozen.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.convert_kid_trial(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_converted int;
BEGIN
  UPDATE kid_profiles
     SET is_active = true,
         metadata = metadata - 'trial' || jsonb_build_object('trial_converted_at', now()),
         updated_at = now()
   WHERE parent_user_id = p_user_id
     AND (metadata->>'trial')::boolean = true;
  GET DIAGNOSTICS v_converted = ROW_COUNT;

  UPDATE users
     SET kid_trial_ends_at = NULL, updated_at = now()
   WHERE id = p_user_id;

  RETURN v_converted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_kid_trial(uuid) TO service_role;


-- ------------------------------------------------------------
-- use_kid_streak_freeze — D19 kids get 2 per week.
-- Allocation resets weekly via streak_freeze_week_start.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.use_kid_streak_freeze(
  p_parent_id uuid,
  p_kid_profile_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kid kid_profiles%ROWTYPE;
  v_week_start date := date_trunc('week', now())::date;
  v_cap int := _setting_int('streak.freeze_max_kids', 2);
BEGIN
  SELECT * INTO v_kid FROM kid_profiles WHERE id = p_kid_profile_id FOR UPDATE;
  IF NOT FOUND OR v_kid.parent_user_id <> p_parent_id THEN
    RAISE EXCEPTION 'kid profile not found';
  END IF;

  -- Reset allocation when the week flips.
  IF v_kid.streak_freeze_week_start IS NULL OR v_kid.streak_freeze_week_start <> v_week_start THEN
    UPDATE kid_profiles
       SET streak_freeze_remaining = v_cap,
           streak_freeze_week_start = v_week_start,
           updated_at = now()
     WHERE id = p_kid_profile_id;
    v_kid.streak_freeze_remaining := v_cap;
  END IF;

  IF v_kid.streak_freeze_remaining <= 0 THEN
    RAISE EXCEPTION 'no streak freezes left this week';
  END IF;

  UPDATE kid_profiles
     SET streak_freeze_remaining = streak_freeze_remaining - 1,
         streak_last_active_date = CURRENT_DATE,
         updated_at = now()
   WHERE id = p_kid_profile_id;

  RETURN jsonb_build_object(
    'remaining', v_kid.streak_freeze_remaining - 1,
    'cap', v_cap
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.use_kid_streak_freeze(uuid, uuid) TO service_role;


-- ------------------------------------------------------------
-- family_members — helper returning the household for a family
-- plan. The family_owner is the billing user; adults/kids roll
-- up via subscriptions.family_owner_id and kid_profiles.parent_user_id.
-- Returns {kind: 'adult' | 'kid', id, display, score, streak}.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.family_members(p_owner_id uuid)
RETURNS TABLE (
  kind text,
  id uuid,
  display text,
  score int,
  streak int
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'adult'::text, u.id, COALESCE(u.display_name, u.username), u.verity_score, u.streak_current
    FROM users u
   WHERE u.id = p_owner_id
      OR u.id IN (
        SELECT s.user_id FROM subscriptions s
         WHERE s.family_owner_id = p_owner_id AND s.status = 'active'
      )
  UNION ALL
  SELECT 'kid'::text, k.id, k.display_name, k.verity_score, k.streak_current
    FROM kid_profiles k
   WHERE k.parent_user_id = p_owner_id
     AND k.is_active = true;
$$;

GRANT EXECUTE ON FUNCTION public.family_members(uuid) TO authenticated, service_role;


-- ------------------------------------------------------------
-- family_weekly_report — D24 aggregate for the last 7 days.
-- Per-member: articles read, quizzes completed, score delta,
-- current streak. Used by the data endpoint + the eventual
-- email send in Phase 11.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.family_weekly_report(p_owner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz := now() - interval '7 days';
  v_payload jsonb;
BEGIN
  SELECT jsonb_build_object(
    'week_ending', now(),
    'members', COALESCE(jsonb_agg(member_row), '[]'::jsonb)
  )
  INTO v_payload
  FROM (
    SELECT jsonb_build_object(
      'kind', m.kind,
      'id', m.id,
      'display', m.display,
      'score', m.score,
      'streak', m.streak,
      'articles_read', (
        SELECT COUNT(*) FROM reading_log rl
         WHERE rl.created_at >= v_since
           AND ((m.kind = 'adult' AND rl.user_id = m.id)
             OR (m.kind = 'kid'   AND rl.kid_profile_id = m.id))
      ),
      'quizzes_completed', (
        SELECT COUNT(DISTINCT (qa.article_id, qa.attempt_number)) FROM quiz_attempts qa
         WHERE qa.created_at >= v_since
           AND ((m.kind = 'adult' AND qa.user_id = m.id)
             OR (m.kind = 'kid'   AND qa.kid_profile_id = m.id))
      )
    ) AS member_row
    FROM family_members(p_owner_id) m
  ) sub;

  RETURN v_payload;
END;
$$;

GRANT EXECUTE ON FUNCTION public.family_weekly_report(uuid) TO authenticated, service_role;


-- ------------------------------------------------------------
-- is_family_owner(user) -> bool
-- D34: owners see the family dashboard / scheduling.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_family_owner(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u JOIN plans p ON p.id = u.plan_id
     WHERE u.id = p_user_id
       AND p.tier IN ('verity_family', 'verity_family_xl')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_family_owner(uuid) TO authenticated, service_role;
