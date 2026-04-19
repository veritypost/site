-- 085_add_update_own_profile_rpc_2026_04_19.sql
-- Migration: 20260419124021 add_update_own_profile_rpc_2026_04_19
--
-- Round 5 Item 2: single server-side write contract for self-profile edits.
--
-- SECURITY DEFINER RPC with explicit 20-column allowlist. Unknown keys in
-- p_fields are silently ignored (owner decision: descriptive fields only;
-- privileged fields stay trigger-protected via Round 4 migration 065).
--
-- Metadata semantics: server-side shallow deep-merge at the top level.
-- When p_fields contains a `metadata` key, the RPC does
--   UPDATE users SET metadata = COALESCE(metadata, '{}'::jsonb) || <patch>
-- so concurrent writers that touch OTHER top-level metadata keys (feed,
-- a11y, expertWatchlist, expertVacation, avatar, location, website,
-- notification_prefs, expert) do not clobber each other at the API layer.
--
-- Idempotent: CREATE OR REPLACE + explicit REVOKE/GRANT every run.

CREATE OR REPLACE FUNCTION public.update_own_profile(p_fields jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
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
    username = CASE WHEN p_fields ? 'username'
                    THEN NULLIF(p_fields->>'username', '')::varchar
                    ELSE u.username END,
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
$fn$;

ALTER FUNCTION public.update_own_profile(jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.update_own_profile(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_own_profile(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_own_profile(jsonb) TO authenticated;

COMMENT ON FUNCTION public.update_own_profile(jsonb) IS
  'Round 5 Item 2: single server-side write contract for self-profile edits. '
  'SECDEF, 20-column allowlist. Unknown keys silently ignored. Metadata is '
  'server-side deep-merged at the top level (|| operator). Privileged columns '
  '(is_expert, plan_id, verity_score, etc.) are protected by the Round 4 '
  'trigger reject_privileged_user_updates and never appear in the allowlist.';
