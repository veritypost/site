-- Wave 1+2 post-impl cleanup:
--   1. Add SELECT policy on ad_freq_counters so admin debug views (Wave 3+)
--      can read counters via permission gate rather than service-role.
--   2. Add explicit NULL guard for NEW.ad_unit_id in the bump trigger.
--      FK enforces non-null today, but guard makes intent explicit and
--      survives any future FK relaxation.

-- 1. SELECT policy on ad_freq_counters
DROP POLICY IF EXISTS ad_freq_counters_select ON public.ad_freq_counters;
CREATE POLICY ad_freq_counters_select ON public.ad_freq_counters
  FOR SELECT USING (public.has_permission('admin.ads.view'));

-- 2. Trigger function — defensive NULL guard at top
CREATE OR REPLACE FUNCTION public._bump_ad_freq_counters()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Defense-in-depth: FK enforces non-null today, but skip cleanly if that
  -- ever changes rather than aborting the impression insert.
  IF NEW.ad_unit_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO public.ad_freq_counters (ad_unit_id, scope, scope_key, count, updated_at)
    VALUES (NEW.ad_unit_id, 'user', NEW.user_id::text, 1, now())
    ON CONFLICT (ad_unit_id, scope, scope_key)
      DO UPDATE SET count = ad_freq_counters.count + 1, updated_at = now();
  END IF;
  IF NEW.session_id IS NOT NULL THEN
    INSERT INTO public.ad_freq_counters (ad_unit_id, scope, scope_key, count, updated_at)
    VALUES (NEW.ad_unit_id, 'session', NEW.session_id::text, 1, now())
    ON CONFLICT (ad_unit_id, scope, scope_key)
      DO UPDATE SET count = ad_freq_counters.count + 1, updated_at = now();
  END IF;
  INSERT INTO public.ad_freq_counters (ad_unit_id, scope, scope_key, count, updated_at)
  VALUES (NEW.ad_unit_id, 'daily',
          to_char(COALESCE(NEW.created_at, now()), 'YYYY-MM-DD'), 1, now())
  ON CONFLICT (ad_unit_id, scope, scope_key)
    DO UPDATE SET count = ad_freq_counters.count + 1, updated_at = now();
  RETURN NEW;
END;
$$;
