-- 092b_rls_lockdown_followup_2026_04_19.sql
-- Migration: 20260419203150 092b_rls_lockdown_followup_2026_04_19
--
-- Round A follow-up: close V2/V10 gaps from migration 092.
-- Root cause: the table-level SELECT/UPDATE/INSERT grants override the
-- column-level REVOKEs. Fix by revoking table-level and re-granting an
-- explicit column list.
--
-- anon column list mirrors the public_user_profiles view plus the
-- leaderboard filter / signup-pick-username uniqueness columns.
-- `frozen_at` added over the planner's list (audit: leaderboard anon
-- client filters .is('frozen_at', null)). Non-PII lifecycle timestamp.
--
-- authenticated keeps table-level SELECT (RLS still gates row visibility).
-- INSERT/UPDATE narrowed to self-mutable columns. `last_login_at`,
-- `email_verified`, `email_verified_at` included because
-- /api/auth/callback/route.js:135 writes them on the session client for
-- returning users (non-privileged per the trigger).

-- anon: revoke table-level SELECT, re-grant narrow column list.
REVOKE SELECT ON public.users FROM anon;

GRANT SELECT (
  id,
  display_name,
  username,
  avatar_url,
  avatar_color,
  banner_url,
  bio,
  verity_score,
  streak_current,
  is_expert,
  expert_title,
  expert_organization,
  is_verified_public_figure,
  created_at,
  profile_visibility,
  is_banned,
  email_verified,
  articles_read_count,
  quizzes_completed_count,
  comment_count,
  followers_count,
  following_count,
  show_on_leaderboard,
  frozen_at
) ON public.users TO anon;

-- authenticated: revoke table-level INSERT/UPDATE, re-grant narrow list.
REVOKE INSERT, UPDATE ON public.users FROM authenticated;

GRANT INSERT (
  display_name,
  bio,
  avatar_url,
  avatar_color,
  banner_url,
  username,
  show_on_leaderboard,
  profile_visibility,
  show_activity,
  allow_messages,
  dm_read_receipts_enabled,
  metadata
) ON public.users TO authenticated;

GRANT UPDATE (
  display_name,
  bio,
  avatar_url,
  avatar_color,
  banner_url,
  username,
  show_on_leaderboard,
  profile_visibility,
  show_activity,
  allow_messages,
  dm_read_receipts_enabled,
  metadata,
  last_login_at,
  email_verified,
  email_verified_at
) ON public.users TO authenticated;
