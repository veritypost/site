-- Round 7 -- start_conversation RPC: atomic convo + both participant rows,
-- paid-gate via user_has_dm_access, dedupe on existing direct convo.
-- Pairs with /api/conversations route; iOS/web stop inserting directly.

CREATE OR REPLACE FUNCTION public.start_conversation(
  p_user_id        uuid,
  p_other_user_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id  uuid;
  v_new_id       uuid;
BEGIN
  IF p_user_id IS NULL OR p_other_user_id IS NULL THEN
    RAISE EXCEPTION 'user ids required';
  END IF;
  IF p_user_id = p_other_user_id THEN
    RAISE EXCEPTION 'cannot start a conversation with yourself';
  END IF;
  IF NOT public.user_has_dm_access(p_user_id) THEN
    RAISE EXCEPTION 'direct messages require a paid plan';
  END IF;
  IF public._user_is_dm_blocked(p_user_id) THEN
    RAISE EXCEPTION 'account is muted or banned -- cannot start conversations';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_other_user_id) THEN
    RAISE EXCEPTION 'recipient not found';
  END IF;

  -- Dedupe: return existing direct conversation if both users already share one.
  SELECT c.id INTO v_existing_id
    FROM public.conversations c
   WHERE c.type = 'direct'
     AND c.is_active = true
     AND EXISTS (
           SELECT 1 FROM public.conversation_participants p1
            WHERE p1.conversation_id = c.id AND p1.user_id = p_user_id
         )
     AND EXISTS (
           SELECT 1 FROM public.conversation_participants p2
            WHERE p2.conversation_id = c.id AND p2.user_id = p_other_user_id
         )
   LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_existing_id, 'existed', true);
  END IF;

  INSERT INTO public.conversations (created_by, type)
  VALUES (p_user_id, 'direct')
  RETURNING id INTO v_new_id;

  INSERT INTO public.conversation_participants (conversation_id, user_id, role)
  VALUES (v_new_id, p_user_id,       'owner'),
         (v_new_id, p_other_user_id, 'member');

  RETURN jsonb_build_object('id', v_new_id, 'existed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.start_conversation(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_conversation(uuid, uuid) TO authenticated, service_role;
