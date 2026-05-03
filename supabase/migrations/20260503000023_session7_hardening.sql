-- Session 7 hardening: close mass-impersonation gaps on toggle_follow
-- and system_apply_dob_correction discovered in Session 6 verification.
--
-- toggle_follow was added in 20260502000000_add_missing_rpcs.sql without a
-- REVOKE block; it accepts a caller-supplied p_follower_id with no auth check,
-- so any anon-key holder can force-follow/unfolce on behalf of any user.
--
-- system_apply_dob_correction was redefined in
-- 20260503000011_session1_drop_gucs_extend_users_protect.sql without a REVOKE;
-- PUBLIC EXECUTE was inherited, leaving a SECURITY DEFINER COPPA-adjacent
-- function callable from /rest/v1/rpc/.

-- ============================================================================
-- Fix 1: toggle_follow — REVOKE + service-role gate
--
-- The /api/follows route uses createServiceClient() and enforces user identity
-- via requirePermission('profile.follow') BEFORE calling the RPC. So the RPC
-- itself only needs to ensure the caller IS the service-role backend (a direct
-- /rest/v1/rpc call from an anon-key holder must be rejected). auth.uid() is
-- NULL inside service-role calls — checking it would break the route. Use the
-- same JWT-claim gate as system_apply_dob_correction.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.toggle_follow(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.toggle_follow(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.toggle_follow(
  p_follower_id uuid,
  p_target_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_exists   boolean;
  v_count    int;
  v_now      timestamptz := now();
BEGIN
  -- Service-role gate: only the backend route may call this function.
  IF current_user NOT IN ('postgres','supabase_admin')
     AND COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_follower_id = p_target_id THEN
    RAISE EXCEPTION 'cannot_follow_self' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.follows
     WHERE follower_id = p_follower_id
       AND following_id = p_target_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.follows
     WHERE follower_id = p_follower_id
       AND following_id = p_target_id;

    UPDATE public.users
       SET followers_count = GREATEST(followers_count - 1, 0)
     WHERE id = p_target_id;

    UPDATE public.users
       SET following_count = GREATEST(following_count - 1, 0)
     WHERE id = p_follower_id;
  ELSE
    INSERT INTO public.follows (follower_id, following_id, notify, created_at, updated_at)
    VALUES (p_follower_id, p_target_id, true, v_now, v_now)
    ON CONFLICT (follower_id, following_id) DO NOTHING;

    UPDATE public.users
       SET followers_count = followers_count + 1
     WHERE id = p_target_id;

    UPDATE public.users
       SET following_count = following_count + 1
     WHERE id = p_follower_id;
  END IF;

  SELECT followers_count INTO v_count
    FROM public.users
   WHERE id = p_target_id;

  RETURN jsonb_build_object(
    'following',       NOT v_exists,
    'follower_count',  COALESCE(v_count, 0)
  );
END;
$$;

-- ============================================================================
-- Fix 2: system_apply_dob_correction — REVOKE + service-role gate
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.system_apply_dob_correction(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.system_apply_dob_correction(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.system_apply_dob_correction(
  p_request_id uuid,
  p_decision_reason text DEFAULT 'cooldown_auto_approval'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_request public.kid_dob_correction_requests%ROWTYPE;
  v_old_dob date;
  v_old_band text;
  v_new_band text;
BEGIN
  -- Service-role gate: only the cron/server backend may call this function.
  IF current_user NOT IN ('postgres','supabase_admin')
     AND COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request FROM public.kid_dob_correction_requests
    WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_request.status NOT IN ('pending','documentation_requested') THEN
    RAISE EXCEPTION 'Request not pending (status=%)', v_request.status USING ERRCODE = '22023';
  END IF;
  -- Cron only auto-approves; admin-level reject + docs-request stay on
  -- admin_apply_dob_correction (which has the perm check).
  IF v_request.direction <> 'younger' THEN
    RAISE EXCEPTION 'system_apply_dob_correction: only younger-band auto-approve' USING ERRCODE = '22023';
  END IF;

  UPDATE public.kid_dob_correction_requests
  SET status = 'approved',
      decision_reason = p_decision_reason,
      decided_at = now()
  WHERE id = p_request_id;

  SELECT date_of_birth, reading_band INTO v_old_dob, v_old_band
    FROM public.kid_profiles WHERE id = v_request.kid_profile_id;
  v_new_band := public.compute_band_from_dob(v_request.requested_dob);

  -- Q02 (2026-05-03): GUC override removed; kid_profiles triggers now bypass
  -- on current_user='postgres', which is true inside this SECURITY DEFINER body.
  UPDATE public.kid_profiles
  SET date_of_birth = v_request.requested_dob,
      reading_band = v_new_band,
      band_changed_at = now(),
      band_history = band_history || jsonb_build_array(
        jsonb_build_object(
          'old_band', v_old_band,
          'new_band', v_new_band,
          'set_at', now(),
          'set_by', null,
          'reason', 'cooldown_auto:' || v_request.id::text
        )
      )
  WHERE id = v_request.kid_profile_id;

  INSERT INTO public.kid_dob_history (
    kid_profile_id, old_dob, new_dob, change_source,
    actor_user_id, decision_reason
  )
  VALUES (
    v_request.kid_profile_id, v_old_dob, v_request.requested_dob,
    'admin_correction', null, p_decision_reason
  );
END;
$function$;
