-- 110_adsense_adapter.sql
-- Master-plan Phase D. Extends the existing serve_ad RPC to include
-- ad_network + ad_network_unit_id in its response, so the client Ad
-- component can dispatch to a Google AdSense renderer (or any future
-- network adapter) without additional DB queries.
--
-- No schema changes — ad_units.ad_network and ad_units.ad_network_unit_id
-- already exist (schema/reset_and_rebuild_v2.sql lines 1253-1254). This
-- migration only updates the function body. Safe to re-run.
--
-- Backward compatible: existing callers (direct / house creatives) that
-- only read `creative_url` / `creative_html` are unaffected; the new
-- fields are additional, never replace.
--
-- Apply with: Supabase SQL Editor → paste → run.

BEGIN;

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
     AND (
       au.frequency_cap_per_user IS NULL
       OR p_user_id IS NULL
       OR (SELECT COUNT(*) FROM ad_impressions ai
             WHERE ai.ad_unit_id = au.id
               AND ai.user_id = p_user_id) <
          CASE WHEN v_reduced THEN au.frequency_cap_per_user / 2
               ELSE au.frequency_cap_per_user END
     )
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
    'ad_network', v_pick.ad_network,               -- NEW: 'direct' | 'house' | 'google_adsense' | ...
    'ad_network_unit_id', v_pick.ad_network_unit_id, -- NEW: AdSense slot ID / network-specific ref
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

COMMIT;
