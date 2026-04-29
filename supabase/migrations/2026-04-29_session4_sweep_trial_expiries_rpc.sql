-- Session 4 — sweep_trial_expiries RPC.
-- Called by the daily sweep-trial-expiry cron.
-- Downgrades beta pro users whose trial clock has run out.
-- Cron logic: coalesce(trial_extension_until, comped_until) takes the later
-- expiry; null = no expiry (lifetime), cron skips those rows.

CREATE OR REPLACE FUNCTION public.sweep_trial_expiries()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_free_plan_id uuid;
  v_now timestamptz := now();
  v_user_id uuid;
  v_count int := 0;
BEGIN
  SELECT id INTO v_free_plan_id FROM public.plans WHERE tier = 'free' LIMIT 1;
  IF v_free_plan_id IS NULL THEN
    RAISE EXCEPTION 'sweep_trial_expiries: free plan not found';
  END IF;

  FOR v_user_id IN
    SELECT id FROM public.users
     WHERE cohort = 'beta'
       AND plan_id IN (SELECT id FROM public.plans WHERE tier = 'verity_pro')
       AND COALESCE(trial_extension_until, comped_until) IS NOT NULL
       AND COALESCE(trial_extension_until, comped_until) < v_now
  LOOP
    UPDATE public.users
       SET plan_id     = v_free_plan_id,
           plan_status = 'active',
           updated_at  = v_now
     WHERE id = v_user_id;
    PERFORM public.bump_user_perms_version(v_user_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
