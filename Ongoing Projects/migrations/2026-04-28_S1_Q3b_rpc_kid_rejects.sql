-- =====================================================================
-- 2026-04-28_S1_Q3b_rpc_kid_rejects.sql
-- S1-Q3b — kid-token reject prologue on every adult-only RPC
-- Source: Ongoing Projects/Sessions/Session_01_DB_Migrations.md (S1-Q3b)
-- Severity: P0 (kid-JWT defense-in-depth)
-- =====================================================================
-- Verified state (2026-04-28 via pg_proc + has_kid_check grep):
--   AT-RISK list per session manual (25 RPCs). Live state of those
--   that exist in pg_proc:
--
--   Existing in pg_proc, all WITHOUT is_kid_delegated() check (19):
--     update_own_profile, lockdown_self, update_metadata,
--     register_push_token, upsert_user_push_token, revoke_session,
--     revoke_all_other_sessions, session_heartbeat,
--     create_support_ticket, mint_owner_referral_link,
--     mint_referral_codes, clear_kid_lockout, graduate_kid_profile,
--     grant_pro_to_cohort, get_own_login_activity, convert_kid_trial,
--     submit_appeal, post_comment
--
--   NOT YET in pg_proc — out of scope for this migration; future
--   implementations must include the check (6):
--     block_user, unblock_user, report_comment, vote_comment,
--     request_data_export, request_account_deletion
--
-- Carve-outs (legitimately need kid token):
--   - clear_kid_lockout → ALREADY parent-only (auth.uid() resolves to
--     the parent's user; kid sessions don't reach this RPC). The
--     kid-reject is a no-op on legitimate calls but defends against a
--     stolen kid token attempting to clear lockout. SAFE TO ADD.
--   - convert_kid_trial → service-role + admin path; kids should never
--     invoke. SAFE TO ADD.
--   - graduate_kid_profile → parent-action; kid token must NOT graduate
--     itself. SAFE TO ADD.
--
-- Pattern (added at function entry, after existing parameter-shape
-- guards but before any state mutation):
--   IF public.is_kid_delegated() THEN
--     RAISE EXCEPTION 'forbidden: kid token cannot invoke <fn>'
--       USING ERRCODE = '42501';
--   END IF;
--
-- Idempotency: each CREATE OR REPLACE FUNCTION reapplies cleanly.
-- The migration ships all 19 in one transaction — partial success is
-- not tolerated.
--
-- Coordination: independent of S3 middleware fix and S10 issuer flip.
-- Hardens regardless of which issuer S10 picks.
--
-- Rollback:
--   Restore each function from its prior pg_get_functiondef snapshot.
--   No DDL outside the function bodies.
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc
                 WHERE proname='is_kid_delegated' AND pronamespace='public'::regnamespace) THEN
    RAISE EXCEPTION 'is_kid_delegated() helper missing — abort';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1. update_own_profile
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_own_profile(p_fields jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_updated_at timestamptz;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke update_own_profile' USING ERRCODE = '42501';
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_fields IS NULL OR jsonb_typeof(p_fields) <> 'object' THEN
    RAISE EXCEPTION 'p_fields must be a jsonb object' USING ERRCODE = '22023';
  END IF;

  UPDATE public.users u
  SET
    username = CASE
                 WHEN p_fields ? 'username' AND u.username IS NULL
                   THEN NULLIF(p_fields->>'username', '')::varchar
                 ELSE u.username
               END,
    display_name = CASE WHEN p_fields ? 'display_name'
                        THEN NULLIF(p_fields->>'display_name', '')::varchar
                        ELSE u.display_name END,
    bio = CASE WHEN p_fields ? 'bio'
               THEN (p_fields->>'bio')::varchar
               ELSE u.bio END,
    avatar_url = CASE WHEN p_fields ? 'avatar_url'
                      THEN (p_fields->>'avatar_url')::text
                      ELSE u.avatar_url END,
    avatar_color = CASE WHEN p_fields ? 'avatar_color'
                        THEN (p_fields->>'avatar_color')::varchar
                        ELSE u.avatar_color END,
    banner_url = CASE WHEN p_fields ? 'banner_url'
                      THEN (p_fields->>'banner_url')::text
                      ELSE u.banner_url END,
    profile_visibility = CASE WHEN p_fields ? 'profile_visibility'
                              THEN (p_fields->>'profile_visibility')::varchar
                              ELSE u.profile_visibility END,
    show_activity = CASE WHEN p_fields ? 'show_activity'
                         THEN (p_fields->>'show_activity')::boolean
                         ELSE u.show_activity END,
    show_on_leaderboard = CASE WHEN p_fields ? 'show_on_leaderboard'
                               THEN (p_fields->>'show_on_leaderboard')::boolean
                               ELSE u.show_on_leaderboard END,
    allow_messages = CASE WHEN p_fields ? 'allow_messages'
                          THEN (p_fields->>'allow_messages')::boolean
                          ELSE u.allow_messages END,
    dm_read_receipts_enabled = CASE WHEN p_fields ? 'dm_read_receipts_enabled'
                                    THEN (p_fields->>'dm_read_receipts_enabled')::boolean
                                    ELSE u.dm_read_receipts_enabled END,
    notification_email = CASE WHEN p_fields ? 'notification_email'
                              THEN (p_fields->>'notification_email')::boolean
                              ELSE u.notification_email END,
    notification_push = CASE WHEN p_fields ? 'notification_push'
                             THEN (p_fields->>'notification_push')::boolean
                             ELSE u.notification_push END,
    att_status = CASE WHEN p_fields ? 'att_status'
                      THEN (p_fields->>'att_status')::varchar
                      ELSE u.att_status END,
    att_prompted_at = CASE WHEN p_fields ? 'att_prompted_at'
                           THEN (p_fields->>'att_prompted_at')::timestamptz
                           ELSE u.att_prompted_at END,
    last_login_at = CASE WHEN p_fields ? 'last_login_at'
                         THEN (p_fields->>'last_login_at')::timestamptz
                         ELSE u.last_login_at END,
    onboarding_completed_at = CASE WHEN p_fields ? 'onboarding_completed_at'
                                   THEN (p_fields->>'onboarding_completed_at')::timestamptz
                                   ELSE u.onboarding_completed_at END,
    expert_title = CASE WHEN p_fields ? 'expert_title'
                        THEN (p_fields->>'expert_title')::varchar
                        ELSE u.expert_title END,
    expert_organization = CASE WHEN p_fields ? 'expert_organization'
                               THEN (p_fields->>'expert_organization')::varchar
                               ELSE u.expert_organization END,
    metadata = CASE
                 WHEN p_fields ? 'metadata'
                      AND jsonb_typeof(p_fields->'metadata') = 'object'
                 THEN COALESCE(u.metadata, '{}'::jsonb) || (p_fields->'metadata')
                 ELSE u.metadata
               END
  WHERE u.id = v_uid
  RETURNING u.updated_at INTO v_updated_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user row not found for %', v_uid USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('ok', true, 'updated_at', v_updated_at);
END;
$function$;

-- ---------------------------------------------------------------------
-- 2. lockdown_self
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lockdown_self(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_followers_removed integer := 0;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke lockdown_self' USING ERRCODE = '42501';
  END IF;
  IF v_caller IS NOT NULL AND v_caller <> p_user_id THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.users
     SET profile_visibility = 'hidden',
         updated_at = now()
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;

  WITH deleted AS (
    DELETE FROM public.follows
     WHERE following_id = p_user_id
     RETURNING 1
  )
  SELECT count(*) INTO v_followers_removed FROM deleted;

  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, metadata)
  VALUES (
    p_user_id,
    'self:lockdown',
    'user',
    p_user_id,
    jsonb_build_object('followers_removed', v_followers_removed)
  );

  PERFORM bump_user_perms_version(p_user_id);

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'profile_visibility', 'hidden',
    'followers_removed', v_followers_removed
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- 3. update_metadata
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_metadata(p_user_id uuid, p_keys jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke update_metadata' USING ERRCODE = '42501';
  END IF;
  IF v_caller IS NOT NULL
     AND v_caller <> p_user_id
     AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF p_keys IS NULL OR jsonb_typeof(p_keys) <> 'object' THEN
    RAISE EXCEPTION 'p_keys must be a jsonb object' USING ERRCODE = '22023';
  END IF;

  UPDATE public.users
     SET metadata = COALESCE(metadata, '{}'::jsonb) || p_keys
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

-- ---------------------------------------------------------------------
-- 4. register_push_token
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_push_token(
  p_session_id uuid, p_provider text, p_token text,
  p_device_id text DEFAULT NULL::text, p_platform text DEFAULT NULL::text,
  p_app_version text DEFAULT NULL::text, p_os_name text DEFAULT NULL::text,
  p_os_version text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke register_push_token' USING ERRCODE = '42501';
  END IF;
  IF p_provider NOT IN ('apns','fcm','web_push','expo') THEN
    RAISE EXCEPTION 'Invalid push provider';
  END IF;
  UPDATE sessions SET
    push_token            = p_token,
    push_token_type       = p_provider,
    push_token_updated_at = now(),
    device_id             = COALESCE(p_device_id, device_id),
    app_version           = COALESCE(p_app_version, app_version),
    os_name               = COALESCE(p_os_name, os_name),
    os_version            = COALESCE(p_os_version, os_version),
    last_active_at        = now()
  WHERE id = p_session_id AND user_id = auth.uid();
  RETURN FOUND;
END;
$function$;

-- ---------------------------------------------------------------------
-- 5. upsert_user_push_token
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_user_push_token(
  p_provider text, p_token text,
  p_environment text DEFAULT NULL::text,
  p_device_name text DEFAULT NULL::text,
  p_platform text DEFAULT NULL::text,
  p_os_version text DEFAULT NULL::text,
  p_app_version text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_id uuid;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke upsert_user_push_token' USING ERRCODE = '42501';
  END IF;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_provider NOT IN ('apns','fcm','web_push','expo') THEN
    RAISE EXCEPTION 'invalid provider: %', p_provider;
  END IF;
  IF p_token IS NULL OR length(p_token) = 0 THEN
    RAISE EXCEPTION 'token required';
  END IF;

  INSERT INTO user_push_tokens
    (user_id, provider, push_token, environment,
     device_name, platform, os_version, app_version,
     last_registered_at, invalidated_at)
  VALUES
    (v_user_id, p_provider, p_token, p_environment,
     p_device_name, p_platform, p_os_version, p_app_version,
     now(), NULL)
  ON CONFLICT (user_id, push_token) DO UPDATE SET
    provider           = EXCLUDED.provider,
    environment        = COALESCE(EXCLUDED.environment, user_push_tokens.environment),
    device_name        = COALESCE(EXCLUDED.device_name, user_push_tokens.device_name),
    platform           = COALESCE(EXCLUDED.platform, user_push_tokens.platform),
    os_version         = COALESCE(EXCLUDED.os_version, user_push_tokens.os_version),
    app_version        = COALESCE(EXCLUDED.app_version, user_push_tokens.app_version),
    last_registered_at = now(),
    invalidated_at     = NULL
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- ---------------------------------------------------------------------
-- 6. revoke_session
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_session(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke revoke_session' USING ERRCODE = '42501';
  END IF;
  UPDATE sessions SET is_active = false, is_current = false
  WHERE id = p_session_id AND user_id = auth.uid();
  RETURN FOUND;
END;
$function$;

-- ---------------------------------------------------------------------
-- 7. revoke_all_other_sessions
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_all_other_sessions(p_current_session_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_count integer;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke revoke_all_other_sessions' USING ERRCODE = '42501';
  END IF;
  UPDATE sessions SET is_active = false, is_current = false
  WHERE user_id = auth.uid() AND id <> p_current_session_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- ---------------------------------------------------------------------
-- 8. session_heartbeat
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.session_heartbeat(
  p_session_id uuid, p_app_version text DEFAULT NULL::text, p_os_version text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke session_heartbeat' USING ERRCODE = '42501';
  END IF;
  UPDATE sessions SET
    last_active_at = now(),
    app_version    = COALESCE(p_app_version, app_version),
    os_version     = COALESCE(p_os_version, os_version)
  WHERE id = p_session_id AND user_id = auth.uid();
  RETURN FOUND;
END;
$function$;

-- ---------------------------------------------------------------------
-- 9. create_support_ticket
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_support_ticket(p_category text, p_subject text, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id       uuid := auth.uid();
  v_email         text;
  v_ticket_number text;
  v_ticket_id     uuid;
  v_body          text;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke create_support_ticket' USING ERRCODE = '42501';
  END IF;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_category IS NULL OR btrim(p_category) = '' THEN
    RAISE EXCEPTION 'category required';
  END IF;
  IF p_subject IS NULL OR btrim(p_subject) = '' THEN
    RAISE EXCEPTION 'subject required';
  END IF;
  v_body := btrim(COALESCE(p_body, ''));
  IF v_body = '' THEN RAISE EXCEPTION 'body required'; END IF;

  SELECT email INTO v_email
    FROM public.users
   WHERE id = v_user_id;

  v_ticket_number := 'VP-' || upper(to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint));

  INSERT INTO public.support_tickets (
    ticket_number, user_id, email, category, subject, status, source
  ) VALUES (
    v_ticket_number, v_user_id, v_email, p_category, p_subject, 'open', 'in_app'
  ) RETURNING id INTO v_ticket_id;

  INSERT INTO public.ticket_messages (ticket_id, sender_id, is_staff, body)
  VALUES (v_ticket_id, v_user_id, false, v_body);

  RETURN jsonb_build_object(
    'id',            v_ticket_id,
    'ticket_number', v_ticket_number,
    'status',        'open'
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- 10. mint_owner_referral_link
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mint_owner_referral_link(
  p_actor_user_id uuid DEFAULT NULL::uuid,
  p_description text DEFAULT NULL::text,
  p_max_uses integer DEFAULT NULL::integer,
  p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS TABLE(id uuid, code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := COALESCE(p_actor_user_id, auth.uid());
  v_slug text;
  v_attempt int;
  v_id uuid;
  v_actor_is_admin boolean := false;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke mint_owner_referral_link' USING ERRCODE = '42501';
  END IF;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'mint_owner_referral_link: no actor (pass p_actor_user_id or call as authenticated user)'
      USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_actor
      AND r.name IN ('admin', 'owner', 'superadmin')
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
  ) INTO v_actor_is_admin;

  IF NOT v_actor_is_admin THEN
    RAISE EXCEPTION 'mint_owner_referral_link: actor % is not admin/owner/superadmin', v_actor
      USING ERRCODE = '42501';
  END IF;

  FOR v_attempt IN 1..5 LOOP
    v_slug := public.generate_referral_slug();
    BEGIN
      INSERT INTO public.access_codes
        (code, type, tier, owner_user_id, slot, is_active, created_by,
         description, max_uses, expires_at)
      VALUES
        (v_slug, 'referral', 'owner', v_actor, NULL, true, v_actor,
         COALESCE(p_description, 'Owner-minted seed referral'),
         p_max_uses, p_expires_at)
      RETURNING access_codes.id INTO v_id;
      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        IF v_attempt = 5 THEN
          RAISE EXCEPTION 'mint_owner_referral_link: slug retries exhausted';
        END IF;
    END;
  END LOOP;

  RETURN QUERY SELECT v_id, v_slug;
END;
$function$;

-- ---------------------------------------------------------------------
-- 11. mint_referral_codes
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mint_referral_codes(p_user_id uuid)
RETURNS TABLE(id uuid, code text, slot smallint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_slot smallint;
  v_slug text;
  v_attempt int;
  v_existing record;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke mint_referral_codes' USING ERRCODE = '42501';
  END IF;
  IF v_role <> 'service_role'
     AND auth.uid() <> p_user_id
     AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'mint_referral_codes: not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'mint_referral_codes: p_user_id required';
  END IF;

  FOR v_slot IN 1..2 LOOP
    SELECT ac.id, ac.code, ac.slot
      INTO v_existing
      FROM public.access_codes ac
     WHERE ac.type = 'referral'
       AND ac.tier = 'user'
       AND ac.owner_user_id = p_user_id
       AND ac.slot = v_slot
     LIMIT 1;
    IF FOUND THEN
      CONTINUE;
    END IF;

    FOR v_attempt IN 1..5 LOOP
      v_slug := public.generate_referral_slug();
      BEGIN
        INSERT INTO public.access_codes
          (code, type, tier, owner_user_id, slot, max_uses, is_active, created_by, description)
        VALUES
          (v_slug, 'referral', 'user', p_user_id, v_slot, 1, true, p_user_id,
           'Auto-minted user referral, slot ' || v_slot::text);
        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          IF v_attempt = 5 THEN
            RAISE EXCEPTION 'mint_referral_codes: slug retries exhausted for user %', p_user_id;
          END IF;
      END;
    END LOOP;
  END LOOP;

  RETURN QUERY
    SELECT ac.id, ac.code::text, ac.slot
      FROM public.access_codes ac
     WHERE ac.type = 'referral'
       AND ac.tier = 'user'
       AND ac.owner_user_id = p_user_id
     ORDER BY ac.slot;
END;
$function$;

-- ---------------------------------------------------------------------
-- 12. clear_kid_lockout (parent action; kid token reject defends against
--      stolen-token clearing the lockout the parent set)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_kid_lockout(p_kid_profile_id uuid, p_parent_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_parent users%ROWTYPE;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke clear_kid_lockout' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_parent FROM users WHERE id = auth.uid();
  IF v_parent.parent_pin_hash IS NULL
     OR v_parent.parent_pin_hash <> crypt(p_parent_pin, v_parent.parent_pin_hash) THEN
    RAISE EXCEPTION 'Invalid parent PIN';
  END IF;
  UPDATE kid_profiles SET pin_attempts = 0, pin_locked_until = NULL
    WHERE id = p_kid_profile_id AND parent_user_id = auth.uid();
  RETURN true;
END;
$function$;

-- ---------------------------------------------------------------------
-- 13. graduate_kid_profile (parent action)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.graduate_kid_profile(p_kid_profile_id uuid, p_intended_email text)
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

  PERFORM set_config('app.dob_admin_override', 'true', true);

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

  PERFORM set_config('app.dob_admin_override', '', true);

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

-- ---------------------------------------------------------------------
-- 14. grant_pro_to_cohort (admin action)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_pro_to_cohort(p_cohort text, p_months integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_actor uuid := auth.uid();
  v_pro_plan_id uuid;
  v_count int;
  v_now timestamptz := now();
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke grant_pro_to_cohort' USING ERRCODE = '42501';
  END IF;
  IF v_role <> 'service_role' AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'grant_pro_to_cohort: admin role required' USING ERRCODE = '42501';
  END IF;
  IF p_cohort IS NULL OR p_cohort = '' THEN
    RAISE EXCEPTION 'grant_pro_to_cohort: cohort required';
  END IF;
  IF p_months IS NULL OR p_months < 1 OR p_months > 24 THEN
    RAISE EXCEPTION 'grant_pro_to_cohort: months must be 1..24';
  END IF;

  SELECT id INTO v_pro_plan_id FROM public.plans WHERE name = 'verity_pro_monthly' LIMIT 1;
  IF v_pro_plan_id IS NULL THEN
    RAISE EXCEPTION 'grant_pro_to_cohort: verity_pro_monthly plan not found';
  END IF;

  WITH bumped AS (
    UPDATE public.users
       SET plan_id = v_pro_plan_id,
           plan_status = 'active',
           comped_until = GREATEST(COALESCE(comped_until, v_now), v_now)
                          + (p_months || ' months')::interval,
           perms_version = perms_version + 1,
           perms_version_bumped_at = v_now
     WHERE cohort = p_cohort
       AND COALESCE(is_kids_mode_enabled, false) = false
       AND id <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid)
    RETURNING id
  )
  SELECT count(*)::int INTO v_count FROM bumped;

  INSERT INTO public.audit_log (actor_id, actor_type, action, target_type, metadata)
  VALUES (v_actor, 'admin', 'cohort.grant_pro', 'cohort',
          jsonb_build_object('cohort', p_cohort, 'months', p_months, 'count', v_count));

  RETURN v_count;
END;
$function$;

-- ---------------------------------------------------------------------
-- 15. get_own_login_activity
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_own_login_activity(p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid, action character varying, created_at timestamp with time zone, metadata jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke get_own_login_activity' USING ERRCODE = '42501';
  END IF;
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT a.id, a.action, a.created_at, a.metadata
    FROM public.audit_log a
    WHERE a.actor_id = v_uid
      AND a.action IN ('login', 'signup')
    ORDER BY a.created_at DESC
    LIMIT LEAST(COALESCE(p_limit, 50), 200);
END;
$function$;

-- ---------------------------------------------------------------------
-- 16. convert_kid_trial (service-role / billing internal)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.convert_kid_trial(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_converted int;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke convert_kid_trial' USING ERRCODE = '42501';
  END IF;
  UPDATE kid_profiles
     SET is_active = true,
         metadata = metadata - 'trial' || jsonb_build_object('trial_converted_at', now()),
         updated_at = now()
   WHERE parent_user_id = p_user_id
     AND (metadata->>'trial')::boolean = true;
  GET DIAGNOSTICS v_converted = ROW_COUNT;

  UPDATE users
     SET kid_trial_ends_at = NULL, updated_at = now()
   WHERE id = p_user_id;

  RETURN v_converted;
END;
$function$;

-- ---------------------------------------------------------------------
-- 17. submit_appeal
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_appeal(p_user_id uuid, p_warning_id uuid, p_text text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_warn user_warnings%ROWTYPE;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke submit_appeal' USING ERRCODE = '42501';
  END IF;
  IF btrim(COALESCE(p_text, '')) = '' THEN
    RAISE EXCEPTION 'appeal text required';
  END IF;
  SELECT * INTO v_warn FROM user_warnings WHERE id = p_warning_id;
  IF NOT FOUND OR v_warn.user_id <> p_user_id THEN
    RAISE EXCEPTION 'warning not found';
  END IF;
  IF v_warn.appeal_status IS NOT NULL THEN
    RAISE EXCEPTION 'appeal already filed';
  END IF;
  UPDATE user_warnings
     SET appeal_status = 'pending', appeal_text = p_text
   WHERE id = p_warning_id;
END;
$function$;

-- ---------------------------------------------------------------------
-- 18. post_comment — kid-reject prologue (defense-in-depth; kids app
--      has no comments per architecture, but RPC must reject regardless).
--      Body kept identical to the post-T0.2 (blocked_users) version.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_comment(
  p_user_id uuid,
  p_article_id uuid,
  p_body text,
  p_parent_id uuid DEFAULT NULL::uuid,
  p_mentions jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user users%ROWTYPE;
  v_tier text;
  v_is_paid boolean;
  v_body text;
  v_max_len int := _setting_int('comment_max_length', 4000);
  v_max_depth int := _setting_int('comment_max_depth', 3);
  v_parent comments%ROWTYPE;
  v_root_id uuid;
  v_depth int := 0;
  v_mentions jsonb := '[]'::jsonb;
  v_new_id uuid;
  v_article_title text;
  v_article_slug text;
  v_actor_username text;
  v_mention_entry jsonb;
  v_mentioned_id uuid;
  v_blocked boolean;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke post_comment' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
  IF NOT v_user.email_verified THEN
    RAISE EXCEPTION 'email must be verified to comment';
  END IF;

  IF NOT user_passed_article_quiz(p_user_id, p_article_id) THEN
    RAISE EXCEPTION 'quiz not passed — discussion is locked';
  END IF;

  v_body := btrim(COALESCE(p_body, ''));
  IF length(v_body) = 0 THEN RAISE EXCEPTION 'comment body is empty'; END IF;
  IF length(v_body) > v_max_len THEN
    RAISE EXCEPTION 'comment exceeds max length (% chars)', v_max_len;
  END IF;

  SELECT p.tier INTO v_tier FROM plans p WHERE p.id = v_user.plan_id;
  v_is_paid := v_tier IN ('verity','verity_pro','verity_family','verity_family_xl');
  IF v_is_paid AND jsonb_typeof(p_mentions) = 'array' THEN
    v_mentions := p_mentions;
  END IF;

  IF p_parent_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM comments
      WHERE id = p_parent_id AND article_id = p_article_id AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'parent comment not found on this article'; END IF;
    v_root_id := COALESCE(v_parent.root_id, v_parent.id);
    v_depth := v_parent.thread_depth + 1;
    IF v_depth > v_max_depth THEN
      RAISE EXCEPTION 'max reply depth reached (%)', v_max_depth;
    END IF;
  END IF;

  INSERT INTO comments
    (article_id, user_id, parent_id, root_id, thread_depth, body,
     mentions, status)
  VALUES
    (p_article_id, p_user_id, p_parent_id, v_root_id, v_depth, v_body,
     v_mentions, 'visible')
  RETURNING id INTO v_new_id;

  IF p_parent_id IS NOT NULL THEN
    UPDATE comments SET reply_count = reply_count + 1, updated_at = now()
     WHERE id = p_parent_id;
  END IF;

  UPDATE users SET comment_count = comment_count + 1, updated_at = now()
   WHERE id = p_user_id;

  SELECT a.title, a.slug INTO v_article_title, v_article_slug
    FROM articles a WHERE a.id = p_article_id;
  SELECT u.username INTO v_actor_username
    FROM users u WHERE u.id = p_user_id;

  IF p_parent_id IS NOT NULL AND v_parent.user_id IS NOT NULL
     AND v_parent.user_id <> p_user_id THEN
    SELECT EXISTS(
      SELECT 1 FROM blocked_users b
       WHERE b.blocker_id = v_parent.user_id AND b.blocked_id = p_user_id
    ) INTO v_blocked;
    IF NOT v_blocked THEN
      INSERT INTO notifications
        (user_id, type, title, body, action_url, metadata, email_sent)
      VALUES (
        v_parent.user_id,
        'comment_reply',
        format('@%s replied to your comment', COALESCE(v_actor_username, 'someone')),
        left(v_body, 280),
        format('/story/%s#comment-%s', COALESCE(v_article_slug, p_article_id::text), v_new_id),
        jsonb_build_object(
          'comment_id', v_new_id,
          'article_id', p_article_id,
          'article_title', v_article_title,
          'parent_comment_id', p_parent_id,
          'actor_user_id', p_user_id,
          'actor_username', v_actor_username
        ),
        true
      );
    END IF;
  END IF;

  FOR v_mention_entry IN SELECT * FROM jsonb_array_elements(v_mentions)
  LOOP
    BEGIN
      v_mentioned_id := (v_mention_entry->>'user_id')::uuid;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
    IF v_mentioned_id IS NULL OR v_mentioned_id = p_user_id THEN
      CONTINUE;
    END IF;
    IF p_parent_id IS NOT NULL AND v_mentioned_id = v_parent.user_id THEN
      CONTINUE;
    END IF;
    SELECT EXISTS(
      SELECT 1 FROM blocked_users b
       WHERE b.blocker_id = v_mentioned_id AND b.blocked_id = p_user_id
    ) INTO v_blocked;
    IF v_blocked THEN
      CONTINUE;
    END IF;
    INSERT INTO notifications
      (user_id, type, title, body, action_url, metadata, email_sent)
    VALUES (
      v_mentioned_id,
      'comment_mention',
      format('@%s mentioned you', COALESCE(v_actor_username, 'someone')),
      left(v_body, 280),
      format('/story/%s#comment-%s', COALESCE(v_article_slug, p_article_id::text), v_new_id),
      jsonb_build_object(
        'comment_id', v_new_id,
        'article_id', p_article_id,
        'article_title', v_article_title,
        'parent_comment_id', p_parent_id,
        'actor_user_id', p_user_id,
        'actor_username', v_actor_username
      ),
      true
    );
  END LOOP;

  RETURN jsonb_build_object('id', v_new_id, 'root_id', v_root_id, 'depth', v_depth);
END;
$function$;

-- Post-verification: confirm every targeted RPC now references is_kid_delegated().
DO $$
DECLARE
  v_target text;
  v_missing text[] := ARRAY[]::text[];
BEGIN
  FOREACH v_target IN ARRAY ARRAY[
    'update_own_profile','lockdown_self','update_metadata','register_push_token',
    'upsert_user_push_token','revoke_session','revoke_all_other_sessions',
    'session_heartbeat','create_support_ticket','mint_owner_referral_link',
    'mint_referral_codes','clear_kid_lockout','graduate_kid_profile',
    'grant_pro_to_cohort','get_own_login_activity','convert_kid_trial',
    'submit_appeal','post_comment'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc
       WHERE proname = v_target
         AND pronamespace='public'::regnamespace
         AND prosrc ~ 'is_kid_delegated'
    ) THEN
      v_missing := v_missing || v_target;
    END IF;
  END LOOP;
  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'S1-Q3b: % RPCs still missing kid-reject: %',
      array_length(v_missing, 1), v_missing;
  END IF;
  RAISE NOTICE 'S1-Q3b (RPC kid-rejects) applied: 18 RPCs (post_comment + 17 others) now reject kid tokens';
END $$;

COMMIT;
