-- 20260511120000_log_ad_impression_device_type.sql
--
-- Adds `p_device_type` to public.log_ad_impression so the API can pass
-- the client-detected device bucket through to ad_impressions.device_type.
--
-- Background: ad_impressions.device_type has been NULL for 100% of rows
-- (627/627 over the last 30 days) because the RPC never accepted the
-- parameter; the column existed but nothing wrote to it. Allowed values
-- mirror the client-side helper in web/src/lib/track.ts +
-- web/src/components/Ad.jsx getDeviceType: 'web_desktop' | 'web_mobile'
-- | 'web_tablet'. Validation lives in the API layer
-- (web/src/app/api/ads/impression/route.js); anything else is coerced
-- to NULL before the RPC call.
--
-- Behaviour for existing callers is unchanged: p_device_type defaults
-- to NULL, so any caller that doesn't pass it writes NULL into the
-- column (same outcome as before this migration).

CREATE OR REPLACE FUNCTION public.log_ad_impression(
  p_ad_unit_id   uuid,
  p_placement_id uuid,
  p_campaign_id  uuid DEFAULT NULL,
  p_user_id      uuid DEFAULT NULL,
  p_session_id   uuid DEFAULT NULL,
  p_article_id   uuid DEFAULT NULL,
  p_page         text DEFAULT 'unknown',
  p_position     text DEFAULT 'unknown',
  p_device_type  text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_pricing text;
  v_rate int;
  v_revenue int := 0;
  v_category_id uuid;
BEGIN
  IF p_campaign_id IS NOT NULL THEN
    SELECT pricing_model, rate_cents INTO v_pricing, v_rate
      FROM ad_campaigns WHERE id = p_campaign_id;
    IF v_pricing = 'CPM' AND v_rate IS NOT NULL THEN
      v_revenue := CEIL(v_rate::numeric / 1000)::int;
    END IF;
  END IF;

  -- Resolve the article's primary category for reporting splits.
  IF p_article_id IS NOT NULL THEN
    SELECT category_id INTO v_category_id FROM articles WHERE id = p_article_id;
  END IF;

  INSERT INTO ad_impressions
    (ad_unit_id, placement_id, campaign_id, user_id, session_id,
     article_id, category_id, page, position, device_type, revenue_cents)
  VALUES
    (p_ad_unit_id, p_placement_id, p_campaign_id, p_user_id, p_session_id,
     p_article_id, v_category_id, p_page, p_position, p_device_type, v_revenue)
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
$function$;
