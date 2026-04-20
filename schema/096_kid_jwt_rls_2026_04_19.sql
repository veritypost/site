-- Migration 096 — kid JWT RLS extensions
-- Reviewed + fixed against agent feedback 2026-04-19.
--
-- Scope: make kid-scoped JWTs (minted by /api/kids/pair) usable + safe.
--
-- Kid JWT claims:
--   sub:              kid_profile_id      → auth.uid()
--   role:             authenticated
--   is_kid_delegated: true                → (auth.jwt() ->> 'is_kid_delegated')::boolean
--   kid_profile_id:   <uuid>
--   parent_user_id:   <uuid>              → used to bind kid writes to the parent
--
-- Review corrections applied:
--   - users_select_kid_blocked now uses NOT is_kid_delegated() (was USING false which didn't block)
--   - is_kid_delegated() granted to authenticated/service_role only (removed anon)
--   - kid_jwt_profile_id() removed (dead code)
--   - kid_profiles UPDATE + reading_log UPDATE kid policies removed (writes go via RPC)
--   - reading_log/quiz_attempts INSERT now binds user_id to parent_user_id claim
--
-- Idempotent. Apply after migration 095.

-- ============================================================
-- Helper: is_kid_delegated()
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_kid_delegated()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE((auth.jwt() ->> 'is_kid_delegated')::boolean, false);
$$;

REVOKE ALL ON FUNCTION public.is_kid_delegated() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_kid_delegated() TO authenticated, service_role;

-- ============================================================
-- kid_profiles — kid JWT reads own row (SELECT only; writes via RPC)
-- ============================================================

DROP POLICY IF EXISTS kid_profiles_select_kid_jwt ON public.kid_profiles;
CREATE POLICY kid_profiles_select_kid_jwt ON public.kid_profiles
    FOR SELECT
    USING (
        public.is_kid_delegated()
        AND id = auth.uid()
    );

-- NOTE: no UPDATE policy for kid JWT on kid_profiles.
-- Kids should not directly modify their own profile (verity_score,
-- streak_current, parent_user_id, coppa_consent_given are all sensitive).
-- Use SECURITY DEFINER RPCs like advance_streak / update_kid_activity instead.

-- ============================================================
-- reading_log — kid JWT reads + inserts its own rows (no UPDATE)
-- ============================================================
-- INSERT binds user_id to the parent_user_id claim so a kid can't claim
-- someone else's user_id on the row.

DROP POLICY IF EXISTS reading_log_select_kid_jwt ON public.reading_log;
CREATE POLICY reading_log_select_kid_jwt ON public.reading_log
    FOR SELECT
    USING (
        public.is_kid_delegated()
        AND kid_profile_id = auth.uid()
    );

DROP POLICY IF EXISTS reading_log_insert_kid_jwt ON public.reading_log;
CREATE POLICY reading_log_insert_kid_jwt ON public.reading_log
    FOR INSERT
    WITH CHECK (
        public.is_kid_delegated()
        AND kid_profile_id = auth.uid()
        AND (
            user_id IS NULL
            OR user_id::text = (auth.jwt() ->> 'parent_user_id')
        )
    );

-- NOTE: no UPDATE policy for kid JWT on reading_log.
-- Writes are append-only from the kid side (one row per article-read session).

-- ============================================================
-- quiz_attempts — kid JWT reads + inserts its own rows
-- ============================================================

DROP POLICY IF EXISTS quiz_attempts_select_kid_jwt ON public.quiz_attempts;
CREATE POLICY quiz_attempts_select_kid_jwt ON public.quiz_attempts
    FOR SELECT
    USING (
        public.is_kid_delegated()
        AND kid_profile_id = auth.uid()
    );

DROP POLICY IF EXISTS quiz_attempts_insert_kid_jwt ON public.quiz_attempts;
CREATE POLICY quiz_attempts_insert_kid_jwt ON public.quiz_attempts
    FOR INSERT
    WITH CHECK (
        public.is_kid_delegated()
        AND kid_profile_id = auth.uid()
        AND (
            user_id IS NULL
            OR user_id::text = (auth.jwt() ->> 'parent_user_id')
        )
    );

-- ============================================================
-- articles + categories — existing SELECT policies already permit authenticated
-- ============================================================
-- No changes here. Kid JWT is authenticated → existing policies allow reads
-- of published/active rows. Kids app scopes to `is_kids_safe = true` in the
-- query itself. Documented here so future tightening doesn't accidentally
-- break kids.

-- ============================================================
-- users — block kid JWT entirely
-- ============================================================
-- Agent A flagged: the previous "USING (is_kid_delegated AND false)" is a
-- no-op because SELECT policies are OR'd; existing users_select allows
-- profile_visibility='public' rows through. Correct block is to use a
-- RESTRICTIVE policy (AND'd with existing) OR to rely on NOT is_kid_delegated.
-- We use RESTRICTIVE to guarantee the block.

DROP POLICY IF EXISTS users_select_block_kid_jwt ON public.users;
CREATE POLICY users_select_block_kid_jwt ON public.users
    AS RESTRICTIVE
    FOR SELECT
    USING (
        NOT public.is_kid_delegated()
    );

-- ============================================================
-- Signal clients
-- ============================================================
UPDATE public.perms_global_version
   SET version = version + 1,
       bumped_at = now()
 WHERE id = 1;

-- ============================================================
-- Verification probes (run manually after apply)
-- ============================================================
-- As kid JWT:
--   SELECT id FROM kid_profiles;                    -- expect 1 (own row)
--   SELECT count(*) FROM kid_profiles WHERE id <> auth.uid();  -- expect 0
--   UPDATE kid_profiles SET verity_score = 9999 WHERE id = auth.uid();  -- expect 0 rows affected
--   SELECT count(*) FROM users;                     -- expect 0 (blocked)
--   INSERT INTO reading_log (kid_profile_id, user_id, article_id, read_percentage, time_spent_seconds, completed)
--     VALUES (auth.uid(), '<NOT-PARENT-ID>', '<valid-article>', 1.0, 60, true);
--   -- expect: error, row-level security violation
--
-- As adult session (parent):
--   SELECT count(*) FROM users WHERE id = auth.uid();           -- expect 1
--   SELECT count(*) FROM kid_profiles WHERE parent_user_id = auth.uid();  -- unchanged
