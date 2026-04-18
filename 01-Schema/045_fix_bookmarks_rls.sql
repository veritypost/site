-- 045_fix_bookmarks_rls.sql
-- Bug 1 (CRITICAL, D13): the prior bookmarks_insert policy required a paid-plan
-- helper check, which blocked every free-user INSERT before the
-- enforce_bookmark_cap trigger could run. D13 states free users get 10
-- bookmarks; the cap trigger (015_phase7_helpers.sql) already enforces that
-- limit. RLS should gate on ownership only and let the trigger handle the
-- tier-specific cap.
--
-- This migration replaces the insert policy with an ownership-only check. The
-- enforce_bookmark_cap BEFORE INSERT trigger is left untouched.
--
-- Idempotent.

BEGIN;

DROP POLICY IF EXISTS "bookmarks_insert" ON "bookmarks";

CREATE POLICY "bookmarks_insert" ON "bookmarks" FOR INSERT WITH CHECK (
  user_id = auth.uid()
);

COMMIT;
