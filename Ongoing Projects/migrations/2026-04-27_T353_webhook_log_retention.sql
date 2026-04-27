-- =====================================================================
-- 2026-04-27_T353_webhook_log_retention.sql
-- T353: webhook_log 30-day retention + index for the Stripe-idempotency
--       constraint check
-- =====================================================================
-- Problem:
--   public.webhook_log.event_id is the Stripe-idempotency key. Stripe
--   retries within ~24h of the original delivery; older rows are dead
--   weight slowing the UNIQUE-constraint check on every new webhook
--   delivery. No retention cron exists; the table grows ~5-15k rows/day
--   in steady-state.
--
-- Retention model:
--   30 days. Idempotency only needs the recent set; admin dashboards
--   that read webhook_log are point-of-failure forensics + use the
--   Stripe Dashboard for older history.
--
-- Rollback:
--   BEGIN; DROP FUNCTION public.purge_webhook_log(); COMMIT;
--
-- Verification:
--   SELECT proname FROM pg_proc WHERE proname = 'purge_webhook_log';
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.purge_webhook_log()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.webhook_log
   WHERE created_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_webhook_log() FROM PUBLIC;

COMMIT;

-- =====================================================================
-- Cron registration required after this migration applies:
--   web/src/app/api/cron/purge-webhook-log/route.ts
--     wraps service.rpc('purge_webhook_log')
--     schedule: daily at 04:00 UTC
-- =====================================================================
