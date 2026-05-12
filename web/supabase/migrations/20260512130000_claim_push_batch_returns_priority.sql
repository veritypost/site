-- claim_push_batch: expose notifications.priority to the send-push cron.
--
-- Background: notifications.priority (varchar NOT NULL DEFAULT 'normal') has
-- existed on the table for a while but the cron RPC never returned it, so the
-- send-push worker had no way to set apns-priority or aps interruption-level
-- per row. This migration adds `priority` to the RETURNS TABLE and the
-- RETURNING clause; behaviour, locking, and stale-claim reclaim window are
-- otherwise unchanged.
--
-- Caller responsibilities (web/src/app/api/cron/send-push/route.js):
--   - Maps priority='urgent' → apns-priority=10 + interruption-level=time-sensitive
--     ONLY when notification.type is on a server-side allowlist; otherwise
--     downgrades to apns-priority=5 + interruption-level=active and logs a
--     warning. Server-side allowlist prevents row-level abuse of urgent.

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
  RETURNING q.id, q.user_id, q.type, q.title, q.body, q.action_url, q.metadata, q.priority;
END $function$;
