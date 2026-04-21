-- Round H — Function search_path hygiene
-- Addresses master-list M-01 (function_search_path_mutable).
--
-- Source of truth: live Supabase advisor pull on 2026-04-19 against project
-- fyiwulqphgmoqullmrfn. Advisor returned 12 flagged functions, not 13 as the
-- attack plan estimated; one has since been closed (or the prior count was
-- stale). All 12 are non-overloaded in public schema.
--
-- Each statement below pins search_path to (public, pg_temp) so that a
-- compromised or hijacked schema on the caller's search_path cannot shadow
-- objects referenced inside these function bodies. pg_temp stays last so
-- per-session temp tables cannot shadow public objects either.
--
-- Priority sequencing: reject_privileged_user_updates first. It is the
-- last-resort trigger on public.users blocking privileged column writes;
-- a search_path shadowing bug there has the highest blast radius.
--
-- This migration is read-only in semantics (no DML, no DDL against tables,
-- no grant changes). It is a metadata update only. Safe to apply in a
-- single transaction. No code caller changes required.

BEGIN;

-- Priority 1: privileged-column write guard (trigger function on public.users).
ALTER FUNCTION public.reject_privileged_user_updates() SET search_path = public, pg_temp;

-- Permission / role plumbing (high impact, all trigger or DEFINER-adjacent).
ALTER FUNCTION public.guard_system_permissions() SET search_path = public, pg_temp;
ALTER FUNCTION public.audit_perm_change() SET search_path = public, pg_temp;
ALTER FUNCTION public.bump_perms_global_version() SET search_path = public, pg_temp;

-- Helper predicates used inside RLS subqueries.
ALTER FUNCTION public._user_is_paid(p_user_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public._user_is_moderator(p_user_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public._user_tier_or_anon(p_user_id uuid) SET search_path = public, pg_temp;

-- Settings + metric helpers.
ALTER FUNCTION public._setting_int(p_key text, p_default integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_user_category_metrics(p_user_id uuid, p_category_id uuid) SET search_path = public, pg_temp;

-- Trigger functions on specific tables.
ALTER FUNCTION public.enforce_max_kids() SET search_path = public, pg_temp;
ALTER FUNCTION public.bookmark_collection_count_sync() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;

COMMIT;

-- ---------------------------------------------------------------------------
-- Verification query
-- ---------------------------------------------------------------------------
-- Confirms every target function now has search_path pinned to public, pg_temp.
-- Expect 12 rows, all with search_path_config = 'search_path=public, pg_temp'.

SELECT
  n.nspname AS schema,
  p.proname AS name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS args,
  COALESCE(
    (SELECT c FROM unnest(p.proconfig) AS c WHERE c LIKE 'search_path=%'),
    '(unset)'
  ) AS search_path_config
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    '_setting_int',
    '_user_is_moderator',
    '_user_is_paid',
    '_user_tier_or_anon',
    'audit_perm_change',
    'bookmark_collection_count_sync',
    'bump_perms_global_version',
    'enforce_max_kids',
    'get_user_category_metrics',
    'guard_system_permissions',
    'reject_privileged_user_updates',
    'update_updated_at_column'
  )
ORDER BY p.proname;

-- After running the migration, also re-run the Supabase security advisor
-- (get_advisors type=security) on project fyiwulqphgmoqullmrfn. Expect ZERO
-- remaining function_search_path_mutable warnings. Other advisor warnings
-- (rls_enabled_no_policy on the 12 N-01 tables, rls_policy_always_true on
-- access_requests/ad_impressions/analytics_events/rate_limit_events/
-- user_sessions/webhook_log, public_bucket_allows_listing on banners,
-- auth_leaked_password_protection) are out of scope for Round H and are
-- handled by Rounds A, D, G.
