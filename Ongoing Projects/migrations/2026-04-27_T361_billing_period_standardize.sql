-- =====================================================================
-- 2026-04-27_T361_billing_period_standardize.sql
-- T361: standardize plans.billing_period values to 'month' / 'year'
-- =====================================================================
-- Problem:
--   plans.billing_period is set to a mix of:
--     'monthly' / 'annual'  (admin form mints these — see admin/plans/page.tsx:56)
--     'month'   / 'year'    (DB reads + Stripe glue use these — see
--                            profile/settings/page.tsx:4253 and lib/plans.js:58,78)
--   The mismatch means downgrade-detection comparisons can miss, the
--   profile-settings page mis-renders the renewal cadence, and Stripe
--   handoffs can pick the wrong recurring.interval. T56 shipped the
--   removal of 'lifetime'; this is the second half of T56's locked
--   spec.
--
-- Strategy:
--   1. UPDATE existing rows: 'monthly' -> 'month', 'annual' -> 'year'.
--      All other values pass through (already canonical or unknown
--      legacy strings — the latter would be a separate triage).
--   2. Add CHECK constraint requiring billing_period IN ('month','year','')
--      so future writes can't drift back.
--      ('' is allowed because the admin form's "— none —" option is
--      legitimately empty for one-time-purchase plans.)
--   3. Code change required: admin/plans/page.tsx BILLING_PERIODS array
--      from ['', 'monthly', 'annual'] -> ['', 'month', 'year'].
--      That edit lands AFTER the migration applies; it would 500 on
--      submit if the constraint hits stale string values.
--
-- Rollback:
--   BEGIN;
--   ALTER TABLE public.plans DROP CONSTRAINT plans_billing_period_check;
--   UPDATE public.plans SET billing_period = 'monthly' WHERE billing_period = 'month';
--   UPDATE public.plans SET billing_period = 'annual' WHERE billing_period = 'year';
--   COMMIT;
--
-- Verification:
--   SELECT DISTINCT billing_period FROM public.plans;
--   -- expect only: 'month', 'year', '' (no 'monthly' / 'annual' / 'lifetime')
--   SELECT conname FROM pg_constraint WHERE conname = 'plans_billing_period_check';
--   -- expect 1 row
-- =====================================================================

BEGIN;

UPDATE public.plans
   SET billing_period = CASE billing_period
                          WHEN 'monthly' THEN 'month'
                          WHEN 'annual'  THEN 'year'
                          ELSE billing_period
                        END
 WHERE billing_period IN ('monthly', 'annual');

-- T56 carve-out: 'lifetime' was already removed from the admin form;
-- if any DB rows still carry 'lifetime', flip them to '' rather than
-- letting the constraint fail. Surface the count for owner triage:
DO $$
DECLARE
  v_lifetime_count integer;
BEGIN
  SELECT COUNT(*) INTO v_lifetime_count
    FROM public.plans
   WHERE billing_period = 'lifetime';
  IF v_lifetime_count > 0 THEN
    RAISE NOTICE 'T361: % plans still carry billing_period=lifetime; flipping to empty string for the CHECK constraint. Owner: review these rows manually after apply.', v_lifetime_count;
    UPDATE public.plans SET billing_period = '' WHERE billing_period = 'lifetime';
  END IF;
END $$;

ALTER TABLE public.plans
  ADD CONSTRAINT plans_billing_period_check
  CHECK (billing_period IN ('month', 'year', ''));

COMMIT;

-- =====================================================================
-- Code change required after this migration applies:
--   web/src/app/admin/plans/page.tsx (line 56):
--     const BILLING_PERIODS = ['', 'month', 'year'] as const;
--
--   No other code changes — DB readers (profile/settings, lib/plans.js)
--   already expect the canonical strings.
-- =====================================================================
