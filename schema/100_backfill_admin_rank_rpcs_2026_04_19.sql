-- Migration 100 — Backfill admin rank-check RPCs (require_outranks, caller_can_assign_role)
--
-- Two SECURITY DEFINER helpers used by 9+ admin routes to enforce role
-- hierarchy (cannot act on users who outrank you; cannot assign a role
-- higher than your own). Both functions are already live in the Supabase
-- project but had no CREATE FUNCTION file in schema/. This file was
-- backfilled from prod on 2026-04-19 via pg_get_functiondef to bring the
-- repo back in sync with the database; no DB change is applied by this
-- file — prod already matches it byte-for-byte.
--
-- Security posture (preserved from prod):
--   - SECURITY DEFINER, search_path pinned to public, pg_temp
--   - service_role short-circuits to true (server jobs win)
--   - unauthed callers always return false
--   - EXECUTE: authenticated + service_role only (anon revoked)

CREATE OR REPLACE FUNCTION public.require_outranks(target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_role   text := current_setting('request.jwt.claim.role', true);
  v_caller_level int;
  v_target_level int;
  v_target_exists boolean;
BEGIN
  -- service_role bypass: server-side jobs always win.
  IF v_role = 'service_role' THEN
    RETURN true;
  END IF;

  -- Unauthed caller: never outranks anyone.
  IF v_caller IS NULL THEN
    RETURN false;
  END IF;

  -- Target must exist.
  SELECT EXISTS(SELECT 1 FROM public.users WHERE id = target_user_id) INTO v_target_exists;
  IF NOT v_target_exists THEN
    RETURN false;
  END IF;

  -- Caller's max hierarchy level across all assigned roles.
  SELECT COALESCE(MAX(r.hierarchy_level), 0)
    INTO v_caller_level
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
   WHERE ur.user_id = v_caller
     AND (ur.expires_at IS NULL OR ur.expires_at > now());

  -- Target's max hierarchy level.
  SELECT COALESCE(MAX(r.hierarchy_level), 0)
    INTO v_target_level
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
   WHERE ur.user_id = target_user_id
     AND (ur.expires_at IS NULL OR ur.expires_at > now());

  RETURN v_caller_level > v_target_level;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.caller_can_assign_role(p_role_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_role   text := current_setting('request.jwt.claim.role', true);
  v_caller_level int;
  v_role_level int;
BEGIN
  IF v_role = 'service_role' THEN
    RETURN true;
  END IF;

  IF v_caller IS NULL THEN
    RETURN false;
  END IF;

  SELECT hierarchy_level INTO v_role_level FROM public.roles WHERE name = p_role_name;
  IF v_role_level IS NULL THEN
    RETURN false; -- unknown role
  END IF;

  SELECT COALESCE(MAX(r.hierarchy_level), 0)
    INTO v_caller_level
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
   WHERE ur.user_id = v_caller
     AND (ur.expires_at IS NULL OR ur.expires_at > now());

  RETURN v_caller_level >= v_role_level;
END;
$function$
;

REVOKE ALL ON FUNCTION public.require_outranks(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.require_outranks(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.require_outranks(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.require_outranks(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.caller_can_assign_role(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.caller_can_assign_role(text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.caller_can_assign_role(text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.caller_can_assign_role(text) TO service_role;

-- applied: 20260419000000   -- prod has had these well before this backfill; timestamp records file-sync, not DB mutation
