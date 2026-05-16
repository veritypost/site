-- Public-contributions visibility toggle on public.users
-- Adds a discrete boolean for the "Show contributions publicly" rail toggle
-- in the redesigned profile settings (redesign-preview.html ~line 3838, 4154).
--
-- This is intentionally separate from show_activity, show_on_leaderboard, and
-- profile_visibility. It gates contributions counts (questions asked, context
-- added) exposed via public_profiles_v even when the profile itself is public.
--
-- Default false: opt-in publication of contribution counts. Users with public
-- profiles do not leak per-intent comment counts until they flip this on.
--
-- Idempotent: safe to re-run.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS show_contributions_publicly boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.show_contributions_publicly IS
  'When true, contributions counts (questions_asked_count, context_added_count) are exposed via public_profiles_v. When false, those columns are returned as NULL. Independent of profile_visibility / show_activity / show_on_leaderboard.';
