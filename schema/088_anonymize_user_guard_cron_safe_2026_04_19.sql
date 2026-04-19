-- 088_anonymize_user_guard_cron_safe_2026_04_19.sql
-- Migration: 20260419131516 anonymize_user_guard_cron_safe_2026_04_19
--
-- Refine the anonymize_user self-invoke guard so it doesn't break the
-- sweep_expired_deletions cron. Cron runs under postgres (no JWT, auth.uid()
-- is NULL), so the previous guard `auth.uid() IS NULL OR auth.uid() = p_user_id`
-- would have raised on every cron call. Narrow it: only raise when the caller
-- has a known session uid AND that uid matches the target.

CREATE OR REPLACE FUNCTION public.anonymize_user(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_shortid text := substr(replace(p_user_id::text, '-', ''), 1, 8);
BEGIN
  -- Defence-in-depth: forbid self-anonymize from a user session.
  -- Service_role (admin layer), cron/postgres (sweep_expired_deletions),
  -- and all non-matching sessions pass through. Only a signed-in user
  -- calling anonymize_user(their_own_uid) is blocked.
  IF auth.uid() IS NOT NULL AND auth.uid() = p_user_id THEN
    RAISE EXCEPTION 'anonymize_user may not be self-invoked' USING ERRCODE = '42501';
  END IF;

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

  UPDATE sessions
     SET is_active = false,
         revoked_at = COALESCE(revoked_at, now()),
         revoke_reason = COALESCE(revoke_reason, 'account_deleted')
   WHERE user_id = p_user_id AND is_active = true;

  DELETE FROM auth_providers WHERE user_id = p_user_id;

  UPDATE data_requests
     SET status = 'cancelled', completed_at = now()
   WHERE user_id = p_user_id AND status = 'pending' AND type = 'export';

  UPDATE data_requests
     SET status = 'completed', completed_at = now()
   WHERE user_id = p_user_id AND type = 'deletion' AND status = 'pending';

  INSERT INTO audit_log (actor_id, actor_type, action, target_type, target_id, metadata)
  VALUES (NULL, 'system', 'user.anonymized', 'user', p_user_id,
          jsonb_build_object('completed_at', now()));
END;
$function$;

-- Preserve the ACL lockdown.
REVOKE ALL ON FUNCTION public.anonymize_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.anonymize_user(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.anonymize_user(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.anonymize_user(uuid) TO service_role;

UPDATE public.perms_global_version SET version = version + 1, bumped_at = now() WHERE id = 1;
