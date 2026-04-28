-- S1-D6 — archive_cluster RPC verification (READ-ONLY)
--
-- Does NOT modify schema. Confirms archive_cluster exists and surfaces its signature
-- so S6 can regenerate types/database.ts and remove the `unknown` cast in
-- web/src/app/api/cron/pipeline-cleanup/route.ts:256-265.

DO $$
DECLARE
  v_found boolean;
  v_sig   text;
  v_rettype text;
  v_secdef boolean;
BEGIN
  SELECT
    EXISTS (SELECT 1 FROM pg_proc WHERE proname='archive_cluster' AND pronamespace='public'::regnamespace),
    pg_get_function_arguments(oid),
    prorettype::regtype::text,
    prosecdef
  INTO v_found, v_sig, v_rettype, v_secdef
  FROM pg_proc
  WHERE proname='archive_cluster' AND pronamespace='public'::regnamespace
  LIMIT 1;

  IF v_found THEN
    RAISE NOTICE 'D6-verify | archive_cluster EXISTS | args=% | returns=% | security_definer=%',
      COALESCE(v_sig,'<none>'), v_rettype, v_secdef;
    RAISE NOTICE 'D6-verify | ACTION: flag S6 to regenerate web/src/types/database.ts — pipeline-cleanup/route.ts:256-265 unknown-cast can be dropped once types include this RPC';
  ELSE
    RAISE NOTICE 'D6-verify | archive_cluster ABSENT — pipeline-cleanup/route.ts:256-265 is calling a missing RPC; flag S3 to implement or route.ts to remove the call';
  END IF;
END $$;
