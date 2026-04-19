-- 074_bump_user_perms_version_atomic_security.sql
-- Migration: 20260418231910 bump_user_perms_version_atomic_security
--
-- Harden bump_user_perms_version so callers can use it atomically from
-- any privileged client (service_role or authenticated admin).
--
-- Fixes Gap 1 (perms_version TOCTOU): the prior approach was a client-side
-- SELECT/+1/UPDATE read-modify-write pattern replicated across multiple
-- admin UI components and routes. Under concurrent admin writes on the
-- same target user, a bump could be lost. The body of this function
-- already used the correct SQL-level +1 increment but was not wired up
-- as SECURITY DEFINER and had no auth gate, so the admin UI kept doing
-- read-modify-write directly against the users table.
--
-- This version:
--   - SECURITY DEFINER with pinned search_path so it can UPDATE users
--     even when called through RLS-restricted clients.
--   - Internal auth gate: service_role bypass OR is_admin_or_above().
--     Anyone else gets a clean permission error.
--   - Idempotent (CREATE OR REPLACE) and preserves the existing return
--     signature (void).

CREATE OR REPLACE FUNCTION public.bump_user_perms_version(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF v_role <> 'service_role' AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'bump_user_perms_version: admin role required';
  END IF;

  UPDATE public.users
     SET perms_version = perms_version + 1,
         perms_version_bumped_at = now()
   WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_user_perms_version(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_user_perms_version(uuid) TO authenticated, service_role;
