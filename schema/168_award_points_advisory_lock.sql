-- 168_award_points_advisory_lock.sql
-- Ext-AAA.6 — award_points race risk on cap enforcement.
--
-- The function reads SELECT COUNT(*) FROM score_events for max_per_day,
-- max_per_article, and cooldown_seconds checks BEFORE INSERT. Two
-- concurrent calls for the same (subject, action) can both observe the
-- pre-write count and both proceed past the cap.
--
-- Mitigation: pg_advisory_xact_lock keyed on a hash of (subject_id, action)
-- at the top of award_points. Lock is held for the duration of the
-- transaction, serialising same-subject/same-action calls. Different
-- subjects don't contend with each other (separate hash keys), so this is
-- low-overhead under realistic load.
--
-- The unique-violation guard for synthetic_key remains the dedup line of
-- defence; this advisory lock closes the cap-counting race that the
-- partial-unique index doesn't cover.

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
  v_lock_subject uuid;
BEGIN
  IF p_user_id IS NULL AND p_kid_profile_id IS NULL THEN
    RAISE EXCEPTION 'award_points requires user_id or kid_profile_id';
  END IF;

  -- Ext-AAA6 — serialise same-subject same-action calls. The lock is
  -- transaction-scoped and released on COMMIT/ROLLBACK; no manual
  -- unlock needed. hashtext + hashtextextended give us two int4 keys
  -- for pg_advisory_xact_lock(int4, int4).
  v_lock_subject := COALESCE(p_user_id, p_kid_profile_id);
  PERFORM pg_advisory_xact_lock(
    hashtext(v_lock_subject::text),
    hashtext(p_action)
  );

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
