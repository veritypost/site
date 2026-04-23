-- 131_rollback_130_grant_authenticated_is_expert_or_above.sql
-- Rollback for 130. Restores the pre-130 ACL: only postgres / service_role / supabase_auth_admin.

REVOKE EXECUTE ON FUNCTION public.is_expert_or_above() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_expert_or_above() FROM anon;
-- Leave service_role grant in place (matches pre-130 state).

UPDATE public.perms_global_version SET version = version + 1, bumped_at = now() WHERE id = 1;
