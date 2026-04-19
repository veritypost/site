-- 091_get_own_login_activity_rpc_2026_04_18.sql
-- Migration: 20260419141408 get_own_login_activity_rpc_2026_04_18
--
-- Self-serve login activity view for the profile settings page. Reads
-- audit_log rows tagged as login/signup by the caller.

CREATE OR REPLACE FUNCTION public.get_own_login_activity(p_limit int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  action varchar,
  created_at timestamptz,
  metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT a.id, a.action, a.created_at, a.metadata
    FROM public.audit_log a
    WHERE a.actor_id = v_uid
      AND a.action IN ('login', 'signup')
    ORDER BY a.created_at DESC
    LIMIT LEAST(COALESCE(p_limit, 50), 200);
END;
$$;

REVOKE ALL ON FUNCTION public.get_own_login_activity(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_own_login_activity(int) TO authenticated, service_role;
