-- 128_grant_anon_is_kid_delegated_exec.sql
-- 2026-04-22
--
-- Bug: anonymous reads against any table with a `*_block_kid_jwt` policy
-- (articles, sources, quizzes, timelines, …) returned 401 with
--   {"code":"42501","message":"permission denied for function is_kid_delegated"}
-- because RLS evaluation calls is_kid_delegated() and the `anon` role
-- lacked EXECUTE on it. Symptom: the iOS adult app showed the
-- "Couldn't load stories" error state on launch (anon home feed).
--
-- The function is STABLE SECURITY DEFINER and reads auth.jwt(), which
-- returns NULL for anon, so the COALESCE returns false. Granting EXECUTE
-- to anon does not change the boolean output for an unauthenticated
-- caller — it just lets the policy expression evaluate at all.
--
-- This restores the same access posture as the other helpers used in
-- public-facing policies (is_admin_or_above, is_editor_or_above) which
-- already have anon EXECUTE.

GRANT EXECUTE ON FUNCTION public.is_kid_delegated() TO anon;

-- Sanity: every other role we expect to hit RLS-bound policies should
-- also have EXECUTE. authenticated already does; restate idempotently.
GRANT EXECUTE ON FUNCTION public.is_kid_delegated() TO authenticated;
