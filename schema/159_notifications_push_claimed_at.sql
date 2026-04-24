-- 159 — L19: atomic claim column on notifications for cron/send-push.
--
-- Prior state: cron/send-push ran SELECT ... WHERE push_sent=false LIMIT 200,
-- dispatched, then updated push_sent=true at the end. Two overlapping cron
-- invocations (Vercel retry, manual trigger + scheduled, or runtime >
-- interval) both see the same 200 rows, both dispatch, both insert into
-- push_receipts. The user gets every notification twice; there's no unique
-- constraint on push_receipts to dedupe.
--
-- Add a push_claimed_at timestamp column + partial index so the cron can:
--   1. Claim a batch atomically via UPDATE ... RETURNING (Postgres
--      serializes these — one writer wins per row).
--   2. Reclaim stuck claims (>5 min old) on the next run if the prior
--      invocation crashed mid-dispatch.
--
-- Backfill: all existing rows with push_sent=true get push_claimed_at=
-- push_sent_at (already-dispatched, no reclaim needed). Unsent rows stay
-- NULL so the first post-migration cron tick claims them cleanly.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS push_claimed_at timestamptz NULL;

-- Backfill already-sent rows so the reclaim query doesn't pick them up.
UPDATE public.notifications
   SET push_claimed_at = push_sent_at
 WHERE push_sent = true
   AND push_claimed_at IS NULL;

-- Partial index on the hot path: unsent notifications, optionally with a
-- stale claim. Keeps the cron's SELECT cheap even as the notifications
-- table grows.
CREATE INDEX IF NOT EXISTS idx_notifications_push_claim
  ON public.notifications (push_claimed_at, created_at)
  WHERE push_sent = false;

COMMENT ON COLUMN public.notifications.push_claimed_at IS
  'L19 — set by cron/send-push before dispatch to atomically claim a batch. NULL = never claimed; past-timestamp = claimed at that time (reclaimable after 5 min if dispatch crashed).';

-- RPC: atomic claim-on-update with FOR UPDATE SKIP LOCKED. Supabase JS can't
-- express FOR UPDATE directly, so this wrapper exists purely to give the
-- cron a single callable entry point. Returns the claimed rows (same shape
-- the cron was already selecting) so the Node code doesn't need a separate
-- SELECT afterward.
--
-- Stale-claim reclaim: rows claimed >5 min ago are fair game again so a
-- prior cron crash doesn't permanently lock notifications.
CREATE OR REPLACE FUNCTION public.claim_push_batch(p_limit int DEFAULT 200)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  type varchar,
  title text,
  body text,
  action_url text,
  metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.notifications n
     SET push_claimed_at = now()
   WHERE n.id IN (
     SELECT inner_n.id
       FROM public.notifications inner_n
      WHERE inner_n.push_sent = false
        AND inner_n.channel <> 'in_app'
        AND (inner_n.push_claimed_at IS NULL
             OR inner_n.push_claimed_at < now() - interval '5 minutes')
      ORDER BY inner_n.created_at
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
   )
  RETURNING n.id, n.user_id, n.type, n.title, n.body, n.action_url, n.metadata;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_push_batch(int) FROM public, anon, authenticated;

COMMENT ON FUNCTION public.claim_push_batch(int) IS
  'L19 — atomically claim a batch of unsent push notifications for dispatch. FOR UPDATE SKIP LOCKED makes concurrent cron invocations see disjoint rows. Stale claims (>5 min) are reclaimable.';
