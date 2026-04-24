-- 152_update_own_profile_freeze_username.sql
-- Tier 2 #12 — `update_own_profile` RPC (schema/085) allowlists
-- `username`, and the `reject_privileged_user_updates` trigger
-- (schema/065) doesn't mention it in its IS DISTINCT list. Web UI
-- disables the username field in settings, but DevTools and iOS
-- SettingsView's ProfilePatch both send it, so the "Usernames cannot
-- be changed" product copy was a client-side lie — any caller could
-- rename freely via the RPC.
--
-- Keep the first-time username-pick flow alive (signup/pick-username
-- calls this RPC with `{ username: value }` while users.username is
-- NULL): allow the assignment only when the row's current username
-- is NULL. Any subsequent call with a `username` key is silently
-- ignored. Display name / bio / avatar / metadata etc. continue to
-- work as before.

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
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_fields IS NULL OR jsonb_typeof(p_fields) <> 'object' THEN
    RAISE EXCEPTION 'p_fields must be a jsonb object' USING ERRCODE = '22023';
  END IF;

  UPDATE public.users u
  SET
    -- First-time-only: accept the `username` key only when the row
    -- has no username yet. A later attempt is a silent no-op so the
    -- SettingsView iOS flow (which still sends the field for legacy
    -- reasons) doesn't error out; it just can't rename.
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
