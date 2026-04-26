-- 092_rls_lockdown_2026_04_19.sql
-- Migration: 20260419194732 092_rls_lockdown_2026_04_19
--
-- Round A — RLS-layer lockdown (C-03, C-05, C-06, H-07, H-20, M-16, N-01, N-02)
-- Reconstructed 2026-04-26 from supabase_migrations.schema_migrations.statements column.
-- No DB change applied by this file — prod already matches it.

-- 1) C-03  public.users PII lockdown

CREATE OR REPLACE VIEW public.public_user_profiles
WITH (security_invoker = true) AS
SELECT
  id,
  display_name,
  username,
  avatar_url,
  avatar_color,
  banner_url,
  bio,
  verity_score,
  streak_current,
  is_expert,
  expert_title,
  expert_organization,
  is_verified_public_figure,
  created_at,
  profile_visibility
FROM public.users
WHERE profile_visibility = 'public'
  AND COALESCE(is_banned, false) = false
  AND deleted_at IS NULL;

COMMENT ON VIEW public.public_user_profiles IS
  'C-03 / Round A: whitelisted public columns (owner resolution #1). SECURITY INVOKER respects RLS on public.users.';

REVOKE SELECT (
  email, phone, date_of_birth, first_name, last_name, country_code, gender,
  locale, timezone, stripe_customer_id, parent_pin_hash, kids_pin_hash,
  password_hash, last_login_ip, last_login_device, last_login_at, login_count,
  failed_login_count, locked_until, pin_attempts, pin_locked_until,
  primary_auth_provider, referral_code, referred_by, notification_email,
  notification_push, email_verified_at, phone_verified_at, metadata,
  deletion_requested_at, deletion_scheduled_for, deletion_completed_at,
  deletion_reason, frozen_at, frozen_verity_score, kid_trial_started_at,
  kid_trial_ends_at, kid_trial_used, ban_reason, banned_at, banned_by,
  plan_id, plan_status, plan_grace_period_ends_at, onboarding_completed_at,
  perms_version, perms_version_bumped_at, warning_count, last_warning_at,
  att_prompted_at, att_status, supervisor_opted_in, has_kids_profiles,
  is_kids_mode_enabled, allow_messages, dm_read_receipts_enabled,
  show_activity, show_on_leaderboard, is_muted, is_shadow_banned,
  mute_level, muted_until, streak_freeze_remaining, streak_freeze_week_start,
  streak_frozen_today, streak_last_active_date, deleted_at, is_active
) ON public.users FROM anon;

GRANT SELECT ON public.public_user_profiles TO anon, authenticated;

ALTER TABLE public.users ALTER COLUMN profile_visibility SET DEFAULT 'private';

UPDATE public.users
SET profile_visibility = 'private'
WHERE profile_visibility = 'public'
  AND id NOT IN (
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE r.name IN (
      'owner','superadmin','admin','editor','expert','moderator','journalist','educator'
    )
  );

-- 2) C-05
REVOKE INSERT, UPDATE, DELETE ON public.user_roles             FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_permission_sets   FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.roles                  FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.permissions            FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.permission_sets        FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.plans                  FROM authenticated;

-- 3) C-06
REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM authenticated;

DROP POLICY IF EXISTS audit_log_insert ON public.audit_log;
CREATE POLICY audit_log_insert ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- 4) H-07
REVOKE EXECUTE ON FUNCTION public.is_admin_or_above()     FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_editor_or_above()    FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_mod_or_above()       FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_paid_user()          FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_premium()            FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_has_role(text)     FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(p_key text, p_as_kid uuid, p_kid_token text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_permission_for(p_key text, p_scope_type text, p_scope_id uuid, p_as_kid uuid, p_kid_token text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.my_permission_keys(p_as_kid uuid, p_kid_token text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_capabilities(p_section text, p_as_kid uuid, p_kid_token text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_verified_email()    FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_banned()             FROM anon;

GRANT EXECUTE ON FUNCTION public.is_admin_or_above()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_editor_or_above()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_mod_or_above()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_paid_user()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_premium()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_role(text)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(p_key text, p_as_kid uuid, p_kid_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission_for(p_key text, p_scope_type text, p_scope_id uuid, p_as_kid uuid, p_kid_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_permission_keys(p_as_kid uuid, p_kid_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_capabilities(p_section text, p_as_kid uuid, p_kid_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_verified_email()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_banned()             TO authenticated;

-- 5) H-20
ALTER TABLE public.perms_global_version ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.perms_global_version FROM authenticated;

-- 6) M-16
REVOKE INSERT, UPDATE, DELETE ON public.webhook_log FROM authenticated;

DROP POLICY IF EXISTS webhook_log_insert ON public.webhook_log;
CREATE POLICY webhook_log_insert ON public.webhook_log
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- 7) N-01

CREATE POLICY bookmark_collections_select_own ON public.bookmark_collections
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.bookmark_collections FROM authenticated;

CREATE POLICY user_warnings_select_own_or_mod ON public.user_warnings
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_mod_or_above());
REVOKE INSERT, UPDATE, DELETE ON public.user_warnings FROM authenticated;

CREATE POLICY weekly_recap_attempts_select_own ON public.weekly_recap_attempts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY weekly_recap_attempts_insert_own ON public.weekly_recap_attempts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
REVOKE UPDATE, DELETE ON public.weekly_recap_attempts FROM authenticated;

CREATE POLICY family_achievement_progress_select_owner ON public.family_achievement_progress
  FOR SELECT TO authenticated
  USING (family_owner_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.family_achievement_progress FROM authenticated;

CREATE POLICY comment_context_tags_select_own ON public.comment_context_tags
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY comment_context_tags_insert_own ON public.comment_context_tags
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY comment_context_tags_delete_own ON public.comment_context_tags
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
REVOKE UPDATE ON public.comment_context_tags FROM authenticated;

CREATE POLICY category_supervisors_select_own_or_mod ON public.category_supervisors
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_mod_or_above());
REVOKE INSERT, UPDATE, DELETE ON public.category_supervisors FROM authenticated;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.behavioral_anomalies FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.expert_queue_items FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.family_achievements FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.sponsored_quizzes FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.weekly_recap_questions FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.weekly_recap_quizzes FROM authenticated, anon;

-- 8) N-02
REVOKE INSERT (parent_pin_hash), UPDATE (parent_pin_hash) ON public.users FROM authenticated;
REVOKE INSERT (kids_pin_hash), UPDATE (kids_pin_hash) ON public.users FROM authenticated;
REVOKE INSERT (failed_login_count), UPDATE (failed_login_count) ON public.users FROM authenticated;
REVOKE INSERT (locked_until), UPDATE (locked_until) ON public.users FROM authenticated;
REVOKE INSERT (last_login_ip), UPDATE (last_login_ip) ON public.users FROM authenticated;

CREATE OR REPLACE FUNCTION public.reject_privileged_user_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
       OR COALESCE(NEW.streak_best, 0) <> 0
       OR NEW.parent_pin_hash IS NOT NULL
       OR NEW.kids_pin_hash IS NOT NULL
       OR COALESCE(NEW.failed_login_count, 0) <> 0
       OR NEW.locked_until IS NOT NULL
       OR NEW.last_login_ip IS NOT NULL
    THEN
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
     OR NEW.streak_best IS DISTINCT FROM OLD.streak_best
     OR NEW.parent_pin_hash IS DISTINCT FROM OLD.parent_pin_hash
     OR NEW.kids_pin_hash IS DISTINCT FROM OLD.kids_pin_hash
     OR NEW.failed_login_count IS DISTINCT FROM OLD.failed_login_count
     OR NEW.locked_until IS DISTINCT FROM OLD.locked_until
     OR NEW.last_login_ip IS DISTINCT FROM OLD.last_login_ip
  THEN
    RAISE EXCEPTION 'privileged column update denied for user %', auth.uid()
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
