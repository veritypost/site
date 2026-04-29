-- Session 4 Migration I — Update apply_signup_cohort RPC to:
--   1. Read beta_trial_duration from settings (default 30 days).
--   2. Set comped_until = now() + v_trial_days when granting pro.
--      Uses COALESCE so an existing comped_until is never shortened.
--
-- Body confirmed from pg_proc before rewrite (2026-04-29).
-- All existing behaviour preserved; only the two pro-grant UPDATE
-- statements gain the comped_until = COALESCE(...) line.

CREATE OR REPLACE FUNCTION public.apply_signup_cohort(
  p_user_id uuid,
  p_via_owner_link boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_signup_cohort text;
  v_beta_active boolean;
  v_beta_cap int;
  v_current_count int;
  v_user record;
  v_pro_plan_id uuid;
  v_now timestamptz := now();
  v_trial_days int;
BEGIN
  IF v_role <> 'service_role' AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'apply_signup_cohort: not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT id, email_verified, cohort, is_kids_mode_enabled, plan_id, verify_locked_at
    INTO v_user
    FROM public.users
   WHERE id = p_user_id
     FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Read trial duration setting (fallback 30 if row missing or non-integer)
  BEGIN
    SELECT NULLIF(TRIM(value), '')::int INTO v_trial_days
      FROM public.settings WHERE key = 'beta_trial_duration';
  EXCEPTION WHEN OTHERS THEN
    v_trial_days := NULL;
  END;
  IF v_trial_days IS NULL OR v_trial_days <= 0 THEN v_trial_days := 30; END IF;

  -- Tag immutability — never overwrite an existing cohort tag
  IF v_user.cohort IS NOT NULL THEN
    -- Already tagged. If they verified email AFTER initial tag and the
    -- prior write skipped Pro grant (because !verified and !owner_link),
    -- grant Pro now (and set comped_until if not already set).
    IF v_user.cohort = 'beta'
       AND v_user.plan_id IS NULL
       AND COALESCE(v_user.email_verified, false) = true THEN
      SELECT id INTO v_pro_plan_id FROM public.plans
        WHERE name = 'verity_pro_monthly' LIMIT 1;
      IF v_pro_plan_id IS NOT NULL THEN
        UPDATE public.users
           SET plan_id       = v_pro_plan_id,
               plan_status   = 'active',
               comped_until  = COALESCE(comped_until, v_now + (v_trial_days || ' days')::interval)
         WHERE id = p_user_id;
        PERFORM public.bump_user_perms_version(p_user_id);
      END IF;
    END IF;
    RETURN v_user.cohort;
  END IF;

  -- Read settings
  SELECT value INTO v_signup_cohort FROM public.settings WHERE key = 'signup_cohort';
  IF v_signup_cohort IS NULL OR v_signup_cohort = '' THEN
    RETURN NULL;
  END IF;

  SELECT (value)::boolean INTO v_beta_active FROM public.settings WHERE key = 'beta_active';
  IF v_signup_cohort = 'beta' AND COALESCE(v_beta_active, false) = false THEN
    UPDATE public.users
       SET cohort = v_signup_cohort,
           cohort_joined_at = v_now
     WHERE id = p_user_id;
    RETURN v_signup_cohort;
  END IF;

  -- Beta cap check
  SELECT (value)::int INTO v_beta_cap FROM public.settings WHERE key = 'beta_cap';
  IF v_signup_cohort = 'beta' AND COALESCE(v_beta_cap, 0) > 0 THEN
    SELECT count(*)::int INTO v_current_count
      FROM public.users
     WHERE cohort = 'beta';
    IF v_current_count >= v_beta_cap THEN
      RETURN NULL;
    END IF;
  END IF;

  -- Tag the cohort
  UPDATE public.users
     SET cohort = v_signup_cohort,
         cohort_joined_at = v_now
   WHERE id = p_user_id;

  -- Pro grant: only for beta cohort, and only if via owner link or email verified.
  -- Kids-mode users are tagged but not granted.
  IF v_signup_cohort = 'beta' AND COALESCE(v_user.is_kids_mode_enabled, false) = false THEN
    IF p_via_owner_link OR COALESCE(v_user.email_verified, false) = true THEN
      SELECT id INTO v_pro_plan_id FROM public.plans
        WHERE name = 'verity_pro_monthly' LIMIT 1;
      IF v_pro_plan_id IS NOT NULL THEN
        UPDATE public.users
           SET plan_id       = v_pro_plan_id,
               plan_status   = 'active',
               comped_until  = COALESCE(comped_until, v_now + (v_trial_days || ' days')::interval)
         WHERE id = p_user_id;
        PERFORM public.bump_user_perms_version(p_user_id);
      END IF;
    ELSE
      -- Closed-beta access gate: unverified non-owner-link beta signups
      -- get an immediate verify-lock. compute_effective_perms strips them
      -- to the appeal/account/login/signup/settings allowlist.
      -- complete_email_verification clears verify_locked_at on email confirm
      -- and grants Pro at that moment.
      UPDATE public.users
         SET verify_locked_at = v_now,
             perms_version = perms_version + 1,
             perms_version_bumped_at = v_now
       WHERE id = p_user_id;
    END IF;
  END IF;

  RETURN v_signup_cohort;
END;
$$;
