-- Extend public_profiles_v with contributions tiles
--
-- Adds:
--   show_contributions_publicly bool (passthrough; lets callers know why a
--                                     count is NULL)
--   questions_asked_count  int   COUNT of comments WHERE intent='question'
--   context_added_count    int   COUNT of comments WHERE intent='add_context'
--
-- Counts are gated by show_contributions_publicly: when false, the view returns
-- NULL for both count columns even though the profile is otherwise public.
-- This matches the redesigned settings rail copy: "Public profile" and
-- "Show contributions publicly" are two separate toggles.
--
-- Taxonomy:
--   intent='question'     -> questions_asked_count (tile 1)
--   intent='add_context'  -> context_added_count   (tile 2)
--   intent='different_take' is NOT counted (per locked decision #9 — only 2 tiles ship).
--
-- Count subqueries filter to status='visible' AND deleted_at IS NULL because
-- the view runs as the postgres owner (de facto SECURITY DEFINER) and bypasses
-- RLS on comments. Without the filter, counts would include soft-deleted and
-- moderator-hidden comments — owner-visible bug: "I deleted my question, why
-- does my profile still say 1 question asked."
--
-- Reading-prefs columns (reading_default_mode/_text_size/_theme) are NOT
-- exposed via this view — they are self-only settings with no product reason
-- to leak through a public projection. Session B aggregator reads them
-- directly from public.users via the owner's JWT context.
--
-- Security model: existing public_profiles_v has reloptions=NULL (de facto
-- security definer behaviour). We preserve that — DO NOT flip to
-- security_invoker here, since the existing column set already runs that way
-- and callers depend on the current grants.
--
-- Adds a covering partial index on comments(user_id, intent) to keep the
-- correlated subqueries cheap as the comments table grows.
--
-- Idempotent: CREATE OR REPLACE VIEW is safe; CREATE INDEX uses IF NOT EXISTS.

CREATE INDEX IF NOT EXISTS idx_comments_user_intent
  ON public.comments (user_id, intent)
  WHERE intent IS NOT NULL;

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
  (u.frozen_at IS NOT NULL) AS is_frozen,
  COALESCE(
    (SELECT ((p.tier)::text <> 'free'::text)
       FROM plans p WHERE p.id = u.plan_id),
    false
  ) AS is_pro,
  u.background_oneline,
  u.background_profession,
  u.background_years,
  u.background_where,
  u.background_lived,
  u.background_languages,
  u.background_lived_public,
  u.show_contributions_publicly,
  CASE WHEN u.show_contributions_publicly THEN (
    SELECT COUNT(*)::int FROM public.comments c
    WHERE c.user_id = u.id
      AND c.intent = 'question'
      AND c.status = 'visible'
      AND c.deleted_at IS NULL
  ) ELSE NULL END AS questions_asked_count,
  CASE WHEN u.show_contributions_publicly THEN (
    SELECT COUNT(*)::int FROM public.comments c
    WHERE c.user_id = u.id
      AND c.intent = 'add_context'
      AND c.status = 'visible'
      AND c.deleted_at IS NULL
  ) ELSE NULL END AS context_added_count
FROM public.users u
WHERE (
  (u.profile_visibility)::text = 'public'::text
  AND COALESCE(u.is_banned, false) = false
  AND COALESCE(u.deletion_scheduled_for, NULL::timestamptz) IS NULL
);

COMMENT ON VIEW public.public_profiles_v IS
  'Public read-projection of users. Adds 2-tile contributions taxonomy (questions_asked_count, context_added_count) gated by show_contributions_publicly. Counts derive from comments.intent (question, add_context) and exclude soft-deleted / moderator-hidden rows; different_take is not exposed. Reading prefs are self-only and read directly from public.users, not this view.';

GRANT SELECT ON public.public_profiles_v TO anon, authenticated, service_role;
