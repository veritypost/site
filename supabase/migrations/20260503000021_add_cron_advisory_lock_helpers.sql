-- Wrapper functions so Supabase .rpc() can call Postgres advisory lock primitives.
-- Both are SECURITY DEFINER so service-role callers can use them without
-- needing direct pg_catalog access.

CREATE OR REPLACE FUNCTION public.pg_try_advisory_lock(key bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT pg_catalog.pg_try_advisory_lock(key);
$$;

CREATE OR REPLACE FUNCTION public.pg_advisory_unlock(key bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT pg_catalog.pg_advisory_unlock(key);
$$;

-- Revoke public execute; only service role (used by cron routes) needs these.
REVOKE EXECUTE ON FUNCTION public.pg_try_advisory_lock(bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pg_advisory_unlock(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pg_try_advisory_lock(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.pg_advisory_unlock(bigint) TO service_role;
