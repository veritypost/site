-- Session 1b — adversary follow-ups (post-PM-A/B/C/D).
--
-- Closes three holes the post-impl adversary surfaced:
--
--   1. kid_profiles INSERT bypass (P0 #13).
--      kid_profiles_protect_columns_trg is BEFORE UPDATE only. Parents can
--      INSERT a row with verity_score=99999, coppa_consent_given=true,
--      reading_band='graduated', forged band_history, etc. and skip every
--      protection. Fix: extend kid_profiles_protect_columns to handle
--      TG_OP='INSERT' by FORCING protected columns to their server-managed
--      defaults for non-privileged callers (parent calling PostgREST
--      directly). Service-role / postgres / admin paths still bypass.
--
--   2. kid_profiles.metadata jsonb escape hatch (P0 #12, partial).
--      metadata is freeform jsonb. Today only a stale comment references
--      `metadata.coppa_consent` (web/src/lib/coppaConsent.js:1) — no live
--      writer or reader — but the surface is a future-bug magnet for any
--      entitlement key (e.g. enforce_max_kids reads users.metadata->>'max_kids'
--      and that exact pattern would be exploitable here on first introduction).
--      Lock parent edits: deny on UPDATE, force '{}'::jsonb on parent INSERT.
--      reading_level is intentionally left parent-editable: it's admin-display
--      only (web/src/app/admin/users/[id]/page.tsx:350) and being deprecated
--      in favor of reading_band per VerityPost/VerityPost/FamilyViews.swift:1127.
--      Session 6 will retire reading_level entirely.
--
--   3. users INSERT denylist incomplete (P1).
--      trg_users_reject_privileged_updates is BEFORE INSERT OR UPDATE and
--      blocks a subset on INSERT, but ~30 columns the new users_protect_columns
--      denies on UPDATE are not on the INSERT side: trial_*, kid_trial_*,
--      cohort/referral, streak_*, login_*, comment/article/quiz counts,
--      pin_attempts/pin_locked_until, is_kids_mode_enabled, deletion_*, and
--      verification timestamps (email_verified_at, etc.). A signup payload
--      claiming any of these gets through. Fix: mirror the full users_protect
--      denylist into the INSERT branch.
--
-- All three changes preserve service_role / postgres / admin bypass paths.

------------------------------------------------------------------------------
-- 1 + 2 — kid_profiles_protect_columns: add INSERT branch + metadata lock.
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.kid_profiles_protect_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF current_user = 'postgres' OR v_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Parent direct-PostgREST INSERT path.
    -- COPPA evidentiary fields: parent cannot claim consent at create-time
    -- via direct INSERT. The legitimate path goes through start_kid_trial /
    -- a kid-creation RPC owned by postgres which bypasses this trigger.
    NEW.coppa_consent_given := false;
    NEW.coppa_consent_at := NULL;
    NEW.reconsent_required_at := NULL;
    NEW.reconsented_at := NULL;

    -- Score / progress counters: server-incremented only.
    NEW.verity_score := 0;
    NEW.articles_read_count := 0;
    NEW.quizzes_completed_count := 0;

    -- Streak counters.
    NEW.streak_current := 0;
    NEW.streak_best := 0;
    NEW.streak_last_active_date := NULL;
    NEW.streak_freeze_remaining := 0;
    NEW.streak_freeze_week_start := NULL;

    -- PIN lockout state (parent rotates pin_hash itself; lockout is server-managed).
    NEW.pin_attempts := 0;
    NEW.pin_locked_until := NULL;

    -- Reading band defaults to 'kids'; band_history starts empty;
    -- band_changed_at clamped to now() so a parent can't backdate.
    NEW.reading_band := 'kids';
    NEW.band_history := '[]'::jsonb;
    NEW.band_changed_at := now();

    -- System-driven prompts.
    NEW.birthday_prompt_at := NULL;

    -- Metadata escape hatch — force empty jsonb. Future entitlement keys
    -- inside metadata cannot be smuggled in at create-time.
    NEW.metadata := '{}'::jsonb;

    -- created_at / updated_at clamped to now().
    NEW.created_at := now();
    NEW.updated_at := now();

    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE' path (unchanged from prior migration except for the
  -- newly-added metadata lock at the bottom).
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'kid_profiles.id is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.parent_user_id IS DISTINCT FROM OLD.parent_user_id THEN
    RAISE EXCEPTION 'kid_profiles.parent_user_id is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'kid_profiles.created_at is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.coppa_consent_given IS DISTINCT FROM OLD.coppa_consent_given THEN
    RAISE EXCEPTION 'kid_profiles.coppa_consent_given is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.coppa_consent_at IS DISTINCT FROM OLD.coppa_consent_at THEN
    RAISE EXCEPTION 'kid_profiles.coppa_consent_at is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.reconsent_required_at IS DISTINCT FROM OLD.reconsent_required_at THEN
    RAISE EXCEPTION 'kid_profiles.reconsent_required_at is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.reconsented_at IS DISTINCT FROM OLD.reconsented_at THEN
    RAISE EXCEPTION 'kid_profiles.reconsented_at is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth THEN
    RAISE EXCEPTION 'kid_profiles.date_of_birth is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.reading_band IS DISTINCT FROM OLD.reading_band THEN
    RAISE EXCEPTION 'kid_profiles.reading_band is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.band_changed_at IS DISTINCT FROM OLD.band_changed_at THEN
    RAISE EXCEPTION 'kid_profiles.band_changed_at is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.band_history IS DISTINCT FROM OLD.band_history THEN
    RAISE EXCEPTION 'kid_profiles.band_history is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.verity_score IS DISTINCT FROM OLD.verity_score THEN
    RAISE EXCEPTION 'kid_profiles.verity_score is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.articles_read_count IS DISTINCT FROM OLD.articles_read_count THEN
    RAISE EXCEPTION 'kid_profiles.articles_read_count is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.quizzes_completed_count IS DISTINCT FROM OLD.quizzes_completed_count THEN
    RAISE EXCEPTION 'kid_profiles.quizzes_completed_count is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.streak_current IS DISTINCT FROM OLD.streak_current THEN
    RAISE EXCEPTION 'kid_profiles.streak_current is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.streak_best IS DISTINCT FROM OLD.streak_best THEN
    RAISE EXCEPTION 'kid_profiles.streak_best is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.streak_last_active_date IS DISTINCT FROM OLD.streak_last_active_date THEN
    RAISE EXCEPTION 'kid_profiles.streak_last_active_date is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.streak_freeze_remaining IS DISTINCT FROM OLD.streak_freeze_remaining THEN
    RAISE EXCEPTION 'kid_profiles.streak_freeze_remaining is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.streak_freeze_week_start IS DISTINCT FROM OLD.streak_freeze_week_start THEN
    RAISE EXCEPTION 'kid_profiles.streak_freeze_week_start is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.pin_attempts IS DISTINCT FROM OLD.pin_attempts THEN
    RAISE EXCEPTION 'kid_profiles.pin_attempts is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.pin_locked_until IS DISTINCT FROM OLD.pin_locked_until THEN
    RAISE EXCEPTION 'kid_profiles.pin_locked_until is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.birthday_prompt_at IS DISTINCT FROM OLD.birthday_prompt_at THEN
    RAISE EXCEPTION 'kid_profiles.birthday_prompt_at is read-only' USING ERRCODE = '42501';
  END IF;

  -- New: metadata lock (Session 1b adversary follow-up).
  IF NEW.metadata IS DISTINCT FROM OLD.metadata THEN
    RAISE EXCEPTION 'kid_profiles.metadata is read-only for self-update (use a typed RPC)' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

-- Re-bind trigger to fire on INSERT as well as UPDATE.
DROP TRIGGER IF EXISTS kid_profiles_protect_columns_trg ON public.kid_profiles;
CREATE TRIGGER kid_profiles_protect_columns_trg
  BEFORE INSERT OR UPDATE ON public.kid_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.kid_profiles_protect_columns();

------------------------------------------------------------------------------
-- 3 — reject_privileged_user_updates: extend INSERT denylist to match
-- users_protect_columns UPDATE denylist.
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reject_privileged_user_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR current_user IN ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin')
     OR public.is_admin_or_above() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Existing checks (preserved).
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
       -- Session 1b additions: mirror users_protect_columns UPDATE denylist.
       -- Trial / billing state.
       OR NEW.trial_extension_until IS NOT NULL
       OR NEW.trial_extended_seen_at IS NOT NULL
       OR NEW.comped_until IS NOT NULL
       OR COALESCE(NEW.kid_trial_used, false) IS TRUE
       OR NEW.kid_trial_started_at IS NOT NULL
       OR NEW.kid_trial_ends_at IS NOT NULL
       -- Cohort / referral.
       OR NEW.cohort IS NOT NULL
       OR NEW.cohort_joined_at IS NOT NULL
       OR NEW.referred_by IS NOT NULL
       OR NEW.referral_code IS NOT NULL
       OR NEW.invite_cap_override IS NOT NULL
       -- Permission-version bookkeeping.
       OR NEW.perms_version_bumped_at IS NOT NULL
       -- Moderation timestamps.
       OR NEW.last_warning_at IS NOT NULL
       OR NEW.verify_locked_at IS NOT NULL
       OR COALESCE(NEW.is_muted, false) IS TRUE
       -- Verification.
       OR COALESCE(NEW.email_verified, false) IS TRUE
       OR NEW.email_verified_at IS NOT NULL
       OR COALESCE(NEW.phone_verified, false) IS TRUE
       OR NEW.phone_verified_at IS NOT NULL
       OR NEW.expert_title IS NOT NULL
       OR NEW.expert_organization IS NOT NULL
       -- Engagement counters (server-incremented only).
       OR COALESCE(NEW.comment_count, 0) <> 0
       OR COALESCE(NEW.articles_read_count, 0) <> 0
       OR COALESCE(NEW.quizzes_completed_count, 0) <> 0
       OR COALESCE(NEW.followers_count, 0) <> 0
       OR COALESCE(NEW.following_count, 0) <> 0
       OR COALESCE(NEW.streak_current, 0) <> 0
       OR COALESCE(NEW.streak_freeze_remaining, 0) <> 0
       OR NEW.streak_freeze_week_start IS NOT NULL
       OR COALESCE(NEW.streak_frozen_today, false) IS TRUE
       OR NEW.streak_last_active_date IS NOT NULL
       OR COALESCE(NEW.login_count, 0) <> 0
       OR NEW.last_login_at IS NOT NULL
       OR NEW.last_login_device IS NOT NULL
       OR NEW.last_active_at IS NOT NULL
       -- PIN lockout state.
       OR COALESCE(NEW.pin_attempts, 0) <> 0
       OR NEW.pin_locked_until IS NOT NULL
       -- Kids-mode flags.
       OR COALESCE(NEW.is_kids_mode_enabled, false) IS TRUE
       OR COALESCE(NEW.has_kids_profiles, false) IS TRUE
       OR COALESCE(NEW.supervisor_opted_in, false) IS TRUE
       -- Lifecycle.
       OR NEW.onboarding_completed_at IS NOT NULL
       OR NEW.deletion_requested_at IS NOT NULL
       OR NEW.deletion_reason IS NOT NULL
       OR NEW.deleted_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'privileged column value on insert denied for user %', auth.uid()
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE branch (preserved verbatim — users_protect_columns_trigger now
  -- carries the broader column-by-column denials; this branch is the
  -- legacy narrow set, kept as defense-in-depth).
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
$function$;
