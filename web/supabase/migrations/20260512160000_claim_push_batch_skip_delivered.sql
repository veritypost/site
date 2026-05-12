-- claim_push_batch: race-close + receipt dedupe.
--
-- Audit finding: claim_push_batch relies on (push_sent=false AND
-- push_claimed_at IS NULL OR > 5 min ago) to gate re-delivery. But the
-- worker writes push_receipts BEFORE flipping push_sent, so a slow
-- worker that delivered + wrote a receipt but didn't yet mark push_sent
-- could be reclaimed by the 5-min stale-claim path on the next cron tick
-- — and re-deliver. push_receipts already records what was delivered;
-- we just weren't consulting it from the claim side.
--
-- This migration:
--   1) Adds a unique partial index on push_receipts (notification_id)
--      WHERE status = 'delivered'. Defence-in-depth: even if the
--      claim-side dedupe fails, the receipt write fails-loud on a
--      second delivery attempt and the worker logs + skips instead
--      of double-delivering.
--   2) Modifies claim_push_batch to LEFT JOIN push_receipts and
--      exclude any notification that already has a delivered receipt.
--      Everything else from the prior CREATE OR REPLACE is preserved:
--      service-role guard, p_limit bounds, FOR UPDATE SKIP LOCKED,
--      5-min stale-claim window, RETURNING list (incl. priority).

CREATE UNIQUE INDEX IF NOT EXISTS push_receipts_delivered_notification_uniq
  ON public.push_receipts (notification_id)
  WHERE status = 'delivered';

CREATE OR REPLACE FUNCTION public.claim_push_batch(p_limit integer)
 RETURNS TABLE(
   id uuid,
   user_id uuid,
   type character varying,
   title character varying,
   body text,
   action_url text,
   metadata jsonb,
   priority character varying
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      LEFT JOIN public.push_receipts pr
        ON pr.notification_id = n.id
       AND pr.status = 'delivered'
     WHERE n.push_sent = false
       AND n.channel <> 'in_app'
       AND (n.push_claimed_at IS NULL OR n.push_claimed_at < now() - interval '5 minutes')
       AND pr.id IS NULL
     ORDER BY n.created_at ASC
     FOR UPDATE OF n SKIP LOCKED
     LIMIT p_limit
  )
  UPDATE public.notifications q
     SET push_claimed_at = now(),
         updated_at = now()
    FROM claimed
   WHERE q.id = claimed.id
  RETURNING q.id, q.user_id, q.type, q.title, q.body, q.action_url, q.metadata, q.priority;
END $function$;
