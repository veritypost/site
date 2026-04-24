-- 150_dm_rpc_error_prefixes.sql
-- Tier 2 #21 — RPC error messages now carry a stable [CODE] prefix so
-- the API routes can map errors to HTTP status without substring-
-- matching free-text that drifts every time copy changes. The fallback
-- (400 + "Could not…") in the route already exists, but 429 +
-- Retry-After relies on recognising the rate-limit case.
--
-- Codes (read by web/src/app/api/messages/route.js +
-- web/src/app/api/conversations/route.js):
--   [DM_PAID_PLAN]       403
--   [DM_MUTED]           403
--   [NOT_PARTICIPANT]    403
--   [DM_EMPTY]           400
--   [DM_TOO_LONG]        400
--   [DM_RATE_LIMIT]      429 + Retry-After
--   [DM_MISSING_IDS]     400
--   [SELF_CONV]          400
--   [USER_NOT_FOUND]     404

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
BEGIN
  IF NOT public.user_has_dm_access(p_user_id) THEN
    RAISE EXCEPTION '[DM_PAID_PLAN] direct messages require a paid plan';
  END IF;

  IF public._user_is_dm_blocked(p_user_id) THEN
    RAISE EXCEPTION '[DM_MUTED] account is muted or banned — cannot send messages';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = p_user_id
  ) INTO v_is_participant;
  IF NOT v_is_participant THEN
    RAISE EXCEPTION '[NOT_PARTICIPANT] not a participant of this conversation';
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
