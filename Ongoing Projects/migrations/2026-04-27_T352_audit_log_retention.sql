-- =====================================================================
-- 2026-04-27_T352_audit_log_retention.sql
-- T352: audit_log retention policy + nightly prune cron
-- =====================================================================
-- Problem:
--   public.audit_log grows unbounded — every admin action, signup, mod
--   action, billing event appends a row. None are reaped. Compliance
--   angle: GDPR data-minimization expects retention windows on audit
--   data tied to identity. Operational angle: query performance on
--   admin/audit dashboards degrades as the table grows.
--
-- Retention model (owner-tunable via the constant below):
--   - 365 days for ALL rows (default).
--   - actor_id and target_id NULLed at 90 days for rows with PII-class
--     actions (so the action history survives but the identity link
--     is severed). PII-class actions listed in the WHERE clause below.
--
-- The split lets us keep useful aggregate signals (How many account
-- deletions per month? How many admin actions in Q3?) past the
-- identity-window without holding linkable PII forever.
--
-- Rollback:
--   BEGIN; DROP FUNCTION public.purge_audit_log();
--   DROP FUNCTION public.anonymize_audit_log_pii(); COMMIT;
--
-- Verification:
--   SELECT proname FROM pg_proc WHERE proname IN
--     ('purge_audit_log','anonymize_audit_log_pii');
--   -- expect 2 rows
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. anonymize_audit_log_pii — runs nightly. NULLs actor_id +
--    target_id for rows older than 90 days where the action is in the
--    PII-class set. Action string + timestamp + non-PII metadata fields
--    survive for aggregate analysis.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.anonymize_audit_log_pii()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.audit_log
     SET actor_id = NULL,
         target_id = NULL,
         metadata = COALESCE(metadata, '{}'::jsonb)
                    - 'email' - 'old_email_hash' - 'new_email_hash'
                    - 'ip' - 'phone' - 'reason'
   WHERE created_at < NOW() - INTERVAL '90 days'
     AND (actor_id IS NOT NULL OR target_id IS NOT NULL)
     AND action IN (
       'auth:signup',
       'auth:login',
       'auth:email_change_initiated',
       'auth:password_change',
       'admin:user_ban',
       'admin:user_mute',
       'admin:user_freeze',
       'admin:user_delete',
       'admin:article_soft_delete',
       'admin:article_restore',
       'admin:comment_hide',
       'admin:comment_restore',
       'admin:report_resolve',
       'family:add_kid_with_seat',
       'family:graduate_kid'
     );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.anonymize_audit_log_pii() FROM PUBLIC;

-- ---------------------------------------------------------------------
-- 2. purge_audit_log — runs nightly. Hard-deletes rows older than 365
--    days. Idempotent across days; partial-batch failure leaves the
--    set in a consistent state.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_audit_log()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.audit_log
   WHERE created_at < NOW() - INTERVAL '365 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_audit_log() FROM PUBLIC;

-- ---------------------------------------------------------------------
-- 3. Index to keep retention sweeps efficient. CREATE INDEX IF NOT
--    EXISTS so re-runs are safe; CONCURRENTLY so the migration doesn't
--    block writers.
-- ---------------------------------------------------------------------
COMMIT;

-- CREATE INDEX CONCURRENTLY can't run in a transaction block;
-- run separately after the COMMIT above.
CREATE INDEX CONCURRENTLY IF NOT EXISTS audit_log_created_at_idx
  ON public.audit_log (created_at);

-- =====================================================================
-- Cron registrations required after this migration applies:
--   web/src/app/api/cron/anonymize-audit-log-pii/route.ts
--     wraps service.rpc('anonymize_audit_log_pii')
--     schedule: nightly at 03:30 UTC
--
--   web/src/app/api/cron/purge-audit-log/route.ts
--     wraps service.rpc('purge_audit_log')
--     schedule: nightly at 03:35 UTC
-- =====================================================================
