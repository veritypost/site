-- 178_fix_cleanup_rate_limit_events_col.sql
--
-- T-002 / Q13 — cleanup_rate_limit_events referenced `occurred_at`, which is
-- not a column on rate_limit_events. The actual timestamp column is `created_at`.
-- Migration 170 introduced the bug; this migration corrects it.
-- 8,574 rows were never deleted because the WHERE clause always errored silently.

CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_events(
  p_retention_days int DEFAULT 7
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  WITH del AS (
    DELETE FROM rate_limit_events
     WHERE created_at < now() - make_interval(days => p_retention_days)
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM del;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_rate_limit_events(int) TO service_role;
