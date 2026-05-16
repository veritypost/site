-- Adds an optional p_preview_tier override to serve_ad. When set, the
-- function uses the supplied tier string in place of the caller's
-- effective tier for placement.hidden_for_tiers / reduced_for_tiers
-- evaluation. Lets the /admin/ads/preview tool simulate per-tier
-- rendering without spinning up a second account per tier.
--
-- The API gate (web/src/app/api/ads/serve/route.js) only forwards
-- preview_tier when the caller has admin.ads.view, so anon callers
-- can't spoof tiers to alter cap-halving / hidden-tier filtering.
--
-- CREATE OR REPLACE cannot add a parameter to an existing function;
-- the old (text, uuid, uuid, uuid) signature is dropped first. All
-- existing JS callers use named-arg syntax (`supabase.rpc('serve_ad',
-- { p_placement_name, p_user_id, p_article_id, p_session_id })`), so
-- adding p_preview_tier with a default is non-breaking.
BEGIN;

DROP FUNCTION IF EXISTS public.serve_ad(text, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.serve_ad(
  p_placement_name text,
  p_user_id        uuid DEFAULT NULL,
  p_article_id     uuid DEFAULT NULL,
  p_session_id     uuid DEFAULT NULL,
  p_preview_tier   text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_placement   public.ad_placements%ROWTYPE;
  v_tier        text;
  v_reduced     boolean;
  v_pin         public.ad_pins%ROWTYPE;
  v_unit        public.ad_units%ROWTYPE;
  v_cat uuid; v_sub uuid; v_cat_parent uuid; v_sub_parent uuid;
  v_ad_eligible boolean;
  v_sensitivity_tags text[];
  v_today       text := to_char(now(), 'YYYY-MM-DD');
  v_user_count  int;
  v_sess_count  int;
  v_daily_count int;
BEGIN
  v_tier := public._user_tier_or_anon(p_user_id);
  -- Admin-preview override. The route layer enforces that only
  -- admin.ads.view callers may pass this; the RPC trusts the value.
  IF p_preview_tier IS NOT NULL AND length(p_preview_tier) > 0 THEN
    v_tier := p_preview_tier;
  END IF;

  -- 1. Load placement
  SELECT * INTO v_placement
  FROM public.ad_placements
  WHERE name = p_placement_name AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ad_unit_id', NULL, 'source', 'no_placement');
  END IF;

  v_reduced := v_tier = ANY(COALESCE(v_placement.reduced_for_tiers, '{}'::text[]));

  -- 2. Editorial gates (article-level)
  IF p_article_id IS NOT NULL THEN
    SELECT a.category_id, a.subcategory_id, cc.parent_id, sc.parent_id,
           a.ad_eligible, a.sensitivity_tags
      INTO v_cat, v_sub, v_cat_parent, v_sub_parent,
           v_ad_eligible, v_sensitivity_tags
      FROM public.articles a
      LEFT JOIN public.categories cc ON cc.id = a.category_id
      LEFT JOIN public.categories sc ON sc.id = a.subcategory_id
     WHERE a.id = p_article_id;

    IF v_ad_eligible IS FALSE THEN
      RETURN jsonb_build_object('ad_unit_id', NULL, 'source', 'editorial_block');
    END IF;
    IF v_sensitivity_tags && ARRAY['tragedy','breaking_casualty','suicide_coverage','cw_sa','cw_violence','obit']::text[] THEN
      RETURN jsonb_build_object('ad_unit_id', NULL, 'source', 'editorial_block');
    END IF;
  END IF;

  -- 3. PIN BRANCH — SELECT-time filter (no DELETE in RPC; lazy GC TBD)
  SELECT * INTO v_pin
  FROM public.ad_pins
  WHERE placement_id = v_placement.id
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF FOUND THEN
    SELECT * INTO v_unit FROM public.ad_units WHERE id = v_pin.ad_unit_id;
    IF FOUND AND v_unit.is_active AND v_unit.approval_status = 'approved' THEN
      -- Tier gate (skipped if force_all_tiers)
      IF v_pin.force_all_tiers
         OR NOT (v_tier = ANY(COALESCE(v_placement.hidden_for_tiers, '{}'::text[]))) THEN

        -- Freq caps (skipped if bypass_freq_cap)
        IF NOT v_pin.bypass_freq_cap THEN
          IF v_unit.frequency_cap_per_user IS NOT NULL AND v_unit.frequency_cap_per_user > 0 AND p_user_id IS NOT NULL THEN
            SELECT count INTO v_user_count FROM public.ad_freq_counters
              WHERE ad_unit_id = v_unit.id AND scope = 'user' AND scope_key = p_user_id::text;
            IF COALESCE(v_user_count, 0) >= (CASE WHEN v_reduced THEN v_unit.frequency_cap_per_user / 2 ELSE v_unit.frequency_cap_per_user END) THEN
              v_unit := NULL;
            END IF;
          END IF;
          IF v_unit.id IS NOT NULL AND v_unit.frequency_cap_per_session IS NOT NULL AND v_unit.frequency_cap_per_session > 0 AND p_session_id IS NOT NULL THEN
            SELECT count INTO v_sess_count FROM public.ad_freq_counters
              WHERE ad_unit_id = v_unit.id AND scope = 'session' AND scope_key = p_session_id::text;
            IF COALESCE(v_sess_count, 0) >= (CASE WHEN v_reduced THEN v_unit.frequency_cap_per_session / 2 ELSE v_unit.frequency_cap_per_session END) THEN
              v_unit := NULL;
            END IF;
          END IF;
          IF v_unit.id IS NOT NULL AND v_unit.daily_impression_cap IS NOT NULL AND v_unit.daily_impression_cap > 0 THEN
            SELECT count INTO v_daily_count FROM public.ad_freq_counters
              WHERE ad_unit_id = v_unit.id AND scope = 'daily' AND scope_key = v_today;
            IF COALESCE(v_daily_count, 0) >= v_unit.daily_impression_cap THEN
              v_unit := NULL;
            END IF;
          END IF;
        END IF;

        IF v_unit.id IS NOT NULL THEN
          RETURN jsonb_build_object(
            'ad_unit_id', v_unit.id, 'placement_id', v_placement.id,
            'campaign_id', v_unit.campaign_id, 'ad_network', v_unit.ad_network,
            'ad_network_unit_id', v_unit.ad_network_unit_id, 'ad_format', v_unit.ad_format,
            'creative_url', v_unit.creative_url, 'creative_html', v_unit.creative_html,
            'click_url', v_unit.click_url, 'alt_text', v_unit.alt_text,
            'cta_text', v_unit.cta_text, 'advertiser_name', v_unit.advertiser_name,
            'frequency_cap_per_user', v_unit.frequency_cap_per_user,
            'frequency_cap_per_session', v_unit.frequency_cap_per_session,
            'reduced', v_reduced, 'source', 'pinned',
            'fallback_network', NULL, 'fallback_network_unit_id', NULL
          );
        END IF;
      END IF;
    END IF;
  END IF;

  -- Tier gate for programmatic path
  IF v_tier = ANY(COALESCE(v_placement.hidden_for_tiers, '{}'::text[])) THEN
    RETURN jsonb_build_object('ad_unit_id', NULL, 'source', 'tier_hidden');
  END IF;

  -- 4. PROGRAMMATIC BRANCH — weighted random eligible unit
  SELECT au.* INTO v_unit
  FROM public.ad_units au
  WHERE au.placement_id = v_placement.id
    AND au.is_active AND au.approval_status = 'approved'
    AND (au.start_date IS NULL OR au.start_date <= now())
    AND (au.end_date   IS NULL OR au.end_date   >= now())
    AND (
      au.campaign_id IS NULL
      OR EXISTS (SELECT 1 FROM public.ad_campaigns c WHERE c.id = au.campaign_id AND c.status = 'active')
    )
    AND (
      NOT EXISTS (SELECT 1 FROM public.ad_targets t WHERE t.ad_unit_id = au.id AND t.mode = 'include')
      OR EXISTS (
        SELECT 1 FROM public.ad_targets t
         WHERE t.ad_unit_id = au.id AND t.mode = 'include'
           AND (
             (t.target_type = 'article'     AND t.target_id = p_article_id)
             OR (t.target_type = 'category'    AND t.target_id IN (v_cat, v_cat_parent, v_sub_parent))
             OR (t.target_type = 'subcategory' AND t.target_id IN (v_cat, v_sub))
           )
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.ad_targets t
       WHERE t.ad_unit_id = au.id AND t.mode = 'exclude'
         AND (
           (t.target_type = 'article'     AND t.target_id = p_article_id)
           OR (t.target_type = 'category'    AND t.target_id IN (v_cat, v_cat_parent, v_sub_parent))
           OR (t.target_type = 'subcategory' AND t.target_id IN (v_cat, v_sub))
         )
    )
    AND (
      au.frequency_cap_per_user IS NULL OR au.frequency_cap_per_user = 0 OR p_user_id IS NULL
      OR COALESCE(
          (SELECT count FROM public.ad_freq_counters
            WHERE ad_unit_id = au.id AND scope = 'user' AND scope_key = p_user_id::text), 0)
         < (CASE WHEN v_reduced THEN au.frequency_cap_per_user / 2 ELSE au.frequency_cap_per_user END)
    )
    AND (
      au.frequency_cap_per_session IS NULL OR au.frequency_cap_per_session = 0 OR p_session_id IS NULL
      OR COALESCE(
          (SELECT count FROM public.ad_freq_counters
            WHERE ad_unit_id = au.id AND scope = 'session' AND scope_key = p_session_id::text), 0)
         < (CASE WHEN v_reduced THEN au.frequency_cap_per_session / 2 ELSE au.frequency_cap_per_session END)
    )
    AND (
      au.daily_impression_cap IS NULL OR au.daily_impression_cap = 0
      OR COALESCE(
          (SELECT count FROM public.ad_freq_counters
            WHERE ad_unit_id = au.id AND scope = 'daily' AND scope_key = v_today), 0)
         < au.daily_impression_cap
    )
  ORDER BY au.weight * random() DESC
  LIMIT 1;

  IF FOUND AND v_unit.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ad_unit_id', v_unit.id, 'placement_id', v_placement.id,
      'campaign_id', v_unit.campaign_id, 'ad_network', v_unit.ad_network,
      'ad_network_unit_id', v_unit.ad_network_unit_id, 'ad_format', v_unit.ad_format,
      'creative_url', v_unit.creative_url, 'creative_html', v_unit.creative_html,
      'click_url', v_unit.click_url, 'alt_text', v_unit.alt_text,
      'cta_text', v_unit.cta_text, 'advertiser_name', v_unit.advertiser_name,
      'frequency_cap_per_user', v_unit.frequency_cap_per_user,
      'frequency_cap_per_session', v_unit.frequency_cap_per_session,
      'reduced', v_reduced, 'source', 'programmatic',
      'fallback_network', NULL, 'fallback_network_unit_id', NULL
    );
  END IF;

  -- 5. FALLBACK BRANCH
  IF v_placement.fallback_network IS NOT NULL AND v_placement.fallback_network <> 'none' THEN
    RETURN jsonb_build_object(
      'ad_unit_id', NULL,
      'placement_id', v_placement.id,
      'fallback_network', v_placement.fallback_network,
      'fallback_network_unit_id', v_placement.fallback_network_unit_id,
      'source', 'network_fallback'
    );
  END IF;

  RETURN jsonb_build_object(
    'ad_unit_id', NULL,
    'placement_id', v_placement.id,
    'fallback_network', NULL,
    'source', 'no_fill'
  );
END;
$$;

COMMENT ON FUNCTION public.serve_ad(text, uuid, uuid, uuid, text) IS
  'Resolves ad creative for a placement. VOLATILE because pin lookup observes live state. Returns jsonb with mandatory ''source'' field: no_placement | editorial_block | tier_hidden | pinned | programmatic | network_fallback | no_fill. p_preview_tier overrides the caller''s effective tier (admin preview only — gated in the API route).';

COMMIT;
