-- ============================================================================
-- VERITY POST — Full Migration Apply Set (2026-04-17 regenerated, v3)
-- ============================================================================
-- 12 migrations concatenated in apply order. Each block is idempotent.
-- Paste the entire file into Supabase SQL Editor and run once.
--
-- NOTE 2026-04-17 regeneration:
--   Migration 051 now self-heals TWO schema drifts:
--     (1) articles.subcategory_id — added via ALTER TABLE IF NOT EXISTS
--         preamble at the top of 051.
--     (2) quiz_attempts.passed — the original RPC used a v1 column that
--         v2 no longer has. Rewritten to derive "quiz passed" from v2
--         shape (group per attempt, count is_correct=true >= 3 per D1).
--
-- If any single migration errors, the transaction for that one rolls back;
-- fix / skip it and rerun. Earlier successes are preserved.
--
-- Order: 051 → 053 → 054 → 055 → 056 → 057 → 058 → 059 → 060 → 061 → 062 → 063
-- (052 was reserved but never used — skipped intentionally.)
-- ============================================================================


-- ============================================================================
-- 051_user_category_metrics_rpc.sql
-- ============================================================================

-- 051_user_category_metrics_rpc.sql
-- Landed via Pass 16 Task 126 (LB-027 profile category 4-metric display).
--
-- RPC returns, per category or per subcategory of a given parent, the
-- viewer's activity: reads, quizzes passed, comments posted, upvotes
-- received on own comments. Used by the Profile Categories tab and the
-- /profile/category/[id] subcategory drill-in.
--
-- Four source tables joined via articles.category_id / subcategory_id:
--   reading_log          — reads (COUNT)
--   quiz_attempts        — quizzes passed (COUNT WHERE passed=true)
--   comments             — comments posted (COUNT WHERE user_id=viewer)
--   comments.upvote_count — upvotes received (SUM over viewer's own
--                           comments)
--
-- Also returns `score` sourced from category_scores for continuity with
-- the existing profile header.
--
-- Shape: when p_category_id is NULL, returns per-top-level-category rows
-- (category_id, subcategory_id=NULL, display_name). When p_category_id is
-- a uuid, returns per-subcategory rows under that parent. Caller decides
-- the level.
--
-- SECURITY INVOKER — uses caller's JWT so RLS on source tables still
-- applies. No secrets, no cross-user leakage.
--
-- 2026-04-17 — added preamble ensuring articles.subcategory_id exists.
-- Canonical schema (reset_and_rebuild_v2.sql) never added this column
-- even though this RPC + ~8 code sites reference it. ALTER IF NOT EXISTS
-- self-heals without breaking idempotent re-apply. Column is a nullable
-- uuid foreign-keyed to categories (subcategories live in the same
-- categories table with parent_id set).

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS subcategory_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_articles_subcategory_id
  ON public.articles(subcategory_id)
  WHERE subcategory_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_user_category_metrics(
  p_user_id uuid,
  p_category_id uuid DEFAULT NULL
)
RETURNS TABLE (
  category_id uuid,
  subcategory_id uuid,
  name text,
  reads bigint,
  quizzes_passed bigint,
  comments bigint,
  upvotes_received bigint,
  score bigint
)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  -- Per-category when no parent specified: group by articles.category_id.
  WITH target_cats AS (
    SELECT c.id, c.name
    FROM public.categories c
    WHERE c.is_active = true
      AND c.deleted_at IS NULL
      AND (
        (p_category_id IS NULL AND c.parent_id IS NULL)
        OR (p_category_id IS NOT NULL AND c.parent_id = p_category_id)
      )
  ),
  viewer_reads AS (
    SELECT a.category_id AS cat, a.subcategory_id AS sub, COUNT(*) AS n
    FROM public.reading_log rl
    JOIN public.articles a ON a.id = rl.article_id
    WHERE rl.user_id = p_user_id
      AND rl.kid_profile_id IS NULL
    GROUP BY a.category_id, a.subcategory_id
  ),
  -- 2026-04-17 — rewritten for v2 quiz_attempts shape. In v2 each row is
  -- one answered question (boolean is_correct) keyed by (user_id,
  -- article_id, attempt_number). "Pass" is derived: group per attempt,
  -- count correct answers, >= 3 per D1. The inner aggregation groups per
  -- attempt and filters to those where the count of correct answers
  -- clears the threshold; the outer aggregation counts one passed quiz
  -- per article/category.
  viewer_quizzes AS (
    SELECT a.category_id AS cat, a.subcategory_id AS sub, COUNT(*) AS n
    FROM (
      SELECT qa.article_id, qa.attempt_number
      FROM public.quiz_attempts qa
      WHERE qa.user_id = p_user_id
        AND qa.kid_profile_id IS NULL
      GROUP BY qa.article_id, qa.attempt_number
      HAVING COUNT(*) FILTER (WHERE qa.is_correct = true) >= 3
    ) passed_attempts
    JOIN public.articles a ON a.id = passed_attempts.article_id
    GROUP BY a.category_id, a.subcategory_id
  ),
  viewer_comments AS (
    SELECT a.category_id AS cat, a.subcategory_id AS sub,
           COUNT(*) AS n,
           COALESCE(SUM(cm.upvote_count), 0) AS upvotes
    FROM public.comments cm
    JOIN public.articles a ON a.id = cm.article_id
    WHERE cm.user_id = p_user_id
      AND cm.deleted_at IS NULL
    GROUP BY a.category_id, a.subcategory_id
  ),
  viewer_scores AS (
    SELECT cs.category_id, cs.score
    FROM public.category_scores cs
    WHERE cs.user_id = p_user_id
      AND cs.kid_profile_id IS NULL
  )
  SELECT
    CASE WHEN p_category_id IS NULL THEN tc.id ELSE p_category_id END AS category_id,
    CASE WHEN p_category_id IS NULL THEN NULL ELSE tc.id END AS subcategory_id,
    tc.name::text AS name,
    COALESCE(CASE
      WHEN p_category_id IS NULL THEN (SELECT SUM(n) FROM viewer_reads r WHERE r.cat = tc.id)
      ELSE (SELECT SUM(n) FROM viewer_reads r WHERE r.sub = tc.id)
    END, 0)::bigint AS reads,
    COALESCE(CASE
      WHEN p_category_id IS NULL THEN (SELECT SUM(n) FROM viewer_quizzes q WHERE q.cat = tc.id)
      ELSE (SELECT SUM(n) FROM viewer_quizzes q WHERE q.sub = tc.id)
    END, 0)::bigint AS quizzes_passed,
    COALESCE(CASE
      WHEN p_category_id IS NULL THEN (SELECT SUM(n) FROM viewer_comments vc WHERE vc.cat = tc.id)
      ELSE (SELECT SUM(n) FROM viewer_comments vc WHERE vc.sub = tc.id)
    END, 0)::bigint AS comments,
    COALESCE(CASE
      WHEN p_category_id IS NULL THEN (SELECT SUM(upvotes) FROM viewer_comments vc WHERE vc.cat = tc.id)
      ELSE (SELECT SUM(upvotes) FROM viewer_comments vc WHERE vc.sub = tc.id)
    END, 0)::bigint AS upvotes_received,
    COALESCE(
      CASE WHEN p_category_id IS NULL
        THEN (SELECT vs.score FROM viewer_scores vs WHERE vs.category_id = tc.id)
        ELSE 0
      END, 0
    )::bigint AS score
  FROM target_cats tc
  ORDER BY tc.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_category_metrics(uuid, uuid) TO authenticated;


-- ============================================================================
-- 053_resolve_username_to_email_rpc.sql
-- ============================================================================

-- 053_resolve_username_to_email_rpc.sql
-- Landed via Pass 16 Task 134 (LB-035 login via email or username).
--
-- Problem: Supabase auth's signInWithPassword requires an email. To let
-- returning users log in with either their email or their username, we
-- need a server-side lookup that takes a username and returns the
-- associated email. That lookup must be SECURITY DEFINER so anon
-- callers can reach it before they're authenticated, but scoped to
-- return exactly the one field needed (email) so it doesn't double as
-- a user-enumeration primitive.
--
-- Privacy considerations:
--   - D32 private-profile toggle governs public visibility; a private
--     profile's username is still resolvable for auth because the
--     legitimate user already knows their own email. Auth is a
--     different concern from profile discovery.
--   - Enumeration risk: the lookup only tells the caller whether a
--     username exists, not whether its password is anything specific.
--     Rate-limited at the API route (10 req/minute per IP).
--   - Error copy at the login form must be identical for missing
--     username vs wrong password to prevent side-channel leak.
--
-- Function is STABLE (not VOLATILE) so it can be called from RLS or
-- triggers if future use cases need it.

CREATE OR REPLACE FUNCTION public.resolve_username_to_email(p_username text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT au.email
  FROM public.users u
  JOIN auth.users au ON au.id = u.id
  WHERE lower(u.username) = lower(trim(p_username))
    AND u.is_banned = false
    AND u.deleted_at IS NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_username_to_email(text) TO anon, authenticated;


-- ============================================================================
-- 054_user_account_lockout.sql
-- ============================================================================

-- 054_user_account_lockout.sql
-- Pass 17 / Task 140a — enforce a 15-minute lockout after 5 failed login
-- attempts against the same account. The `users.locked_until` column and
-- `failed_login_count` counter already live in the base schema
-- (reset_and_rebuild_v2.sql:328-329); this migration is idempotent in case
-- an environment predates that state, and ships the
-- `public.record_failed_login(uuid)` RPC that the login route calls on each
-- failed attempt. Grant is to `service_role` only — the login API uses the
-- service client to invoke it so RLS does not need to consider it.

ALTER TABLE users ADD COLUMN IF NOT EXISTS "locked_until" timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "failed_login_count" integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.record_failed_login(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE users
    SET failed_login_count = COALESCE(failed_login_count, 0) + 1
    WHERE id = p_user_id
    RETURNING failed_login_count INTO v_count;

  IF v_count >= 5 THEN
    UPDATE users SET locked_until = now() + interval '15 minutes' WHERE id = p_user_id;
  END IF;
END;
$$;

-- A successful login clears the counter + lockout. Idempotent — callable
-- once per authenticated session without side effects on an already-clean
-- account.
CREATE OR REPLACE FUNCTION public.clear_failed_login(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE users
    SET failed_login_count = 0, locked_until = NULL
    WHERE id = p_user_id
      AND (failed_login_count > 0 OR locked_until IS NOT NULL);
END;
$$;

-- Email-keyed lockout peek used by the login-precheck endpoint so the
-- client can skip the Supabase auth call for an account that is already
-- in the 15-minute window. Returns NULL (not locked) for unknown emails
-- so the shape doesn't leak account existence.
CREATE OR REPLACE FUNCTION public.get_user_lockout_by_email(p_email text)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.locked_until
    FROM public.users u
    JOIN auth.users a ON a.id = u.id
    WHERE lower(a.email) = lower(p_email)
      AND u.locked_until IS NOT NULL
      AND u.locked_until > now()
    LIMIT 1;
$$;

-- Email-keyed failure recorder for the login-failed endpoint. No-op for
-- unknown emails — same shape, no enumeration side channel.
CREATE OR REPLACE FUNCTION public.record_failed_login_by_email(p_email text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_locked_until timestamptz;
BEGIN
  SELECT u.id INTO v_user_id
    FROM public.users u
    JOIN auth.users a ON a.id = u.id
    WHERE lower(a.email) = lower(p_email)
    LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM public.record_failed_login(v_user_id);

  SELECT locked_until INTO v_locked_until FROM public.users WHERE id = v_user_id;
  RETURN v_locked_until;
END;
$$;

-- Pass 17 / UJ-708 — constant-shape "is this email registered?" probe
-- for the signup form. Returns TRUE only when an auth.users row exists
-- for the supplied email. Rate-limited at the route layer.
CREATE OR REPLACE FUNCTION public.is_email_registered(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = lower(p_email)
  );
$$;

GRANT EXECUTE ON FUNCTION public.record_failed_login(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_failed_login(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_lockout_by_email(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_failed_login_by_email(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_email_registered(text) TO service_role;


-- ============================================================================
-- 055_admin_audit_log.sql
-- ============================================================================

-- 055_admin_audit_log.sql
-- Pass 17 / Task 141a — admin audit trail. Every destructive admin
-- action (ban, delete, cancel subscription, webhook retry, promo delete,
-- etc.) records a row here via `public.record_admin_action` before the
-- action fires. RLS permits admin+ SELECT; INSERT is only through the
-- SECURITY DEFINER function (rows cannot be inserted directly).

CREATE TABLE IF NOT EXISTS "admin_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_user_id" uuid NOT NULL,
  "action" text NOT NULL,
  "target_table" text,
  "target_id" uuid,
  "reason" text,
  "old_value" jsonb,
  "new_value" jsonb,
  "ip" inet,
  "user_agent" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "admin_audit_log"
  DROP CONSTRAINT IF EXISTS "fk_admin_audit_log_actor";
ALTER TABLE "admin_audit_log"
  ADD CONSTRAINT "fk_admin_audit_log_actor"
  FOREIGN KEY ("actor_user_id") REFERENCES "users" ("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_admin_audit_log_actor" ON "admin_audit_log" ("actor_user_id");
CREATE INDEX IF NOT EXISTS "idx_admin_audit_log_action" ON "admin_audit_log" ("action");
CREATE INDEX IF NOT EXISTS "idx_admin_audit_log_target" ON "admin_audit_log" ("target_table", "target_id");
CREATE INDEX IF NOT EXISTS "idx_admin_audit_log_created_at" ON "admin_audit_log" ("created_at" DESC);

ALTER TABLE "admin_audit_log" ENABLE ROW LEVEL SECURITY;

-- Select: any admin or above.
DROP POLICY IF EXISTS "admin_audit_log_select" ON "admin_audit_log";
CREATE POLICY "admin_audit_log_select" ON "admin_audit_log"
  FOR SELECT TO authenticated
  USING (public.is_admin_or_above());

-- No direct INSERT/UPDATE/DELETE — writes happen via the function below.

CREATE OR REPLACE FUNCTION public.record_admin_action(
  p_action       text,
  p_target_table text DEFAULT NULL,
  p_target_id    uuid DEFAULT NULL,
  p_reason       text DEFAULT NULL,
  p_old_value    jsonb DEFAULT NULL,
  p_new_value    jsonb DEFAULT NULL,
  p_ip           inet DEFAULT NULL,
  p_user_agent   text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'record_admin_action: no authenticated actor';
  END IF;

  IF NOT public.is_admin_or_above() AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_actor AND r.name IN ('moderator', 'editor')
  ) THEN
    RAISE EXCEPTION 'record_admin_action: insufficient privileges';
  END IF;

  INSERT INTO public.admin_audit_log (
    actor_user_id, action, target_table, target_id,
    reason, old_value, new_value, ip, user_agent
  )
  VALUES (
    v_actor, p_action, p_target_table, p_target_id,
    p_reason, p_old_value, p_new_value, p_ip, p_user_agent
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_admin_action(
  text, text, uuid, text, jsonb, jsonb, inet, text
) TO authenticated, service_role;


-- ============================================================================
-- 056_verity_score_rpcs.sql
-- ============================================================================

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


-- ============================================================================
-- 057_rpc_lockdown.sql
-- ============================================================================

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


-- ============================================================================
-- 058_kid_pin_salt.sql
-- ============================================================================

-- ============================================================
-- 058_kid_pin_salt.sql
-- Chunk 5 of the post-audit repair pass.
--
-- Closes:
--   - DA-109 / F-085: kid PIN stored as unsalted SHA-256. PIN space is
--     10,000 (4 digits). A pre-computed table of all 10k SHA-256 hashes
--     fits in ~200 KB, so any DB dump instantly recovers every kid's
--     PIN. Lockout (3/60s) deters online brute force but not offline
--     rainbow attacks.
--
-- Remediation strategy
-- --------------------
-- Add two columns to `kid_profiles`:
--
--   - `pin_salt` text (nullable, hex-encoded random)
--   - `pin_hash_algo` text NOT NULL DEFAULT 'sha256'
--
-- Existing rows retain `pin_hash_algo = 'sha256'` and no salt. The
-- verify-pin route dispatches on `pin_hash_algo` and transparently
-- rehashes to PBKDF2 on the first successful entry after this migration
-- lands — each family drifts to salted storage naturally, without a
-- mandatory PIN reset flow. PIN sets issued after this migration write
-- `pbkdf2` with a fresh per-row salt.
--
-- PBKDF2 was chosen over bcrypt/argon2 because Web Crypto
-- (`crypto.subtle.deriveBits`) is available in the Next.js Node runtime
-- today without any npm dependency. Iteration count (100_000) is tuned
-- for ~50-80ms verify time on serverless cold starts — expensive enough
-- to kill offline brute force, fast enough to not matter in the
-- interactive kid-exit flow.
--
-- Dependencies: apply after 057_rpc_lockdown.sql. Idempotent.
-- ============================================================

ALTER TABLE public.kid_profiles
  ADD COLUMN IF NOT EXISTS pin_salt text;

ALTER TABLE public.kid_profiles
  ADD COLUMN IF NOT EXISTS pin_hash_algo text NOT NULL DEFAULT 'sha256';

-- Back-fill the algo marker explicitly on existing rows with a PIN —
-- the DEFAULT handles new rows automatically but older rows that have
-- a pin_hash may have been created before this migration with a NULL
-- in the new column (if ADD COLUMN without the DEFAULT had been run).
-- Idempotent.
UPDATE public.kid_profiles
SET pin_hash_algo = 'sha256'
WHERE pin_hash IS NOT NULL AND pin_hash_algo IS NULL;

COMMENT ON COLUMN public.kid_profiles.pin_salt IS
  'Hex-encoded random salt for PBKDF2-SHA256 kid PIN hashes. NULL for '
  'legacy pin_hash_algo=''sha256'' rows — transparently rehashed to '
  'pbkdf2 on the first successful verify after migration 058.';

COMMENT ON COLUMN public.kid_profiles.pin_hash_algo IS
  'Hash algorithm for pin_hash. ''sha256'' = legacy unsalted; '
  '''pbkdf2'' = salted PBKDF2-SHA256 100_000 iter. See lib/kidPin.js.';


-- ============================================================================
-- 059_billing_hardening.sql
-- ============================================================================

-- ============================================================
-- 059_billing_hardening.sql
-- Chunk 7 of the post-audit repair pass.
--
-- Closes:
--   - F-049 (subscriptions_insert RLS permits user_id = auth.uid()):
--     Tighten to admin-only. Real subscriptions are written by the
--     service-role Stripe webhook path; letting a user self-insert a
--     `subscriptions` row forges entitlement.
--   - DA-159 (no un-cancel handler in Stripe webhook): Add
--     `billing_uncancel_subscription(p_user_id)` RPC so the webhook
--     handler has a purpose-built, transactional reversal when a user
--     clicks "Keep subscription" in Stripe Portal after scheduling
--     cancellation.
--
-- Dependencies: apply after 058_kid_pin_salt.sql.
-- Idempotent. Service-role retains full access to subscriptions via
-- `bypass RLS`; nothing the webhook does changes.
-- ============================================================

-- ------------------------------------------------------------
-- F-049: subscriptions_insert / subscriptions_update admin-only
-- ------------------------------------------------------------
-- Existing policy:
--   "subscriptions_insert" USING (user_id = auth.uid() OR public.is_admin_or_above())
--   "subscriptions_update" USING (user_id = auth.uid() OR public.is_admin_or_above())
--
-- Drop and recreate without the self-insert/self-update clause. The
-- service role (used by /api/stripe/webhook) bypasses RLS entirely, so
-- this change does not affect the billing path.

DROP POLICY IF EXISTS "subscriptions_insert" ON public.subscriptions;
CREATE POLICY "subscriptions_insert" ON public.subscriptions
  FOR INSERT
  WITH CHECK (public.is_admin_or_above());

DROP POLICY IF EXISTS "subscriptions_update" ON public.subscriptions;
CREATE POLICY "subscriptions_update" ON public.subscriptions
  FOR UPDATE
  USING (public.is_admin_or_above());

COMMENT ON POLICY "subscriptions_insert" ON public.subscriptions IS
  'F-049: user_id = auth.uid() clause removed. Real subscriptions '
  'are created by the Stripe webhook on the service client; admins '
  'may insert manually for recovery. Self-insert let users forge '
  'entitlement.';

COMMENT ON POLICY "subscriptions_update" ON public.subscriptions IS
  'F-049: user_id = auth.uid() clause removed. Subscription state '
  'changes originate from Stripe events via the webhook.';

-- ------------------------------------------------------------
-- DA-159: billing_uncancel_subscription RPC
-- ------------------------------------------------------------
-- Mirror of billing_cancel_subscription in shape. Reverses the grace
-- timer + subscription cancellation markers when a user clicks "Keep
-- subscription" in Stripe Portal after cancel_at_period_end was set.
-- No-op (raises informative exception) if the user is not in grace.
-- Transactional: the `FOR UPDATE` lock on the user row ensures a
-- concurrent cancel_subscription cannot interleave.

CREATE OR REPLACE FUNCTION public.billing_uncancel_subscription(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user users%ROWTYPE;
  v_sub subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found: %', p_user_id;
  END IF;

  IF v_user.plan_grace_period_ends_at IS NULL THEN
    -- Not in grace — nothing to reverse. Return a stable shape so the
    -- webhook caller can treat this as an idempotent no-op.
    RETURN jsonb_build_object(
      'user_id', p_user_id,
      'already_active', true
    );
  END IF;

  IF v_user.frozen_at IS NOT NULL THEN
    -- Grace already elapsed to freeze; un-cancel is no longer the
    -- right operation here. The caller should run resubscribe
    -- instead. Raise so the mismatch surfaces loudly.
    RAISE EXCEPTION 'user % is frozen; use billing_resubscribe', p_user_id;
  END IF;

  SELECT * INTO v_sub FROM subscriptions
    WHERE user_id = p_user_id AND grace_period_ends_at IS NOT NULL
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  UPDATE subscriptions
     SET cancelled_at = NULL,
         cancel_at = NULL,
         cancel_reason = NULL,
         auto_renew = true,
         grace_period_started_at = NULL,
         grace_period_ends_at = NULL,
         status = 'active',
         updated_at = now()
   WHERE id = v_sub.id;

  UPDATE users
     SET plan_grace_period_ends_at = NULL,
         plan_status = 'active',
         updated_at = now()
   WHERE id = p_user_id;

  INSERT INTO subscription_events
    (subscription_id, user_id, event_type, from_plan, to_plan, provider, reason)
  SELECT v_sub.id, p_user_id, 'cancel_rescinded',
         p.name, p.name, v_sub.source, 'stripe: cancel_at_period_end=false'
    FROM plans p WHERE p.id = v_sub.plan_id;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'subscription_id', v_sub.id,
    'already_active', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.billing_uncancel_subscription(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.billing_uncancel_subscription(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.billing_uncancel_subscription(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.billing_uncancel_subscription(uuid) TO service_role;

COMMENT ON FUNCTION public.billing_uncancel_subscription(uuid) IS
  'DA-159: reverses billing_cancel_subscription. Called from Stripe '
  'webhook when cancel_at_period_end flips back to false. '
  'Idempotent no-op when user is not in grace.';


-- ============================================================================
-- 060_resolve_username_anon_revoke.sql
-- ============================================================================

-- ============================================================
-- 060_resolve_username_anon_revoke.sql
-- Chunk 9 of the post-audit repair pass.
--
-- Closes:
--   - F-032 (resolve_username exposes email for any public username):
--     Cannot fix at the DB — the whole point of the RPC is to turn a
--     public handle into the registered email so the login form
--     accepts "username + password" without requiring the user to
--     recall their email. The route already rate-limits and returns
--     fuzzy error copy; scope here is to make sure the RPC cannot be
--     called via a direct PostgREST request from an anon browser,
--     bypassing the route-level rate limit.
--   - F-033 (resolve_username_to_email granted to anon at the DB):
--     Revoke. Route still works because the route handler uses the
--     user-session supabase client (authenticated grant), which this
--     migration leaves intact. Unauthenticated callers who hit
--     /api/auth/resolve-username get served a fresh Supabase session
--     (anon-first) — BUT the actual RPC call now fails for anon, so
--     we also flip the route to the service-role client below.
--
-- Deployment note
-- ---------------
-- This migration revokes anon EXECUTE. After apply, the existing
-- /api/auth/resolve-username route must use the service client, which
-- the Chunk 9 code change does. Apply order: deploy code first, apply
-- 060 second, OR apply 060 first if you accept brief 5xx on that
-- single route between migration and deploy.
--
-- Dependencies: apply after 059_billing_hardening.sql. Idempotent.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.resolve_username_to_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_username_to_email(text) FROM anon;
-- authenticated revoked too — route now uses service client.
REVOKE EXECUTE ON FUNCTION public.resolve_username_to_email(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_username_to_email(text) TO service_role;

COMMENT ON FUNCTION public.resolve_username_to_email(text) IS
  'F-032 / F-033: service-role only. Route /api/auth/resolve-username '
  'brokers access with per-IP rate limit. Direct PostgREST calls '
  'from anon/authenticated are denied so the rate limit is enforceable.';


-- ============================================================================
-- 061_kid_paused_at.sql
-- ============================================================================

-- ============================================================
-- 061_kid_paused_at.sql
-- Chunk 2 of the kids-mode audit + repair pass.
--
-- Adds a parent-controlled pause state to kid_profiles. Orthogonal
-- to `is_active` (which carries trial-freeze semantics — D44). A
-- paused kid:
--   - is hidden from /kids profile picker and the expert-session
--     "ask as" list,
--   - still renders in the parental dashboard with a "Paused" pill,
--   - resumes when the parent clears paused_at.
--
-- Idempotent. Apply after 060_resolve_username_anon_revoke.sql.
-- ============================================================

ALTER TABLE public.kid_profiles
  ADD COLUMN IF NOT EXISTS paused_at timestamptz;

COMMENT ON COLUMN public.kid_profiles.paused_at IS
  'Parent-initiated pause marker. NULL = active. Non-null timestamp = '
  'paused at that moment (hides profile from kid surfaces but keeps '
  'data). Distinct from is_active, which is used for trial-freeze '
  'semantics per D44.';

CREATE INDEX IF NOT EXISTS idx_kid_profiles_paused_at
  ON public.kid_profiles (parent_user_id, paused_at)
  WHERE paused_at IS NULL;


-- ============================================================================
-- 062_kid_global_leaderboard_opt_in.sql
-- ============================================================================

-- ============================================================
-- 062_kid_global_leaderboard_opt_in.sql
-- Chunk 6a of the kids-mode audit + repair pass.
--
-- D12 2026-04-16 clarified that a kids-only global leaderboard may
-- expose kid display_name + score across families. This migration
-- adds a per-kid opt-in so the exposure is explicit, parental, and
-- conservative-by-default (minors under COPPA).
--
-- Semantics:
--   - global_leaderboard_opt_in boolean NOT NULL DEFAULT false.
--   - Flag is set via /api/kids/[id] PATCH (parent-owned only).
--   - /api/kids/global-leaderboard filters to rows where the flag is
--     true. The caller's own kid receives a CTA-vs-ranking branch
--     on the client: if self is not opted in, the leaderboard renders
--     an opt-in prompt instead of an artificially-narrow ranking.
--   - No backfill — every existing kid starts opted out. There is
--     zero real kid activity at this point in the rollout, so
--     starting cold is honest, and any parent who wants visibility
--     makes a deliberate toggle.
--
-- Partial index: optimises the default leaderboard branch, which
-- reads from kid_profiles WHERE is_active=true AND opted-in, sorted
-- by verity_score descending.
--
-- Idempotent. Apply after 061_kid_paused_at.sql.
-- ============================================================

ALTER TABLE public.kid_profiles
  ADD COLUMN IF NOT EXISTS global_leaderboard_opt_in boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.kid_profiles.global_leaderboard_opt_in IS
  'Parent-controlled opt-in (D12 2026-04-16). When true, this kid '
  'appears on /kids/leaderboard global scope with display_name + '
  'score. Default false — conservative privacy posture for minors. '
  'No backfill; existing kids must be explicitly opted in.';

CREATE INDEX IF NOT EXISTS idx_kid_profiles_global_leaderboard_opt_in
  ON public.kid_profiles (verity_score DESC)
  WHERE global_leaderboard_opt_in = true AND is_active = true;


-- ============================================================================
-- 063_kid_expert_session_rls.sql
-- ============================================================================

-- ============================================================
-- 063_kid_expert_session_rls.sql
-- Chunk 7 of the kids-mode audit + repair pass.
--
-- kid_expert_sessions + kid_expert_questions were enabled for RLS in
-- reset_and_rebuild_v2.sql (lines 3070-3071) but no policies were
-- ever defined. Under Postgres default, that means every non-
-- service-role query returns zero rows — implicitly denying all
-- reads and writes. This migration restores the intended access:
--
--   kid_expert_sessions SELECT — any authenticated user can read
--     scheduled + active session metadata (session metadata is not
--     kid PII; D9 says kids attend these, so parents + kids must
--     be able to browse). Assigned expert or moderator can also
--     read draft / completed / cancelled sessions.
--
--   kid_expert_questions SELECT — three-way scope per Chunk 7 spec:
--     (a) the parent of the asking kid,
--     (b) the assigned expert for that question's session,
--     (c) moderator-or-above.
--
-- Writes on both tables stay closed to non-service-role callers;
-- the existing API endpoints own the insert / update paths under
-- service role. If the owner wants direct client writes in the
-- future, a WITH CHECK policy in a follow-up migration is the add.
--
-- Idempotent via DROP POLICY IF EXISTS. Apply after 062.
-- ============================================================

-- ------------------------------------------------------------
-- kid_expert_sessions
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "kid_expert_sessions_select_public" ON public.kid_expert_sessions;
CREATE POLICY "kid_expert_sessions_select_public"
  ON public.kid_expert_sessions
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND COALESCE(is_active, false) = true
    AND status = 'scheduled'
  );

DROP POLICY IF EXISTS "kid_expert_sessions_select_expert" ON public.kid_expert_sessions;
CREATE POLICY "kid_expert_sessions_select_expert"
  ON public.kid_expert_sessions
  FOR SELECT
  USING (expert_id = auth.uid());

DROP POLICY IF EXISTS "kid_expert_sessions_select_mod" ON public.kid_expert_sessions;
CREATE POLICY "kid_expert_sessions_select_mod"
  ON public.kid_expert_sessions
  FOR SELECT
  USING (public.is_mod_or_above());

-- ------------------------------------------------------------
-- kid_expert_questions
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "kid_expert_questions_select_parent" ON public.kid_expert_questions;
CREATE POLICY "kid_expert_questions_select_parent"
  ON public.kid_expert_questions
  FOR SELECT
  USING (
    kid_profile_id IN (
      SELECT id FROM public.kid_profiles WHERE parent_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "kid_expert_questions_select_expert" ON public.kid_expert_questions;
CREATE POLICY "kid_expert_questions_select_expert"
  ON public.kid_expert_questions
  FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM public.kid_expert_sessions WHERE expert_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "kid_expert_questions_select_mod" ON public.kid_expert_questions;
CREATE POLICY "kid_expert_questions_select_mod"
  ON public.kid_expert_questions
  FOR SELECT
  USING (public.is_mod_or_above());

-- Verify (manual, after apply):
--   SELECT polname, pg_get_expr(polqual, polrelid)
--   FROM pg_policy
--   WHERE polrelid::regclass::text LIKE 'kid_expert%'
--   ORDER BY polrelid::regclass::text, polname;
--
-- Expected: 3 policies per table (select_parent/expert/mod on
-- questions; select_public/expert/mod on sessions).

