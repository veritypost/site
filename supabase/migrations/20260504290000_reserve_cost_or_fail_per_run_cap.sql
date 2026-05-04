-- Slice 4 / Finding #10 — add per-run cap guard to reserve_cost_or_fail.
-- Daily-cap check is preserved unchanged; per-run check is added before it.
-- Idempotent (CREATE OR REPLACE). Signature unchanged.

CREATE OR REPLACE FUNCTION public.reserve_cost_or_fail(
  p_run_id        uuid,
  p_estimated_usd numeric
) RETURNS TABLE(
  accepted       boolean,
  reservation_id uuid,
  today_usd      numeric,
  cap_usd        numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today       numeric;
  v_daily_cap   numeric;
  v_per_run_cap numeric;
  v_id          uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pipeline:cost-cap'));

  -- Per-run cap: reject if the requested reservation already exceeds the cap.
  SELECT COALESCE((value)::numeric, 1.0) INTO v_per_run_cap
    FROM settings WHERE key = 'pipeline.per_run_cost_usd_cap';

  IF p_estimated_usd > v_per_run_cap THEN
    RETURN QUERY SELECT false, NULL::uuid, 0::numeric, v_per_run_cap;
    RETURN;
  END IF;

  -- Daily cap check (unchanged from original).
  SELECT COALESCE((value)::numeric, 10) INTO v_daily_cap
    FROM settings WHERE key = 'pipeline.daily_cost_usd_cap';

  SELECT COALESCE(SUM(pc.cost_usd), 0)
       + COALESCE(
           (SELECT SUM(reserved_usd)
              FROM pipeline_cost_reservations
             WHERE status = 'active'
               AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')),
           0)
    INTO v_today
    FROM pipeline_costs pc
   WHERE pc.created_at >= date_trunc('day', now() AT TIME ZONE 'UTC');

  IF v_today + p_estimated_usd > v_daily_cap THEN
    RETURN QUERY SELECT false, NULL::uuid, v_today, v_daily_cap;
    RETURN;
  END IF;

  INSERT INTO pipeline_cost_reservations(pipeline_run_id, reserved_usd)
    VALUES (p_run_id, p_estimated_usd)
    RETURNING id INTO v_id;

  RETURN QUERY SELECT true, v_id, v_today, v_daily_cap;
END $$;

GRANT EXECUTE ON FUNCTION public.reserve_cost_or_fail(uuid, numeric)
  TO authenticated, service_role;
