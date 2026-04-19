-- 084_restrict_users_table_privileged_inserts_v2_2026_04_19.sql
-- Migration: 20260419115149 restrict_users_table_privileged_inserts_v2_2026_04_19
--
-- v2 fix: allow column defaults on INSERT (perms_version=1, plan_status='free')
-- so a clean non-admin INSERT of id/email/username still passes.

CREATE OR REPLACE FUNCTION public.reject_privileged_user_updates() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER AS $fn$
BEGIN
  IF auth.uid() IS NULL
     OR current_user IN ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin')
     OR public.is_admin_or_above() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_expert, false) IS TRUE
       OR COALESCE(NEW.is_verified_public_figure, false) IS TRUE
       OR COALESCE(NEW.is_banned, false) IS TRUE
       OR COALESCE(NEW.is_shadow_banned, false) IS TRUE
       OR COALESCE(NEW.is_active, true) IS FALSE
       OR NEW.plan_id IS NOT NULL
       OR COALESCE(NEW.plan_status, 'free') <> 'free'
       OR COALESCE(NEW.verity_score, 0) <> 0
       OR COALESCE(NEW.warning_count, 0) <> 0
       OR COALESCE(NEW.perms_version, 1) <> 1
       OR NEW.ban_reason IS NOT NULL
       OR NEW.banned_at IS NOT NULL
       OR NEW.banned_by IS NOT NULL
       OR NEW.muted_until IS NOT NULL
       OR COALESCE(NEW.mute_level, 0) <> 0
       OR NEW.frozen_at IS NOT NULL
       OR NEW.frozen_verity_score IS NOT NULL
       OR NEW.plan_grace_period_ends_at IS NOT NULL
       OR NEW.stripe_customer_id IS NOT NULL
       OR NEW.deletion_scheduled_for IS NOT NULL
       OR NEW.deletion_completed_at IS NOT NULL
       OR COALESCE(NEW.streak_best, 0) <> 0 THEN
      RAISE EXCEPTION 'privileged column value on insert denied for user %', auth.uid()
        USING ERRCODE = '42501';
    END IF;
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
