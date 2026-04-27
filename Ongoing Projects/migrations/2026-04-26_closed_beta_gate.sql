-- =====================================================================
-- 2026-04-26_closed_beta_gate.sql
-- Closed-beta hardening: one-time user slugs + signup-time verify-lock
-- =====================================================================
-- Changes:
--   A. mint_referral_codes — user-tier slugs default max_uses=1 (one
--      invitee per slot, ever).
--   B. apply_signup_cohort — when cohort='beta' AND email not yet
--      verified AND not via owner link, stamp verify_locked_at=now()
--      immediately. Closes the access gap during beta: unverified
--      slot-link signups have an account but compute_effective_perms
--      strips them to the appeal/account/login/signup/settings
--      allowlist until they verify.
--   C. complete_email_verification — already clears verify_locked_at;
--      no change needed (verified by code review).
-- =====================================================================

BEGIN;

-- A. mint_referral_codes — user-tier slugs are one-time-use
CREATE OR REPLACE FUNCTION public.mint_referral_codes(p_user_id uuid)
RETURNS TABLE (id uuid, code text, slot smallint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_slot smallint;
  v_slug text;
  v_attempt int;
  v_existing record;
BEGIN
  IF v_role <> 'service_role'
     AND auth.uid() <> p_user_id
     AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'mint_referral_codes: not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'mint_referral_codes: p_user_id required';
  END IF;

  FOR v_slot IN 1..2 LOOP
    SELECT ac.id, ac.code, ac.slot
      INTO v_existing
      FROM public.access_codes ac
     WHERE ac.type = 'referral'
       AND ac.tier = 'user'
       AND ac.owner_user_id = p_user_id
       AND ac.slot = v_slot
     LIMIT 1;
    IF FOUND THEN
      CONTINUE;
    END IF;

    FOR v_attempt IN 1..5 LOOP
      v_slug := public.generate_referral_slug();
      BEGIN
        -- Closed-beta: one invitee per slot. Owner can adjust per-row
        -- via admin UI later if a redeemer never signs up and they
        -- want to recycle the slot. Default is enforced at mint.
        INSERT INTO public.access_codes
          (code, type, tier, owner_user_id, slot, max_uses, is_active, created_by, description)
        VALUES
          (v_slug, 'referral', 'user', p_user_id, v_slot, 1, true, p_user_id,
           'Auto-minted user referral, slot ' || v_slot::text);
        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          IF v_attempt = 5 THEN
            RAISE EXCEPTION 'mint_referral_codes: slug retries exhausted for user %', p_user_id;
          END IF;
      END;
    END LOOP;
  END LOOP;

  RETURN QUERY
    SELECT ac.id, ac.code::text, ac.slot
      FROM public.access_codes ac
     WHERE ac.type = 'referral'
       AND ac.tier = 'user'
       AND ac.owner_user_id = p_user_id
     ORDER BY ac.slot;
END;
$$;

-- B. apply_signup_cohort — stamp verify_locked_at immediately for
--    non-owner-link beta signups. They have an account but lockout
--    allowlist applies until email_verified flips true.
CREATE OR REPLACE FUNCTION public.apply_signup_cohort(
  p_user_id uuid,
  p_via_owner_link boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

  -- Tag immutability — never overwrite an existing cohort tag
  IF v_user.cohort IS NOT NULL THEN
    -- Already tagged. If they verified email AFTER initial tag and the
    -- prior write skipped Pro grant (because !verified and !owner_link),
    -- we should now grant Pro.
    IF v_user.cohort = 'beta'
       AND v_user.plan_id IS NULL
       AND COALESCE(v_user.email_verified, false) = true THEN
      SELECT id INTO v_pro_plan_id FROM public.plans
        WHERE name = 'verity_pro_monthly' LIMIT 1;
      IF v_pro_plan_id IS NOT NULL THEN
        UPDATE public.users
           SET plan_id = v_pro_plan_id,
               plan_status = 'active'
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

  -- Pro grant: only for beta cohort, and only if either via owner link
  -- OR email is already verified. Kids-mode users are tagged but not granted.
  IF v_signup_cohort = 'beta' AND COALESCE(v_user.is_kids_mode_enabled, false) = false THEN
    IF p_via_owner_link OR COALESCE(v_user.email_verified, false) = true THEN
      SELECT id INTO v_pro_plan_id FROM public.plans
        WHERE name = 'verity_pro_monthly' LIMIT 1;
      IF v_pro_plan_id IS NOT NULL THEN
        UPDATE public.users
           SET plan_id = v_pro_plan_id,
               plan_status = 'active'
         WHERE id = p_user_id;
        PERFORM public.bump_user_perms_version(p_user_id);
      END IF;
    ELSE
      -- Closed-beta access gate: unverified non-owner-link beta signups
      -- get an immediate verify-lock. compute_effective_perms strips
      -- them to the appeal/account/login/signup/settings allowlist.
      -- complete_email_verification clears verify_locked_at on email
      -- confirm and grants Pro at that moment.
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

-- Re-apply lockdown (functions have new bodies but same signatures —
-- the existing REVOKE/GRANT carries over, but make explicit for safety).
REVOKE EXECUTE ON FUNCTION public.apply_signup_cohort(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.apply_signup_cohort(uuid, boolean) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mint_referral_codes(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mint_referral_codes(uuid) TO authenticated, service_role;

COMMIT;
