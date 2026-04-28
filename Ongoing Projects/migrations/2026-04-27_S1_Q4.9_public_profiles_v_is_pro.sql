-- S1-Q4.9 — public_profiles_v: add is_pro derived boolean
--
-- The view currently exposes is_frozen (derived from frozen_at IS NOT NULL)
-- but no paid-status indicator. Client code has to join plans or query tier
-- separately to decide whether to show the "pro" badge or unlock pro-only
-- social features (follow, DM).
--
-- Verified state (2026-04-27): view body is a SELECT from users u with
-- profile_visibility='public' and no is_banned / deletion_scheduled_for.
-- No JOIN to plans. Existing columns include verity_score, is_expert,
-- is_verified_public_figure, and is_frozen.
--
-- Change: add a correlated subquery that resolves is_pro as true when the
-- user's plan tier is not 'free'. Uses a correlated scalar subquery on plans
-- rather than a JOIN to avoid row multiplication if plans ever allows
-- multiple rows per plan_id (currently 1:1 but the subquery is safer).
--
-- Acceptance: pg_get_viewdef contains 'is_pro'.

BEGIN;

CREATE OR REPLACE VIEW public.public_profiles_v AS
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
    u.frozen_at IS NOT NULL AS is_frozen,
    COALESCE(
      (SELECT p.tier <> 'free'
         FROM public.plans p
        WHERE p.id = u.plan_id),
      false
    ) AS is_pro
   FROM public.users u
  WHERE u.profile_visibility::text = 'public'::text
    AND COALESCE(u.is_banned, false) = false
    AND COALESCE(u.deletion_scheduled_for, NULL::timestamp with time zone) IS NULL;

DO $$
DECLARE v_def text;
BEGIN
  v_def := pg_get_viewdef('public.public_profiles_v', true);
  IF v_def NOT LIKE '%is_pro%' THEN
    RAISE EXCEPTION 'S1-Q4.9 post-check failed: is_pro not in view definition';
  END IF;
  RAISE NOTICE 'S1-Q4.9 applied: public_profiles_v now exposes is_pro';
END $$;

COMMIT;
