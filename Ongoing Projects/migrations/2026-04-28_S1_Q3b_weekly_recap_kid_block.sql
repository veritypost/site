-- =====================================================================
-- 2026-04-28_S1_Q3b_weekly_recap_kid_block.sql
-- S1-Q3b — restrictive kid-blocks on weekly_recap_questions/quizzes
-- Source: Ongoing Projects/Sessions/Session_01_DB_Migrations.md (S1-Q3b)
-- Severity: P0 (kid-JWT defense-in-depth)
-- =====================================================================
-- Verified state (2026-04-28 via pg_policies):
--   weekly_recap_questions  weekly_recap_questions_modify  PERMISSIVE  ALL
--   weekly_recap_questions  weekly_recap_questions_select  PERMISSIVE  SELECT
--   weekly_recap_quizzes    weekly_recap_quizzes_modify    PERMISSIVE  ALL
--   weekly_recap_quizzes    weekly_recap_quizzes_select    PERMISSIVE  SELECT
--
--   No kid-block. Q3b audit: "weekly_recap_questions and
--   weekly_recap_quizzes have no kid-block on SELECT." A kid token
--   passing through PostgREST sees the adult weekly recap content set.
--
-- Fix: add RESTRICTIVE FOR ALL policies that require NOT
-- is_kid_delegated(). Mirrors the pattern used elsewhere
-- (messages_block_kid_jwt, etc).
--
-- Rollback:
--   DROP POLICY weekly_recap_questions_block_kid_jwt ON public.weekly_recap_questions;
--   DROP POLICY weekly_recap_quizzes_block_kid_jwt ON public.weekly_recap_quizzes;
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc
                 WHERE proname='is_kid_delegated' AND pronamespace='public'::regnamespace) THEN
    RAISE EXCEPTION 'is_kid_delegated() helper missing — abort';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='weekly_recap_questions') THEN
    RAISE EXCEPTION 'weekly_recap_questions table missing — abort';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='weekly_recap_quizzes') THEN
    RAISE EXCEPTION 'weekly_recap_quizzes table missing — abort';
  END IF;
END $$;

DROP POLICY IF EXISTS weekly_recap_questions_block_kid_jwt ON public.weekly_recap_questions;
CREATE POLICY weekly_recap_questions_block_kid_jwt ON public.weekly_recap_questions
  AS RESTRICTIVE
  FOR ALL
  USING (NOT public.is_kid_delegated())
  WITH CHECK (NOT public.is_kid_delegated());

DROP POLICY IF EXISTS weekly_recap_quizzes_block_kid_jwt ON public.weekly_recap_quizzes;
CREATE POLICY weekly_recap_quizzes_block_kid_jwt ON public.weekly_recap_quizzes
  AS RESTRICTIVE
  FOR ALL
  USING (NOT public.is_kid_delegated())
  WITH CHECK (NOT public.is_kid_delegated());

DO $$ BEGIN RAISE NOTICE 'S1-Q3b (weekly_recap) applied: restrictive kid-block on questions + quizzes'; END $$;

COMMIT;
