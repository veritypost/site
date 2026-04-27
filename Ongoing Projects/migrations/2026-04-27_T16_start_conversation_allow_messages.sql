-- =====================================================================
-- T16 — start_conversation: enforce recipient's allow_messages opt-out
-- =====================================================================
-- The current `start_conversation(p_user_id, p_other_user_id)` RPC
-- checks sender DM access + sender mute/ban + recipient existence,
-- but does NOT honor the recipient's `users.allow_messages` flag.
-- A third-party client with the public anon key could bypass the UI
-- hide and force-create conversations with users who opted out of
-- direct messages. This is a privacy hole.
--
-- This migration adds a single recipient-allow-messages check to the
-- existing function body, preserving every other behavior. New error
-- code: [DM_RECIPIENT_OPTED_OUT]. The existing /api/conversations
-- route's T283 enumeration-collapse already maps DM_PAID_PLAN +
-- DM_MUTED + USER_NOT_FOUND to a uniform 403 'cannot_dm' — extend
-- the same set with DM_RECIPIENT_OPTED_OUT so error codes don't leak
-- the recipient's opt-out preference.
--
-- Schema verified 2026-04-27 via MCP:
--   users.allow_messages boolean DEFAULT true
--
-- Idempotent: CREATE OR REPLACE; no-op if already in place.
-- Rollback: re-run the prior CREATE OR REPLACE without the new check
-- (preserved in git history at commit 5573de6 and earlier).
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.start_conversation(p_user_id uuid, p_other_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_id  uuid;
  v_new_id       uuid;
BEGIN
  IF p_user_id IS NULL OR p_other_user_id IS NULL THEN
    RAISE EXCEPTION '[DM_MISSING_IDS] user ids required';
  END IF;
  IF p_user_id = p_other_user_id THEN
    RAISE EXCEPTION '[SELF_CONV] cannot start a conversation with yourself';
  END IF;
  IF NOT public.user_has_dm_access(p_user_id) THEN
    RAISE EXCEPTION '[DM_PAID_PLAN] direct messages require a paid plan';
  END IF;
  IF public._user_is_dm_blocked(p_user_id) THEN
    RAISE EXCEPTION '[DM_MUTED] account is muted or banned -- cannot start conversations';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_other_user_id) THEN
    RAISE EXCEPTION '[USER_NOT_FOUND] recipient not found';
  END IF;

  -- T16 — recipient privacy gate. allow_messages defaults true; only
  -- explicit opt-out blocks. The /api/conversations route catches the
  -- error code below and surfaces a uniform 403 'cannot_dm' alongside
  -- DM_PAID_PLAN / DM_MUTED / USER_NOT_FOUND so the response shape
  -- doesn't leak the recipient's opt-out preference (T283 + T16).
  IF NOT (SELECT allow_messages FROM public.users WHERE id = p_other_user_id) THEN
    RAISE EXCEPTION '[DM_RECIPIENT_OPTED_OUT] recipient does not accept direct messages';
  END IF;

  SELECT c.id INTO v_existing_id
    FROM public.conversations c
   WHERE c.type = 'direct'
     AND c.is_active = true
     AND EXISTS (SELECT 1 FROM public.conversation_participants p1 WHERE p1.conversation_id = c.id AND p1.user_id = p_user_id)
     AND EXISTS (SELECT 1 FROM public.conversation_participants p2 WHERE p2.conversation_id = c.id AND p2.user_id = p_other_user_id)
   LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_existing_id, 'existed', true);
  END IF;

  INSERT INTO public.conversations (created_by, type) VALUES (p_user_id, 'direct') RETURNING id INTO v_new_id;
  INSERT INTO public.conversation_participants (conversation_id, user_id, role)
  VALUES (v_new_id, p_user_id, 'owner'), (v_new_id, p_other_user_id, 'member');
  RETURN jsonb_build_object('id', v_new_id, 'existed', false);
END;
$function$;

COMMIT;

-- Verification query (run after apply):
--   SELECT pg_get_functiondef('public.start_conversation(uuid,uuid)'::regprocedure)
--     LIKE '%DM_RECIPIENT_OPTED_OUT%';
-- Expected: true
