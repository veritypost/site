-- S1-T2.2 — anonymize_user: redact comment bodies, message bodies, backfill
--
-- The existing anonymize_user function nulls user-level PII (email, phone,
-- name, etc.) but leaves comments.body, comments.body_html, comments.mentions
-- and messages.body, messages.body_html intact. Those fields contain user-
-- authored free text that constitutes PII under GDPR/CCPA deletion requests.
--
-- Verified state (2026-04-27): no UPDATE on comments or messages in prosrc.
-- Both tables confirmed to have body + body_html columns. messages.body_html
-- nullable; comments.mentions is jsonb.
--
-- Change: extend the function body with two UPDATEs (comments + messages).
-- Add one-time backfill for users already deleted (deleted_at IS NOT NULL)
-- whose content was not redacted before this patch.
--
-- Signature, return type (void), SECURITY DEFINER, and search_path preserved.
--
-- Acceptance: prosrc contains 'UPDATE comments' and 'UPDATE messages'.

BEGIN;

DO $$
DECLARE
  body_text text;
BEGIN
  SELECT prosrc INTO body_text FROM pg_proc
   WHERE proname = 'anonymize_user'
     AND pronamespace = 'public'::regnamespace;
  IF body_text IS NULL THEN
    RAISE EXCEPTION 'S1-T2.2 abort: anonymize_user not found';
  END IF;
  IF body_text LIKE '%UPDATE comments%' THEN
    RAISE NOTICE 'S1-T2.2 no-op: anonymize_user already redacts comments';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.anonymize_user(p_user_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_shortid text := substr(replace(p_user_id::text, '-', ''), 1, 8);
BEGIN
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

  -- Redact comment bodies (GDPR — user-authored PII in free-text).
  UPDATE comments
     SET body      = '[deleted]',
         body_html = NULL,
         mentions  = '[]'::jsonb
   WHERE user_id = p_user_id;

  -- Redact direct message bodies.
  UPDATE messages
     SET body      = '[deleted]',
         body_html = NULL
   WHERE sender_id = p_user_id;

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
$$;

-- One-time backfill: redact content for users deleted before this patch.
-- Scoped to rows where body IS DISTINCT FROM '[deleted]' so re-runs are safe.
DO $$
DECLARE
  v_comments_updated bigint;
  v_messages_updated bigint;
BEGIN
  UPDATE comments
     SET body      = '[deleted]',
         body_html = NULL,
         mentions  = '[]'::jsonb
   WHERE user_id IN (SELECT id FROM users WHERE deleted_at IS NOT NULL)
     AND body IS DISTINCT FROM '[deleted]';
  GET DIAGNOSTICS v_comments_updated = ROW_COUNT;

  UPDATE messages
     SET body      = '[deleted]',
         body_html = NULL
   WHERE sender_id IN (SELECT id FROM users WHERE deleted_at IS NOT NULL)
     AND body IS DISTINCT FROM '[deleted]';
  GET DIAGNOSTICS v_messages_updated = ROW_COUNT;

  RAISE NOTICE 'S1-T2.2 backfill: % comment rows, % message rows redacted',
    v_comments_updated, v_messages_updated;
END $$;

DO $$
DECLARE
  body_text text;
BEGIN
  SELECT prosrc INTO body_text FROM pg_proc
   WHERE proname = 'anonymize_user'
     AND pronamespace = 'public'::regnamespace;
  IF body_text NOT LIKE '%UPDATE comments%' OR body_text NOT LIKE '%UPDATE messages%' THEN
    RAISE EXCEPTION 'S1-T2.2 post-check failed: redaction UPDATEs not found in prosrc';
  END IF;
  RAISE NOTICE 'S1-T2.2 applied: anonymize_user now redacts comments + messages';
END $$;

COMMIT;
