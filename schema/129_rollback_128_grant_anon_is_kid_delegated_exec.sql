-- 129_rollback_128_grant_anon_is_kid_delegated_exec.sql
-- 2026-04-22
-- Rollback for 128_grant_anon_is_kid_delegated_exec.sql.
-- Reverts the EXECUTE grant on public.is_kid_delegated() for the anon role.
-- Note: revoking re-introduces the 401 on anon reads of any table whose
-- RLS calls is_kid_delegated() (40 policies as of this date). Only run
-- this if a follow-up migration replaces the helper.

REVOKE EXECUTE ON FUNCTION public.is_kid_delegated() FROM anon;
