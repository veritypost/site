-- =====================================================================
-- 2026-04-27_T300b_finish_public_profile_lockdown.sql
-- T300 follow-up: drop the surviving broad SELECT policy + add the
-- missing is_frozen column to public_profiles_v.
-- =====================================================================
-- Context:
--   Owner applied the original T300 migration. MCP audit 2026-04-27
--   shows two gaps:
--     (1) The view exists but has no `is_frozen` derived column.
--         Caller code (leaderboard) was updated to filter on `is_frozen`
--         expecting it; without the column the filter fails.
--     (2) Policy `users_select` survived the original migration's
--         `DROP POLICY IF EXISTS "users_public_read"` — the existing
--         policy was named `users_select` (not `users_public_read`),
--         so the DROP was a no-op. `users_select` still grants reads
--         when `profile_visibility='public' OR id=auth.uid() OR
--         is_admin_or_above()`. That's PERMISSIVE alongside the new
--         `users_self_read` + `users_admin_read` policies — so RLS
--         evaluates "ANY of (broad public OR self OR admin)" and the
--         broad public read still works against `public.users`. T300's
--         column-level leak isn't actually closed yet.
--
--   Anon GRANT was correctly revoked (verified `anon_can_select_users
--   = false`), so unauthenticated callers are blocked. The remaining
--   gap is authenticated-but-not-self-not-admin readers — they can
--   still pull the full row via `from('users')` because `users_select`
--   matches their case.
--
-- Fix:
--   1. DROP `users_select` (the broad PERMISSIVE policy).
--   2. CREATE OR REPLACE the view to include `is_frozen`.
--
--   The RESTRICTIVE policy `users_select_block_kid_jwt` stays — it's
--   orthogonal (blocks kid-delegated JWTs from reading users at all).
--
-- Pre-flight verification (run before applying):
--   SELECT policyname FROM pg_policies WHERE schemaname='public'
--    AND tablename='users';
--   -- expect including: users_select, users_select_block_kid_jwt,
--   --                   users_self_read, users_admin_read,
--   --                   users_insert, users_update
--
-- Verification (after apply):
--   SELECT policyname FROM pg_policies WHERE schemaname='public'
--    AND tablename='users' AND policyname='users_select';
--   -- expect 0 rows
--   SELECT 1 FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='public_profiles_v'
--      AND column_name='is_frozen';
--   -- expect 1 row
--
-- Rollback:
--   BEGIN;
--   CREATE POLICY "users_select" ON public.users FOR SELECT
--     TO authenticated, anon
--     USING (
--       (id = auth.uid())
--       OR (profile_visibility::text = 'public')
--       OR is_admin_or_above()
--     );
--   COMMIT;
-- =====================================================================

BEGIN;

-- 1. Drop the surviving broad SELECT policy. users_self_read +
--    users_admin_read (added by the original T300 migration) cover
--    the legitimate read paths; non-self / non-admin reads of users
--    now have no matching PERMISSIVE policy and fail closed.
DROP POLICY IF EXISTS "users_select" ON public.users;

-- 2. CREATE OR REPLACE the view to include the is_frozen derived
--    column. The view body otherwise matches the original T300 draft
--    exactly — same WHERE filters, same column whitelist.
CREATE OR REPLACE VIEW public.public_profiles_v
WITH (security_invoker = false)
AS
SELECT
  u.id,
  u.username,
  u.display_name,
  u.bio,
  u.avatar_url,
  u.avatar_color,
  u.banner_url,
  u.verity_score,
  u.streak_current,
  u.is_expert,
  u.expert_title,
  u.expert_organization,
  u.is_verified_public_figure,
  u.articles_read_count,
  u.quizzes_completed_count,
  u.comment_count,
  u.followers_count,
  u.following_count,
  u.show_activity,
  u.show_on_leaderboard,
  u.profile_visibility,
  u.email_verified,
  u.created_at,
  -- Derived booleans for caller-side filtering without leaking
  -- timestamps. `is_frozen` lets the leaderboard hide frozen users
  -- without exposing the freeze date.
  (u.frozen_at IS NOT NULL) AS is_frozen
FROM public.users u
WHERE
  u.profile_visibility = 'public'
  AND COALESCE(u.is_banned, false) = false
  AND COALESCE(u.deletion_scheduled_for, NULL) IS NULL;

-- View permissions need to be re-granted after CREATE OR REPLACE.
GRANT SELECT ON public.public_profiles_v TO authenticated, anon;

COMMIT;
