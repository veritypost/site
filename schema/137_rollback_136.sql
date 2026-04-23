-- 137_rollback_136.sql
--
-- Rollback for 136_defense_in_depth_kid_jwt_blocks.sql.
-- Drops every RESTRICTIVE block policy created by 136. Idempotent.

BEGIN;

DROP POLICY IF EXISTS analytics_events_block_kid_jwt          ON public.analytics_events;
DROP POLICY IF EXISTS category_scores_block_kid_jwt           ON public.category_scores;
DROP POLICY IF EXISTS device_profile_bindings_block_kid_jwt   ON public.device_profile_bindings;
DROP POLICY IF EXISTS kid_category_permissions_block_kid_jwt  ON public.kid_category_permissions;
DROP POLICY IF EXISTS kid_expert_questions_block_kid_jwt      ON public.kid_expert_questions;
DROP POLICY IF EXISTS kid_pair_codes_block_kid_jwt            ON public.kid_pair_codes;
DROP POLICY IF EXISTS kid_profiles_block_kid_jwt              ON public.kid_profiles;
DROP POLICY IF EXISTS kid_sessions_block_kid_jwt              ON public.kid_sessions;
DROP POLICY IF EXISTS quiz_attempts_block_kid_jwt             ON public.quiz_attempts;
DROP POLICY IF EXISTS reading_log_block_kid_jwt               ON public.reading_log;
DROP POLICY IF EXISTS score_events_block_kid_jwt              ON public.score_events;
DROP POLICY IF EXISTS streaks_block_kid_jwt                   ON public.streaks;
DROP POLICY IF EXISTS user_achievements_block_kid_jwt         ON public.user_achievements;

COMMIT;
