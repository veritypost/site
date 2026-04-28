-- Session A — atomic cost reservation (additive).
--
-- Decision 14 + C3 (AI-today.md): replace check-then-run cost-cap with
-- an advisory-lock'd reserve_cost_or_fail RPC. Three parallel generates
-- can no longer each pass the check before any has spent, because the
-- reservation row is committed inside pg_advisory_xact_lock. Settled
-- reservations stay in the table for audit; the active partial index
-- keeps the cap-check hot path cheap.

CREATE TABLE public.pipeline_cost_reservations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_run_id uuid NOT NULL REFERENCES public.pipeline_runs(id) ON DELETE CASCADE,
  reserved_usd    numeric NOT NULL CHECK (reserved_usd >= 0),
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','settled','released')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  settled_at      timestamptz
);

CREATE INDEX idx_pcr_active_today
  ON public.pipeline_cost_reservations(created_at)
  WHERE status = 'active';

ALTER TABLE public.pipeline_cost_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY pipeline_cost_reservations_select
  ON public.pipeline_cost_reservations
  FOR SELECT
  USING (public.is_admin_or_above());

CREATE POLICY pipeline_cost_reservations_insert
  ON public.pipeline_cost_reservations
  FOR INSERT
  WITH CHECK (public.is_admin_or_above());

CREATE POLICY pipeline_cost_reservations_update
  ON public.pipeline_cost_reservations
  FOR UPDATE
  USING (public.is_admin_or_above());

CREATE POLICY pipeline_cost_reservations_delete
  ON public.pipeline_cost_reservations
  FOR DELETE
  USING (public.is_admin_or_above());

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
  v_today numeric;
  v_cap   numeric;
  v_id    uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pipeline:cost-cap'));

  SELECT COALESCE((value)::numeric, 10) INTO v_cap
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

  IF v_today + p_estimated_usd > v_cap THEN
    RETURN QUERY SELECT false, NULL::uuid, v_today, v_cap;
    RETURN;
  END IF;

  INSERT INTO pipeline_cost_reservations(pipeline_run_id, reserved_usd)
    VALUES (p_run_id, p_estimated_usd)
    RETURNING id INTO v_id;

  RETURN QUERY SELECT true, v_id, v_today, v_cap;
END $$;

CREATE OR REPLACE FUNCTION public.reconcile_cost_reservation(p_run_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE pipeline_cost_reservations
     SET status = 'settled',
         settled_at = now()
   WHERE pipeline_run_id = p_run_id
     AND status = 'active';
$$;

GRANT EXECUTE ON FUNCTION public.reserve_cost_or_fail(uuid, numeric)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_cost_reservation(uuid)
  TO authenticated, service_role;
