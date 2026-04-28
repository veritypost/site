-- S1-J-verify — Orphan-table verification scan (READ-ONLY)
--
-- Does NOT modify schema. Run AFTER A114 (which drops deep_links, so that table
-- is intentionally absent here). Confirms whether app_config, analytics_events,
-- article_relations, audit_log, admin_audit_log are orphaned or load-bearing.
--
-- Output: NOTICE messages for the owner to review before any follow-up drops.

DO $$
DECLARE
  t text;
  row_count bigint;
  rls_count int;
  proc_count int;
BEGIN
  -- Spot-check core tables
  FOREACH t IN ARRAY ARRAY['app_config','analytics_events','article_relations']
  LOOP
    BEGIN
      EXECUTE format('SELECT COUNT(*) FROM public.%I', t) INTO row_count;
      SELECT COUNT(*) INTO rls_count FROM pg_policies WHERE tablename = t AND schemaname = 'public';
      SELECT COUNT(*) INTO proc_count FROM pg_proc p
       WHERE p.prosrc ILIKE ('%' || t || '%')
         AND p.pronamespace = 'public'::regnamespace;
      RAISE NOTICE 'J-verify | table=% rows=% rls_policies=% rpc_references=%',
        t, row_count, rls_count, proc_count;
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'J-verify | table=% ABSENT (already dropped or never existed)', t;
    END;
  END LOOP;

  -- audit_log vs admin_audit_log overlap
  BEGIN
    EXECUTE 'SELECT COUNT(*) FROM public.audit_log' INTO row_count;
    RAISE NOTICE 'J-verify | audit_log rows=%', row_count;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'J-verify | audit_log ABSENT';
  END;

  BEGIN
    EXECUTE 'SELECT COUNT(*) FROM public.admin_audit_log' INTO row_count;
    RAISE NOTICE 'J-verify | admin_audit_log rows=% — check whether this overlaps with audit_log or serves a distinct surface', row_count;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'J-verify | admin_audit_log ABSENT';
  END;
END $$;

-- Follow-up rule: if any table above shows rows=0 + rls_policies=0 + rpc_references=0,
-- write Ongoing Projects/migrations/2026-04-27_S1_J-followup_<table>_drop.sql using
-- the same pattern as A114. Do NOT drop tables with rows or active callers without
-- owner review.
