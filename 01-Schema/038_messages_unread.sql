-- 038_messages_unread.sql
-- Powers the unread-indicator UI on /messages (web + iOS).
-- Everything below is additive and idempotent — safe to re-run.

BEGIN;

-- Optional covering index. The existing UNIQUE on (conversation_id, user_id)
-- already serves the point-lookup path; this adds the reverse (user_id first)
-- for the list query used by get_unread_counts below. Both shapes will be
-- hit by the RPC, so we add it defensively.
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_conv
  ON conversation_participants (user_id, conversation_id)
  WHERE left_at IS NULL;

-- Returns one row per active conversation for the calling user with the
-- count of messages created by OTHER users after the caller's last_read_at
-- (or all such messages if last_read_at is NULL — a new conversation).
CREATE OR REPLACE FUNCTION public.get_unread_counts()
RETURNS TABLE (conversation_id uuid, unread bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cp.conversation_id,
         count(m.id) FILTER (
           WHERE m.sender_id <> auth.uid()
             AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
         ) AS unread
    FROM conversation_participants cp
    LEFT JOIN messages m ON m.conversation_id = cp.conversation_id
   WHERE cp.user_id = auth.uid()
     AND cp.left_at IS NULL
   GROUP BY cp.conversation_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_counts() TO authenticated;

COMMIT;

-- Verify (manual):
-- SELECT * FROM public.get_unread_counts();
