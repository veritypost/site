-- =====================================================================
-- 2026-04-28_S1_T2.3_comments_block_rls.sql
-- S1-T2.3 — comments_select RLS filters comments authored by users the
--           reader has blocked (DB-level enforcement)
-- Source: Ongoing Projects/Sessions/Session_01_DB_Migrations.md (S1-T2.3)
-- Severity: P1 (block enforcement is currently client-only)
-- =====================================================================
-- Verified state (2026-04-28 via pg_policies):
--   comments_select qual:
--     ((status::text = 'visible' AND deleted_at IS NULL)
--      OR user_id = auth.uid() OR is_mod_or_above())
--   No blocked_users filter. iOS, raw PostgREST, and realtime clients
--   see comments authored by users the reader has blocked.
--
-- Fix: ALTER POLICY adds a NOT EXISTS clause that excludes comments
-- whose author appears in blocked_users with the reader as blocker.
-- The author's own view of their content + moderator view are preserved
-- (the OR branches still pass).
--
-- Note on direction: blocked_users.blocker_id is the user who created
-- the block; blocked_id is the user who got blocked. We filter when
-- the *reader* (auth.uid()) blocked the *author* (comments.user_id) —
-- the reader doesn't want to see content from their blockee. The
-- reverse direction (author blocked the reader) is handled by
-- per-author privacy and post_comment's mention/reply skip rules.
--
-- Performance: blocked_users has an index on blocker_id (verified via
-- the post_comment EXISTS pattern). Subquery executes per-row but is
-- shallow; for an active reader with 100 blocks, the EXISTS short-
-- circuits quickly.
--
-- Rollback:
--   ALTER POLICY comments_select ON public.comments
--     USING (((status::text = 'visible' AND deleted_at IS NULL)
--              OR user_id = auth.uid() OR is_mod_or_above()));
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname='public' AND tablename='comments'
                   AND policyname='comments_select') THEN
    RAISE EXCEPTION 'comments_select policy missing — abort';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='blocked_users') THEN
    RAISE EXCEPTION 'blocked_users table missing — abort';
  END IF;
END $$;

ALTER POLICY comments_select ON public.comments
  USING (
    (
      ((status::text = 'visible'::text) AND (deleted_at IS NULL))
      OR (user_id = auth.uid())
      OR is_mod_or_above()
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users b
       WHERE b.blocker_id = auth.uid()
         AND b.blocked_id = comments.user_id
    )
  );

DO $$ BEGIN RAISE NOTICE 'S1-T2.3 applied: comments_select filters reader-blocked authors'; END $$;

COMMIT;
