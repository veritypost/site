-- S1-Q4.8 — freeze content-lockout RLS: add frozen_at check to 4 INSERT policies
--
-- Decision (Q4.8): "B — content lockout. Add frozen_at IS NULL to comment INSERT
-- RLS, vote routes, follow routes, message routes. If a user's payment is disputed
-- enough to trigger a freeze, they shouldn't be active in community."
--
-- Verified state (2026-04-27):
--   comments_insert:    with_check = auth.uid()=user_id AND has_verified_email() AND NOT is_banned() AND user_passed_article_quiz(...)
--   comment_votes_insert: with_check = auth.uid()=user_id AND has_verified_email() AND NOT is_banned() AND user_passed_article_quiz(...)
--   follows_insert:     with_check = auth.uid()=follower_id AND has_verified_email() AND NOT is_banned() AND is_premium()
--   messages_insert:    with_check = auth.uid()=sender_id AND conversation membership AND NOT _user_is_dm_blocked(auth.uid())
-- None have a frozen_at check.
--
-- Pattern: inline correlated subquery `(SELECT frozen_at IS NULL FROM users WHERE id=auth.uid())`
-- rather than a helper function. The helper would be an extra dependency; the subquery
-- is self-contained and equally fast (auth.uid() lookup is hot).
--
-- Service-role callers are unaffected (no auth.uid() → policies don't fire for service_role).
--
-- Acceptance: pg_policies.with_check for all 4 policies contains 'frozen_at'.

BEGIN;

DO $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count FROM pg_policies
   WHERE tablename IN ('comments','comment_votes','follows','messages')
     AND cmd='INSERT' AND with_check LIKE '%frozen_at%';
  IF v_count >= 4 THEN
    RAISE NOTICE 'S1-Q4.8 no-op: all INSERT policies already have frozen_at check';
  END IF;
END $$;

-- Comments INSERT
ALTER POLICY comments_insert ON public.comments
  WITH CHECK (
    user_id = auth.uid()
    AND has_verified_email()
    AND (NOT is_banned())
    AND user_passed_article_quiz(auth.uid(), article_id)
    AND (SELECT u.frozen_at IS NULL FROM public.users u WHERE u.id = auth.uid())
  );

-- Comment votes INSERT
ALTER POLICY comment_votes_insert ON public.comment_votes
  WITH CHECK (
    user_id = auth.uid()
    AND has_verified_email()
    AND (NOT is_banned())
    AND user_passed_article_quiz(
      auth.uid(),
      (SELECT c.article_id FROM public.comments c WHERE c.id = comment_votes.comment_id)
    )
    AND (SELECT u.frozen_at IS NULL FROM public.users u WHERE u.id = auth.uid())
  );

-- Follows INSERT
ALTER POLICY follows_insert ON public.follows
  WITH CHECK (
    follower_id = auth.uid()
    AND has_verified_email()
    AND (NOT is_banned())
    AND is_premium()
    AND (SELECT u.frozen_at IS NULL FROM public.users u WHERE u.id = auth.uid())
  );

-- Messages INSERT
ALTER POLICY messages_insert ON public.messages
  WITH CHECK (
    sender_id = auth.uid()
    AND conversation_id IN (
      SELECT cp.conversation_id
        FROM public.conversation_participants cp
       WHERE cp.user_id = auth.uid()
    )
    AND (NOT _user_is_dm_blocked(auth.uid()))
    AND (SELECT u.frozen_at IS NULL FROM public.users u WHERE u.id = auth.uid())
  );

DO $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count FROM pg_policies
   WHERE tablename IN ('comments','comment_votes','follows','messages')
     AND cmd='INSERT' AND with_check LIKE '%frozen_at%';
  IF v_count < 4 THEN
    RAISE EXCEPTION 'S1-Q4.8 post-check failed: only % of 4 INSERT policies updated', v_count;
  END IF;
  RAISE NOTICE 'S1-Q4.8 applied: frozen_at check added to 4 INSERT policies';
END $$;

COMMIT;
