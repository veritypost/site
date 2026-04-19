-- 082_restrict_users_table_privileged_updates_v2_2026_04_19.sql
-- Migration: 20260419113041 restrict_users_table_privileged_updates_v2_2026_04_19
--
-- Corrected: trigger function must NOT be SECURITY DEFINER. Inside a
-- SECDEF owned by postgres, current_user becomes 'postgres', defeating
-- the whitelist. INVOKER here means current_user reflects the actual
-- caller role (authenticated, anon, service_role, postgres, etc).
-- Helper calls (auth.uid(), is_admin_or_above()) are themselves SECDEF
-- where needed and work from INVOKER context.

CREATE OR REPLACE FUNCTION public.reject_privileged_user_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF auth.uid() IS NULL
     OR current_user IN ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin')
     OR public.is_admin_or_above() THEN
    RETURN NEW;
  END IF;

  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id
     OR NEW.plan_status IS DISTINCT FROM OLD.plan_status
     OR NEW.is_expert IS DISTINCT FROM OLD.is_expert
     OR NEW.is_verified_public_figure IS DISTINCT FROM OLD.is_verified_public_figure
     OR NEW.is_banned IS DISTINCT FROM OLD.is_banned
     OR NEW.is_shadow_banned IS DISTINCT FROM OLD.is_shadow_banned
     OR NEW.verity_score IS DISTINCT FROM OLD.verity_score
     OR NEW.warning_count IS DISTINCT FROM OLD.warning_count
     OR NEW.perms_version IS DISTINCT FROM OLD.perms_version
     OR NEW.ban_reason IS DISTINCT FROM OLD.ban_reason
     OR NEW.banned_at IS DISTINCT FROM OLD.banned_at
     OR NEW.banned_by IS DISTINCT FROM OLD.banned_by
     OR NEW.muted_until IS DISTINCT FROM OLD.muted_until
     OR NEW.mute_level IS DISTINCT FROM OLD.mute_level
     OR NEW.frozen_at IS DISTINCT FROM OLD.frozen_at
     OR NEW.frozen_verity_score IS DISTINCT FROM OLD.frozen_verity_score
     OR NEW.plan_grace_period_ends_at IS DISTINCT FROM OLD.plan_grace_period_ends_at
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.deletion_scheduled_for IS DISTINCT FROM OLD.deletion_scheduled_for
     OR NEW.deletion_completed_at IS DISTINCT FROM OLD.deletion_completed_at
     OR NEW.streak_best IS DISTINCT FROM OLD.streak_best THEN
    RAISE EXCEPTION 'privileged column update denied for user %', auth.uid()
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$fn$;

-- Ensure grants: trigger function runs in invoker's context; authenticated
-- must be able to invoke it (it's attached to an UPDATE trigger they fire).
REVOKE ALL ON FUNCTION public.reject_privileged_user_updates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_privileged_user_updates() TO authenticated, anon, service_role;
