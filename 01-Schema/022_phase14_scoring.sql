-- ============================================================
-- Phase 14 — Scoring engine (LAUNCH BLOCKER)
--
-- Rebuilds point accrual + streak roll-over after the Phase 2
-- removal of users.verity_tier left lib/scoring.js broken.
--
-- Goals:
--   - Verity Score increments on: quiz_correct answers, quiz_perfect
--     bonuses, first_quiz_of_day bonus, read_article (completion),
--     post_comment (adults only), streak_day, streak milestones (7/30/90/365).
--   - Points flow into users.verity_score AND category_scores.score
--     (via the article's category_id) for article-linked actions.
--   - Kids route to kid_profiles.verity_score and category_scores rows
--     with kid_profile_id set.
--   - Streak daily roll-over works for both adults and kids, respecting
--     freezes per D19 (Verity Pro adults: 2/wk, Family kids: 2/wk, else 0).
--   - All awards are idempotent: the same (subject, action, source)
--     cannot double-score on replay.
--
-- Design notes:
--   1. New table score_events is the award ledger. It is required
--      because score_rules.max_per_day / max_per_article /
--      cooldown_seconds cannot be enforced by counting source rows
--      alone (comments, quiz_attempts, reading_log live in different
--      tables with different shapes). One row per point grant, with a
--      dedupe key per (subject, action, source).
--   2. users.streak_freeze_week_start is added to mirror the Phase 9
--      column on kid_profiles. Freezes refill to 2 at the start of
--      each ISO week for qualifying tiers.
--   3. "Today" is derived from users.timezone (parent's timezone for
--      kids), falling back to UTC.
--   4. These RPCs are not yet wired into submit_quiz_attempt,
--      post_comment, or reading_log writes. The API-route wiring
--      happens in a follow-up pass.
-- ============================================================


-- ------------------------------------------------------------
-- Schema: score_events ledger + users.streak_freeze_week_start
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "score_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid,
  "kid_profile_id" uuid,
  "action" varchar(50) NOT NULL,
  "points" integer NOT NULL,
  "category_id" uuid,
  "article_id" uuid,
  "source_type" varchar(30) NOT NULL,         -- 'quiz_attempt' | 'reading_log' | 'comment' | 'streak' | 'manual'
  "source_id" uuid,                           -- PK of the source row (or NULL for synthetic awards like milestone)
  "occurred_on" date NOT NULL,                -- local-date of the award, used for max_per_day rollups
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "score_events_subject_chk" CHECK (
    (user_id IS NOT NULL AND kid_profile_id IS NULL)
    OR (kid_profile_id IS NOT NULL)
  )
);

-- Dedupe key: the same subject + action + source cannot be scored twice.
-- source_id may be NULL for synthetic events (streak milestones). For those,
-- dedupe is handled in logic via a deterministic metadata key.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_score_events_dedupe_user"
  ON "score_events" ("user_id", "action", "source_type", "source_id")
  WHERE user_id IS NOT NULL AND source_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_score_events_dedupe_kid"
  ON "score_events" ("kid_profile_id", "action", "source_type", "source_id")
  WHERE kid_profile_id IS NOT NULL AND source_id IS NOT NULL;

-- Synthetic-event dedupe (streak milestones etc.) via metadata->>'key'.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_score_events_synthetic_user"
  ON "score_events" ("user_id", "action", ((metadata->>'key')))
  WHERE user_id IS NOT NULL AND source_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_score_events_synthetic_kid"
  ON "score_events" ("kid_profile_id", "action", ((metadata->>'key')))
  WHERE kid_profile_id IS NOT NULL AND source_id IS NULL;

CREATE INDEX IF NOT EXISTS "idx_score_events_user_action_date"
  ON "score_events" ("user_id", "action", "occurred_on")
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_score_events_kid_action_date"
  ON "score_events" ("kid_profile_id", "action", "occurred_on")
  WHERE kid_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_score_events_article"
  ON "score_events" ("article_id") WHERE article_id IS NOT NULL;

ALTER TABLE "score_events" ENABLE ROW LEVEL SECURITY;
-- Service-role-only writes; authenticated users read their own.
DROP POLICY IF EXISTS "score_events_select_own" ON "score_events";
CREATE POLICY "score_events_select_own" ON "score_events" FOR SELECT USING (
  user_id = auth.uid()
  OR kid_profile_id IN (SELECT id FROM kid_profiles WHERE parent_user_id = auth.uid())
);

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "streak_freeze_week_start" date;


-- ------------------------------------------------------------
-- _user_freeze_allowance(user, kid) -> int
-- Returns the per-week freeze allowance for the subject per D19.
-- Adults: Verity Pro / Verity Family / Verity Family XL → 2. Else 0.
-- Kids (on a Family or Family XL plan, owned by a parent): 2. Else 0.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._user_freeze_allowance(
  p_user_id uuid,
  p_kid_profile_id uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_name text;
BEGIN
  IF p_kid_profile_id IS NOT NULL THEN
    SELECT p.name INTO v_plan_name
      FROM kid_profiles k
      JOIN users u ON u.id = k.parent_user_id
      LEFT JOIN plans p ON p.id = u.plan_id
     WHERE k.id = p_kid_profile_id;
    RETURN CASE
      WHEN v_plan_name LIKE 'verity_family%' THEN 2
      ELSE 0
    END;
  END IF;

  SELECT p.name INTO v_plan_name
    FROM users u LEFT JOIN plans p ON p.id = u.plan_id
   WHERE u.id = p_user_id;
  RETURN CASE
    WHEN v_plan_name LIKE 'verity_pro%'
      OR v_plan_name LIKE 'verity_family%'
    THEN 2
    ELSE 0
  END;
END;
$$;
GRANT EXECUTE ON FUNCTION public._user_freeze_allowance(uuid, uuid) TO authenticated, service_role;


-- ------------------------------------------------------------
-- _subject_local_today(user, kid) -> date
-- "Today" in the subject's timezone. Kids inherit their parent's TZ.
-- Falls back to UTC.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._subject_local_today(
  p_user_id uuid,
  p_kid_profile_id uuid DEFAULT NULL
) RETURNS date
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text;
BEGIN
  IF p_kid_profile_id IS NOT NULL THEN
    SELECT u.timezone INTO v_tz
      FROM kid_profiles k JOIN users u ON u.id = k.parent_user_id
     WHERE k.id = p_kid_profile_id;
  ELSE
    SELECT timezone INTO v_tz FROM users WHERE id = p_user_id;
  END IF;
  RETURN (now() AT TIME ZONE COALESCE(NULLIF(v_tz, ''), 'UTC'))::date;
END;
$$;
GRANT EXECUTE ON FUNCTION public._subject_local_today(uuid, uuid) TO authenticated, service_role;


-- ------------------------------------------------------------
-- award_points(action, user, kid, article, category, source_type, source_id, synthetic_key)
-- Central idempotent award.
--   - Loads score_rules by action; no-op if is_active=false or if
--     applies_to_kids=false for a kid subject.
--   - Enforces max_per_day, max_per_article, cooldown_seconds via
--     score_events counts.
--   - Stamps users.verity_score or kid_profiles.verity_score.
--   - If category_id is provided, upserts category_scores.
--   - Writes a score_events row as the audit trail + dedupe key.
-- Returns jsonb: { awarded: bool, points: int, reason: text|null }
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_points(
  p_action text,
  p_user_id uuid DEFAULT NULL,
  p_kid_profile_id uuid DEFAULT NULL,
  p_article_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_source_type text DEFAULT 'manual',
  p_source_id uuid DEFAULT NULL,
  p_synthetic_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule score_rules%ROWTYPE;
  v_today date;
  v_is_kid boolean := p_kid_profile_id IS NOT NULL;
  v_points int;
  v_count_day int;
  v_count_article int;
  v_last_at timestamptz;
  v_metadata jsonb := '{}'::jsonb;
BEGIN
  IF p_user_id IS NULL AND p_kid_profile_id IS NULL THEN
    RAISE EXCEPTION 'award_points requires user_id or kid_profile_id';
  END IF;

  SELECT * INTO v_rule FROM score_rules WHERE action = p_action;
  IF NOT FOUND OR NOT v_rule.is_active THEN
    RETURN jsonb_build_object('awarded', false, 'points', 0, 'reason', 'rule_missing_or_inactive');
  END IF;

  IF v_is_kid AND NOT v_rule.applies_to_kids THEN
    RETURN jsonb_build_object('awarded', false, 'points', 0, 'reason', 'not_applicable_to_kids');
  END IF;

  v_today := _subject_local_today(p_user_id, p_kid_profile_id);
  v_points := v_rule.points;

  -- max_per_article cap
  IF v_rule.max_per_article IS NOT NULL AND p_article_id IS NOT NULL THEN
    IF v_is_kid THEN
      SELECT COUNT(*) INTO v_count_article FROM score_events
       WHERE kid_profile_id = p_kid_profile_id AND action = p_action AND article_id = p_article_id;
    ELSE
      SELECT COUNT(*) INTO v_count_article FROM score_events
       WHERE user_id = p_user_id AND action = p_action AND article_id = p_article_id;
    END IF;
    IF v_count_article >= v_rule.max_per_article THEN
      RETURN jsonb_build_object('awarded', false, 'points', 0, 'reason', 'max_per_article');
    END IF;
  END IF;

  -- max_per_day cap
  IF v_rule.max_per_day IS NOT NULL THEN
    IF v_is_kid THEN
      SELECT COUNT(*) INTO v_count_day FROM score_events
       WHERE kid_profile_id = p_kid_profile_id AND action = p_action AND occurred_on = v_today;
    ELSE
      SELECT COUNT(*) INTO v_count_day FROM score_events
       WHERE user_id = p_user_id AND action = p_action AND occurred_on = v_today;
    END IF;
    IF v_count_day >= v_rule.max_per_day THEN
      RETURN jsonb_build_object('awarded', false, 'points', 0, 'reason', 'max_per_day');
    END IF;
  END IF;

  -- cooldown_seconds: look at most recent same-action event
  IF v_rule.cooldown_seconds IS NOT NULL THEN
    IF v_is_kid THEN
      SELECT MAX(created_at) INTO v_last_at FROM score_events
       WHERE kid_profile_id = p_kid_profile_id AND action = p_action;
    ELSE
      SELECT MAX(created_at) INTO v_last_at FROM score_events
       WHERE user_id = p_user_id AND action = p_action;
    END IF;
    IF v_last_at IS NOT NULL AND v_last_at > now() - make_interval(secs => v_rule.cooldown_seconds) THEN
      RETURN jsonb_build_object('awarded', false, 'points', 0, 'reason', 'cooldown');
    END IF;
  END IF;

  IF p_synthetic_key IS NOT NULL THEN
    v_metadata := jsonb_build_object('key', p_synthetic_key);
  END IF;

  -- Insert ledger row. ON CONFLICT covers both the concrete-source and
  -- synthetic-key partial unique indexes — a replay returns awarded=false.
  BEGIN
    INSERT INTO score_events
      (user_id, kid_profile_id, action, points, category_id, article_id,
       source_type, source_id, occurred_on, metadata)
    VALUES
      (CASE WHEN v_is_kid THEN NULL ELSE p_user_id END,
       p_kid_profile_id, p_action, v_points, p_category_id, p_article_id,
       p_source_type, p_source_id, v_today, v_metadata);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('awarded', false, 'points', 0, 'reason', 'already_awarded');
  END;

  -- Apply points to total score + optional category score.
  IF v_is_kid THEN
    UPDATE kid_profiles SET verity_score = verity_score + v_points WHERE id = p_kid_profile_id;
  ELSE
    UPDATE users SET verity_score = verity_score + v_points WHERE id = p_user_id;
  END IF;

  IF p_category_id IS NOT NULL THEN
    IF v_is_kid THEN
      INSERT INTO category_scores (user_id, kid_profile_id, category_id, score, articles_read, quizzes_correct, last_activity_at)
      VALUES (
        (SELECT parent_user_id FROM kid_profiles WHERE id = p_kid_profile_id),
        p_kid_profile_id, p_category_id, v_points, 0, 0, now()
      )
      ON CONFLICT (kid_profile_id, category_id) WHERE kid_profile_id IS NOT NULL
      DO UPDATE SET score = category_scores.score + EXCLUDED.score,
                    last_activity_at = now(),
                    updated_at = now();
    ELSE
      INSERT INTO category_scores (user_id, kid_profile_id, category_id, score, articles_read, quizzes_correct, last_activity_at)
      VALUES (p_user_id, NULL, p_category_id, v_points, 0, 0, now())
      ON CONFLICT (user_id, category_id) WHERE kid_profile_id IS NULL
      DO UPDATE SET score = category_scores.score + EXCLUDED.score,
                    last_activity_at = now(),
                    updated_at = now();
    END IF;
  END IF;

  RETURN jsonb_build_object('awarded', true, 'points', v_points, 'reason', NULL);
END;
$$;
GRANT EXECUTE ON FUNCTION public.award_points(text, uuid, uuid, uuid, uuid, text, uuid, text) TO service_role;


-- ------------------------------------------------------------
-- advance_streak(user, kid) -> jsonb
-- Call on ANY scoring activity (quiz submit, reading complete,
-- comment post). Idempotent per local-day: the first call of the
-- day advances, subsequent calls are no-ops.
--
-- Roll-over rules:
--   last_active = today            -> no-op
--   last_active = yesterday        -> streak_current += 1
--   gap of N missed days           -> if freezes_available >= N:
--                                       consume N freezes, advance streak
--                                     else: reset streak_current to 1
--   last_active IS NULL            -> streak_current := 1
--
-- Weekly freeze refill (per D19): on the first activity of a new ISO
-- week, streak_freeze_remaining is restored to the per-tier allowance
-- and streak_freeze_week_start is stamped.
--
-- Milestone bonuses (7/30/90/365) are awarded exactly when
-- streak_current crosses those thresholds.
-- Returns: { advanced: bool, streak: int, best: int, milestone: text|null, freezes_used: int }
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.advance_streak(
  p_user_id uuid DEFAULT NULL,
  p_kid_profile_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date;
  v_last date;
  v_streak int;
  v_best int;
  v_freeze_rem int;
  v_freeze_week date;
  v_is_kid boolean := p_kid_profile_id IS NOT NULL;
  v_iso_week_start date;
  v_allowance int;
  v_gap int;
  v_freezes_used int := 0;
  v_milestone text := NULL;
  v_milestone_action text;
BEGIN
  IF p_user_id IS NULL AND p_kid_profile_id IS NULL THEN
    RAISE EXCEPTION 'advance_streak requires user_id or kid_profile_id';
  END IF;

  v_today := _subject_local_today(p_user_id, p_kid_profile_id);
  -- ISO week start (Monday)
  v_iso_week_start := v_today - ((EXTRACT(ISODOW FROM v_today)::int - 1));

  IF v_is_kid THEN
    SELECT streak_current, streak_best, streak_last_active_date,
           streak_freeze_remaining, streak_freeze_week_start
      INTO v_streak, v_best, v_last, v_freeze_rem, v_freeze_week
      FROM kid_profiles WHERE id = p_kid_profile_id FOR UPDATE;
  ELSE
    SELECT streak_current, streak_best, streak_last_active_date,
           streak_freeze_remaining, streak_freeze_week_start
      INTO v_streak, v_best, v_last, v_freeze_rem, v_freeze_week
      FROM users WHERE id = p_user_id FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'subject not found';
  END IF;

  -- Weekly freeze refill if we've crossed into a new ISO week.
  IF v_freeze_week IS NULL OR v_freeze_week < v_iso_week_start THEN
    v_allowance := _user_freeze_allowance(p_user_id, p_kid_profile_id);
    v_freeze_rem := v_allowance;
    v_freeze_week := v_iso_week_start;
  END IF;

  -- Same-day: no-op (still persist any freeze refill done above).
  IF v_last = v_today THEN
    IF v_is_kid THEN
      UPDATE kid_profiles
         SET streak_freeze_remaining = v_freeze_rem,
             streak_freeze_week_start = v_freeze_week
       WHERE id = p_kid_profile_id;
    ELSE
      UPDATE users
         SET streak_freeze_remaining = v_freeze_rem,
             streak_freeze_week_start = v_freeze_week
       WHERE id = p_user_id;
    END IF;
    RETURN jsonb_build_object('advanced', false, 'streak', v_streak,
      'best', v_best, 'milestone', NULL, 'freezes_used', 0);
  END IF;

  IF v_last IS NULL THEN
    v_streak := 1;
  ELSE
    v_gap := (v_today - v_last) - 1; -- 0 if yesterday, N if N days missed
    IF v_gap = 0 THEN
      v_streak := v_streak + 1;
    ELSIF v_gap > 0 AND v_freeze_rem >= v_gap THEN
      v_freeze_rem := v_freeze_rem - v_gap;
      v_freezes_used := v_gap;
      v_streak := v_streak + 1;
      -- Write freeze marker rows for each covered day.
      FOR i IN 1..v_gap LOOP
        BEGIN
          INSERT INTO streaks (user_id, kid_profile_id, date, activity_type, is_freeze)
          VALUES (
            CASE WHEN v_is_kid THEN NULL ELSE p_user_id END,
            p_kid_profile_id,
            v_last + i, 'freeze', true
          );
        EXCEPTION WHEN unique_violation THEN
          NULL; -- already a row for that day, leave it
        END;
      END LOOP;
    ELSE
      v_streak := 1;
    END IF;
  END IF;

  IF v_streak > v_best THEN
    v_best := v_streak;
  END IF;

  -- Persist counters
  IF v_is_kid THEN
    UPDATE kid_profiles
       SET streak_current = v_streak,
           streak_best = v_best,
           streak_last_active_date = v_today,
           streak_freeze_remaining = v_freeze_rem,
           streak_freeze_week_start = v_freeze_week
     WHERE id = p_kid_profile_id;
  ELSE
    UPDATE users
       SET streak_current = v_streak,
           streak_best = v_best,
           streak_last_active_date = v_today,
           streak_freeze_remaining = v_freeze_rem,
           streak_freeze_week_start = v_freeze_week
     WHERE id = p_user_id;
  END IF;

  -- Today's activity row (non-freeze).
  BEGIN
    INSERT INTO streaks (user_id, kid_profile_id, date, activity_type, is_freeze)
    VALUES (
      CASE WHEN v_is_kid THEN NULL ELSE p_user_id END,
      p_kid_profile_id, v_today, 'read', false
    );
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  -- Daily streak point (respects max_per_day=5/day in score_rules seed = 5pts cap).
  PERFORM award_points(
    'streak_day', p_user_id, p_kid_profile_id,
    NULL, NULL, 'streak', NULL,
    'streak_day:' || v_today::text
  );

  -- Milestone bonus (strict equality). Seeded rules: streak_7 / 30 / 90 / 365.
  IF v_streak IN (7, 30, 90, 365) THEN
    v_milestone_action := 'streak_' || v_streak::text;
    v_milestone := v_milestone_action;
    PERFORM award_points(
      v_milestone_action, p_user_id, p_kid_profile_id,
      NULL, NULL, 'streak', NULL,
      v_milestone_action || ':' || v_today::text
    );
  END IF;

  RETURN jsonb_build_object(
    'advanced', true,
    'streak', v_streak,
    'best', v_best,
    'milestone', v_milestone,
    'freezes_used', v_freezes_used
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.advance_streak(uuid, uuid) TO service_role;


-- ------------------------------------------------------------
-- score_on_quiz_submit(user, kid, article, attempt_number) -> jsonb
-- Called AFTER submit_quiz_attempt has written the 5 quiz_attempts
-- rows. Reads those rows to compute correct-count and award points.
-- Awards: quiz_correct × correct_count, quiz_perfect if 5/5,
-- first_quiz_of_day if applicable. Then advance_streak.
-- Stamps quiz_attempts.points_earned on the scored rows.
-- Idempotent via score_events dedupe on the attempt row PKs.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.score_on_quiz_submit(
  p_user_id uuid,
  p_kid_profile_id uuid,
  p_article_id uuid,
  p_attempt_number int
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category_id uuid;
  v_correct int := 0;
  v_total int := 0;
  v_is_first_today boolean := false;
  v_today date;
  v_points_total int := 0;
  v_points jsonb;
  v_streak jsonb;
  r record;
BEGIN
  SELECT category_id INTO v_category_id FROM articles WHERE id = p_article_id;
  v_today := _subject_local_today(p_user_id, p_kid_profile_id);

  -- Walk the 5 attempt rows for this attempt_number.
  FOR r IN
    SELECT id, is_correct FROM quiz_attempts
     WHERE article_id = p_article_id
       AND attempt_number = p_attempt_number
       AND (
         (p_kid_profile_id IS NOT NULL AND kid_profile_id = p_kid_profile_id)
         OR (p_kid_profile_id IS NULL AND user_id = p_user_id AND kid_profile_id IS NULL)
       )
  LOOP
    v_total := v_total + 1;
    IF r.is_correct THEN
      v_correct := v_correct + 1;
      v_points := award_points(
        'quiz_correct', p_user_id, p_kid_profile_id,
        p_article_id, v_category_id,
        'quiz_attempt', r.id, NULL
      );
      IF (v_points->>'awarded')::boolean THEN
        v_points_total := v_points_total + (v_points->>'points')::int;
        UPDATE quiz_attempts SET points_earned = (v_points->>'points')::int WHERE id = r.id;
      END IF;
    END IF;
  END LOOP;

  IF v_total = 0 THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'no_attempt_rows');
  END IF;

  -- Perfect-score bonus.
  IF v_correct = v_total THEN
    v_points := award_points(
      'quiz_perfect', p_user_id, p_kid_profile_id,
      p_article_id, v_category_id,
      'quiz_attempt', NULL,
      'quiz_perfect:' || p_article_id::text || ':' || p_attempt_number::text
    );
    IF (v_points->>'awarded')::boolean THEN
      v_points_total := v_points_total + (v_points->>'points')::int;
    END IF;
  END IF;

  -- First quiz of the day bonus (synthetic, dedup key = date).
  v_points := award_points(
    'first_quiz_of_day', p_user_id, p_kid_profile_id,
    NULL, NULL, 'quiz_attempt', NULL,
    'first_quiz_of_day:' || v_today::text
  );
  IF (v_points->>'awarded')::boolean THEN
    v_points_total := v_points_total + (v_points->>'points')::int;
    v_is_first_today := true;
  END IF;

  -- category_scores.quizzes_correct is a cumulative counter. Bump it
  -- once per successful pass (3/5+) for the article's category.
  IF v_category_id IS NOT NULL AND v_correct >= 3 THEN
    IF p_kid_profile_id IS NOT NULL THEN
      UPDATE category_scores
         SET quizzes_correct = quizzes_correct + 1, last_activity_at = now()
       WHERE kid_profile_id = p_kid_profile_id AND category_id = v_category_id;
    ELSE
      UPDATE category_scores
         SET quizzes_correct = quizzes_correct + 1, last_activity_at = now()
       WHERE user_id = p_user_id AND category_id = v_category_id AND kid_profile_id IS NULL;
    END IF;
  END IF;

  -- quizzes_completed_count — kids only. submit_quiz_attempt already
  -- bumps users.quizzes_completed_count; don't double-count.
  IF p_kid_profile_id IS NOT NULL THEN
    UPDATE kid_profiles SET quizzes_completed_count = quizzes_completed_count + 1
     WHERE id = p_kid_profile_id;
  END IF;

  v_streak := advance_streak(p_user_id, p_kid_profile_id);

  RETURN jsonb_build_object(
    'awarded', true,
    'correct', v_correct,
    'total', v_total,
    'points_total', v_points_total,
    'first_quiz_of_day', v_is_first_today,
    'streak', v_streak
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.score_on_quiz_submit(uuid, uuid, uuid, int) TO service_role;


-- ------------------------------------------------------------
-- score_on_reading_complete(user, kid, article, reading_log_id) -> jsonb
-- Called when reading_log.completed flips to true. Awards read_article
-- once per article (max_per_article=1 in score_rules) and advances
-- the streak. Also bumps articles_read_count + category_scores.articles_read.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.score_on_reading_complete(
  p_user_id uuid,
  p_kid_profile_id uuid,
  p_article_id uuid,
  p_reading_log_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category_id uuid;
  v_points jsonb;
  v_streak jsonb;
  v_awarded boolean := false;
  v_points_val int := 0;
BEGIN
  SELECT category_id INTO v_category_id FROM articles WHERE id = p_article_id;

  v_points := award_points(
    'read_article', p_user_id, p_kid_profile_id,
    p_article_id, v_category_id,
    'reading_log', p_reading_log_id, NULL
  );
  v_awarded := (v_points->>'awarded')::boolean;
  v_points_val := (v_points->>'points')::int;

  IF v_awarded THEN
    UPDATE reading_log SET points_earned = v_points_val WHERE id = p_reading_log_id;

    IF p_kid_profile_id IS NOT NULL THEN
      UPDATE kid_profiles SET articles_read_count = articles_read_count + 1
       WHERE id = p_kid_profile_id;
    ELSE
      UPDATE users SET articles_read_count = articles_read_count + 1
       WHERE id = p_user_id;
    END IF;

    IF v_category_id IS NOT NULL THEN
      IF p_kid_profile_id IS NOT NULL THEN
        UPDATE category_scores SET articles_read = articles_read + 1, last_activity_at = now()
         WHERE kid_profile_id = p_kid_profile_id AND category_id = v_category_id;
      ELSE
        UPDATE category_scores SET articles_read = articles_read + 1, last_activity_at = now()
         WHERE user_id = p_user_id AND category_id = v_category_id AND kid_profile_id IS NULL;
      END IF;
    END IF;
  END IF;

  v_streak := advance_streak(p_user_id, p_kid_profile_id);

  RETURN jsonb_build_object(
    'awarded', v_awarded,
    'points', v_points_val,
    'reason', v_points->>'reason',
    'streak', v_streak
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.score_on_reading_complete(uuid, uuid, uuid, uuid) TO service_role;


-- ------------------------------------------------------------
-- score_on_comment_post(user, comment_id) -> jsonb
-- Called after post_comment succeeds. Adults only (post_comment has
-- applies_to_kids=false; kids can't comment anyway per D9). Enforces
-- the seeded cooldown=60s and max_per_day=15 / max_per_article=1.
-- Advances streak.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.score_on_comment_post(
  p_user_id uuid,
  p_comment_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_article_id uuid;
  v_category_id uuid;
  v_points jsonb;
  v_streak jsonb;
BEGIN
  SELECT c.article_id, a.category_id
    INTO v_article_id, v_category_id
    FROM comments c JOIN articles a ON a.id = c.article_id
   WHERE c.id = p_comment_id;

  v_points := award_points(
    'post_comment', p_user_id, NULL,
    v_article_id, v_category_id,
    'comment', p_comment_id, NULL
  );

  v_streak := advance_streak(p_user_id, NULL);

  RETURN jsonb_build_object(
    'awarded', (v_points->>'awarded')::boolean,
    'points', (v_points->>'points')::int,
    'reason', v_points->>'reason',
    'streak', v_streak
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.score_on_comment_post(uuid, uuid) TO service_role;


-- ------------------------------------------------------------
-- recompute_verity_score(user, kid) -> jsonb
-- Safety-hatch backfill. Sets users.verity_score (or
-- kid_profiles.verity_score) to SUM(category_scores.score) + any
-- non-category-attributed score_events points. Useful if drift is
-- ever observed; not called by the hot path.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_verity_score(
  p_user_id uuid DEFAULT NULL,
  p_kid_profile_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
BEGIN
  IF p_kid_profile_id IS NOT NULL THEN
    SELECT COALESCE(SUM(points), 0) INTO v_total FROM score_events
     WHERE kid_profile_id = p_kid_profile_id;
    UPDATE kid_profiles SET verity_score = v_total WHERE id = p_kid_profile_id;
  ELSE
    SELECT COALESCE(SUM(points), 0) INTO v_total FROM score_events
     WHERE user_id = p_user_id;
    UPDATE users SET verity_score = v_total WHERE id = p_user_id;
  END IF;
  RETURN jsonb_build_object('verity_score', v_total);
END;
$$;
GRANT EXECUTE ON FUNCTION public.recompute_verity_score(uuid, uuid) TO service_role;
