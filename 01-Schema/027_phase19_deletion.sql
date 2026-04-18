-- ============================================================
-- Phase 19.2 — Account deletion pipeline
--
-- Adds four RPCs:
--   schedule_account_deletion(user_id)  — sets the 30-day timer +
--                                         writes a data_requests row
--   cancel_account_deletion(user_id)    — clears the timer if still
--                                         within the grace window
--   anonymize_user(user_id)             — nulls PII, preserves user_id
--                                         FKs so comments / reading_log /
--                                         quiz_attempts stay attached
--                                         (with "deleted user" display)
--   sweep_expired_deletions()           — cron entry point
--
-- Anonymization policy:
--   - Auth identity nulled: email, phone, password_hash, stripe_customer_id
--   - Display identity nulled: username set to sentinel "deleted_<shortid>",
--     display_name/first_name/last_name/bio/avatar_url/avatar_color/
--     banner_url/date_of_birth/gender/country_code/timezone/referral_code
--   - Privacy flags: profile_visibility='private', show_on_leaderboard=false,
--     allow_messages=false
--   - Lifecycle: deleted_at = now(), is_active = false,
--     deletion_completed_at = now()
--   - Sessions revoked: sessions.is_active = false, revoked_at = now()
--   - Auth provider links dropped via delete (breaks OAuth tie)
--   - Kid profiles CASCADE via FK from users(id) -> kid_profiles.parent_user_id
--
--   Not touched: comments/reading_log/quiz_attempts/category_scores/
--   score_events/bookmarks/follows/notifications. These keep the user_id
--   FK intact so history/discussion integrity survives.
-- ============================================================


-- ------------------------------------------------------------
-- schedule_account_deletion — user-initiated. 30-day grace.
-- Idempotent: if already scheduled, returns existing schedule.
-- Refuses if already anonymized.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.schedule_account_deletion(
  p_user_id uuid,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user users%ROWTYPE;
  v_scheduled timestamptz;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
  IF v_user.deletion_completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'account already anonymized';
  END IF;

  IF v_user.deletion_scheduled_for IS NOT NULL AND v_user.deletion_scheduled_for > now() THEN
    v_scheduled := v_user.deletion_scheduled_for;
  ELSE
    v_scheduled := now() + interval '30 days';
    UPDATE users
       SET deletion_requested_at = now(),
           deletion_scheduled_for = v_scheduled,
           deletion_reason = p_reason,
           updated_at = now()
     WHERE id = p_user_id;
  END IF;

  INSERT INTO data_requests (user_id, type, reason, regulation, status)
  VALUES (p_user_id, 'deletion', p_reason, 'gdpr', 'pending')
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'scheduled_for', v_scheduled,
    'grace_days_remaining', GREATEST(0, EXTRACT(DAY FROM v_scheduled - now())::int)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.schedule_account_deletion(uuid, text) TO service_role;


-- ------------------------------------------------------------
-- cancel_account_deletion — clears the timer if still in grace.
-- Safe to call after anonymization (no-op).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_account_deletion(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_user.deletion_completed_at IS NOT NULL THEN RETURN false; END IF;
  IF v_user.deletion_scheduled_for IS NULL THEN RETURN true; END IF;
  IF v_user.deletion_scheduled_for <= now() THEN RETURN false; END IF;

  UPDATE users
     SET deletion_requested_at = NULL,
         deletion_scheduled_for = NULL,
         deletion_reason = NULL,
         updated_at = now()
   WHERE id = p_user_id;

  UPDATE data_requests
     SET status = 'cancelled', completed_at = now()
   WHERE user_id = p_user_id AND type = 'deletion' AND status = 'pending';

  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cancel_account_deletion(uuid) TO service_role;


-- ------------------------------------------------------------
-- anonymize_user — destructive PII scrub. FK references preserved.
-- Called by sweep_expired_deletions; also callable by service_role
-- for manual cases.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.anonymize_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shortid text := substr(replace(p_user_id::text, '-', ''), 1, 8);
BEGIN
  UPDATE users SET
    email = NULL,
    email_verified = false,
    email_verified_at = NULL,
    phone = NULL,
    phone_verified = false,
    phone_verified_at = NULL,
    password_hash = NULL,
    username = 'deleted_' || v_shortid,
    display_name = 'Deleted user',
    first_name = NULL,
    last_name = NULL,
    bio = NULL,
    avatar_url = NULL,
    avatar_color = NULL,
    banner_url = NULL,
    date_of_birth = NULL,
    gender = NULL,
    country_code = NULL,
    timezone = NULL,
    referral_code = NULL,
    stripe_customer_id = NULL,
    last_login_ip = NULL,
    last_login_device = NULL,
    profile_visibility = 'private',
    show_activity = false,
    show_on_leaderboard = false,
    allow_messages = false,
    is_active = false,
    deleted_at = now(),
    deletion_completed_at = now(),
    notification_email = false,
    notification_push = false,
    updated_at = now()
  WHERE id = p_user_id;

  -- Revoke every live session for this user.
  UPDATE sessions
     SET is_active = false,
         revoked_at = COALESCE(revoked_at, now()),
         revoke_reason = COALESCE(revoke_reason, 'account_deleted')
   WHERE user_id = p_user_id AND is_active = true;

  -- Break OAuth ties so providers can't reattach.
  DELETE FROM auth_providers WHERE user_id = p_user_id;

  -- Clear any pending data export requests (no one to deliver to).
  UPDATE data_requests
     SET status = 'cancelled', completed_at = now()
   WHERE user_id = p_user_id AND status = 'pending' AND type = 'export';

  -- Close the deletion request itself.
  UPDATE data_requests
     SET status = 'completed', completed_at = now()
   WHERE user_id = p_user_id AND type = 'deletion' AND status = 'pending';

  INSERT INTO audit_log (actor_id, actor_type, action, target_type, target_id, metadata)
  VALUES (NULL, 'system', 'user.anonymized', 'user', p_user_id,
          jsonb_build_object('completed_at', now()));
END;
$$;
GRANT EXECUTE ON FUNCTION public.anonymize_user(uuid) TO service_role;


-- ------------------------------------------------------------
-- sweep_expired_deletions — cron entry point. Anonymizes every
-- user whose 30-day timer has expired. Returns count processed.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sweep_expired_deletions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_count int := 0;
BEGIN
  FOR v_user_id IN
    SELECT id FROM users
     WHERE deletion_scheduled_for IS NOT NULL
       AND deletion_scheduled_for <= now()
       AND deletion_completed_at IS NULL
     ORDER BY deletion_scheduled_for
     LIMIT 500
  LOOP
    PERFORM anonymize_user(v_user_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.sweep_expired_deletions() TO service_role;
