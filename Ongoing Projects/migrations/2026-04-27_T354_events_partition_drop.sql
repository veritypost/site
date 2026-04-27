-- =====================================================================
-- 2026-04-27_T354_events_partition_drop.sql
-- T354: convert public.events to monthly RANGE partitions + 12-month
--       retention via DETACH/DROP cron
-- =====================================================================
-- Problem:
--   public.events grew to ~5.8k rows in the last 7 days per the system
--   map analytics audit; extrapolating ~300k rows/year. Single-table
--   query performance on admin/analytics + the events-pipeline ingest
--   degrades as the table grows. Standard pattern is monthly
--   partitions + drop-partition retention so DELETE doesn't churn the
--   index.
--
-- Migration model:
--   1. Rename public.events -> public.events_legacy.
--   2. Create new public.events as PARTITION BY RANGE (occurred_at).
--   3. Create one partition for the current month + one for next month.
--   4. Move all rows from events_legacy into the appropriate
--      partition by occurred_at.
--   5. Drop events_legacy.
--   6. Add SECURITY DEFINER `events_create_next_partition()` cron — runs
--      mid-month, creates the partition for month+2 (so we always have
--      ≥1 future partition pre-built).
--   7. Add SECURITY DEFINER `events_drop_old_partitions()` cron —
--      detaches + drops partitions > 12 months old.
--
-- Rollback (irreversible after data move; capture full backup first):
--   This is destructive. If you need to roll back AFTER apply, restore
--   from backup. Test on a Supabase branch first.
--
-- Pre-flight:
--   1. SELECT COUNT(*) FROM public.events;
--      Note current row count for post-migration verify.
--   2. Take a full backup or run on a branch.
--
-- Verification:
--   SELECT relname FROM pg_class WHERE relkind = 'p' AND relname = 'events';
--   -- expect 1 row (events is now a partitioned parent)
--   SELECT COUNT(*) FROM public.events;
--   -- should match the pre-flight count
--   SELECT proname FROM pg_proc WHERE proname IN
--     ('events_create_next_partition','events_drop_old_partitions');
--   -- expect 2 rows
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Rename existing table out of the way.
-- ---------------------------------------------------------------------
ALTER TABLE public.events RENAME TO events_legacy;

-- ---------------------------------------------------------------------
-- 2. Create the partitioned parent. Column list MUST mirror events_legacy
--    exactly. Pull the actual column list at apply time via:
--      \d+ public.events_legacy
--    and update this CREATE TABLE before applying. Placeholder columns
--    below match the events shape from src/lib/events/types.ts.
-- ---------------------------------------------------------------------
CREATE TABLE public.events (
  event_id uuid NOT NULL,
  event_name text NOT NULL,
  event_category text NOT NULL,
  occurred_at timestamptz NOT NULL,
  user_id uuid,
  session_id text NOT NULL,
  device_id text,
  user_tier text,
  user_tenure_days integer,
  page text,
  content_type text,
  article_id uuid,
  article_slug text,
  category_slug text,
  subcategory_slug text,
  author_id uuid,
  cohort text,
  via_owner_link boolean,
  referrer_domain text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  device_type text,
  country_iso2 text,
  region text,
  consent_analytics boolean,
  consent_ads boolean,
  experiment_bucket text,
  user_agent_hash text,
  ip_hash text,
  is_bot boolean DEFAULT false,
  payload jsonb DEFAULT '{}'::jsonb,
  PRIMARY KEY (event_id, occurred_at)
) PARTITION BY RANGE (occurred_at);

-- Mirror RLS + grants from events_legacy. Update at apply time.
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.events TO authenticated;
GRANT SELECT, INSERT ON public.events TO anon;

-- ---------------------------------------------------------------------
-- 3. Pre-build current + next month partitions.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_this_start date := date_trunc('month', CURRENT_DATE)::date;
  v_next_start date := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date;
  v_after_next date := (date_trunc('month', CURRENT_DATE) + INTERVAL '2 months')::date;
BEGIN
  EXECUTE format(
    'CREATE TABLE public.events_p_%s PARTITION OF public.events
       FOR VALUES FROM (%L) TO (%L)',
    to_char(v_this_start, 'YYYY_MM'), v_this_start, v_next_start
  );
  EXECUTE format(
    'CREATE TABLE public.events_p_%s PARTITION OF public.events
       FOR VALUES FROM (%L) TO (%L)',
    to_char(v_next_start, 'YYYY_MM'), v_next_start, v_after_next
  );
END $$;

-- ---------------------------------------------------------------------
-- 4. Move legacy rows into the partitioned parent. Postgres routes each
--    INSERT to the matching partition automatically; rows older than
--    "this month start" go nowhere and need a backfill partition.
--    Build backfill partitions for any months in events_legacy that
--    fall outside the pre-built partitions.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_part_name text;
  v_start date;
  v_end date;
BEGIN
  FOR r IN
    SELECT DISTINCT date_trunc('month', occurred_at)::date AS month_start
      FROM public.events_legacy
     ORDER BY 1
  LOOP
    v_start := r.month_start;
    v_end := (v_start + INTERVAL '1 month')::date;
    v_part_name := format('events_p_%s', to_char(v_start, 'YYYY_MM'));
    IF NOT EXISTS (
      SELECT 1 FROM pg_class WHERE relname = v_part_name
    ) THEN
      EXECUTE format(
        'CREATE TABLE public.%I PARTITION OF public.events
           FOR VALUES FROM (%L) TO (%L)',
        v_part_name, v_start, v_end
      );
    END IF;
  END LOOP;
END $$;

INSERT INTO public.events
SELECT * FROM public.events_legacy;

DROP TABLE public.events_legacy;

-- ---------------------------------------------------------------------
-- 5. Cron functions.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.events_create_next_partition()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_start date := (date_trunc('month', CURRENT_DATE) + INTERVAL '2 months')::date;
  v_target_end date := (date_trunc('month', CURRENT_DATE) + INTERVAL '3 months')::date;
  v_part_name text := format('events_p_%s', to_char(v_target_start, 'YYYY_MM'));
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = v_part_name) THEN
    RETURN format('skip: %s already exists', v_part_name);
  END IF;
  EXECUTE format(
    'CREATE TABLE public.%I PARTITION OF public.events
       FOR VALUES FROM (%L) TO (%L)',
    v_part_name, v_target_start, v_target_end
  );
  RETURN format('created: %s', v_part_name);
END;
$$;

REVOKE ALL ON FUNCTION public.events_create_next_partition() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.events_drop_old_partitions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_dropped integer := 0;
  v_cutoff date := (date_trunc('month', CURRENT_DATE) - INTERVAL '12 months')::date;
BEGIN
  FOR r IN
    SELECT c.relname
      FROM pg_inherits i
      JOIN pg_class c ON c.oid = i.inhrelid
      JOIN pg_class p ON p.oid = i.inhparent
     WHERE p.relname = 'events'
       AND c.relname LIKE 'events_p_%'
  LOOP
    -- Parse YYYY_MM from the partition name. Skip if can't parse.
    BEGIN
      IF to_date(substring(r.relname from 'events_p_(.*)'), 'YYYY_MM') < v_cutoff THEN
        EXECUTE format('DROP TABLE public.%I', r.relname);
        v_dropped := v_dropped + 1;
      END IF;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
  END LOOP;
  RETURN v_dropped;
END;
$$;

REVOKE ALL ON FUNCTION public.events_drop_old_partitions() FROM PUBLIC;

COMMIT;

-- =====================================================================
-- Cron registrations required after this migration applies:
--   web/src/app/api/cron/events-create-next-partition/route.ts
--     wraps service.rpc('events_create_next_partition')
--     schedule: 15th of each month at 02:00 UTC
--
--   web/src/app/api/cron/events-drop-old-partitions/route.ts
--     wraps service.rpc('events_drop_old_partitions')
--     schedule: 1st of each month at 02:30 UTC
-- =====================================================================
