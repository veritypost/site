-- =====================================================================
-- 2026-04-27_T362_update_metadata_rpc_REAPPLY.sql
-- T362 — `update_metadata` RPC re-apply
-- =====================================================================
-- Status:
--   The original T362 migration file is correct, but pg_proc shows the
--   function did NOT land in production (verified 2026-04-27 via MCP).
--   Most likely cause: the apply step was skipped or silently rolled
--   back during the bundle. This file is a clean re-run — same body
--   as the original, no schema-table dependencies, idempotent (CREATE
--   OR REPLACE).
--
-- Verification after apply:
--   SELECT proname FROM pg_proc WHERE proname = 'update_metadata';
--   -- expect 1 row
-- =====================================================================

CREATE OR REPLACE FUNCTION public.update_metadata(
  p_user_id uuid,
  p_keys jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  -- Caller must be self OR an admin. Service-role bypasses
  -- (auth.uid() returns NULL for service-role calls — intended).
  IF v_caller IS NOT NULL
     AND v_caller <> p_user_id
     AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF p_keys IS NULL OR jsonb_typeof(p_keys) <> 'object' THEN
    RAISE EXCEPTION 'p_keys must be a jsonb object' USING ERRCODE = '22023';
  END IF;

  UPDATE public.users
     SET metadata = COALESCE(metadata, '{}'::jsonb) || p_keys
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_metadata(uuid, jsonb) TO authenticated;
