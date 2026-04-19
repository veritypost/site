-- ============================================================
-- 056_verity_score_rpcs.sql
-- DA-097 / F-004 — Lock down the `increment_field` universal
-- write primitive.
--
-- Context
-- -------
-- The `increment_field(table_name, row_id, field_name, amount)` RPC was
-- defined in reset_and_rebuild_v2.sql:4385-4398 as SECURITY DEFINER with
-- identifier-quoted dynamic SQL. It is granted to the `authenticated`
-- role (reset_and_rebuild_v2.sql:4466). Any logged-in user can therefore
-- call it with arbitrary table/column names, including:
--
--   rpc('increment_field',
--       { table_name: 'users', row_id: <own id>,
--         field_name: 'verity_score', amount: 10000 })
--
-- No row-ownership check, no column allowlist, no amount bound. The
-- quoting prevents classical SQL injection, but the function itself is
-- the exploit vector. Deep Audit flagged as P1; Fresh Audit flagged as
-- CRITICAL; Deep Audit Review escalated to P0.
--
-- Related RPCs noted by Fresh Audit (F-005, F-006) — `update_follow_counts`,
-- `increment_comment_vote`, `increment_comment_count`,
-- `increment_bookmark_count`, `purge_rate_limit_events` — are handled in
-- a later chunk. This migration only addresses the `increment_field`
-- primitive.
--
-- Remediation
-- -----------
-- Two defenses, applied together:
--
-- 1. Revoke EXECUTE from `anon` and `authenticated`. Only `service_role`
--    may invoke. Route handlers that need to increment counters must
--    use the service client (createServiceClient) and carry server-side
--    checks for who may trigger the increment.
--
-- 2. Harden the function body with a narrow (table, field) allowlist
--    and a magnitude cap on `amount`, so even if EXECUTE is later
--    granted more broadly by accident, the blast radius is bounded.
--    `verity_score` is intentionally NOT in the allowlist — it is only
--    ever written by the server-side scoring RPCs in reset_and_rebuild_v2.
--
-- Rollback
-- --------
-- To revert in an incident:
--
--   GRANT EXECUTE ON FUNCTION public.increment_field(text, uuid, text, integer)
--     TO authenticated;
--
--   -- Then re-run the function definition from reset_and_rebuild_v2.sql:4385.
--
-- ============================================================

-- Harden the function body. CREATE OR REPLACE keeps the signature
-- intact so existing callers (service role) continue to work.
CREATE OR REPLACE FUNCTION public.increment_field(
  table_name text,
  row_id uuid,
  field_name text,
  amount integer DEFAULT 1
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Tables and columns that route handlers may legitimately increment
  -- via the service role. Anything not in this list must use a
  -- purpose-built RPC. `users.verity_score` is deliberately absent —
  -- scoring is owned by the scoring RPCs. `users.login_count` is here
  -- so /api/auth/login bookkeeping can continue to function.
  v_allowed_pairs text[] := ARRAY[
    'articles.view_count',
    'articles.share_count',
    'articles.comment_count',
    'articles.bookmark_count',
    'users.login_count'
  ];
  v_pair text := table_name || '.' || field_name;
BEGIN
  IF NOT (v_pair = ANY(v_allowed_pairs)) THEN
    RAISE EXCEPTION
      'increment_field: (table, field) pair % is not permitted. Use a purpose-built RPC.', v_pair
      USING ERRCODE = '42501';
  END IF;

  IF amount IS NULL OR abs(amount) > 1000 THEN
    RAISE EXCEPTION 'increment_field: amount must be between -1000 and 1000'
      USING ERRCODE = '22003';
  END IF;

  EXECUTE format('UPDATE %I SET %I = coalesce(%I, 0) + $1 WHERE id = $2',
                 table_name, field_name, field_name)
  USING amount, row_id;
END;
$$;

-- Revoke from anon and authenticated. Service role retains access
-- implicitly (SECURITY DEFINER runs as the function owner anyway; the
-- grant just gates who can CALL it).
REVOKE EXECUTE ON FUNCTION public.increment_field(text, uuid, text, integer)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_field(text, uuid, text, integer)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_field(text, uuid, text, integer)
  FROM authenticated;

GRANT EXECUTE ON FUNCTION public.increment_field(text, uuid, text, integer)
  TO service_role;

COMMENT ON FUNCTION public.increment_field(text, uuid, text, integer) IS
  'Service-role-only counter increment. Narrow (table, field) allowlist '
  'enforced in body. See 056_verity_score_rpcs.sql for rationale.';
