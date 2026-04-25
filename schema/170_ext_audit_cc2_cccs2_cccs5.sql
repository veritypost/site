-- 170_ext_audit_cc2_cccs2_cccs5.sql
-- External audit Bucket-5 schema cluster.
--
-- Ext-CC.2 — claim_queue_item has FOR UPDATE but no TTL. A claimed
--   expert queue item that the expert never replies to stays claimed
--   forever, so other experts can never pick it up.
-- Ext-CCC.2 — user_roles has no UNIQUE(user_id, role_id) — same role
--   can be granted twice. Cleanup before constraint.
-- Ext-CCC.5 — rate_limit_events has no cleanup; row count grows
--   unbounded over time. Add a deletion helper called by a cron.

-- ============================================================================
-- CC.2 — release_stale_expert_claims
-- ============================================================================
-- A claim older than the threshold (default 48h) is reverted to pending so
-- the queue stays unblocked. Returns count of items released.

CREATE OR REPLACE FUNCTION public.release_stale_expert_claims(
  p_max_age_hours int DEFAULT 48
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  WITH released AS (
    UPDATE expert_queue_items
       SET status = 'pending',
           claimed_by = NULL,
           claimed_at = NULL,
           updated_at = now()
     WHERE status = 'claimed'
       AND claimed_at IS NOT NULL
       AND claimed_at < now() - make_interval(hours => p_max_age_hours)
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM released;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_stale_expert_claims(int) TO service_role;

-- ============================================================================
-- CCC.2 — UNIQUE(user_id, role_id) on user_roles
-- ============================================================================
-- Dedup any existing duplicates (keep the earliest row), then add the
-- constraint so future grants are idempotent at the DB level.

DELETE FROM public.user_roles a
USING public.user_roles b
WHERE a.user_id = b.user_id
  AND a.role_id = b.role_id
  AND a.ctid > b.ctid;

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_role_uniq;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_role_uniq UNIQUE (user_id, role_id);

-- ============================================================================
-- CCC.5 — rate_limit_events cleanup
-- ============================================================================
-- The table accumulates a row per allowed call; nothing trims it. Add a
-- helper that deletes rows older than the retention window. A cron route
-- (web/src/app/api/cron/rate-limit-cleanup) calls this daily.

CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_events(
  p_retention_days int DEFAULT 7
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  WITH del AS (
    DELETE FROM rate_limit_events
     WHERE occurred_at < now() - make_interval(days => p_retention_days)
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM del;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_rate_limit_events(int) TO service_role;
