-- =====================================================================
-- T17 — start_conversation + post_message: enforce blocked_users
-- =====================================================================
-- The audit flagged that web/iOS only filter blocked-user conversations
-- in the UI; the underlying RPCs don't check the blocked_users table.
--
-- MCP verification 2026-04-27:
--   start_conversation — checks sender DM access + sender mute/ban +
--     recipient existence + (post-T16) recipient allow_messages. NO
--     check on blocked_users in either direction.
--   post_message — checks sender DM access + sender mute/ban +
--     conversation participation + body length + rate limit. NO
--     check on blocked_users between conversation participants.
--
-- Net result: a user who has been blocked by another can still start
-- a conversation with that other user (start_conversation), and a user
-- in an existing conversation that pre-dates the block can still keep
-- sending messages (post_message). The UI hides this; third-party
-- clients with the public anon key bypass.
--
-- This migration adds bidirectional block checks to both RPCs:
--   * start_conversation — reject if sender↔other are blocked in
--     EITHER direction.
--   * post_message — for direct (1:1) conversations, find the other
--     participant and reject if blocked in EITHER direction. Group
--     conversations (if any future shape) are not affected — block
--     between two participants of a multi-party convo is a separate
--     UX problem (per-message hide, not per-message reject).
--
-- New error code: [DM_BLOCKED]. Surfaced via uniform `cannot_dm` 403
-- in the route layer alongside the existing T283 / T16 codes.
--
-- Schema verified 2026-04-27 via MCP:
--   blocked_users(blocker_id uuid, blocked_id uuid, ...) — the
--   directional shape is "blocker blocked blocked." Bidirectional
--   check uses .or(blocker_id=A AND blocked_id=B, blocker_id=B AND
--   blocked_id=A) semantics.
--
-- Idempotent: CREATE OR REPLACE; no-op if already in place.
-- Rollback: re-run prior CREATE OR REPLACE bodies (preserved in git
-- history at commit df5cdb8 / 27ee7b3 and earlier).
-- =====================================================================

BEGIN;

-- ----- start_conversation ---------------------------------------------
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

  -- T16 — recipient privacy gate.
  IF NOT (SELECT allow_messages FROM public.users WHERE id = p_other_user_id) THEN
    RAISE EXCEPTION '[DM_RECIPIENT_OPTED_OUT] recipient does not accept direct messages';
  END IF;

  -- T17 — bidirectional block enforcement. Either direction blocks.
  IF EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker_id = p_user_id AND blocked_id = p_other_user_id)
       OR (blocker_id = p_other_user_id AND blocked_id = p_user_id)
  ) THEN
    RAISE EXCEPTION '[DM_BLOCKED] cannot start conversation with a blocked user';
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

-- ----- post_message ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_message(p_user_id uuid, p_conversation_id uuid, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_body text;
  v_max_len int := 4000;
  v_new_id uuid;
  v_is_participant boolean;
  v_recent_count int;
  v_preview text;
  v_other_user_id uuid;
  v_conv_type text;
BEGIN
  IF NOT public.user_has_dm_access(p_user_id) THEN
    RAISE EXCEPTION '[DM_PAID_PLAN] direct messages require a paid plan';
  END IF;

  IF public._user_is_dm_blocked(p_user_id) THEN
    RAISE EXCEPTION '[DM_MUTED] account is muted or banned -- cannot send messages';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = p_user_id
  ) INTO v_is_participant;
  IF NOT v_is_participant THEN
    RAISE EXCEPTION '[NOT_PARTICIPANT] not a participant of this conversation';
  END IF;

  -- T17 — bidirectional block enforcement on direct (1:1) conversations.
  -- Find the other participant; if a block exists in either direction,
  -- reject the send. Group conversations (type != 'direct') skip this
  -- check — block-in-multi-party is a per-message UX hide, not a hard
  -- send reject.
  SELECT type INTO v_conv_type FROM conversations WHERE id = p_conversation_id;
  IF v_conv_type = 'direct' THEN
    SELECT user_id INTO v_other_user_id
      FROM conversation_participants
     WHERE conversation_id = p_conversation_id
       AND user_id <> p_user_id
     LIMIT 1;
    IF v_other_user_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.blocked_users
      WHERE (blocker_id = p_user_id AND blocked_id = v_other_user_id)
         OR (blocker_id = v_other_user_id AND blocked_id = p_user_id)
    ) THEN
      RAISE EXCEPTION '[DM_BLOCKED] cannot send messages to a blocked user';
    END IF;
  END IF;

  v_body := btrim(COALESCE(p_body, ''));
  IF length(v_body) = 0 THEN
    RAISE EXCEPTION '[DM_EMPTY] message body is empty';
  END IF;
  IF length(v_body) > v_max_len THEN
    RAISE EXCEPTION '[DM_TOO_LONG] message exceeds max length (% chars)', v_max_len;
  END IF;

  SELECT count(*) INTO v_recent_count FROM messages
    WHERE sender_id = p_user_id AND created_at > now() - interval '1 minute';
  IF v_recent_count >= 30 THEN
    RAISE EXCEPTION '[DM_RATE_LIMIT] too many messages; slow down';
  END IF;

  INSERT INTO messages (conversation_id, sender_id, body, status, moderation_status)
  VALUES (p_conversation_id, p_user_id, v_body, 'sent', 'clean')
  RETURNING id INTO v_new_id;

  v_preview := substring(v_body for 100);
  UPDATE conversations
    SET last_message_preview = v_preview,
        last_message_at = now(),
        updated_at = now()
    WHERE id = p_conversation_id;

  RETURN jsonb_build_object(
    'id', v_new_id,
    'conversation_id', p_conversation_id,
    'sender_id', p_user_id,
    'body', v_body,
    'created_at', now()
  );
END;
$function$;

COMMIT;

-- Verification queries (run after apply):
--   SELECT pg_get_functiondef('public.start_conversation(uuid,uuid)'::regprocedure) LIKE '%DM_BLOCKED%';   -- expect true
--   SELECT pg_get_functiondef('public.post_message(uuid,uuid,text)'::regprocedure) LIKE '%DM_BLOCKED%';     -- expect true
