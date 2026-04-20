-- Migration 097 — Kid JWT RLS: extended table coverage
--
-- Extends the kid-delegated JWT RLS model established in migration 096
-- to cover additional kid-scoped tables: user_achievements, category_scores,
-- kid_category_permissions, and kid_expert_questions. Each policy uses the
-- public.is_kid_delegated() helper (defined in 096) plus a kid_profile_id =
-- auth.uid() match so a kid JWT can only see/write its own rows. Ends with
-- a perms_global_version bump so clients refetch permissions. This file
-- was backfilled from prod on 2026-04-19 to bring the repo back in sync;
-- the migration was already applied to the Supabase project directly.

-- user_achievements: kid can SELECT own earned badges
DROP POLICY IF EXISTS user_achievements_select_kid_jwt ON public.user_achievements;
CREATE POLICY user_achievements_select_kid_jwt ON public.user_achievements
    FOR SELECT
    USING (
        public.is_kid_delegated()
        AND kid_profile_id = auth.uid()
    );

-- category_scores: kid can SELECT own category scores
DROP POLICY IF EXISTS category_scores_select_kid_jwt ON public.category_scores;
CREATE POLICY category_scores_select_kid_jwt ON public.category_scores
    FOR SELECT
    USING (
        public.is_kid_delegated()
        AND kid_profile_id = auth.uid()
    );

-- kid_category_permissions: kid can SELECT own (needs to know allowed categories)
DROP POLICY IF EXISTS kid_category_permissions_select_kid_jwt ON public.kid_category_permissions;
CREATE POLICY kid_category_permissions_select_kid_jwt ON public.kid_category_permissions
    FOR SELECT
    USING (
        public.is_kid_delegated()
        AND kid_profile_id = auth.uid()
    );

-- kid_expert_questions: kid can SELECT + INSERT own
DROP POLICY IF EXISTS kid_expert_questions_select_kid_jwt ON public.kid_expert_questions;
CREATE POLICY kid_expert_questions_select_kid_jwt ON public.kid_expert_questions
    FOR SELECT
    USING (
        public.is_kid_delegated()
        AND kid_profile_id = auth.uid()
    );

DROP POLICY IF EXISTS kid_expert_questions_insert_kid_jwt ON public.kid_expert_questions;
CREATE POLICY kid_expert_questions_insert_kid_jwt ON public.kid_expert_questions
    FOR INSERT
    WITH CHECK (
        public.is_kid_delegated()
        AND kid_profile_id = auth.uid()
    );

-- signal clients
UPDATE public.perms_global_version
   SET version = version + 1,
       bumped_at = now()
 WHERE id = 1;

-- applied: 20260420002302
