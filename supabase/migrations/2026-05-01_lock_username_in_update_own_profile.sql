-- Lock username in update_own_profile RPC.
--
-- Source of truth: live RPC body pulled via Supabase MCP on 2026-05-01
-- (RPC was never in supabase/migrations/ before this file). This migration
-- replaces it verbatim except for two changes:
--
--   1. Adds an explicit guard near the top that raises 42501 'username locked'
--      when a non-admin user tries to set username on a row that already has
--      a non-empty username. The empty-string trap is fixed via
--      coalesce(nullif(v_current, ''), null) so legacy '' rows can still
--      first-pick. Admins bypass via is_admin_or_above().
--
--   2. Simplifies the username CASE clause inside the UPDATE — the guard now
--      enforces who can write, so the `AND u.username IS NULL` predicate is
--      removed (otherwise admin renames would silently no-op even after
--      passing the guard).
--
-- Everything else (kid-delegated check, not-authenticated check, jsonb-typeof
-- check, every other CASE column, RETURNING/RETURN, SECURITY DEFINER,
-- search_path, signature) is preserved verbatim from the live source.

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

  -- Username lock: once a non-empty username is set, only admins can change it.
  -- Converts the prior silent no-op (CASE clause WHEN ... AND u.username IS NULL)
  -- into an explicit 42501 so the UI knows the rename failed. The
  -- coalesce(nullif(...)) handles legacy rows where username = '' so they
  -- can still complete first-pick.
  IF (p_fields ? 'username') THEN
    DECLARE
      v_current text;
    BEGIN
      SELECT username INTO v_current FROM public.users WHERE id = v_uid;
      IF coalesce(nullif(v_current, ''), null) IS NOT NULL
         AND NOT public.is_admin_or_above() THEN
        RAISE EXCEPTION 'username locked' USING ERRCODE = '42501';
      END IF;
    END;
  END IF;

  UPDATE public.users u
  SET
    username = CASE
                 WHEN p_fields ? 'username'
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
