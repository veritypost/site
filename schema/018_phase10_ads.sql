-- ============================================================
-- Phase 10 — Ads & Monetization
-- D23: tier-aware ad loads. Anonymous gets interstitial + autoplay,
-- Free Verified gets in-feed + banner + 3rd-quiz interstitial,
-- Verity gets a single small banner, Verity Pro / Family / XL
-- see nothing. Frequency capping per user + per session, fraud
-- filter deferred (Phase 8 scope call).
-- ============================================================

-- ------------------------------------------------------------
-- _user_tier_or_anon(user_id) -> text
-- Returns the tier string for a user (falls through plans.tier),
-- or 'anonymous' if p_user_id is null, or 'free' if logged in
-- without a plan row.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._user_tier_or_anon(p_user_id uuid)
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL THEN 'anonymous'
    ELSE COALESCE(
      (SELECT p.tier FROM users u LEFT JOIN plans p ON p.id = u.plan_id WHERE u.id = p_user_id),
      'free'
    )
  END;
$$;


-- ------------------------------------------------------------
-- serve_ad(placement_name, user_id, article_id, session_id) -> jsonb
--
-- Returns the ad_unit to render (or null if no eligible unit).
-- Enforcement order:
--   1. Placement exists and is_active.
--   2. Viewer tier not in hidden_for_tiers (return null if it is).
--   3. Filter candidate ad_units: is_active, approved, not expired.
--   4. Frequency cap: discard units where this user has already hit
--      frequency_cap_per_user (lifetime) or frequency_cap_per_session
--      (this session). Reduced-tier users get halved caps.
--   5. Weighted random pick. Returns minimal shape for the client.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.serve_ad(
  p_placement_name text,
  p_user_id uuid DEFAULT NULL,
  p_article_id uuid DEFAULT NULL,
  p_session_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_placement ad_placements%ROWTYPE;
  v_tier text := _user_tier_or_anon(p_user_id);
  v_reduced boolean;
  v_pick ad_units%ROWTYPE;
BEGIN
  SELECT * INTO v_placement FROM ad_placements
   WHERE name = p_placement_name AND is_active = true;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Tier hidden entirely (Verity Pro/Family/XL by default).
  IF v_tier = ANY(COALESCE(v_placement.hidden_for_tiers, '{}')) THEN
    RETURN NULL;
  END IF;
  v_reduced := v_tier = ANY(COALESCE(v_placement.reduced_for_tiers, '{}'));

  -- Pick an eligible ad_unit.
  SELECT au.* INTO v_pick
    FROM ad_units au
   WHERE au.placement_id = v_placement.id
     AND au.is_active = true
     AND au.approval_status = 'approved'
     AND (au.start_date IS NULL OR au.start_date <= now())
     AND (au.end_date   IS NULL OR au.end_date   >= now())
     -- Per-user lifetime cap.
     AND (
       au.frequency_cap_per_user IS NULL
       OR p_user_id IS NULL
       OR (SELECT COUNT(*) FROM ad_impressions ai
             WHERE ai.ad_unit_id = au.id
               AND ai.user_id = p_user_id) <
          CASE WHEN v_reduced THEN au.frequency_cap_per_user / 2
               ELSE au.frequency_cap_per_user END
     )
     -- Per-session cap.
     AND (
       au.frequency_cap_per_session IS NULL
       OR p_session_id IS NULL
       OR (SELECT COUNT(*) FROM ad_impressions ai
             WHERE ai.ad_unit_id = au.id
               AND ai.session_id = p_session_id) <
          CASE WHEN v_reduced THEN au.frequency_cap_per_session / 2
               ELSE au.frequency_cap_per_session END
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


-- ------------------------------------------------------------
-- log_ad_impression — writes ad_impressions + rolls into ad_daily_stats.
-- Called by the client right after <Ad/> renders.
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
BEGIN
  INSERT INTO ad_impressions
    (ad_unit_id, placement_id, campaign_id, user_id, session_id,
     article_id, page, position)
  VALUES
    (p_ad_unit_id, p_placement_id, p_campaign_id, p_user_id, p_session_id,
     p_article_id, p_page, p_position)
  RETURNING id INTO v_id;

  INSERT INTO ad_daily_stats (ad_unit_id, placement_id, campaign_id, date, impressions)
  VALUES (p_ad_unit_id, p_placement_id, p_campaign_id, CURRENT_DATE, 1)
  ON CONFLICT (ad_unit_id, placement_id, date) DO UPDATE
    SET impressions = ad_daily_stats.impressions + 1;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_ad_impression(uuid, uuid, uuid, uuid, uuid, uuid, text, text) TO authenticated, anon, service_role;


-- ------------------------------------------------------------
-- log_ad_click — marks an impression as clicked + rolls stats.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_ad_click(
  p_impression_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_imp ad_impressions%ROWTYPE;
BEGIN
  UPDATE ad_impressions
     SET is_clicked = true, clicked_at = now()
   WHERE id = p_impression_id AND is_clicked = false
  RETURNING * INTO v_imp;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO ad_daily_stats (ad_unit_id, placement_id, campaign_id, date, clicks)
  VALUES (v_imp.ad_unit_id, v_imp.placement_id, v_imp.campaign_id, CURRENT_DATE, 1)
  ON CONFLICT (ad_unit_id, placement_id, date) DO UPDATE
    SET clicks = ad_daily_stats.clicks + 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_ad_click(uuid) TO authenticated, anon, service_role;


-- ------------------------------------------------------------
-- ad_daily_stats may not have a unique index on the ON CONFLICT
-- columns — add it idempotently so the UPSERTs above resolve cleanly.
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_daily_stats_unit_placement_date
  ON ad_daily_stats (ad_unit_id, placement_id, date);
