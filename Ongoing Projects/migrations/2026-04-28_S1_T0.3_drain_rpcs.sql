-- =====================================================================
-- 2026-04-28_S1_T0.3_drain_rpcs.sql
-- S1-T0.3 — claim_push_batch + ack_push_batch
--           + claim_email_batch + ack_email_batch
-- Source: Ongoing Projects/Sessions/Session_01_DB_Migrations.md (S1-T0.3)
-- Severity: P0 production-broken
-- =====================================================================
-- Verified state (2026-04-28 via pg_proc + cron consumer read):
--   pg_proc lookup returns ZERO rows for all four function names.
--   web/src/app/api/cron/send-push/route.js:72 calls
--     service.rpc('claim_push_batch', { p_limit: 200 })
--   and consumes rows shaped:
--     { id, user_id, type, title, body, action_url, metadata, ... }
--   from public.notifications. Push cron is dead today (no RPC to call).
--
--   web/src/app/api/cron/send-emails/route.js currently SELECTs
--   notifications directly; S2 cron redesign migrates it onto
--   claim_email_batch + ack_email_batch (Session_02_Cron.md lines 389-416,
--   468-469). All 4 RPCs ship in one transaction so S2 can unblock
--   immediately.
--
--   Queue table = public.notifications (not a separate table). Status
--   tracking uses existing columns:
--     push_claimed_at, push_sent, push_sent_at, push_receipt
--     email_sent, email_sent_at
--   Adding email_claimed_at to mirror push.
--
-- Concurrency: FOR UPDATE SKIP LOCKED in claim_*_batch ensures two
-- concurrent cron invocations claim disjoint rows. ack_*_batch uses
-- the claimed-at timestamp as a guard so a stale-claim retry can't
-- ack a row that was re-claimed by another tick.
--
-- Caller dependencies (flagged for peer sessions, not edited here):
--   - send-push/route.js (S2): already calls claim_push_batch; S2 should
--     add an ack_push_batch call after dispatch instead of the per-row
--     UPDATE notifications loop. Until S2 migrates, the existing
--     UPDATE-by-id path keeps working — claim_push_batch sets
--     push_claimed_at without changing other status flags, so the
--     existing dispatcher's UPDATE clears it transparently.
--   - send-emails/route.js (S2): currently uses direct SELECT; S2
--     redesigns to use claim_email_batch + ack_email_batch.
--
-- Rollback:
--   BEGIN;
--   DROP FUNCTION public.claim_push_batch(int);
--   DROP FUNCTION public.ack_push_batch(jsonb);
--   DROP FUNCTION public.claim_email_batch(int);
--   DROP FUNCTION public.ack_email_batch(jsonb);
--   ALTER TABLE public.notifications DROP COLUMN IF EXISTS email_claimed_at;
--   COMMIT;
-- =====================================================================

BEGIN;

-- Pre-flight: confirm notifications table + columns exist.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='notifications') THEN
    RAISE EXCEPTION 'public.notifications missing — abort';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='notifications'
                   AND column_name='push_claimed_at') THEN
    RAISE EXCEPTION 'notifications.push_claimed_at missing — abort';
  END IF;
END $$;

-- Add email_claimed_at to mirror push, keeping the queue model uniform.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS email_claimed_at timestamptz;

-- Stale-claim reclaim window — a crashed cron run shouldn't permanently
-- pin its claimed rows. 5 minutes mirrors the maxDuration=60s + retry
-- pattern used in send-push/send-emails.
-- ---------------------------------------------------------------------

-- 1. claim_push_batch
CREATE OR REPLACE FUNCTION public.claim_push_batch(p_limit int)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  type varchar,
  title varchar,
  body text,
  action_url text,
  metadata jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  -- Service-role only. Defense-in-depth — Vercel cron always calls with
  -- service_role key; a kid token / authenticated user invoking this
  -- through PostgREST would otherwise be able to drain the queue.
  IF v_role IS DISTINCT FROM 'service_role'
     AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'claim_push_batch: service_role required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH claimed AS (
    SELECT n.id
      FROM public.notifications n
     WHERE n.push_sent = false
       AND n.channel <> 'in_app'
       AND (n.push_claimed_at IS NULL OR n.push_claimed_at < now() - interval '5 minutes')
     ORDER BY n.created_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT GREATEST(COALESCE(p_limit, 1), 1)
  )
  UPDATE public.notifications n
     SET push_claimed_at = now(),
         updated_at = now()
    FROM claimed c
   WHERE n.id = c.id
   RETURNING n.id, n.user_id, n.type, n.title, n.body,
             n.action_url, n.metadata, n.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_push_batch(int) TO service_role;

-- 2. ack_push_batch
-- Consumer passes p_rows shaped: [{id: uuid, status: 'delivered'|'failed'|...,
--                                  receipt: text|null, error: text|null}, ...]
-- WHERE push_claimed_at IS NOT NULL guards against acking a row that has
-- been reclaimed (push_claimed_at would be reset by claim_push_batch's
-- 5-minute reclaim).
CREATE OR REPLACE FUNCTION public.ack_push_batch(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_acked integer := 0;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role'
     AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'ack_push_batch: service_role required'
      USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a jsonb array' USING ERRCODE = '22023';
  END IF;

  WITH acked AS (
    UPDATE public.notifications n
       SET push_sent = true,
           push_sent_at = now(),
           push_receipt = COALESCE((r->>'receipt'), n.push_receipt),
           push_claimed_at = NULL,
           metadata = CASE
             WHEN (r->>'error') IS NOT NULL
               THEN COALESCE(n.metadata, '{}'::jsonb)
                    || jsonb_build_object('push_error', r->>'error',
                                          'push_status', r->>'status')
             WHEN (r->>'status') IS NOT NULL AND (r->>'status') <> 'delivered'
               THEN COALESCE(n.metadata, '{}'::jsonb)
                    || jsonb_build_object('push_status', r->>'status')
             ELSE n.metadata
           END,
           updated_at = now()
      FROM jsonb_array_elements(p_rows) AS r
     WHERE n.id = (r->>'id')::uuid
       AND n.push_claimed_at IS NOT NULL
     RETURNING 1
  )
  SELECT count(*)::int INTO v_acked FROM acked;

  RETURN v_acked;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ack_push_batch(jsonb) TO service_role;

-- 3. claim_email_batch
-- Mirrors claim_push_batch, gated on email_sent + the (newly added)
-- email_claimed_at. Email cron is transactional-only (data_export_ready,
-- kid_trial_expired, expert_reverification_due) — see send-emails/route.js
-- TYPE_TO_TEMPLATE map.
CREATE OR REPLACE FUNCTION public.claim_email_batch(p_limit int)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  type varchar,
  title varchar,
  body text,
  action_url text,
  metadata jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF v_role IS DISTINCT FROM 'service_role'
     AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'claim_email_batch: service_role required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH claimed AS (
    SELECT n.id
      FROM public.notifications n
     WHERE n.email_sent = false
       AND n.type IN ('data_export_ready','kid_trial_expired','expert_reverification_due')
       AND (n.email_claimed_at IS NULL OR n.email_claimed_at < now() - interval '5 minutes')
     ORDER BY n.created_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT GREATEST(COALESCE(p_limit, 1), 1)
  )
  UPDATE public.notifications n
     SET email_claimed_at = now(),
         updated_at = now()
    FROM claimed c
   WHERE n.id = c.id
   RETURNING n.id, n.user_id, n.type, n.title, n.body,
             n.action_url, n.metadata, n.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_email_batch(int) TO service_role;

-- 4. ack_email_batch
-- p_rows shape: [{id: uuid, status: 'sent'|'failed'|'skipped',
--                 error: text|null, skip_reason: text|null}, ...]
CREATE OR REPLACE FUNCTION public.ack_email_batch(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_acked integer := 0;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role'
     AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'ack_email_batch: service_role required'
      USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a jsonb array' USING ERRCODE = '22023';
  END IF;

  WITH acked AS (
    UPDATE public.notifications n
       SET email_sent = true,
           email_sent_at = now(),
           email_claimed_at = NULL,
           metadata = CASE
             WHEN (r->>'error') IS NOT NULL
               THEN COALESCE(n.metadata, '{}'::jsonb)
                    || jsonb_build_object('email_error', r->>'error',
                                          'email_status', r->>'status')
             WHEN (r->>'skip_reason') IS NOT NULL
               THEN COALESCE(n.metadata, '{}'::jsonb)
                    || jsonb_build_object('email_skip_reason', r->>'skip_reason')
             ELSE n.metadata
           END,
           updated_at = now()
      FROM jsonb_array_elements(p_rows) AS r
     WHERE n.id = (r->>'id')::uuid
       AND n.email_claimed_at IS NOT NULL
     RETURNING 1
  )
  SELECT count(*)::int INTO v_acked FROM acked;

  RETURN v_acked;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ack_email_batch(jsonb) TO service_role;

-- Post-verification.
DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM pg_proc
   WHERE pronamespace='public'::regnamespace
     AND proname IN ('claim_push_batch','ack_push_batch','claim_email_batch','ack_email_batch');
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'expected 4 drain RPCs after migration; found %', v_count;
  END IF;
  RAISE NOTICE 'S1-T0.3 applied: claim_push_batch + ack_push_batch + claim_email_batch + ack_email_batch live';
END $$;

COMMIT;
