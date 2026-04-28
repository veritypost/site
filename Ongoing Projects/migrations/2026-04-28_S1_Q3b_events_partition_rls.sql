-- =====================================================================
-- 2026-04-28_S1_Q3b_events_partition_rls.sql
-- S1-Q3b — enable RLS + restrictive kid-block on events_* partitions
-- Source: Ongoing Projects/Sessions/Session_01_DB_Migrations.md (S1-Q3b)
-- Severity: P0 (kid-JWT defense-in-depth)
-- =====================================================================
-- Verified state (2026-04-28 via pg_class + pg_inherits):
--   public.events parent: relrowsecurity=true, 0 policies
--   All events_YYYYMMDD partitions + events_default:
--     relrowsecurity=false, 0 policies
--
--   Per Q3b audit: "events parent partition has RLS enabled with 0
--   policies; partitions have RLS disabled entirely." Postgres applies
--   RLS at the partition level (not the parent), so a kid token through
--   PostgREST can SELECT from any partition directly. Defense-in-depth:
--   events writes are service-role today, but a kid token shouldn't
--   even appear at this surface.
--
-- Fix: ALTER TABLE ... ENABLE ROW LEVEL SECURITY on every partition,
-- plus a RESTRICTIVE FOR ALL policy USING (NOT is_kid_delegated()).
-- Idempotent: enumerates partitions via pg_inherits at apply time so
-- new partitions added after this migration get caught by a follow-up
-- run.
--
-- Note: this migration does NOT add a permissive policy. Without one,
-- non-service callers see zero rows (RLS default deny). Service-role
-- bypasses RLS entirely (Postgres bypassrls attribute), so the
-- analytics writes from server cron/edge functions remain unaffected.
-- If a future feature needs a non-service caller to SELECT events
-- (e.g., a user-facing analytics view), add a permissive policy in a
-- separate migration; do NOT widen the kid-block.
--
-- Rollback:
--   For each partition:
--     DROP POLICY events_<n>_block_kid_jwt ON public.events_<n>;
--     ALTER TABLE public.events_<n> DISABLE ROW LEVEL SECURITY;
-- =====================================================================

BEGIN;

DO $$
DECLARE
  v_partition record;
  v_policy_name text;
  v_count int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc
                 WHERE proname='is_kid_delegated' AND pronamespace='public'::regnamespace) THEN
    RAISE EXCEPTION 'is_kid_delegated() helper missing — abort';
  END IF;

  FOR v_partition IN
    SELECT child.relname AS partition_name,
           child.oid AS partition_oid,
           child.relrowsecurity AS rls_enabled
      FROM pg_inherits i
      JOIN pg_class parent ON parent.oid=i.inhparent
      JOIN pg_class child ON child.oid=i.inhrelid
      JOIN pg_namespace n ON n.oid=parent.relnamespace
     WHERE n.nspname='public' AND parent.relname='events'
  LOOP
    v_policy_name := v_partition.partition_name || '_block_kid_jwt';

    -- Enable RLS if not already.
    IF NOT v_partition.rls_enabled THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
                     v_partition.partition_name);
    END IF;

    -- Drop + create the restrictive policy (idempotent).
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                   v_policy_name, v_partition.partition_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL '
      || 'USING (NOT public.is_kid_delegated()) '
      || 'WITH CHECK (NOT public.is_kid_delegated())',
      v_policy_name, v_partition.partition_name
    );

    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'S1-Q3b (events partitions) applied: RLS enabled + kid-block on % partitions', v_count;
END $$;

COMMIT;
