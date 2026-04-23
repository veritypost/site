-- 136_defense_in_depth_kid_jwt_blocks.sql
--
-- Defense-in-depth: add `*_block_kid_jwt` RESTRICTIVE policies to every kid-joined
-- table that was missing one. CLAUDE.md invariant: every table with `kid_profile_id`
-- OR `parent_user_id` MUST have a RESTRICTIVE block policy alongside its permissive
-- policies, so a misconfigured permissive grant cannot accidentally expose adult
-- data to a kid JWT.
--
-- Audit (Stream C, 2026-04-22) flagged 13 tables. Verified via pg_policies that
-- none of them currently have a *_block_kid_jwt RESTRICTIVE policy. RLS is enabled
-- on all 13.
--
-- Trust model reminder: the kid JWT carries the kid_profile_id in the `sub` claim,
-- so `auth.uid()` returns the kid_profile_id under a kid JWT (not the parent's
-- user id). Existing kid-jwt permissive policies in this codebase consistently use
-- `kid_profile_id = auth.uid()`, NOT `(auth.jwt()->>'kid_profile_id')::uuid`. We
-- match that pattern so our RESTRICTIVE narrowings line up exactly with existing
-- permissive grants and don't accidentally close a path the app legitimately uses.
--
-- All policies are AS RESTRICTIVE FOR ALL — they intersect with permissive
-- policies, so they can only further restrict, never grant. service_role bypasses
-- RLS entirely so admin/cron/SECURITY DEFINER paths are unaffected.

BEGIN;

-- ---------------------------------------------------------------------------
-- analytics_events
-- Has kid_profile_id column, but the existing permissive policies are
-- (a) INSERT to any (used by anon/web tracking) and (b) SELECT admin_or_above.
-- There is NO permissive policy that grants kid JWT access. Kid app does not
-- log analytics under kid JWT. Plain block — if kid analytics ever gets added,
-- a narrowed policy can replace this one in a follow-up migration.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS analytics_events_block_kid_jwt ON public.analytics_events;
CREATE POLICY analytics_events_block_kid_jwt ON public.analytics_events
  AS RESTRICTIVE
  FOR ALL
  USING (NOT is_kid_delegated())
  WITH CHECK (NOT is_kid_delegated());

-- ---------------------------------------------------------------------------
-- category_scores
-- Has kid_profile_id. Existing kid-jwt permissive: category_scores_select_kid_jwt
-- uses `kid_profile_id = auth.uid()`. Narrow to match.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS category_scores_block_kid_jwt ON public.category_scores;
CREATE POLICY category_scores_block_kid_jwt ON public.category_scores
  AS RESTRICTIVE
  FOR ALL
  USING (NOT is_kid_delegated() OR kid_profile_id = auth.uid())
  WITH CHECK (NOT is_kid_delegated() OR kid_profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- device_profile_bindings
-- Only parent_user_id column (no kid_profile_id). All existing permissive
-- policies key on parent_user_id = auth.uid(). Kid JWT has no business here.
-- Plain block.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS device_profile_bindings_block_kid_jwt ON public.device_profile_bindings;
CREATE POLICY device_profile_bindings_block_kid_jwt ON public.device_profile_bindings
  AS RESTRICTIVE
  FOR ALL
  USING (NOT is_kid_delegated())
  WITH CHECK (NOT is_kid_delegated());

-- ---------------------------------------------------------------------------
-- kid_category_permissions
-- Kid-scoped. Existing kid-jwt permissive: kid_category_permissions_select_kid_jwt
-- uses `kid_profile_id = auth.uid()`. Narrow to match (read-only path for kid).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS kid_category_permissions_block_kid_jwt ON public.kid_category_permissions;
CREATE POLICY kid_category_permissions_block_kid_jwt ON public.kid_category_permissions
  AS RESTRICTIVE
  FOR ALL
  USING (NOT is_kid_delegated() OR kid_profile_id = auth.uid())
  WITH CHECK (NOT is_kid_delegated() OR kid_profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- kid_expert_questions
-- Kid-scoped. Existing kid-jwt permissive: SELECT + INSERT both gated on
-- `kid_profile_id = auth.uid()`. Narrow to match.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS kid_expert_questions_block_kid_jwt ON public.kid_expert_questions;
CREATE POLICY kid_expert_questions_block_kid_jwt ON public.kid_expert_questions
  AS RESTRICTIVE
  FOR ALL
  USING (NOT is_kid_delegated() OR kid_profile_id = auth.uid())
  WITH CHECK (NOT is_kid_delegated() OR kid_profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- kid_pair_codes
-- ONE-TIME view at pair time, by parent only. No kid-jwt permissive policy
-- exists. Per spec: kid JWT must NOT read this table post-pair (codes are a
-- pair-time secret only). Plain block.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS kid_pair_codes_block_kid_jwt ON public.kid_pair_codes;
CREATE POLICY kid_pair_codes_block_kid_jwt ON public.kid_pair_codes
  AS RESTRICTIVE
  FOR ALL
  USING (NOT is_kid_delegated())
  WITH CHECK (NOT is_kid_delegated());

-- ---------------------------------------------------------------------------
-- kid_profiles
-- Kid-scoped, but kid JWT has THREE legitimate read paths via existing
-- permissive policies:
--   * kid_profiles_select_kid_jwt          → own row (`id = auth.uid()`)
--   * kid_profiles_select_siblings_kid_jwt → siblings (parent_user_id matches
--                                            the parent_user_id JWT claim)
--   * kid_profiles_select_global_leaderboard_kid_jwt → opted-in active kids
--
-- The RESTRICTIVE policy must allow the union, otherwise it would close paths
-- the app currently uses (sibling switcher, global leaderboard). Mirror all
-- three predicates so the block never strictly blocks something a permissive
-- policy already grants.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS kid_profiles_block_kid_jwt ON public.kid_profiles;
CREATE POLICY kid_profiles_block_kid_jwt ON public.kid_profiles
  AS RESTRICTIVE
  FOR ALL
  USING (
    NOT is_kid_delegated()
    OR id = auth.uid()
    OR (parent_user_id)::text = (auth.jwt() ->> 'parent_user_id')
    OR (global_leaderboard_opt_in = true AND is_active = true)
  )
  WITH CHECK (
    NOT is_kid_delegated()
    OR id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- kid_sessions
-- Has both kid_profile_id and parent_user_id. Existing policies: parent SELECT
-- only, plus a `kid_sessions_nowrite` policy that blocks ALL writes. NO
-- kid-jwt permissive policy exists. Service role manages this table for the
-- pair flow. Kid JWT has no read or write business here. Plain block.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS kid_sessions_block_kid_jwt ON public.kid_sessions;
CREATE POLICY kid_sessions_block_kid_jwt ON public.kid_sessions
  AS RESTRICTIVE
  FOR ALL
  USING (NOT is_kid_delegated())
  WITH CHECK (NOT is_kid_delegated());

-- ---------------------------------------------------------------------------
-- quiz_attempts
-- Has kid_profile_id + user_id. Existing kid-jwt permissive: SELECT + INSERT
-- both gated on `kid_profile_id = auth.uid()` (INSERT additionally validates
-- user_id). Narrow to `kid_profile_id = auth.uid()` so the block aligns with
-- the row-level join the permissive policies already enforce.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS quiz_attempts_block_kid_jwt ON public.quiz_attempts;
CREATE POLICY quiz_attempts_block_kid_jwt ON public.quiz_attempts
  AS RESTRICTIVE
  FOR ALL
  USING (NOT is_kid_delegated() OR kid_profile_id = auth.uid())
  WITH CHECK (NOT is_kid_delegated() OR kid_profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- reading_log
-- Has kid_profile_id + user_id. Existing kid-jwt permissive: SELECT + INSERT
-- both gated on `kid_profile_id = auth.uid()`. Narrow to match.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS reading_log_block_kid_jwt ON public.reading_log;
CREATE POLICY reading_log_block_kid_jwt ON public.reading_log
  AS RESTRICTIVE
  FOR ALL
  USING (NOT is_kid_delegated() OR kid_profile_id = auth.uid())
  WITH CHECK (NOT is_kid_delegated() OR kid_profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- score_events
-- Has kid_profile_id + user_id. NO kid-jwt permissive policy exists — the
-- only SELECT policy keys on `user_id = auth.uid()` OR parent-of-kid. Inserts
-- happen via SECURITY DEFINER trigger (service path, RLS-bypassed). Kid JWT
-- has no path to read or write this table today. Plain block.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS score_events_block_kid_jwt ON public.score_events;
CREATE POLICY score_events_block_kid_jwt ON public.score_events
  AS RESTRICTIVE
  FOR ALL
  USING (NOT is_kid_delegated())
  WITH CHECK (NOT is_kid_delegated());

-- ---------------------------------------------------------------------------
-- streaks
-- Has kid_profile_id + user_id. Existing kid-jwt permissive: streaks_insert_kid_jwt
-- gates on `kid_profile_id = auth.uid()`. SELECT permissive uses
-- owns_kid_profile (parent), so under kid JWT today the kid cannot see its
-- own streak via permissive policies — but the app reads streaks via service
-- role (server-rendered scenes). Narrow to `kid_profile_id = auth.uid()` so
-- the existing kid INSERT path keeps working AND a future direct-kid SELECT
-- isn't pre-broken by this RESTRICTIVE.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS streaks_block_kid_jwt ON public.streaks;
CREATE POLICY streaks_block_kid_jwt ON public.streaks
  AS RESTRICTIVE
  FOR ALL
  USING (NOT is_kid_delegated() OR kid_profile_id = auth.uid())
  WITH CHECK (NOT is_kid_delegated() OR kid_profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- user_achievements
-- Has kid_profile_id + user_id. Existing kid-jwt permissive:
-- user_achievements_select_kid_jwt gates on `kid_profile_id = auth.uid()`.
-- Narrow to match.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS user_achievements_block_kid_jwt ON public.user_achievements;
CREATE POLICY user_achievements_block_kid_jwt ON public.user_achievements
  AS RESTRICTIVE
  FOR ALL
  USING (NOT is_kid_delegated() OR kid_profile_id = auth.uid())
  WITH CHECK (NOT is_kid_delegated() OR kid_profile_id = auth.uid());

COMMIT;
