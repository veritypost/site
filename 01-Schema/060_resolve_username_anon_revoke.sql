-- ============================================================
-- 060_resolve_username_anon_revoke.sql
-- Chunk 9 of the post-audit repair pass.
--
-- Closes:
--   - F-032 (resolve_username exposes email for any public username):
--     Cannot fix at the DB — the whole point of the RPC is to turn a
--     public handle into the registered email so the login form
--     accepts "username + password" without requiring the user to
--     recall their email. The route already rate-limits and returns
--     fuzzy error copy; scope here is to make sure the RPC cannot be
--     called via a direct PostgREST request from an anon browser,
--     bypassing the route-level rate limit.
--   - F-033 (resolve_username_to_email granted to anon at the DB):
--     Revoke. Route still works because the route handler uses the
--     user-session supabase client (authenticated grant), which this
--     migration leaves intact. Unauthenticated callers who hit
--     /api/auth/resolve-username get served a fresh Supabase session
--     (anon-first) — BUT the actual RPC call now fails for anon, so
--     we also flip the route to the service-role client below.
--
-- Deployment note
-- ---------------
-- This migration revokes anon EXECUTE. After apply, the existing
-- /api/auth/resolve-username route must use the service client, which
-- the Chunk 9 code change does. Apply order: deploy code first, apply
-- 060 second, OR apply 060 first if you accept brief 5xx on that
-- single route between migration and deploy.
--
-- Dependencies: apply after 059_billing_hardening.sql. Idempotent.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.resolve_username_to_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_username_to_email(text) FROM anon;
-- authenticated revoked too — route now uses service client.
REVOKE EXECUTE ON FUNCTION public.resolve_username_to_email(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_username_to_email(text) TO service_role;

COMMENT ON FUNCTION public.resolve_username_to_email(text) IS
  'F-032 / F-033: service-role only. Route /api/auth/resolve-username '
  'brokers access with per-IP rate limit. Direct PostgREST calls '
  'from anon/authenticated are denied so the rate limit is enforceable.';
