-- 108_events_pipeline.sql
-- Master-plan Phase A, commit #1.
--
-- The single-pipeline events table. Everything measurable on the site
-- (pageviews, quiz events, score changes, ad impressions, subscribe
-- conversions) writes through one endpoint into one partitioned table.
-- Downstream fan-out (GA4, BigQuery, future ClickHouse) reads from here;
-- nothing else holds authoritative event truth.
--
-- Design decisions locked here:
--   * Native Postgres declarative partitioning by day on occurred_at.
--     pg_cron creates tomorrow's partition nightly and drops partitions
--     older than 90 days. No pg_partman dependency.
--   * PK is (event_id, occurred_at) so the partition key is present;
--     idempotency is by that tuple. Clients MUST generate both at event
--     time, not at send time, so retries dedupe cleanly.
--   * Wide schema (~35 columns) captures every dimension we expect to
--     slice on. Unused columns are null; a targeted jsonb payload
--     column handles anything not covered.
--   * RLS enabled; no policies. Service role (server endpoints) is the
--     only writer; admin reads go through the admin layout auth gate.
--   * user_agent and ip are never stored raw. Server hashes with a
--     rotating salt before insert.
--
-- Apply with: supabase sql editor → paste file → run. Requires pg_cron
-- extension (already enabled on Supabase by default).

BEGIN;

-- =========================================================================
-- 1. Parent partitioned table
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.events (
  event_id            uuid        NOT NULL,
  event_name          text        NOT NULL,
  event_category      text        NOT NULL CHECK (event_category IN (
                                  'product', 'ads', 'marketing', 'system')),
  occurred_at         timestamptz NOT NULL,
  received_at         timestamptz NOT NULL DEFAULT now(),

  -- Identity
  user_id             uuid,
  session_id          text        NOT NULL,
  device_id           text,
  user_tier           text,
  user_tenure_days    int,

  -- Page context
  page                text,
  content_type        text,
  article_id          uuid,
  article_slug        text,
  category_slug       text,
  subcategory_slug    text,
  author_id           uuid,

  -- Marketing attribution
  referrer_domain     text,
  utm_source          text,
  utm_medium          text,
  utm_campaign        text,

  -- Device
  device_type         text,
  country_iso2        text,
  region              text,
  viewport_w          int,
  viewport_h          int,

  -- Consent
  consent_analytics   boolean,
  consent_ads         boolean,

  -- Integrity
  is_bot              boolean NOT NULL DEFAULT false,
  experiment_bucket   text,

  -- Privacy-safe identifiers (hashed server-side before insert)
  user_agent_hash     text,
  ip_hash             text,

  -- Event-specific payload (quiz_score, ad_unit_id, scroll_depth_pct, etc.)
  payload             jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at          timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (event_id, occurred_at)
) PARTITION BY RANGE (occurred_at);

COMMENT ON TABLE public.events IS
  'Single-pipeline event table. All measurable product/ads/marketing/system '
  'events land here via /api/events/batch. Partitioned by day on occurred_at; '
  '90-day retention; nothing else holds authoritative event truth.';

-- Indexes on the parent cascade to every partition.
CREATE INDEX IF NOT EXISTS events_occurred_at_idx
  ON public.events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS events_user_id_idx
  ON public.events (user_id, occurred_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_article_id_idx
  ON public.events (article_id, occurred_at DESC) WHERE article_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_category_slug_idx
  ON public.events (category_slug, occurred_at DESC) WHERE category_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_event_name_idx
  ON public.events (event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS events_session_id_idx
  ON public.events (session_id, occurred_at DESC);

-- =========================================================================
-- 2. RLS — enabled with no policies. Service role writes; nobody else.
-- =========================================================================

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Admin and DSAR reads use the service role via server routes. If a future
-- policy needs to allow users to read their own events (right-to-access),
-- add it then. Default-deny here is the correct posture.

-- =========================================================================
-- 3. Partition maintenance
-- =========================================================================

-- Creates the partition for a given date if it doesn't exist.
CREATE OR REPLACE FUNCTION public.create_events_partition_for(target_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
END;
$$;

-- Drops partitions older than retention_days. Default 90.
CREATE OR REPLACE FUNCTION public.drop_old_events_partitions(retention_days int DEFAULT 90)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff       date := current_date - retention_days;
  partition    record;
  dropped      int := 0;
BEGIN
  FOR partition IN
    SELECT relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname ~ '^events_[0-9]{8}$'
       AND to_date(substring(c.relname FROM 8 FOR 8), 'YYYYMMDD') < cutoff
  LOOP
    EXECUTE format('DROP TABLE public.%I', partition.relname);
    dropped := dropped + 1;
  END LOOP;
  RETURN dropped;
END;
$$;

-- =========================================================================
-- 4. Seed partitions — today, tomorrow, plus a default for early writes
--    that arrive before the cron has kicked in.
-- =========================================================================

SELECT public.create_events_partition_for(current_date);
SELECT public.create_events_partition_for(current_date + 1);

-- Default catches stray inserts with out-of-range occurred_at (clock skew,
-- backfills). We don't want them to fail; we do want to find them later.
CREATE TABLE IF NOT EXISTS public.events_default
  PARTITION OF public.events DEFAULT;

-- =========================================================================
-- 5. pg_cron jobs — create tomorrow's partition each night, drop old.
-- =========================================================================

-- pg_cron is enabled on Supabase by default. If it's not on your instance,
-- run: CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a partition for day-after-tomorrow every night at 00:05 UTC.
-- Safe to re-run; create_events_partition_for is idempotent.
SELECT cron.schedule(
  'events-create-next-partition',
  '5 0 * * *',
  $$SELECT public.create_events_partition_for(current_date + 1);$$
);

-- Drop partitions older than 90 days, nightly at 00:15 UTC.
SELECT cron.schedule(
  'events-drop-old-partitions',
  '15 0 * * *',
  $$SELECT public.drop_old_events_partitions(90);$$
);

-- =========================================================================
-- 6. Admin helper view — useful for spot-checks before we build dashboards.
-- =========================================================================

CREATE OR REPLACE VIEW public.events_24h_summary AS
SELECT
  event_category,
  event_name,
  count(*)                                      AS total,
  count(DISTINCT user_id)                       AS distinct_users,
  count(DISTINCT session_id)                    AS distinct_sessions,
  count(*) FILTER (WHERE is_bot)                AS bot_events,
  min(occurred_at)                              AS first_seen,
  max(occurred_at)                              AS last_seen
FROM public.events
WHERE occurred_at >= now() - interval '24 hours'
GROUP BY event_category, event_name
ORDER BY total DESC;

COMMIT;
