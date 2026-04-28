-- S1-T0.5 — current_kid_profile_id: read top-level JWT claim, not app_metadata
--
-- The function currently extracts the kid profile from the nested path
-- `auth.jwt() -> 'app_metadata' ->> 'kid_profile_id'`. The kid auth system
-- stamps the claim at the top level of the JWT, so the nested path always
-- returns NULL for legitimate kid sessions, breaking all kid-session checks.
--
-- Verified state (2026-04-27 live pg_proc.prosrc):
--   SELECT NULLIF(auth.jwt() -> 'app_metadata' ->> 'kid_profile_id', '')::uuid
--
-- Fix: remove the intermediate `-> 'app_metadata'` hop.
--
-- Preserved unchanged: LANGUAGE sql, RETURNS uuid, NOT SECURITY DEFINER,
-- no search_path override (proconfig=null). Signature unchanged.
--
-- Acceptance: pg_proc.prosrc for current_kid_profile_id contains
-- `jwt() ->> 'kid_profile_id'` with no `app_metadata` intermediate step.

BEGIN;

DO $$
DECLARE
  body_text text;
BEGIN
  SELECT prosrc INTO body_text FROM pg_proc
   WHERE proname = 'current_kid_profile_id'
     AND pronamespace = 'public'::regnamespace;
  IF body_text IS NULL THEN
    RAISE EXCEPTION 'S1-T0.5 abort: current_kid_profile_id not found';
  END IF;
  IF body_text NOT LIKE '%app_metadata%' THEN
    RAISE NOTICE 'S1-T0.5 no-op: current_kid_profile_id already reads top-level claim';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.current_kid_profile_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
AS $$
  SELECT NULLIF(auth.jwt() ->> 'kid_profile_id', '')::uuid
$$;

DO $$
DECLARE
  body_text text;
BEGIN
  SELECT prosrc INTO body_text FROM pg_proc
   WHERE proname = 'current_kid_profile_id'
     AND pronamespace = 'public'::regnamespace;
  IF body_text LIKE '%app_metadata%' THEN
    RAISE EXCEPTION 'S1-T0.5 post-check failed: app_metadata still present in body';
  END IF;
  RAISE NOTICE 'S1-T0.5 applied: current_kid_profile_id now reads top-level kid_profile_id claim';
END $$;

COMMIT;
