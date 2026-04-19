-- 065_restrict_users_table_privileged_updates_2026_04_19.sql
-- Round 4 Track U migration 1.
--
-- Prevents self-escalation via direct UPDATEs on public.users by authenticated
-- callers. RLS on users_update allows any user to PATCH their own row (id =
-- auth.uid()), and no column-level grants were restricted — so without a
-- trigger guard any user could raise their own plan, verity_score, perms
-- bitmap, etc. via PostgREST.
--
-- Option B: BEFORE UPDATE trigger that RAISES when any of the privileged
-- columns changes and the caller is neither service-role/superuser nor an
-- admin-or-above. NOTE: the trigger function is SECURITY INVOKER (NOT
-- DEFINER) — a SECDEF owned by postgres would switch current_user to
-- 'postgres' inside the function body, matching our whitelist and bypassing
-- the check for every caller. INVOKER preserves current_user.
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS.

CREATE OR REPLACE FUNCTION public.reject_privileged_user_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
BEGIN
  -- Exempt:
  --   1. Service-role / superuser / auth-admin paths.
  --      (In these paths auth.uid() is often NULL; we still whitelist by
  --      current_user as defence in depth.)
  --   2. Authenticated callers with admin-or-higher role.
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

DROP TRIGGER IF EXISTS trg_users_reject_privileged_updates ON public.users;
CREATE TRIGGER trg_users_reject_privileged_updates
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.reject_privileged_user_updates();

REVOKE ALL ON FUNCTION public.reject_privileged_user_updates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_privileged_user_updates()
  TO authenticated, anon, service_role;
