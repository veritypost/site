-- =====================================================================
-- 2026-04-28_S1_T2.2_anonymize_user_body_redact.sql
-- S1-T2.2 — anonymize_user redacts comment + message bodies
-- Source: Ongoing Projects/Sessions/Session_01_DB_Migrations.md (S1-T2.2)
-- Severity: P0 (GDPR Art. 17 erasure exposure)
-- =====================================================================
-- Verified state (2026-04-28 via pg_get_functiondef):
--   public.anonymize_user(p_user_id uuid) flips username/sessions/
--   auth_providers + closes data_requests but leaves comments.body,
--   comments.body_html, comments.mentions, messages.body verbatim. A
--   soft-deleted user's content stays readable indefinitely.
--
-- Adjacent surfaces verified:
--   - support_tickets.body / appeals — out of scope for this fix
--     (not user-facing public content). Surface as a follow-up if owner
--     wants ticket bodies redacted on deletion. Per session manual:
--     "If support_tickets or appeals bodies aren't redacted by another
--     path, surface as a follow-up task (not in S1 scope but flagged)."
--
-- Schema sanity:
--   - comments.body_html column exists (verified)
--   - comments.mentions column exists (verified)
--   - messages.body column exists (verified)
--   - users.deletion_completed_at column exists (used as legacy
--     soft-delete marker for backfill)
--
-- Rollback:
--   Restore previous anonymize_user body without the two UPDATE
--   statements. Backfill cannot be undone — comment bodies are gone.
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc
                 WHERE proname='anonymize_user'
                   AND pronamespace='public'::regnamespace) THEN
    RAISE EXCEPTION 'anonymize_user RPC missing — abort';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='comments'
                   AND column_name='body_html') THEN
    RAISE EXCEPTION 'comments.body_html missing — abort';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='comments'
                   AND column_name='mentions') THEN
    RAISE EXCEPTION 'comments.mentions missing — abort';
  END IF;
END $$;

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

  -- T2.2 — GDPR Art. 17: redact comment + message bodies. Display name
  -- flip alone leaves user-authored content readable indefinitely. Set
  -- bodies to '[deleted]' (matches comment_delete soft-delete marker)
  -- and clear body_html + mentions to drop any leaked @-handles.
  UPDATE comments
     SET body = '[deleted]',
         body_html = NULL,
         mentions = '[]'::jsonb,
         updated_at = now()
   WHERE user_id = p_user_id
     AND body <> '[deleted]';

  UPDATE messages
     SET body = '[deleted]',
         updated_at = now()
   WHERE sender_id = p_user_id
     AND body <> '[deleted]';

  INSERT INTO audit_log (actor_id, actor_type, action, target_type, target_id, metadata)
  VALUES (NULL, 'system', 'user.anonymized', 'user', p_user_id,
          jsonb_build_object('completed_at', now()));
END;
$function$;

-- Backfill: any users already in deleted state need their content
-- redacted now. Idempotent — body <> '[deleted]' guard skips already-
-- redacted rows on re-apply.
DO $$
DECLARE
  v_comments_redacted int;
  v_messages_redacted int;
BEGIN
  WITH r AS (
    UPDATE public.comments c
       SET body = '[deleted]',
           body_html = NULL,
           mentions = '[]'::jsonb,
           updated_at = now()
      FROM public.users u
     WHERE u.id = c.user_id
       AND u.deletion_completed_at IS NOT NULL
       AND c.body <> '[deleted]'
     RETURNING 1
  )
  SELECT count(*) INTO v_comments_redacted FROM r;

  WITH r AS (
    UPDATE public.messages m
       SET body = '[deleted]',
           updated_at = now()
      FROM public.users u
     WHERE u.id = m.sender_id
       AND u.deletion_completed_at IS NOT NULL
       AND m.body <> '[deleted]'
     RETURNING 1
  )
  SELECT count(*) INTO v_messages_redacted FROM r;

  RAISE NOTICE 'S1-T2.2 applied: anonymize_user redacts bodies; backfill comments=%, messages=%',
    v_comments_redacted, v_messages_redacted;
END $$;

COMMIT;
