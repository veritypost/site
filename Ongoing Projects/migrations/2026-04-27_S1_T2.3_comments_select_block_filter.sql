-- S1-T2.3 — comments_select RLS: add blocked_users filter to visible branch
--
-- Current USING clause (verified 2026-04-27):
--   ((status='visible' AND deleted_at IS NULL) OR user_id=auth.uid() OR is_mod_or_above())
--
-- Gap: a user who has blocked another user still sees that user's comments.
-- The blocked_users table (blocker_id, blocked_id) is the authoritative source.
--
-- New USING clause restructures the three OR branches to apply the block
-- check only to the "visible other people's comments" path:
--   1. is_mod_or_above() — mods see everything, no block filter
--   2. user_id = auth.uid() — own comments always visible (including hidden)
--   3. visible + undeleted + (anonymous OR not blocked by viewer)
--
-- Performance: blocked_users lookup only fires for authenticated requests on
-- the visible branch. A partial index on blocked_users(blocker_id) already
-- exists (confirmed T0.3 pre-flight verified the table structure).
--
-- Acceptance: pg_policies.qual for comments_select contains 'blocked_users'.

BEGIN;

DO $$
DECLARE
  v_qual text;
BEGIN
  SELECT qual INTO v_qual FROM pg_policies
   WHERE tablename = 'comments' AND policyname = 'comments_select';
  IF v_qual IS NULL THEN
    RAISE EXCEPTION 'S1-T2.3 abort: comments_select policy not found';
  END IF;
  IF v_qual LIKE '%blocked_users%' THEN
    RAISE NOTICE 'S1-T2.3 no-op: comments_select already has blocked_users filter';
  END IF;
END $$;

ALTER POLICY comments_select ON public.comments
  USING (
    is_mod_or_above()
    OR (user_id = auth.uid())
    OR (
      (status = 'visible' AND deleted_at IS NULL)
      AND (
        auth.uid() IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM public.blocked_users bu
           WHERE bu.blocker_id = auth.uid()
             AND bu.blocked_id = comments.user_id
        )
      )
    )
  );

DO $$
DECLARE
  v_qual text;
BEGIN
  SELECT qual INTO v_qual FROM pg_policies
   WHERE tablename = 'comments' AND policyname = 'comments_select';
  IF v_qual NOT LIKE '%blocked_users%' THEN
    RAISE EXCEPTION 'S1-T2.3 post-check failed: blocked_users not in comments_select qual';
  END IF;
  RAISE NOTICE 'S1-T2.3 applied: comments_select now filters blocked users from visible branch';
END $$;

COMMIT;
