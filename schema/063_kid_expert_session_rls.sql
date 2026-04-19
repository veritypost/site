-- ============================================================
-- 063_kid_expert_session_rls.sql
-- Chunk 7 of the kids-mode audit + repair pass.
--
-- kid_expert_sessions + kid_expert_questions were enabled for RLS in
-- reset_and_rebuild_v2.sql (lines 3070-3071) but no policies were
-- ever defined. Under Postgres default, that means every non-
-- service-role query returns zero rows — implicitly denying all
-- reads and writes. This migration restores the intended access:
--
--   kid_expert_sessions SELECT — any authenticated user can read
--     scheduled + active session metadata (session metadata is not
--     kid PII; D9 says kids attend these, so parents + kids must
--     be able to browse). Assigned expert or moderator can also
--     read draft / completed / cancelled sessions.
--
--   kid_expert_questions SELECT — three-way scope per Chunk 7 spec:
--     (a) the parent of the asking kid,
--     (b) the assigned expert for that question's session,
--     (c) moderator-or-above.
--
-- Writes on both tables stay closed to non-service-role callers;
-- the existing API endpoints own the insert / update paths under
-- service role. If the owner wants direct client writes in the
-- future, a WITH CHECK policy in a follow-up migration is the add.
--
-- Idempotent via DROP POLICY IF EXISTS. Apply after 062.
-- ============================================================

-- ------------------------------------------------------------
-- kid_expert_sessions
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "kid_expert_sessions_select_public" ON public.kid_expert_sessions;
CREATE POLICY "kid_expert_sessions_select_public"
  ON public.kid_expert_sessions
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND COALESCE(is_active, false) = true
    AND status = 'scheduled'
  );

DROP POLICY IF EXISTS "kid_expert_sessions_select_expert" ON public.kid_expert_sessions;
CREATE POLICY "kid_expert_sessions_select_expert"
  ON public.kid_expert_sessions
  FOR SELECT
  USING (expert_id = auth.uid());

DROP POLICY IF EXISTS "kid_expert_sessions_select_mod" ON public.kid_expert_sessions;
CREATE POLICY "kid_expert_sessions_select_mod"
  ON public.kid_expert_sessions
  FOR SELECT
  USING (public.is_mod_or_above());

-- ------------------------------------------------------------
-- kid_expert_questions
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "kid_expert_questions_select_parent" ON public.kid_expert_questions;
CREATE POLICY "kid_expert_questions_select_parent"
  ON public.kid_expert_questions
  FOR SELECT
  USING (
    kid_profile_id IN (
      SELECT id FROM public.kid_profiles WHERE parent_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "kid_expert_questions_select_expert" ON public.kid_expert_questions;
CREATE POLICY "kid_expert_questions_select_expert"
  ON public.kid_expert_questions
  FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM public.kid_expert_sessions WHERE expert_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "kid_expert_questions_select_mod" ON public.kid_expert_questions;
CREATE POLICY "kid_expert_questions_select_mod"
  ON public.kid_expert_questions
  FOR SELECT
  USING (public.is_mod_or_above());

-- Verify (manual, after apply):
--   SELECT polname, pg_get_expr(polqual, polrelid)
--   FROM pg_policy
--   WHERE polrelid::regclass::text LIKE 'kid_expert%'
--   ORDER BY polrelid::regclass::text, polname;
--
-- Expected: 3 policies per table (select_parent/expert/mod on
-- questions; select_public/expert/mod on sessions).
