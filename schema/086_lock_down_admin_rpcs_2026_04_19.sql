-- 086_lock_down_admin_rpcs_2026_04_19.sql
-- Migration: 20260419131252 lock_down_admin_rpcs_2026_04_19
--
-- Round 6 SECURITY: lock down 14 admin-surface RPCs from PUBLIC/anon/authenticated.
-- Strategy: REVOKE-only (service_role keeps EXECUTE). Bodies preserved, except
-- anonymize_user gains a defensive self-anonymize guard.

-- 1. anonymize_user (p_user_id uuid)
REVOKE ALL ON FUNCTION public.anonymize_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.anonymize_user(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.anonymize_user(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.anonymize_user(uuid) TO service_role;

-- Defensive guard: prevent self-anonymize when called inside a user session.
CREATE OR REPLACE FUNCTION public.anonymize_user(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_shortid text := substr(replace(p_user_id::text, '-', ''), 1, 8);
BEGIN
  -- Defence-in-depth: if called inside a user session (not service_role),
  -- forbid self-anonymize. Legitimate path is sweep_expired_deletions cron
  -- or admin layer (service_role).
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR auth.uid() = p_user_id) THEN
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

-- Re-apply ACL tightening after CREATE OR REPLACE.
REVOKE ALL ON FUNCTION public.anonymize_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.anonymize_user(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.anonymize_user(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.anonymize_user(uuid) TO service_role;

-- 2. apply_penalty
REVOKE ALL ON FUNCTION public.apply_penalty(uuid, uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_penalty(uuid, uuid, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.apply_penalty(uuid, uuid, integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_penalty(uuid, uuid, integer, text) TO service_role;

-- 3. approve_expert_application
REVOKE ALL ON FUNCTION public.approve_expert_application(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_expert_application(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.approve_expert_application(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.approve_expert_application(uuid, uuid, text) TO service_role;

-- 4. cancel_account_deletion
REVOKE ALL ON FUNCTION public.cancel_account_deletion(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_account_deletion(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.cancel_account_deletion(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_account_deletion(uuid) TO service_role;

-- 5. grant_role
REVOKE ALL ON FUNCTION public.grant_role(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_role(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.grant_role(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.grant_role(uuid, uuid, text) TO service_role;

-- 6. hide_comment
REVOKE ALL ON FUNCTION public.hide_comment(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hide_comment(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.hide_comment(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hide_comment(uuid, uuid, text) TO service_role;

-- 7. mark_probation_complete
REVOKE ALL ON FUNCTION public.mark_probation_complete(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_probation_complete(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.mark_probation_complete(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_probation_complete(uuid, uuid) TO service_role;

-- 8. reject_expert_application
REVOKE ALL ON FUNCTION public.reject_expert_application(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_expert_application(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.reject_expert_application(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reject_expert_application(uuid, uuid, text) TO service_role;

-- 9. resolve_appeal
REVOKE ALL ON FUNCTION public.resolve_appeal(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_appeal(uuid, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_appeal(uuid, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_appeal(uuid, uuid, text, text) TO service_role;

-- 10. resolve_report
REVOKE ALL ON FUNCTION public.resolve_report(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_report(uuid, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_report(uuid, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_report(uuid, uuid, text, text) TO service_role;

-- 11. revoke_role
REVOKE ALL ON FUNCTION public.revoke_role(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_role(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.revoke_role(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_role(uuid, uuid, text) TO service_role;

-- 12. schedule_account_deletion
REVOKE ALL ON FUNCTION public.schedule_account_deletion(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.schedule_account_deletion(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.schedule_account_deletion(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_account_deletion(uuid, text) TO service_role;

-- 13. send_breaking_news
REVOKE ALL ON FUNCTION public.send_breaking_news(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_breaking_news(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.send_breaking_news(uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.send_breaking_news(uuid, text, text) TO service_role;

-- 14. unhide_comment
REVOKE ALL ON FUNCTION public.unhide_comment(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unhide_comment(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.unhide_comment(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.unhide_comment(uuid, uuid) TO service_role;

-- Bump global perms version.
UPDATE public.perms_global_version SET version = version + 1, bumped_at = now() WHERE id = 1;
