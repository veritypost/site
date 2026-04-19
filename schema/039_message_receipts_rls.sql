-- 039_message_receipts_rls.sql
-- Loosens message_receipts SELECT so the sender of a message can see whether
-- it was read, while keeping INSERT/UPDATE scoped to the row owner. Recipients
-- continue to only see their own rows; senders additionally see rows for
-- messages they sent. 1:1 DM binary "Read" display is the immediate use case;
-- naturally extends to "Read by N" for any future group-DM model.

BEGIN;

DROP POLICY IF EXISTS "message_receipts_select" ON "message_receipts";

CREATE POLICY "message_receipts_select" ON "message_receipts" FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM messages m
    WHERE m.id = message_receipts.message_id
      AND m.sender_id = auth.uid()
  )
);

-- INSERT + UPDATE policies unchanged: `user_id = auth.uid()`.

COMMIT;

-- Verify (manual):
-- SELECT * FROM pg_policies WHERE tablename = 'message_receipts';
