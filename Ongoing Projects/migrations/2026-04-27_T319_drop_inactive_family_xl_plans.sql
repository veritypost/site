-- =====================================================================
-- 2026-04-27_T319_drop_inactive_family_xl_plans.sql
-- T319: hard-delete the inactive verity_family_xl_* SKU rows
-- =====================================================================
-- Background:
--   Phase 2 of AI + Plan Change Implementation locked the family pricing
--   model to: `verity_family` includes 1 kid, parents add up to 4 total
--   via per-kid add-on at $4.99/mo. The `verity_family_xl_*` SKUs were
--   retired per that decision (see web/src/app/api/family/config/
--   route.js:24 — "verity_family_xl is retired permanently"). Code-side
--   scrub of the 6 references shipped 2026-04-27 alongside this file.
--
--   Other inactive family rows that might exist (verity_family_annual,
--   etc.): NOT dropped here. Those are LIVE — `verity_family_monthly`
--   and `verity_family_annual` are both billed-period variants of the
--   active `verity_family` tier. Only the XL pair is retired.
--
-- Pre-flight (run before applying):
--   SELECT id, name, tier, billing_period, is_active, is_visible
--     FROM public.plans
--    WHERE tier = 'verity_family_xl';
--   -- expect 2 rows: verity_family_xl_monthly, verity_family_xl_annual
--   SELECT COUNT(*) FROM public.subscriptions
--    WHERE plan_id IN (SELECT id FROM public.plans WHERE tier = 'verity_family_xl');
--   -- MUST be 0 — if non-zero, HALT and migrate those subscribers off
--   -- before deleting the plan rows.
--
-- Strategy:
--   1. Verify zero active subscriptions reference verity_family_xl plans.
--   2. Delete dependent permission_set bindings (if any).
--   3. Delete the 2 plan rows.
--
-- Rollback:
--   The plan row UUIDs are stable; if rollback is needed, re-INSERT from
--   the schema seed (schema/reset_and_rebuild_v2.sql). No FK cascades
--   tracked here — verify the dependency map at apply time.
--
-- Verification:
--   SELECT COUNT(*) FROM public.plans WHERE tier = 'verity_family_xl';
--   -- expect 0
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Belt-and-braces: refuse to delete if any subscription still
--    references a verity_family_xl plan. The pre-flight comment is
--    advisory; the RAISE is enforcement.
-- ---------------------------------------------------------------------
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
      'T319: refusing to drop verity_family_xl plans — % subscription(s) still reference them. Migrate subscribers first.',
      v_active_count
      USING ERRCODE = 'P0001';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. Drop dependent permission_set bindings if the plan_perm_sets
--    junction exists. If the table name differs in your schema, adjust
--    or comment out — verify with information_schema.tables before apply.
-- ---------------------------------------------------------------------
DELETE FROM public.permission_set_perms
 WHERE permission_set_id IN (
   SELECT id FROM public.permission_sets
    WHERE name LIKE 'plan:verity_family_xl%'
 );

DELETE FROM public.permission_sets
 WHERE name LIKE 'plan:verity_family_xl%';

-- ---------------------------------------------------------------------
-- 3. Drop the 2 plan rows.
-- ---------------------------------------------------------------------
DELETE FROM public.plans
 WHERE tier = 'verity_family_xl';

COMMIT;

-- =====================================================================
-- Code already scrubbed in commit landing alongside this file:
--   - web/src/lib/plans.js (TIER_ORDER + DB-rows comment)
--   - web/src/app/NavWrapper.tsx (deriveTier branch + AuthContext type doc)
--   - web/src/app/admin/ad-placements/page.tsx (ALL_TIERS + new-placement
--     hidden_for_tiers default)
--   - web/src/app/api/admin/ad-placements/route.js (POST default)
--   - web/src/app/leaderboard/page.tsx (comment)
--   - web/src/app/api/cron/recompute-family-achievements/route.js (comment)
--   - web/src/app/api/account/onboarding/route.js (deriveServerTier branch)
--   - web/src/app/profile/page.tsx (T316 Pro-pill billing tier check)
-- =====================================================================
