-- S1-A2-PC — update_metadata RPC verification (READ-ONLY)
--
-- Does NOT modify schema. Confirms whether update_metadata exists in pg_proc.
-- Caller: web/src/app/api/auth/email-change/route.js:166,171.
-- web/src/types/database.ts has zero defs for it — either type drift or broken RPC.

DO $$
DECLARE
  v_found  boolean;
  v_sig    text;
  v_rettype text;
  v_secdef  boolean;
BEGIN
  SELECT
    EXISTS (SELECT 1 FROM pg_proc WHERE proname='update_metadata' AND pronamespace='public'::regnamespace),
    pg_get_function_arguments(oid),
    prorettype::regtype::text,
    prosecdef
  INTO v_found, v_sig, v_rettype, v_secdef
  FROM pg_proc
  WHERE proname='update_metadata' AND pronamespace='public'::regnamespace
  LIMIT 1;

  IF v_found THEN
    RAISE NOTICE 'A2-PC-verify | update_metadata EXISTS | args=% | returns=% | security_definer=%',
      COALESCE(v_sig,'<none>'), v_rettype, v_secdef;
    RAISE NOTICE 'A2-PC-verify | ACTION: type drift only — flag S6 to regenerate web/src/types/database.ts so email-change/route.js:166,171 gets typed call site';
  ELSE
    RAISE NOTICE 'A2-PC-verify | update_metadata ABSENT — email-change/route.js:166,171 is calling a missing RPC';
    RAISE NOTICE 'A2-PC-verify | ACTION: flag S3 to rewrite route.js to call supabase.auth.updateUser() or direct users UPDATE instead';
  END IF;
END $$;
