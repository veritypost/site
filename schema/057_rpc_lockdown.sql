-- ============================================================
-- 057_rpc_lockdown.sql
-- Chunk 4 of the post-audit repair pass.
--
-- Closes:
--   - F-005: universal-write counter RPCs granted to `authenticated`
--   - F-006: purge_rate_limit_events granted to `authenticated`
--   - F-007: 47 SECURITY DEFINER functions without `SET search_path`
--   - F-008: my_permission_keys without `SET search_path`
--   - DA-031 / F-018 / F-019: rate limiter is non-atomic and fails
--     open on DB error
--
-- Section map:
--
--   A. search_path hardening — bulk-apply `SET search_path = public`
--      to every SECURITY DEFINER function in public schema.
--   B. Counter RPC lockdown — revoke EXECUTE from anon/authenticated
--      on the universal-write primitives. Service role only.
--   C. Atomic rate-limit RPC — `check_rate_limit(key, max, window_sec)`
--      with pg_advisory_xact_lock for race-free count-then-insert.
--
-- Dependencies: apply after 056_verity_score_rpcs.sql. Idempotent —
-- safe to re-run.
-- ============================================================

-- ============================================================
-- A. search_path hardening (F-007, F-008)
-- ============================================================
--
-- Every `SECURITY DEFINER` function that does not bind its
-- `search_path` is vulnerable to search-path hijack: if an attacker
-- can create objects in a schema the role's search_path resolves
-- before `public`, the hijack shadows our role checks
-- (`is_admin_or_above`, `is_mod_or_above`, `user_has_role`, etc.) and
-- the RLS policies that depend on them silently return false-positives.
--
-- Rather than hand-listing 47 function signatures, iterate pg_proc and
-- apply `ALTER FUNCTION ... SET search_path = public` to every match.
-- The ALTER is idempotent and only changes the session GUC for future
-- calls. Existing function bodies are untouched.

DO $vp_lockdown_search_path$
DECLARE
  f record;
  v_count integer := 0;
BEGIN
  FOR f IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS func_name,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public',
      f.schema_name, f.func_name, f.args
    );
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'Pinned search_path = public on % SECURITY DEFINER functions.', v_count;
END
$vp_lockdown_search_path$;


-- ============================================================
-- B. Counter RPC lockdown (F-005, F-006)
-- ============================================================
--
-- These RPCs were all granted to `authenticated` in the base schema
-- (reset_and_rebuild_v2.sql:4488-4495). Any logged-in user could
-- therefore call them directly from the browser to tamper with
-- follower counts, comment vote counts, bookmark counts, and comment
-- counts, or wipe the rate-limit table on demand. None of them check
-- the caller's ownership of the target row.
--
-- All counter work for legitimate flows now runs through service-role
-- paths in API routes (see `/api/stories/read` for the model). Revoke
-- client access; grant service_role explicitly for clarity.

DO $vp_lockdown_counters$
DECLARE
  f text;
  v_funcs text[] := ARRAY[
    'public.increment_view_count(uuid)',
    'public.increment_share_count(uuid)',
    'public.increment_comment_count(uuid, integer)',
    'public.increment_bookmark_count(uuid, integer)',
    'public.increment_comment_vote(uuid, text, integer)',
    'public.update_follow_counts(uuid, uuid, integer)',
    'public.purge_rate_limit_events(interval)'
  ];
BEGIN
  FOREACH f IN ARRAY v_funcs LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', f);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
  RAISE NOTICE 'Counter RPCs locked down: %', array_length(v_funcs, 1);
END
$vp_lockdown_counters$;


-- ============================================================
-- C. Atomic rate-limit RPC (DA-031 / F-018 / F-019)
-- ============================================================
--
-- Replaces the JS-side count-then-insert with a single SQL call that
-- (a) serializes concurrent callers on the same key via an advisory
-- transaction lock, and (b) returns the decision + remaining count in
-- one round trip. The caller (lib/rateLimit.js) fails CLOSED when this
-- RPC errors — no more silent disable of brute-force protection during
-- DB hiccups.
--
-- Schema note: `rate_limit_events` in reset_and_rebuild_v2.sql was
-- designed for a per-endpoint tracking model (NOT NULL ip_address,
-- endpoint, action, request_count, window_start). The JS rate limiter
-- has been writing a bare `{ key }` into it since inception — rejected
-- by Postgres every time, swallowed by the try/catch, producing
-- silent fail-open behavior (another facet of DA-031). This migration
-- adapts the table to the key/timestamp model the code always assumed:
--
--   1. Add `key text` column.
--   2. Make the old NOT NULL columns nullable (they are unused by the
--      current codebase). Existing rows, if any, keep their values.
--   3. Add a (key, created_at) index to make the count query fast.
--
-- Granted to anon + authenticated because several auth-entry routes
-- (/api/auth/signup, /api/auth/check-email) are called pre-login and
-- must still be able to rate-limit themselves. The function only
-- touches rate_limit_events.

ALTER TABLE public.rate_limit_events ADD COLUMN IF NOT EXISTS key text;
ALTER TABLE public.rate_limit_events ALTER COLUMN ip_address   DROP NOT NULL;
ALTER TABLE public.rate_limit_events ALTER COLUMN endpoint     DROP NOT NULL;
ALTER TABLE public.rate_limit_events ALTER COLUMN action       DROP NOT NULL;
ALTER TABLE public.rate_limit_events ALTER COLUMN request_count DROP NOT NULL;
ALTER TABLE public.rate_limit_events ALTER COLUMN window_start DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rate_limit_events_key_created_at
  ON public.rate_limit_events (key, created_at DESC)
  WHERE key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_max integer,
  p_window_sec integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz;
  v_count integer;
BEGIN
  IF p_key IS NULL OR length(p_key) = 0 OR length(p_key) > 200 THEN
    RAISE EXCEPTION 'check_rate_limit: key must be 1..200 chars'
      USING ERRCODE = '22023';
  END IF;
  IF p_max IS NULL OR p_max < 1 OR p_max > 10000 THEN
    RAISE EXCEPTION 'check_rate_limit: max must be 1..10000'
      USING ERRCODE = '22023';
  END IF;
  IF p_window_sec IS NULL OR p_window_sec < 1 OR p_window_sec > 86400 THEN
    RAISE EXCEPTION 'check_rate_limit: window_sec must be 1..86400'
      USING ERRCODE = '22023';
  END IF;

  v_cutoff := now() - make_interval(secs => p_window_sec);

  -- Serialize concurrent callers on this key inside the current
  -- transaction. hashtext() returns int4; two different keys that
  -- collide would only wait for each other, not produce a wrong
  -- answer. Released at commit/rollback.
  PERFORM pg_advisory_xact_lock(hashtext(p_key));

  SELECT count(*) INTO v_count
  FROM rate_limit_events
  WHERE key = p_key AND created_at >= v_cutoff;

  IF v_count >= p_max THEN
    RETURN jsonb_build_object('limited', true, 'remaining', 0);
  END IF;

  INSERT INTO rate_limit_events (key) VALUES (p_key);

  RETURN jsonb_build_object('limited', false, 'remaining', p_max - v_count - 1);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.check_rate_limit(text, integer, integer) IS
  'Atomic rate-limit check + record. Serializes concurrent callers on '
  'the key via pg_advisory_xact_lock. Returns {limited, remaining} as '
  'jsonb. Callers should fail-closed on any error for auth-sensitive '
  'keys. See 057_rpc_lockdown.sql.';
