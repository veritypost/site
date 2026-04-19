-- 049_post_message_rpc.sql
-- Bug 83: web sends DMs via direct supabase.from('messages').insert from the
-- browser — no server-side moderation, rate limit, or paid gate. Mirror the
-- post_comment pattern: SECURITY DEFINER RPC that consolidates all checks
-- and the conversation preview update into one transaction.
--
-- Checks layered in: (1) DM access (paid tier + not frozen per D40),
-- (2) DM mute/ban via _user_is_dm_blocked, (3) participant in the
-- conversation, (4) body length bounds, (5) rate limit (30 messages
-- per minute per user — stops trivial spam loops), (6) conversation
-- preview update in the same tx.
--
-- Idempotent.

BEGIN;

CREATE OR REPLACE FUNCTION public.post_message(
  p_user_id uuid,
  p_conversation_id uuid,
  p_body text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_body text;
  v_max_len int := 4000;
  v_new_id uuid;
  v_is_participant boolean;
  v_recent_count int;
  v_preview text;
BEGIN
  IF NOT public.user_has_dm_access(p_user_id) THEN
    RAISE EXCEPTION 'direct messages require a paid plan';
  END IF;

  IF public._user_is_dm_blocked(p_user_id) THEN
    RAISE EXCEPTION 'account is muted or banned — cannot send messages';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = p_user_id
  ) INTO v_is_participant;
  IF NOT v_is_participant THEN
    RAISE EXCEPTION 'not a participant of this conversation';
  END IF;

  v_body := btrim(COALESCE(p_body, ''));
  IF length(v_body) = 0 THEN RAISE EXCEPTION 'message body is empty'; END IF;
  IF length(v_body) > v_max_len THEN
    RAISE EXCEPTION 'message exceeds max length (% chars)', v_max_len;
  END IF;

  -- 30/min rate limit.
  SELECT count(*) INTO v_recent_count FROM messages
    WHERE sender_id = p_user_id AND created_at > now() - interval '1 minute';
  IF v_recent_count >= 30 THEN
    RAISE EXCEPTION 'rate limit: too many messages; slow down';
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
$$;

GRANT EXECUTE ON FUNCTION public.post_message(uuid, uuid, text) TO service_role;

COMMIT;
