-- Migration 098 — Kid JWT RLS: sibling + global leaderboard reads on kid_profiles
--
-- Adds two SELECT policies on public.kid_profiles so a kid-delegated JWT can
-- (a) see its siblings via the parent_user_id JWT claim (Family leaderboard),
-- and (b) see any other kid row that has explicitly opted in to the Global
-- leaderboard and is active. Both policies gate on public.is_kid_delegated()
-- from migration 096; the global policy additionally requires
-- global_leaderboard_opt_in = true as the consent gate. Ends with a
-- perms_global_version bump. This file was backfilled from prod on
-- 2026-04-19 to bring the repo back in sync; the migration was already
-- applied to the Supabase project directly.

-- Sibling read: kid can SELECT kid_profiles that share their parent_user_id
-- (via the JWT parent_user_id claim).
DROP POLICY IF EXISTS kid_profiles_select_siblings_kid_jwt ON public.kid_profiles;
CREATE POLICY kid_profiles_select_siblings_kid_jwt ON public.kid_profiles
    FOR SELECT
    USING (
        public.is_kid_delegated()
        AND parent_user_id::text = (auth.jwt() ->> 'parent_user_id')
    );

-- Global leaderboard: kid can SELECT any other kid row if that kid opted in.
-- The opt-in flag is the consent gate.
DROP POLICY IF EXISTS kid_profiles_select_global_leaderboard_kid_jwt ON public.kid_profiles;
CREATE POLICY kid_profiles_select_global_leaderboard_kid_jwt ON public.kid_profiles
    FOR SELECT
    USING (
        public.is_kid_delegated()
        AND global_leaderboard_opt_in = true
        AND is_active = true
    );

UPDATE public.perms_global_version
   SET version = version + 1, bumped_at = now()
 WHERE id = 1;

-- applied: 20260420010034
