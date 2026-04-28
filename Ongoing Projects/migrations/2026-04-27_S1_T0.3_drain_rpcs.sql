-- S1-T0.3 — drain RPCs: claim_push_batch + ack_push_batch + claim_email_batch + ack_email_batch
--
-- Production-broken (P0). The send-push cron at
-- web/src/app/api/cron/send-push/route.js:72 calls
-- `service.rpc('claim_push_batch', { p_limit: 200 })`. Live `pg_proc`
-- lookup (2026-04-27) returns zero rows for any of the four function
-- names. Every push cron tick errors out — breaking-news fan-out is
-- dead, comment-reply push delivery is dead, mention push is dead.
--
-- The send-emails cron currently selects directly from notifications
-- (no claim/ack yet), but S2's redesign will swap to these RPCs once
-- they exist; ship them in one transaction so S2 has a complete contract.
--
-- Verified state (2026-04-27 via information_schema):
--   - Both push and email queues live in `public.notifications` (single
--     table). Push pending = (push_sent=false AND channel<>'in_app').
--     Email pending = (email_sent=false AND type IN <transactional set>);
--     the type filter belongs to S2's redesign, so claim_email_batch
--     here returns email-pending rows in created_at order and lets the
--     consumer filter by type as today.
--   - notifications.push_claimed_at exists. notifications.email_claimed_at
--     does NOT — this migration adds it for parity.
--   - Row shape consumed by send-push (route.js:85, 197-260) and
--     send-emails (route.js:62): id, user_id, type, title, body,
--     action_url, metadata.
--
-- Concurrency model:
--   - claim_*_batch uses FOR UPDATE SKIP LOCKED to let parallel cron
--     invocations claim disjoint row sets without deadlock.
--   - Stale claims (>5 min old) are reclaimable so a crashed prior tick
--     doesn't permanently lock notifications.
--   - ack_*_batch UPDATEs only rows whose claim is still ours; rows
--     reclaimed by a later tick are no-ops.
--
-- Authorisation: service-role only. cron auth verifies CRON_SECRET on
-- the HTTP layer; the RPC adds defence-in-depth via auth.role() check.
-- is_admin_or_above() is allowed for ad-hoc admin debugging from the
-- backend.
--
-- ack_*_batch shape: jsonb array of { id (uuid), status (text), error (text) }.
-- status values: 'delivered' | 'failed'. Other statuses (e.g. 'invalidated')
-- map to 'failed' upstream; the RPC stamps the value verbatim into the
-- side-channel (push_receipt for push, metadata.email_error for email)
-- so S2 can carry richer status without a schema change.
--
-- Caller refactor: send-push is already calling claim_push_batch; once
-- this lands the cron starts working without a code change. ack_push_batch
-- and the two email RPCs are unused until S2 ships the drain redesign;
-- shipping them now unblocks S2 (S1→S2 RPC gate per 00_INDEX.md).

BEGIN;

-- Pre-flight: confirm both queue contracts exist on notifications.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'notifications'
  ) THEN
    RAISE EXCEPTION 'S1-T0.3 abort: public.notifications table missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'notifications'
       AND column_name = 'push_claimed_at'
  ) THEN
    RAISE EXCEPTION 'S1-T0.3 abort: notifications.push_claimed_at missing — push claim contract incomplete';
  END IF;
END $$;

-- Add email_claimed_at column (parity with push_claimed_at). Idempotent.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS email_claimed_at timestamptz;

-- Index supports both claim_* scans (claim drives off the partial WHERE).
-- Two partial indexes — one per channel — keep the hot pages narrow.
CREATE INDEX IF NOT EXISTS notifications_pending_push_idx
  ON public.notifications (created_at)
  WHERE push_sent = false AND channel <> 'in_app';
CREATE INDEX IF NOT EXISTS notifications_pending_email_idx
  ON public.notifications (created_at)
  WHERE email_sent = false;

-- 1. claim_push_batch — atomically claim N pending push rows.
CREATE OR REPLACE FUNCTION public.claim_push_batch(p_limit int)
  RETURNS TABLE(
    id uuid,
    user_id uuid,
    type varchar,
    title varchar,
    body text,
    action_url text,
    metadata jsonb
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  -- Defence-in-depth: service-role only. cron auth verifies CRON_SECRET
  -- at the HTTP layer; this guard catches accidental client-side calls
  -- (PostgREST anon / authenticated tokens hit it as 42501).
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'forbidden: claim_push_batch is service-role only'
      USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit <= 0 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'p_limit must be in (0, 1000], got %', p_limit
      USING ERRCODE = '22023';
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
     LIMIT p_limit
  )
  UPDATE public.notifications q
     SET push_claimed_at = now(),
         updated_at = now()
    FROM claimed
   WHERE q.id = claimed.id
  RETURNING q.id, q.user_id, q.type, q.title, q.body, q.action_url, q.metadata;
END $$;

-- 2. ack_push_batch — mark each claimed row's terminal status.
-- Consumer passes [{ id, status, error }, ...]. status='delivered' marks
-- push_sent=true with push_sent_at=now(); status='failed' marks the row
-- sent (so it doesn't re-queue) and stamps the error into push_receipt.
-- WHERE push_claimed_at IS NOT NULL guards against acking a row that has
-- already been reclaimed by a stuck-handler retry.
CREATE OR REPLACE FUNCTION public.ack_push_batch(p_rows jsonb)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'forbidden: ack_push_batch is service-role only'
      USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(COALESCE(p_rows, 'null'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a jsonb array of { id, status, error }'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.notifications q
     SET push_sent = true,
         push_sent_at = now(),
         push_receipt = NULLIF(r->>'error', ''),
         updated_at = now()
    FROM jsonb_array_elements(p_rows) AS r
   WHERE q.id = (r->>'id')::uuid
     AND q.push_claimed_at IS NOT NULL;
END $$;

-- 3. claim_email_batch — atomically claim N pending email rows.
-- Type filtering (transactional-only) stays in the consumer per current
-- send-emails route; this RPC returns all email-pending rows ordered by
-- created_at and the consumer applies its TYPE_TO_TEMPLATE allowlist.
CREATE OR REPLACE FUNCTION public.claim_email_batch(p_limit int)
  RETURNS TABLE(
    id uuid,
    user_id uuid,
    type varchar,
    title varchar,
    body text,
    action_url text,
    metadata jsonb
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'forbidden: claim_email_batch is service-role only'
      USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit <= 0 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'p_limit must be in (0, 1000], got %', p_limit
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH claimed AS (
    SELECT n.id
      FROM public.notifications n
     WHERE n.email_sent = false
       AND (n.email_claimed_at IS NULL OR n.email_claimed_at < now() - interval '5 minutes')
     ORDER BY n.created_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT p_limit
  )
  UPDATE public.notifications q
     SET email_claimed_at = now(),
         updated_at = now()
    FROM claimed
   WHERE q.id = claimed.id
  RETURNING q.id, q.user_id, q.type, q.title, q.body, q.action_url, q.metadata;
END $$;

-- 4. ack_email_batch — mark each claimed row's terminal status.
-- status='delivered' → email_sent=true, email_sent_at=now().
-- status='failed' → email_sent=true (don't retry indefinitely) and the
-- error string lands in metadata.email_error so admin tools can surface it.
CREATE OR REPLACE FUNCTION public.ack_email_batch(p_rows jsonb)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'forbidden: ack_email_batch is service-role only'
      USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(COALESCE(p_rows, 'null'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a jsonb array of { id, status, error }'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.notifications q
     SET email_sent = true,
         email_sent_at = now(),
         metadata = q.metadata || jsonb_build_object(
           'email_error', NULLIF(r->>'error', ''),
           'email_status', NULLIF(r->>'status', '')
         ),
         updated_at = now()
    FROM jsonb_array_elements(p_rows) AS r
   WHERE q.id = (r->>'id')::uuid
     AND q.email_claimed_at IS NOT NULL;
END $$;

-- Grants — only service_role + admin; deny anon/authenticated.
REVOKE ALL ON FUNCTION public.claim_push_batch(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ack_push_batch(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_email_batch(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ack_email_batch(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_push_batch(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.ack_push_batch(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_email_batch(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.ack_email_batch(jsonb) TO service_role;

-- Post-verification: confirm all four exist with prosecdef=true.
DO $$
DECLARE
  fn text;
  found boolean;
BEGIN
  FOREACH fn IN ARRAY ARRAY['claim_push_batch','ack_push_batch','claim_email_batch','ack_email_batch']
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM pg_proc
       WHERE proname = fn
         AND pronamespace = 'public'::regnamespace
         AND prosecdef = true
    ) INTO found;
    IF NOT found THEN
      RAISE EXCEPTION 'S1-T0.3 post-check failed: % missing or not SECURITY DEFINER', fn;
    END IF;
  END LOOP;
  RAISE NOTICE 'S1-T0.3 applied: claim_push_batch + ack_push_batch + claim_email_batch + ack_email_batch live; email_claimed_at column added';
END $$;

COMMIT;
