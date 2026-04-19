-- ============================================================
-- Phase 17 — Functional gap fixes (SQL batch)
--
-- Covers items 1, 2, 3, 5, 6 from the launch-readiness Phase 17:
--   1. Family achievement cron rollup (recompute_family_achievements)
--   2. Contextual ad targeting filter inside serve_ad
--   3. Ad revenue math in log_ad_impression + log_ad_click
--   5. Per-user recap UNIQUE(recap_quiz_id, user_id), replay overwrites
--   6. Frequency-cap halving edge case: switch to every-other-view gate
--      for ad units with any cap <= 2 on reduced-tier viewers
--
-- Items 4 (Reply-button UI gate) and 8 (profile shareable card) are
-- JS-side and handled in a follow-up pass.
-- ============================================================


-- ============================================================
-- Item 5: Per-user recap uniqueness
-- ============================================================
-- Enforce UNIQUE(recap_quiz_id, user_id) and make submit_recap_attempt
-- a replay-safe upsert. Last attempt wins — scoring/articles_missed
-- reflect the most recent submission. The UI "Completed" badge becomes
-- a hint, not a hard lock.
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_recap_attempts_quiz_user
  ON weekly_recap_attempts (recap_quiz_id, user_id);

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

  RETURN jsonb_build_object(
    'attempt_id', v_attempt_id,
    'score', v_score,
    'total', v_total,
    'articles_missed', v_missed,
    'results', v_results
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_recap_attempt(uuid, uuid, jsonb) TO service_role;


-- ============================================================
-- Items 2 + 6: serve_ad rewrite
-- ============================================================
-- #2 targeting_categories: ads with a non-empty targeting_categories
--    array only match when the article's category_id is in the list.
--    Empty/null targeting = no restriction. If p_article_id is NULL
--    (no article context), category-targeted ads are excluded so the
--    advertiser gets the context they paid for.
-- #6 every-other-view gate for small caps: when a unit has any cap
--    (per-user or per-session) <= 2, reduced-tier viewers skip the
--    cap-halving path (which would round 1 → 0) and instead pass
--    through a coin-flip. Effectively halves show rate without
--    locking them out.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.serve_ad(
  p_placement_name text,
  p_user_id uuid DEFAULT NULL,
  p_article_id uuid DEFAULT NULL,
  p_session_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_placement ad_placements%ROWTYPE;
  v_tier text := _user_tier_or_anon(p_user_id);
  v_reduced boolean;
  v_article_category_id uuid;
  v_pick ad_units%ROWTYPE;
BEGIN
  SELECT * INTO v_placement FROM ad_placements
   WHERE name = p_placement_name AND is_active = true;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_tier = ANY(COALESCE(v_placement.hidden_for_tiers, '{}')) THEN
    RETURN NULL;
  END IF;
  v_reduced := v_tier = ANY(COALESCE(v_placement.reduced_for_tiers, '{}'));

  IF p_article_id IS NOT NULL THEN
    SELECT category_id INTO v_article_category_id FROM articles WHERE id = p_article_id;
  END IF;

  SELECT au.* INTO v_pick
    FROM ad_units au
   WHERE au.placement_id = v_placement.id
     AND au.is_active = true
     AND au.approval_status = 'approved'
     AND (au.start_date IS NULL OR au.start_date <= now())
     AND (au.end_date   IS NULL OR au.end_date   >= now())
     -- Contextual category targeting (item 2).
     AND (
       au.targeting_categories IS NULL
       OR jsonb_typeof(au.targeting_categories) <> 'array'
       OR jsonb_array_length(au.targeting_categories) = 0
       OR (
         v_article_category_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(au.targeting_categories) t
            WHERE t = v_article_category_id::text
         )
       )
     )
     -- Per-user lifetime cap; halve for reduced tier only when cap > 2
     -- AND no other cap on the unit is <= 2.
     AND (
       au.frequency_cap_per_user IS NULL
       OR p_user_id IS NULL
       OR (SELECT COUNT(*) FROM ad_impressions ai
             WHERE ai.ad_unit_id = au.id
               AND ai.user_id = p_user_id) <
          CASE
            WHEN v_reduced
              AND au.frequency_cap_per_user > 2
              AND COALESCE(au.frequency_cap_per_session, 999) > 2
            THEN au.frequency_cap_per_user / 2
            ELSE au.frequency_cap_per_user
          END
     )
     -- Per-session cap; same halving rule.
     AND (
       au.frequency_cap_per_session IS NULL
       OR p_session_id IS NULL
       OR (SELECT COUNT(*) FROM ad_impressions ai
             WHERE ai.ad_unit_id = au.id
               AND ai.session_id = p_session_id) <
          CASE
            WHEN v_reduced
              AND au.frequency_cap_per_session > 2
              AND COALESCE(au.frequency_cap_per_user, 999) > 2
            THEN au.frequency_cap_per_session / 2
            ELSE au.frequency_cap_per_session
          END
     )
     -- Every-other-view gate for small-cap ads on reduced tier.
     AND (
       NOT v_reduced
       OR (
         COALESCE(au.frequency_cap_per_user, 999) > 2
         AND COALESCE(au.frequency_cap_per_session, 999) > 2
       )
       OR random() < 0.5
     )
   ORDER BY au.weight * random() DESC
   LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'ad_unit_id', v_pick.id,
    'placement_id', v_placement.id,
    'campaign_id', v_pick.campaign_id,
    'ad_format', v_pick.ad_format,
    'creative_url', v_pick.creative_url,
    'creative_html', v_pick.creative_html,
    'click_url', v_pick.click_url,
    'alt_text', v_pick.alt_text,
    'cta_text', v_pick.cta_text,
    'advertiser_name', v_pick.advertiser_name,
    'reduced', v_reduced
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.serve_ad(text, uuid, uuid, uuid) TO authenticated, anon, service_role;


-- ============================================================
-- Item 3: Ad revenue math
-- ============================================================
-- Pricing from ad_campaigns.pricing_model + rate_cents:
--   CPM  — rate_cents is $/1000 impressions. Impression revenue =
--          ceil(rate_cents / 1000). Click revenue = 0.
--   CPC  — impression revenue = 0. Click revenue = rate_cents.
--   CPA / flat / other — 0 on both sides for now; conversion tracking
--          is a separate pipeline (not in scope).
-- Stamps ad_impressions.revenue_cents + ad_daily_stats.revenue_cents
-- + bumps ad_campaigns.spent_cents.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_ad_impression(
  p_ad_unit_id uuid,
  p_placement_id uuid,
  p_campaign_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_session_id uuid DEFAULT NULL,
  p_article_id uuid DEFAULT NULL,
  p_page text DEFAULT 'unknown',
  p_position text DEFAULT 'unknown'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_pricing text;
  v_rate int;
  v_revenue int := 0;
BEGIN
  IF p_campaign_id IS NOT NULL THEN
    SELECT pricing_model, rate_cents INTO v_pricing, v_rate
      FROM ad_campaigns WHERE id = p_campaign_id;
    IF v_pricing = 'CPM' AND v_rate IS NOT NULL THEN
      v_revenue := CEIL(v_rate::numeric / 1000)::int;
    END IF;
  END IF;

  INSERT INTO ad_impressions
    (ad_unit_id, placement_id, campaign_id, user_id, session_id,
     article_id, page, position, revenue_cents)
  VALUES
    (p_ad_unit_id, p_placement_id, p_campaign_id, p_user_id, p_session_id,
     p_article_id, p_page, p_position, v_revenue)
  RETURNING id INTO v_id;

  INSERT INTO ad_daily_stats (ad_unit_id, placement_id, campaign_id, date, impressions, revenue_cents)
  VALUES (p_ad_unit_id, p_placement_id, p_campaign_id, CURRENT_DATE, 1, v_revenue)
  ON CONFLICT (ad_unit_id, placement_id, date) DO UPDATE
    SET impressions   = ad_daily_stats.impressions + 1,
        revenue_cents = ad_daily_stats.revenue_cents + EXCLUDED.revenue_cents;

  IF v_revenue > 0 AND p_campaign_id IS NOT NULL THEN
    UPDATE ad_campaigns
       SET spent_cents = spent_cents + v_revenue,
           total_impressions = total_impressions + 1,
           updated_at = now()
     WHERE id = p_campaign_id;
  ELSIF p_campaign_id IS NOT NULL THEN
    UPDATE ad_campaigns
       SET total_impressions = total_impressions + 1, updated_at = now()
     WHERE id = p_campaign_id;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_ad_impression(uuid, uuid, uuid, uuid, uuid, uuid, text, text) TO authenticated, anon, service_role;


CREATE OR REPLACE FUNCTION public.log_ad_click(
  p_impression_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_imp ad_impressions%ROWTYPE;
  v_pricing text;
  v_rate int;
  v_revenue int := 0;
BEGIN
  UPDATE ad_impressions
     SET is_clicked = true, clicked_at = now()
   WHERE id = p_impression_id AND is_clicked = false
  RETURNING * INTO v_imp;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_imp.campaign_id IS NOT NULL THEN
    SELECT pricing_model, rate_cents INTO v_pricing, v_rate
      FROM ad_campaigns WHERE id = v_imp.campaign_id;
    IF v_pricing = 'CPC' AND v_rate IS NOT NULL THEN
      v_revenue := v_rate;
    END IF;
  END IF;

  IF v_revenue > 0 THEN
    UPDATE ad_impressions
       SET revenue_cents = revenue_cents + v_revenue
     WHERE id = p_impression_id;
  END IF;

  INSERT INTO ad_daily_stats (ad_unit_id, placement_id, campaign_id, date, clicks, revenue_cents)
  VALUES (v_imp.ad_unit_id, v_imp.placement_id, v_imp.campaign_id, CURRENT_DATE, 1, v_revenue)
  ON CONFLICT (ad_unit_id, placement_id, date) DO UPDATE
    SET clicks        = ad_daily_stats.clicks + 1,
        revenue_cents = ad_daily_stats.revenue_cents + EXCLUDED.revenue_cents;

  IF v_imp.campaign_id IS NOT NULL THEN
    UPDATE ad_campaigns
       SET spent_cents = spent_cents + v_revenue,
           total_clicks = total_clicks + 1,
           updated_at = now()
     WHERE id = v_imp.campaign_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_ad_click(uuid) TO authenticated, anon, service_role;


-- ============================================================
-- Item 1: Family achievement cron rollup
-- ============================================================
-- Supported criteria shapes (achievements.criteria jsonb):
--   { "type": "family_articles_read", "threshold": 100, "window_days": 30 }
--     Sums reading_log.completed=true rows in the last window_days
--     across all family members (adults + kids).
--   { "type": "family_quizzes_completed", "threshold": 50, "window_days": 30 }
--     Sums distinct (user_id|kid_profile_id, article_id, attempt_number)
--     quiz attempts in the last window_days across the family.
--   { "type": "members_with_streak_min", "threshold": 3, "streak_min": 7 }
--     Count of family members (adults + kids) whose streak_current >=
--     streak_min; earned when count >= threshold.
--
-- Unknown criteria types are skipped (no-op). Once earned, earned_at
-- is sticky — later recomputes never clear it. Progress counter is
-- updated each run for UI display.
--
-- Called by cron/recompute-family-achievements (wired separately).
-- ------------------------------------------------------------
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

    -- Family members = owner + any co-adult on the same plan (out of scope
    -- here; owner-only for now — future enhancement per D34) + kid profiles.
    v_members := ARRAY[v_owner_id];
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
