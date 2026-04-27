-- =====================================================================
-- 2026-04-27_T319_drop_inactive_family_xl_plans_CORRECTED.sql
-- T319: hard-delete inactive verity_family_xl_* SKUs (corrected)
-- =====================================================================
-- Why this supersedes the original T319 migration:
--   The original named the wrong junction tables. Verified via pg_constraint:
--     fk_subscriptions_plan_id              (subscriptions.plan_id)
--     fk_users_plan_id                      (users.plan_id)
--     fk_subscriptions_downgraded_from_plan (subscriptions.downgraded_from_plan_id)
--     fk_plan_features_plan_id              (plan_features.plan_id)
--     plan_permission_sets_plan_id_fkey     (plan_permission_sets.plan_id)
--     fk_access_codes_grants_plan_id        (access_codes.grants_plan_id)
--   Original guessed `permission_set_perms` + `permission_sets` named
--   'plan:verity_family_xl%' — those don't exist with that naming. The
--   actual junction is `plan_permission_sets`. Plus `plan_features`
--   carries 54 rows referencing the XL plans that also need clearing.
--
-- Pre-flight verified 2026-04-27 via MCP:
--   users referencing XL:                   0
--   subscriptions.plan_id referencing XL:   0
--   subscriptions.downgraded_from_plan_id:  0
--   subscription_events from/to XL:         0
--   access_codes.grants_plan_id:            0
--   plan_permission_sets:                   6 rows (will be deleted)
--   plan_features:                          54 rows (will be deleted)
--
-- Verification after apply:
--   SELECT COUNT(*) FROM public.plans WHERE tier = 'verity_family_xl';
--   -- expect 0
-- =====================================================================

BEGIN;

-- Belt-and-braces: refuse to delete if any subscription still references
-- a verity_family_xl plan. The pre-flight confirmation above is advisory;
-- the RAISE here is enforcement at apply time.
DO $$
DECLARE
  v_active_count integer;
BEGIN
  SELECT COUNT(*) INTO v_active_count
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
   WHERE p.tier = 'verity_family_xl';
  IF v_active_count > 0 THEN
    RAISE EXCEPTION
      'T319: refusing to drop verity_family_xl plans — % subscription(s) still reference them.',
      v_active_count
      USING ERRCODE = 'P0001';
  END IF;
END $$;

-- Drop dependent rows in the actual junction tables.
DELETE FROM public.plan_permission_sets
 WHERE plan_id IN (SELECT id FROM public.plans WHERE tier = 'verity_family_xl');

DELETE FROM public.plan_features
 WHERE plan_id IN (SELECT id FROM public.plans WHERE tier = 'verity_family_xl');

-- Drop the 2 plan rows.
DELETE FROM public.plans
 WHERE tier = 'verity_family_xl';

COMMIT;
