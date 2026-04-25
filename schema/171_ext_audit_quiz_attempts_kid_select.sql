-- 171_ext_audit_quiz_attempts_kid_select.sql
-- Ext-GG.2 — quiz_attempts SELECT lacks a kid-JWT branch.
--
-- The base SELECT policy on quiz_attempts is:
--     user_id = auth.uid() OR public.is_admin_or_above()
-- A kid session uses a custom JWT where auth.uid() resolves to the
-- kid_profile_id (not a user_id), so kids can't read their own quiz
-- history. INSERT was patched in schema/132/133 to branch on
-- is_kid_delegated() but SELECT was missed.
--
-- Add a kid-JWT-aware SELECT policy. Same shape as the INSERT branch:
-- the kid is the row owner via kid_profile_id when the request carries
-- the kid JWT, and they can read rows scoped to their own profile.

DROP POLICY IF EXISTS quiz_attempts_select_kid_jwt ON public.quiz_attempts;

CREATE POLICY quiz_attempts_select_kid_jwt ON public.quiz_attempts
  FOR SELECT
  USING (
    public.is_kid_delegated()
    AND kid_profile_id = auth.uid()
  );
