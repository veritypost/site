-- 130_grant_authenticated_is_expert_or_above.sql
-- Migration: 20260422_grant_authenticated_is_expert_or_above
--
-- Sister-fix to 128 (is_kid_delegated). The is_expert_or_above() helper
-- is referenced from RLS policies and from anon/authenticated-context
-- queries (e.g. surfacing expert-only UI bits before a route hits the
-- RPC layer). Without EXECUTE on `authenticated`, those checks
-- silently return false and gate legitimate experts out.
--
-- Mirrors the 128 fix shape: REVOKE then GRANT from PUBLIC + named
-- roles to make the ACL deterministic regardless of prior state.

REVOKE ALL ON FUNCTION public.is_expert_or_above() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_expert_or_above() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_expert_or_above() TO anon;
GRANT EXECUTE ON FUNCTION public.is_expert_or_above() TO service_role;

UPDATE public.perms_global_version SET version = version + 1, bumped_at = now() WHERE id = 1;
