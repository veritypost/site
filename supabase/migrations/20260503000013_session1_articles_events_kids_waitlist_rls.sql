-- Session 1 — PM-D: Articles draft leak + events_* partition RLS gaps + kids_waitlist anon-insert hole
-- See REVIEW_SESSIONS/SESSION_01_DB_RLS.md for full context.
--
-- P0 #4 — Articles draft leak via OR'd RLS policies.
--   Problem: policy `articles_public_read_excludes_soft_deleted` is PERMISSIVE FOR SELECT
--     TO anon, authenticated with USING ((deleted_at IS NULL) OR is_admin_or_above()).
--     Postgres OR's permissive policies, so any non-deleted row (including drafts)
--     was readable by anon, bypassing the published-only `articles_select` and
--     `public_can_read_published` policies.
--   Fix: DROP the over-permissive policy. The remaining policies already cover
--     legitimate access:
--       - `articles_select`: published+non-deleted to all, plus author + editor+
--       - `public_can_read_published`: published-only for anon+authenticated
--       - `articles_block_kid_jwt` (RESTRICTIVE): blocks kid JWTs
--       - `articles_read_kid_jwt`: kid-only path
--       - `articles_insert/update/delete`: editor+ / admin+ for writes
--
-- P0 #5 — events_* partition tables missing RLS.
--   Problem: parent `public.events` has RLS, but the partition factory
--     `create_events_partition_for(date)` does not call ENABLE ROW LEVEL SECURITY
--     on freshly-created partitions. Five live partitions are currently
--     unprotected: events_20260430, events_20260501..events_20260504.
--     Direct queries against unprotected partitions bypass parent RLS.
--   Fix:
--     (a) Patch the factory to ENABLE RLS on every new partition.
--     (b) Backfill ENABLE RLS on every existing partition that has it off.
--   No permissive SELECT/INSERT policies are added: events writes go through
--   the service-role client (web/src/app/api/events/batch/route.ts and
--   web/src/lib/trackServer.ts both call createServiceClient()), and reads
--   are server-only via service role. Default-deny for anon/authenticated is
--   the correct posture.
--
-- P0 #6 — kids_waitlist_insert_anon has WITH CHECK (true).
--   Problem: anon could insert arbitrary rows into kids_waitlist.
--   Fix: DROP the policy. The legitimate write path
--     (web/src/app/api/kids-waitlist/route.ts) goes through createServiceClient(),
--     which bypasses RLS. The route file's header explicitly states
--     "Service-role-only". After this drop, anon inserts are denied at the DB.
--   The remaining policies (kids_waitlist_modify, kids_waitlist_select) keep
--   admin-or-above access intact.

BEGIN;

----------------------------------------------------------------------
-- Part 1: Articles — drop the OR'd over-permissive policy
----------------------------------------------------------------------
DROP POLICY IF EXISTS "articles_public_read_excludes_soft_deleted" ON public.articles;

----------------------------------------------------------------------
-- Part 2: events partitions — patch factory + backfill RLS
----------------------------------------------------------------------

-- (2a) Patch the partition factory so newly-created partitions get RLS on.
CREATE OR REPLACE FUNCTION public.create_events_partition_for(target_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  partition_name text;
  start_ts       text;
  end_ts         text;
BEGIN
  partition_name := format('events_%s', to_char(target_date, 'YYYYMMDD'));
  start_ts       := to_char(target_date, 'YYYY-MM-DD');
  end_ts         := to_char(target_date + 1, 'YYYY-MM-DD');

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I '
    'PARTITION OF public.events '
    'FOR VALUES FROM (%L) TO (%L)',
    partition_name, start_ts, end_ts
  );

  -- Defense in depth: enable RLS on the partition itself. The parent's RLS
  -- only applies to queries routed through the parent; direct queries against
  -- the child partition check the child's relrowsecurity flag. Without this,
  -- a client able to address the partition by name (predictable date format)
  -- would bypass parent RLS entirely.
  EXECUTE format(
    'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
    partition_name
  );
END;
$function$;

-- (2b) Backfill: enable RLS on every events_* partition that currently has it off.
DO $backfill$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_inherits i ON i.inhrelid = c.oid
    WHERE n.nspname = 'public'
      AND i.inhparent = 'public.events'::regclass
      AND c.relrowsecurity = false
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      rec.relname
    );
  END LOOP;
END
$backfill$;

----------------------------------------------------------------------
-- Part 3: kids_waitlist — drop anon-insert hole
----------------------------------------------------------------------
DROP POLICY IF EXISTS "kids_waitlist_insert_anon" ON public.kids_waitlist;

COMMIT;
