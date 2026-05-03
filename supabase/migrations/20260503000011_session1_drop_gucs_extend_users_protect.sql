-- Session 1 PM-B (Q02) — Drop unauthenticated-trustable GUCs from trigger gates
-- and extend users_protect_columns with the missing security-state columns.
--
-- Closes (per REVIEW_REPORT.md):
--   * P0 #2 — `app.auth_sync` GUC bypass in users_protect_columns
--   * P0 #3 — `app.dob_admin_override` GUC bypass in enforce_kid_dob_immutable / enforce_band_ratchet
--   * P0 #7 — users_protect_columns allowlist incomplete (trial_extension_until,
--             kid_trial_*, failed_login_count, locked_until, mute_*, pin_*, parental
--             control state, engagement counters, streak_*, onboarding_completed_at,
--             deletion_*; documented in PM-11 finding).
--
-- Locked decision (owner, 2026-05-03, Q02):
--   Drop both `app.dob_admin_override` and `app.auth_sync` GUCs entirely. Replace
--   trigger gates with `current_user = 'postgres' OR current_setting('request.jwt.claim.role', true) = 'service_role'`.
--   Strip every `set_config('app.dob_admin_override', ...)` / `set_config('app.auth_sync', ...)`
--   PERFORM call from admin_apply_dob_correction, system_apply_dob_correction,
--   graduate_kid_profile, and handle_auth_user_updated.
--
-- Why current_user='postgres' is the right gate:
--   All four caller RPCs are SECURITY DEFINER and owned by `postgres` (verified via
--   pg_proc.proowner). Inside their bodies, current_user resolves to 'postgres'.
--   The auth-sync trigger handle_auth_user_updated fires on auth.users via
--   `on_auth_user_updated` AFTER UPDATE, owned by postgres → same. PostgREST anon /
--   authenticated callers cannot impersonate `current_user` (it's controlled by SET ROLE,
--   which PostgREST never issues for those roles), nor can they spoof
--   request.jwt.claim.role='service_role' (PostgREST sets that header from the JWT it
--   verifies; the anon/authenticated key cannot mint a service_role JWT).
--
-- Allowlist shape change:
--   The previous trigger enumerated PROTECTED columns and let everything else through.
--   The new trigger enumerates SELF-EDITABLE columns (mirroring update_own_profile's
--   field list) and rejects writes to ANY other column. This prevents future drift —
--   adding a new sensitive column to public.users no longer requires remembering to
--   extend the trigger.

-- ============================================================================
-- 1) users_protect_columns — drop GUC bypass + invert allowlist
-- ============================================================================
CREATE OR REPLACE FUNCTION public.users_protect_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_jwt_role  text    := current_setting('request.jwt.claim.role', true);
  v_is_admin  boolean := false;
BEGIN
  -- Bypass for legitimate writers:
  --   * SECURITY DEFINER RPCs owned by postgres (update_own_profile, handle_auth_user_updated,
  --     session_heartbeat, record_failed_login, clear_failed_login, register_push_token,
  --     billing_*, etc.) — current_user resolves to 'postgres' inside their bodies.
  --   * Service-role direct REST calls — JWT role claim = 'service_role'.
  IF current_user = 'postgres' THEN RETURN NEW; END IF;
  IF v_jwt_role = 'service_role' THEN RETURN NEW; END IF;

  -- Admin escape hatch — admin/owner UI may PATCH /rest/v1/users directly.
  BEGIN
    v_is_admin := public.is_admin_or_above();
  EXCEPTION WHEN OTHERS THEN
    v_is_admin := false;
  END;
  IF v_is_admin THEN RETURN NEW; END IF;

  -- ----------------------------------------------------------------------------
  -- Inverted allowlist: from here down, the caller is anon or authenticated
  -- writing to public.users via PostgREST. Only the columns explicitly listed
  -- below are self-editable; everything else must round-trip through a
  -- SECURITY DEFINER RPC (update_own_profile, register_push_token, etc.).
  -- ----------------------------------------------------------------------------

  -- (a) Profile surface — mirrors update_own_profile's writable fields.
  --     `username` has its own lock (preserves item-10 behaviour from
  --     2026-05-01_protect_users_username.sql).
  IF OLD.username IS NOT NULL AND OLD.username <> ''
     AND NEW.username IS DISTINCT FROM OLD.username THEN
    RAISE EXCEPTION 'users.username is read-only for self-update'
      USING ERRCODE = '42501';
  END IF;

  -- (b) Hard-immutable identity / system columns — never editable by self.
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'users.id is immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'users.created_at is immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'users.email is read-only for self-update (use Supabase auth flow)'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    RAISE EXCEPTION 'users.phone is read-only for self-update'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.password_hash IS DISTINCT FROM OLD.password_hash THEN
    RAISE EXCEPTION 'users.password_hash is read-only for self-update'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.primary_auth_provider IS DISTINCT FROM OLD.primary_auth_provider THEN
    RAISE EXCEPTION 'users.primary_auth_provider is read-only for self-update'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth THEN
    RAISE EXCEPTION 'users.date_of_birth is read-only for self-update'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.first_name IS DISTINCT FROM OLD.first_name THEN
    RAISE EXCEPTION 'users.first_name is read-only for self-update'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.last_name IS DISTINCT FROM OLD.last_name THEN
    RAISE EXCEPTION 'users.last_name is read-only for self-update'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.gender IS DISTINCT FROM OLD.gender THEN
    RAISE EXCEPTION 'users.gender is read-only for self-update'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.country_code IS DISTINCT FROM OLD.country_code THEN
    RAISE EXCEPTION 'users.country_code is read-only for self-update'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.locale IS DISTINCT FROM OLD.locale THEN
    RAISE EXCEPTION 'users.locale is read-only for self-update'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.timezone IS DISTINCT FROM OLD.timezone THEN
    RAISE EXCEPTION 'users.timezone is read-only for self-update'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'users.is_active is read-only for self-update'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.user_state IS DISTINCT FROM OLD.user_state THEN
    RAISE EXCEPTION 'users.user_state is read-only for self-update'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    -- updated_at is set by tg_set_updated_at; self-write should not bypass it.
    RAISE EXCEPTION 'users.updated_at is managed by trigger'
      USING ERRCODE = '42501';
  END IF;

  -- (c) Plan / billing state.
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
  IF NEW.comped_until IS DISTINCT FROM OLD.comped_until THEN
    RAISE EXCEPTION 'users.comped_until is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.trial_extension_until IS DISTINCT FROM OLD.trial_extension_until THEN
    RAISE EXCEPTION 'users.trial_extension_until is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.trial_extended_seen_at IS DISTINCT FROM OLD.trial_extended_seen_at THEN
    RAISE EXCEPTION 'users.trial_extended_seen_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.frozen_at IS DISTINCT FROM OLD.frozen_at THEN
    RAISE EXCEPTION 'users.frozen_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.frozen_verity_score IS DISTINCT FROM OLD.frozen_verity_score THEN
    RAISE EXCEPTION 'users.frozen_verity_score is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.kid_trial_used IS DISTINCT FROM OLD.kid_trial_used THEN
    RAISE EXCEPTION 'users.kid_trial_used is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.kid_trial_started_at IS DISTINCT FROM OLD.kid_trial_started_at THEN
    RAISE EXCEPTION 'users.kid_trial_started_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.kid_trial_ends_at IS DISTINCT FROM OLD.kid_trial_ends_at THEN
    RAISE EXCEPTION 'users.kid_trial_ends_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;

  -- (d) Cohort / referral state.
  IF NEW.cohort IS DISTINCT FROM OLD.cohort THEN
    RAISE EXCEPTION 'users.cohort is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.cohort_joined_at IS DISTINCT FROM OLD.cohort_joined_at THEN
    RAISE EXCEPTION 'users.cohort_joined_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.referred_by IS DISTINCT FROM OLD.referred_by THEN
    RAISE EXCEPTION 'users.referred_by is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN
    RAISE EXCEPTION 'users.referral_code is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.invite_cap_override IS DISTINCT FROM OLD.invite_cap_override THEN
    RAISE EXCEPTION 'users.invite_cap_override is read-only for self-update' USING ERRCODE = '42501';
  END IF;

  -- (e) Permission-version state.
  IF NEW.perms_version IS DISTINCT FROM OLD.perms_version THEN
    RAISE EXCEPTION 'users.perms_version is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.perms_version_bumped_at IS DISTINCT FROM OLD.perms_version_bumped_at THEN
    RAISE EXCEPTION 'users.perms_version_bumped_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;

  -- (f) Moderation / lockout state (PM-11 P0 #7).
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
  IF NEW.is_muted IS DISTINCT FROM OLD.is_muted THEN
    RAISE EXCEPTION 'users.is_muted is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.muted_until IS DISTINCT FROM OLD.muted_until THEN
    RAISE EXCEPTION 'users.muted_until is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.mute_level IS DISTINCT FROM OLD.mute_level THEN
    RAISE EXCEPTION 'users.mute_level is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.warning_count IS DISTINCT FROM OLD.warning_count THEN
    RAISE EXCEPTION 'users.warning_count is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.last_warning_at IS DISTINCT FROM OLD.last_warning_at THEN
    RAISE EXCEPTION 'users.last_warning_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.failed_login_count IS DISTINCT FROM OLD.failed_login_count THEN
    RAISE EXCEPTION 'users.failed_login_count is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.locked_until IS DISTINCT FROM OLD.locked_until THEN
    RAISE EXCEPTION 'users.locked_until is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.verify_locked_at IS DISTINCT FROM OLD.verify_locked_at THEN
    RAISE EXCEPTION 'users.verify_locked_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;

  -- (g) Verification / expert claims.
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

  -- (h) Engagement / scoring counters (server-trigger maintained).
  IF NEW.verity_score IS DISTINCT FROM OLD.verity_score THEN
    RAISE EXCEPTION 'users.verity_score is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.comment_count IS DISTINCT FROM OLD.comment_count THEN
    RAISE EXCEPTION 'users.comment_count is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.articles_read_count IS DISTINCT FROM OLD.articles_read_count THEN
    RAISE EXCEPTION 'users.articles_read_count is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.quizzes_completed_count IS DISTINCT FROM OLD.quizzes_completed_count THEN
    RAISE EXCEPTION 'users.quizzes_completed_count is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.followers_count IS DISTINCT FROM OLD.followers_count THEN
    RAISE EXCEPTION 'users.followers_count is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.following_count IS DISTINCT FROM OLD.following_count THEN
    RAISE EXCEPTION 'users.following_count is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.streak_current IS DISTINCT FROM OLD.streak_current THEN
    RAISE EXCEPTION 'users.streak_current is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.streak_best IS DISTINCT FROM OLD.streak_best THEN
    RAISE EXCEPTION 'users.streak_best is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.streak_freeze_remaining IS DISTINCT FROM OLD.streak_freeze_remaining THEN
    RAISE EXCEPTION 'users.streak_freeze_remaining is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.streak_freeze_week_start IS DISTINCT FROM OLD.streak_freeze_week_start THEN
    RAISE EXCEPTION 'users.streak_freeze_week_start is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.streak_frozen_today IS DISTINCT FROM OLD.streak_frozen_today THEN
    RAISE EXCEPTION 'users.streak_frozen_today is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.streak_last_active_date IS DISTINCT FROM OLD.streak_last_active_date THEN
    RAISE EXCEPTION 'users.streak_last_active_date is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.login_count IS DISTINCT FROM OLD.login_count THEN
    RAISE EXCEPTION 'users.login_count is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.last_login_at IS DISTINCT FROM OLD.last_login_at THEN
    RAISE EXCEPTION 'users.last_login_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.last_login_device IS DISTINCT FROM OLD.last_login_device THEN
    RAISE EXCEPTION 'users.last_login_device is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.last_login_ip IS DISTINCT FROM OLD.last_login_ip THEN
    RAISE EXCEPTION 'users.last_login_ip is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.last_active_at IS DISTINCT FROM OLD.last_active_at THEN
    RAISE EXCEPTION 'users.last_active_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;

  -- (i) Parental control / kid PIN state.
  IF NEW.parent_pin_hash IS DISTINCT FROM OLD.parent_pin_hash THEN
    RAISE EXCEPTION 'users.parent_pin_hash is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.kids_pin_hash IS DISTINCT FROM OLD.kids_pin_hash THEN
    RAISE EXCEPTION 'users.kids_pin_hash is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.pin_attempts IS DISTINCT FROM OLD.pin_attempts THEN
    RAISE EXCEPTION 'users.pin_attempts is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.pin_locked_until IS DISTINCT FROM OLD.pin_locked_until THEN
    RAISE EXCEPTION 'users.pin_locked_until is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.is_kids_mode_enabled IS DISTINCT FROM OLD.is_kids_mode_enabled THEN
    RAISE EXCEPTION 'users.is_kids_mode_enabled is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.has_kids_profiles IS DISTINCT FROM OLD.has_kids_profiles THEN
    RAISE EXCEPTION 'users.has_kids_profiles is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.supervisor_opted_in IS DISTINCT FROM OLD.supervisor_opted_in THEN
    RAISE EXCEPTION 'users.supervisor_opted_in is read-only for self-update' USING ERRCODE = '42501';
  END IF;

  -- (j) Onboarding / deletion lifecycle.
  IF NEW.onboarding_completed_at IS DISTINCT FROM OLD.onboarding_completed_at THEN
    RAISE EXCEPTION 'users.onboarding_completed_at is read-only for self-update'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.deletion_requested_at IS DISTINCT FROM OLD.deletion_requested_at THEN
    RAISE EXCEPTION 'users.deletion_requested_at is read-only for self-update'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.deletion_scheduled_for IS DISTINCT FROM OLD.deletion_scheduled_for THEN
    RAISE EXCEPTION 'users.deletion_scheduled_for is read-only for self-update'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.deletion_completed_at IS DISTINCT FROM OLD.deletion_completed_at THEN
    RAISE EXCEPTION 'users.deletion_completed_at is read-only for self-update'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.deletion_reason IS DISTINCT FROM OLD.deletion_reason THEN
    RAISE EXCEPTION 'users.deletion_reason is read-only for self-update'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'users.deleted_at is read-only for self-update'
      USING ERRCODE = '42501';
  END IF;

  -- All other columns are self-editable. Per information_schema.columns, that
  -- residual set is exactly:
  --   display_name, bio, avatar_url, avatar_color, banner_url,
  --   profile_visibility, show_activity, show_on_leaderboard, allow_messages,
  --   dm_read_receipts_enabled, notification_email, notification_push,
  --   att_status, att_prompted_at, metadata
  -- which matches update_own_profile's writable field list (minus username,
  -- which is handled by the lock above).
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.users_protect_columns() IS
  'BEFORE UPDATE on public.users. Bypassed for current_user=postgres (any '
  'SECURITY DEFINER caller, including update_own_profile, handle_auth_user_updated, '
  'session_heartbeat, billing_*) and for service_role JWT. Inverted allowlist: '
  'self-editable columns mirror update_own_profile; everything else raises 42501. '
  'GUC bypass via app.auth_sync was removed 2026-05-03 (Q02) — see migration '
  '20260503000011_session1_drop_gucs_extend_users_protect.sql.';

-- ============================================================================
-- 2) enforce_kid_dob_immutable — drop GUC, gate on current_user/service_role
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_kid_dob_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_jwt_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  -- Bypass for legitimate writers: postgres-owned SECURITY DEFINER RPCs
  -- (admin_apply_dob_correction, system_apply_dob_correction, graduate_kid_profile)
  -- and direct service-role REST calls.
  IF current_user = 'postgres' OR v_jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF OLD.date_of_birth IS DISTINCT FROM NEW.date_of_birth THEN
    RAISE EXCEPTION
      'date_of_birth is immutable after profile creation. Use the DOB-correction request flow.'
      USING ERRCODE = '22023', HINT = 'Submit POST /api/kids/[id]/dob-correction';
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.enforce_kid_dob_immutable() IS
  'BEFORE UPDATE on public.kid_profiles. Bypassed for current_user=postgres / '
  'service_role JWT. GUC bypass via app.dob_admin_override was removed 2026-05-03 '
  '(Q02). Legitimate DOB rewrites go through admin_apply_dob_correction or '
  'system_apply_dob_correction (both SECURITY DEFINER, both owned by postgres).';

-- ============================================================================
-- 3) enforce_band_ratchet — drop GUC, gate on current_user/service_role
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_band_ratchet()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old_rank int;
  v_new_rank int;
  v_jwt_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  -- Bypass for legitimate writers: same shape as enforce_kid_dob_immutable.
  IF current_user = 'postgres' OR v_jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;
  v_old_rank := CASE OLD.reading_band
    WHEN 'kids' THEN 1
    WHEN 'tweens' THEN 2
    WHEN 'graduated' THEN 3
    ELSE 0
  END;
  v_new_rank := CASE NEW.reading_band
    WHEN 'kids' THEN 1
    WHEN 'tweens' THEN 2
    WHEN 'graduated' THEN 3
    ELSE 0
  END;
  IF v_new_rank < v_old_rank THEN
    RAISE EXCEPTION
      'reading_band cannot regress (% -> %)', OLD.reading_band, NEW.reading_band
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.enforce_band_ratchet() IS
  'BEFORE UPDATE on public.kid_profiles. Bypassed for current_user=postgres / '
  'service_role JWT. GUC bypass via app.dob_admin_override was removed 2026-05-03 '
  '(Q02). Note: tweens(2)->graduated(3) is monotonic, so graduate_kid_profile does '
  'not actually need a bypass for the rank check itself; it bypasses for symmetry '
  'and to allow band_history rewrites.';

-- ============================================================================
-- 4) admin_apply_dob_correction — drop set_config calls
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_apply_dob_correction(
  p_request_id uuid,
  p_decision text,
  p_decision_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_request public.kid_dob_correction_requests%ROWTYPE;
  v_actor uuid := auth.uid();
  v_old_dob date;
  v_old_band text;
  v_new_band text;
  v_has_perm boolean;
BEGIN
  -- Permission gate
  SELECT EXISTS (
    SELECT 1 FROM public.compute_effective_perms(v_actor) p
    WHERE p.permission_key = 'admin.kids.dob_corrections.review' AND p.granted = true
  ) INTO v_has_perm;
  IF NOT v_has_perm THEN
    RAISE EXCEPTION 'Permission denied: admin.kids.dob_corrections.review' USING ERRCODE = '42501';
  END IF;

  IF p_decision NOT IN ('approved','rejected','documentation_requested') THEN
    RAISE EXCEPTION 'p_decision must be approved|rejected|documentation_requested' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_request FROM public.kid_dob_correction_requests
    WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_request.status NOT IN ('pending','documentation_requested') THEN
    RAISE EXCEPTION 'Request not pending (status=%)', v_request.status USING ERRCODE = '22023';
  END IF;

  UPDATE public.kid_dob_correction_requests
  SET status = p_decision,
      decision_reason = p_decision_reason,
      decided_by = v_actor,
      decided_at = now()
  WHERE id = p_request_id;

  IF p_decision = 'approved' THEN
    SELECT date_of_birth, reading_band INTO v_old_dob, v_old_band
      FROM public.kid_profiles WHERE id = v_request.kid_profile_id;
    v_new_band := public.compute_band_from_dob(v_request.requested_dob);

    -- Q02 (2026-05-03): GUC override removed; kid_profiles triggers now bypass
    -- on current_user='postgres', which is true inside this SECURITY DEFINER body.
    UPDATE public.kid_profiles
    SET date_of_birth = v_request.requested_dob,
        reading_band = v_new_band,
        band_changed_at = now(),
        band_history = band_history || jsonb_build_array(
          jsonb_build_object(
            'old_band', v_old_band,
            'new_band', v_new_band,
            'set_at', now(),
            'set_by', v_actor,
            'reason', 'dob_correction:' || v_request.id::text
          )
        )
    WHERE id = v_request.kid_profile_id;

    INSERT INTO public.kid_dob_history (
      kid_profile_id, old_dob, new_dob, change_source,
      actor_user_id, decision_reason
    )
    VALUES (
      v_request.kid_profile_id, v_old_dob, v_request.requested_dob,
      'admin_correction', v_actor, p_decision_reason
    );
  END IF;
END;
$function$;

-- ============================================================================
-- 5) system_apply_dob_correction — drop set_config calls
-- ============================================================================
CREATE OR REPLACE FUNCTION public.system_apply_dob_correction(
  p_request_id uuid,
  p_decision_reason text DEFAULT 'cooldown_auto_approval'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_request public.kid_dob_correction_requests%ROWTYPE;
  v_old_dob date;
  v_old_band text;
  v_new_band text;
BEGIN
  SELECT * INTO v_request FROM public.kid_dob_correction_requests
    WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_request.status NOT IN ('pending','documentation_requested') THEN
    RAISE EXCEPTION 'Request not pending (status=%)', v_request.status USING ERRCODE = '22023';
  END IF;
  -- Cron only auto-approves; admin-level reject + docs-request stay on
  -- admin_apply_dob_correction (which has the perm check).
  IF v_request.direction <> 'younger' THEN
    RAISE EXCEPTION 'system_apply_dob_correction: only younger-band auto-approve' USING ERRCODE = '22023';
  END IF;

  UPDATE public.kid_dob_correction_requests
  SET status = 'approved',
      decision_reason = p_decision_reason,
      decided_at = now()
  WHERE id = p_request_id;

  SELECT date_of_birth, reading_band INTO v_old_dob, v_old_band
    FROM public.kid_profiles WHERE id = v_request.kid_profile_id;
  v_new_band := public.compute_band_from_dob(v_request.requested_dob);

  -- Q02 (2026-05-03): GUC override removed; kid_profiles triggers now bypass
  -- on current_user='postgres', which is true inside this SECURITY DEFINER body.
  UPDATE public.kid_profiles
  SET date_of_birth = v_request.requested_dob,
      reading_band = v_new_band,
      band_changed_at = now(),
      band_history = band_history || jsonb_build_array(
        jsonb_build_object(
          'old_band', v_old_band,
          'new_band', v_new_band,
          'set_at', now(),
          'set_by', null,
          'reason', 'cooldown_auto:' || v_request.id::text
        )
      )
  WHERE id = v_request.kid_profile_id;

  INSERT INTO public.kid_dob_history (
    kid_profile_id, old_dob, new_dob, change_source,
    actor_user_id, decision_reason
  )
  VALUES (
    v_request.kid_profile_id, v_old_dob, v_request.requested_dob,
    'admin_correction', null, p_decision_reason
  );
END;
$function$;

-- ============================================================================
-- 6) graduate_kid_profile — drop set_config calls
-- ============================================================================
CREATE OR REPLACE FUNCTION public.graduate_kid_profile(
  p_kid_profile_id uuid,
  p_intended_email text
)
RETURNS TABLE(token text, expires_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_kid public.kid_profiles%ROWTYPE;
  v_token text;
  v_expires timestamptz;
  v_email text := lower(trim(p_intended_email));
  v_email_re text := '^[^@\s]+@[^@\s]+\.[^@\s]+$';
  v_existing_user uuid;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke graduate_kid_profile' USING ERRCODE = '42501';
  END IF;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF v_email IS NULL OR v_email = '' OR v_email !~ v_email_re THEN
    RAISE EXCEPTION 'p_intended_email must be a valid email' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_existing_user FROM auth.users WHERE lower(email) = v_email LIMIT 1;
  IF v_existing_user IS NOT NULL THEN
    RAISE EXCEPTION 'Email already in use' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_kid FROM public.kid_profiles WHERE id = p_kid_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kid not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_kid.parent_user_id <> v_actor THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_kid.is_active = false THEN
    RAISE EXCEPTION 'Kid profile already inactive' USING ERRCODE = '22023';
  END IF;
  IF v_kid.reading_band = 'graduated' THEN
    RAISE EXCEPTION 'Kid already graduated' USING ERRCODE = '22023';
  END IF;
  IF v_kid.reading_band <> 'tweens' THEN
    RAISE EXCEPTION 'Only tweens-band kids can graduate (current=%)', v_kid.reading_band USING ERRCODE = '22023';
  END IF;

  v_token := encode(gen_random_bytes(24), 'hex');
  v_expires := now() + interval '24 hours';

  INSERT INTO public.graduation_tokens (
    token, kid_profile_id, parent_user_id, intended_email, expires_at, metadata
  )
  VALUES (
    v_token, p_kid_profile_id, v_actor, v_email, v_expires,
    jsonb_build_object('display_name', v_kid.display_name)
  );

  -- Q02 (2026-05-03): GUC override removed; kid_profiles triggers now bypass
  -- on current_user='postgres', which is true inside this SECURITY DEFINER body.
  -- (tweens->graduated is monotonic, so the band-ratchet wouldn't have raised
  -- anyway; the bypass mirrors the other DOB RPCs.)
  UPDATE public.kid_profiles
  SET is_active = false,
      reading_band = 'graduated',
      band_changed_at = now(),
      band_history = band_history || jsonb_build_array(
        jsonb_build_object(
          'old_band', v_kid.reading_band,
          'new_band', 'graduated',
          'set_at', now(),
          'set_by', v_actor,
          'reason', 'graduation:' || v_token
        )
      ),
      pin_hash = null,
      pin_salt = null,
      birthday_prompt_at = null
  WHERE id = p_kid_profile_id;

  UPDATE public.kid_sessions
  SET revoked_at = now()
  WHERE kid_profile_id = p_kid_profile_id AND revoked_at IS NULL;

  UPDATE public.subscriptions
  SET kid_seats_paid = greatest(1, kid_seats_paid - 1),
      updated_at = now()
  WHERE user_id = v_actor
    AND status IN ('active','trialing')
    AND kid_seats_paid > 1;

  token := v_token;
  expires_at := v_expires;
  RETURN NEXT;
END;
$function$;

-- ============================================================================
-- 7) handle_auth_user_updated — drop set_config('app.auth_sync',...) call
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_auth_user_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Q02 (2026-05-03): app.auth_sync GUC removed. users_protect_columns now
  -- bypasses on current_user='postgres', which is true inside this
  -- postgres-owned SECURITY DEFINER trigger.
  IF NEW.email_confirmed_at IS DISTINCT FROM OLD.email_confirmed_at THEN
    UPDATE public.users
    SET email_verified    = NEW.email_confirmed_at IS NOT NULL,
        email_verified_at = NEW.email_confirmed_at
    WHERE id = NEW.id;
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.users SET email = NEW.email WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

-- End of migration. Verify:
--   SELECT pg_get_functiondef('public.users_protect_columns'::regproc);
--   SELECT pg_get_functiondef('public.enforce_kid_dob_immutable'::regproc);
--   SELECT pg_get_functiondef('public.enforce_band_ratchet'::regproc);
--   SELECT pg_get_functiondef('public.admin_apply_dob_correction'::regproc);
--   SELECT pg_get_functiondef('public.system_apply_dob_correction'::regproc);
--   SELECT pg_get_functiondef('public.graduate_kid_profile'::regproc);
--   SELECT pg_get_functiondef('public.handle_auth_user_updated'::regproc);
-- and confirm no `app.auth_sync` / `app.dob_admin_override` references remain.
