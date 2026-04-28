-- S1-T14 — use_streak_freeze(p_user_id uuid) RPC
--
-- Adult plumbing exists (streak_freeze_remaining on users, iOS Models.swift decodes it,
-- admin streak_freeze flag lives in metadata) but there is no server endpoint to consume
-- a freeze and restore the streak. This RPC provides that endpoint.
--
-- Mirrors the shape of the existing use_kid_streak_freeze RPC.
--
-- Auth: self-or-admin. Kid tokens are blocked via JWT claim check (is_kid_delegated()
-- helper not yet created — inline check on jwt()->> 'kid_profile_id'; updates to
-- use is_kid_delegated() once Q3b lands).
--
-- Logic:
--   1. Auth gate (self or admin; kid token rejected)
--   2. Lock row for update
--   3. Guard: ≥1 freeze remaining
--   4. Restore streak_current = streak_best; decrement streak_freeze_remaining
--   5. Audit log + return jsonb
--
-- audit_log columns (verified 2026-04-27): actor_id, actor_type, action,
--   target_type, target_id, metadata (no target_user_id column).
--
-- Acceptance: pg_proc shows use_streak_freeze with prosecdef=true;
-- GRANT EXECUTE to authenticated present.

BEGIN;

CREATE OR REPLACE FUNCTION public.use_streak_freeze(p_user_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_remaining int;
  v_current   int;
  v_best      int;
BEGIN
  -- Self-or-admin gate
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT is_admin_or_above() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Kid token rejection (inline until is_kid_delegated() is created by Q3b)
  IF auth.jwt() ->> 'kid_profile_id' IS NOT NULL THEN
    RAISE EXCEPTION 'forbidden: kid token cannot use adult streak freeze'
      USING ERRCODE = '42501';
  END IF;

  SELECT streak_freeze_remaining, streak_current, streak_best
    INTO v_remaining, v_current, v_best
    FROM public.users
   WHERE id = p_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found: %', p_user_id USING ERRCODE = 'P0002';
  END IF;

  IF v_remaining IS NULL OR v_remaining <= 0 THEN
    RAISE EXCEPTION 'no streak freezes remaining' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.users
     SET streak_current          = v_best,
         streak_freeze_remaining = v_remaining - 1,
         streak_freeze_used_at   = now(),
         updated_at              = now()
   WHERE id = p_user_id;

  INSERT INTO public.audit_log
    (actor_id, actor_type, action, target_type, target_id, metadata)
  VALUES (
    p_user_id, 'user',
    'streak_freeze_used',
    'user', p_user_id,
    jsonb_build_object(
      'restored_to',    v_best,
      'was',            v_current,
      'remaining_after', v_remaining - 1
    )
  );

  RETURN jsonb_build_object(
    'success',    true,
    'restored_to', v_best,
    'remaining',  v_remaining - 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.use_streak_freeze(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.use_streak_freeze(uuid) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE proname = 'use_streak_freeze'
       AND pronamespace = 'public'::regnamespace
       AND prosecdef = true
  ) THEN
    RAISE EXCEPTION 'S1-T14 post-check failed: use_streak_freeze not found or not SECURITY DEFINER';
  END IF;
  RAISE NOTICE 'S1-T14 applied: use_streak_freeze RPC live';
END $$;

COMMIT;
