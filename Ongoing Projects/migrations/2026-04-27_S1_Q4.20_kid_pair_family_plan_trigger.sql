-- S1-Q4.20 — parental_consents: enforce family-plan-required for kid pairing
--
-- Decision (Q4.20): "Locked: Family-plan-required for kids. Closes the FTC-enforcement-
-- pattern path entirely (Epic $275M, YouTube $170M precedents). Free-tier kids cannot
-- pair without a family subscription on the parent's account."
--
-- The DB slice is a BEFORE INSERT OR UPDATE trigger on parental_consents that checks
-- the parent's plan tier. Pure RLS isn't sufficient because plan_id can change after
-- the row exists; the trigger re-checks on every UPDATE too.
--
-- Bypass: auth.uid() IS NULL (service_role / postgres maintenance operations). This
-- ensures I11 backfill and admin corrections can still proceed without interference.
-- User-initiated pairings always have auth.uid() set via the anon → authenticated JWT.
--
-- Pre-flight: verify 0 existing consent rows with non-family parents (grandfathering).
-- Verified 2026-04-27: 0 total consent rows → pre-flight trivially passes.
--
-- Apply ORDER: must land AFTER S1-A3 (which adds consent_version column and establishes
-- the table structure) but BEFORE or AFTER S1-I11 is fine since I11 uses service-role
-- backfill (auth.uid() IS NULL → trigger bypasses).
--
-- Acceptance: as free-tier parent → INSERT into parental_consents → ERRCODE 23514.
-- As family-tier parent → INSERT succeeds.

BEGIN;

DO $$
DECLARE bad_count int;
BEGIN
  SELECT COUNT(*) INTO bad_count
    FROM public.parental_consents pc
    JOIN public.users u ON u.id = pc.parent_user_id
    JOIN public.plans p ON p.id = u.plan_id
   WHERE p.tier NOT LIKE 'verity_family%';
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'S1-Q4.20 abort: % existing consent rows have non-family parents — grandfather manually before applying',
      bad_count;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._enforce_kid_pair_family_plan()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE v_tier text;
BEGIN
  -- Service-role and admin operations bypass the gate (auth.uid() IS NULL
  -- for service_role). Only user-initiated pairings are enforced.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.tier INTO v_tier
    FROM public.users u
    JOIN public.plans p ON p.id = u.plan_id
   WHERE u.id = NEW.parent_user_id;

  IF v_tier IS NULL OR v_tier NOT LIKE 'verity_family%' THEN
    RAISE EXCEPTION
      'kid pairing requires a Family plan (current: %); upgrade before pairing',
      COALESCE(v_tier, '<no plan>')
      USING ERRCODE = '23514',
            HINT    = 'Upgrade to Family before pairing a kid account.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_kid_pair_family_plan ON public.parental_consents;
CREATE TRIGGER enforce_kid_pair_family_plan
  BEFORE INSERT OR UPDATE ON public.parental_consents
  FOR EACH ROW EXECUTE FUNCTION public._enforce_kid_pair_family_plan();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'enforce_kid_pair_family_plan'
       AND tgrelid = 'public.parental_consents'::regclass
  ) THEN
    RAISE EXCEPTION 'S1-Q4.20 post-check failed: trigger not found';
  END IF;
  RAISE NOTICE 'S1-Q4.20 applied: kid-pair family-plan trigger live';
END $$;

COMMIT;
