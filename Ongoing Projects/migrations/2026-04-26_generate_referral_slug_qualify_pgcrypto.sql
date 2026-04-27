-- =====================================================================
-- 2026-04-26_generate_referral_slug_qualify_pgcrypto.sql
-- generate_referral_slug — qualify gen_random_bytes with extensions schema
-- =====================================================================
-- pgcrypto is installed in the `extensions` schema on Supabase. The
-- function had `SET search_path = public, pg_temp` so it couldn't see
-- gen_random_bytes. Qualify the call to fix.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.generate_referral_slug()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_raw bytea;
  v_slug text;
BEGIN
  v_raw := extensions.gen_random_bytes(8);
  v_slug := lower(translate(encode(v_raw, 'base64'), '+/=', ''));
  RETURN substring(v_slug FROM 1 FOR 10);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_referral_slug() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.generate_referral_slug() TO service_role;

COMMIT;
