-- 2026-04-28 — auth-sync trigger bypass for users_protect_columns.
--
-- Bug: signup via signInWithOtp fails with
--   ERROR: users.email_verified is read-only for self-update (SQLSTATE 42501)
--   500: Database error updating user
-- because handle_auth_user_updated (AFTER UPDATE on auth.users) propagates
-- email_verified to public.users while the JWT role is still 'anon' /
-- 'authenticated' (SECURITY DEFINER preserves the original role context).
-- users_protect_columns then rejects the legitimate auth-sync write.
--
-- Fix: a transaction-local GUC `app.auth_sync = 'true'` set inside the
-- auth-sync trigger and read by the protect-columns trigger as a bypass
-- signal. is_local := true scopes it to the current transaction so it
-- can't leak across requests.

CREATE OR REPLACE FUNCTION public.handle_auth_user_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('app.auth_sync', 'true', true);

  IF NEW.email_confirmed_at IS DISTINCT FROM OLD.email_confirmed_at THEN
    UPDATE public.users
    SET email_verified = NEW.email_confirmed_at IS NOT NULL,
        email_verified_at = NEW.email_confirmed_at
    WHERE id = NEW.id;
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.users SET email = NEW.email WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.users_protect_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_is_admin boolean := false;
  v_auth_sync text := current_setting('app.auth_sync', true);
BEGIN
  IF v_auth_sync = 'true' THEN
    RETURN NEW;
  END IF;

  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_is_admin := public.is_admin_or_above();
  EXCEPTION WHEN OTHERS THEN
    v_is_admin := false;
  END;
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  IF NEW.cohort IS DISTINCT FROM OLD.cohort THEN
    RAISE EXCEPTION 'users.cohort is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.cohort_joined_at IS DISTINCT FROM OLD.cohort_joined_at THEN
    RAISE EXCEPTION 'users.cohort_joined_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.comped_until IS DISTINCT FROM OLD.comped_until THEN
    RAISE EXCEPTION 'users.comped_until is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.verify_locked_at IS DISTINCT FROM OLD.verify_locked_at THEN
    RAISE EXCEPTION 'users.verify_locked_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;

  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN
    RAISE EXCEPTION 'users.plan_id is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.plan_status IS DISTINCT FROM OLD.plan_status THEN
    RAISE EXCEPTION 'users.plan_status is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.plan_grace_period_ends_at IS DISTINCT FROM OLD.plan_grace_period_ends_at THEN
    RAISE EXCEPTION 'users.plan_grace_period_ends_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN
    RAISE EXCEPTION 'users.stripe_customer_id is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.frozen_at IS DISTINCT FROM OLD.frozen_at THEN
    RAISE EXCEPTION 'users.frozen_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.frozen_verity_score IS DISTINCT FROM OLD.frozen_verity_score THEN
    RAISE EXCEPTION 'users.frozen_verity_score is read-only for self-update' USING ERRCODE = '42501';
  END IF;

  IF NEW.perms_version IS DISTINCT FROM OLD.perms_version THEN
    RAISE EXCEPTION 'users.perms_version is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.perms_version_bumped_at IS DISTINCT FROM OLD.perms_version_bumped_at THEN
    RAISE EXCEPTION 'users.perms_version_bumped_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;

  IF NEW.referred_by IS DISTINCT FROM OLD.referred_by THEN
    RAISE EXCEPTION 'users.referred_by is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN
    RAISE EXCEPTION 'users.referral_code is read-only for self-update' USING ERRCODE = '42501';
  END IF;

  IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
    RAISE EXCEPTION 'users.is_banned is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.is_shadow_banned IS DISTINCT FROM OLD.is_shadow_banned THEN
    RAISE EXCEPTION 'users.is_shadow_banned is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.ban_reason IS DISTINCT FROM OLD.ban_reason THEN
    RAISE EXCEPTION 'users.ban_reason is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.banned_at IS DISTINCT FROM OLD.banned_at THEN
    RAISE EXCEPTION 'users.banned_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.banned_by IS DISTINCT FROM OLD.banned_by THEN
    RAISE EXCEPTION 'users.banned_by is read-only for self-update' USING ERRCODE = '42501';
  END IF;

  IF NEW.email_verified IS DISTINCT FROM OLD.email_verified THEN
    RAISE EXCEPTION 'users.email_verified is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.email_verified_at IS DISTINCT FROM OLD.email_verified_at THEN
    RAISE EXCEPTION 'users.email_verified_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.phone_verified IS DISTINCT FROM OLD.phone_verified THEN
    RAISE EXCEPTION 'users.phone_verified is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at THEN
    RAISE EXCEPTION 'users.phone_verified_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.is_expert IS DISTINCT FROM OLD.is_expert THEN
    RAISE EXCEPTION 'users.is_expert is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.is_verified_public_figure IS DISTINCT FROM OLD.is_verified_public_figure THEN
    RAISE EXCEPTION 'users.is_verified_public_figure is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.expert_title IS DISTINCT FROM OLD.expert_title THEN
    RAISE EXCEPTION 'users.expert_title is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.expert_organization IS DISTINCT FROM OLD.expert_organization THEN
    RAISE EXCEPTION 'users.expert_organization is read-only for self-update' USING ERRCODE = '42501';
  END IF;

  IF NEW.verity_score IS DISTINCT FROM OLD.verity_score THEN
    RAISE EXCEPTION 'users.verity_score is read-only for self-update' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;
