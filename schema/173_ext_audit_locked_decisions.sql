-- 173_ext_audit_locked_decisions.sql
-- Owner-locked decisions from 2026-04-25 audit close.
-- See memory/project_locked_decisions_2026-04-25.md.

-- ============================================================================
-- GG.1 — tighten follows_select (drop the OR true)
-- ============================================================================
-- Owner decision: follow rows are private. Visible only to follower, followee,
-- and admins. Public profile follower-counts continue to come from the
-- aggregate columns on `users` (followers_count / following_count), not from
-- per-row reads of the follows table.

DROP POLICY IF EXISTS follows_select ON public.follows;

CREATE POLICY follows_select ON public.follows
  FOR SELECT
  USING (
    follower_id = auth.uid()
    OR following_id = auth.uid()
    OR public.is_admin_or_above()
  );

-- ============================================================================
-- M.8 — password rules to DB
-- ============================================================================
-- Seed settings rows the lib/password.js + new /api/settings/password-policy
-- endpoint will read. Server validation already lives in
-- validatePasswordServer; client mounts will fetch the policy on render.

INSERT INTO public.settings (key, value, value_type, category, description)
VALUES
  ('password.min_length', '8', 'number', 'auth',
   'Minimum password length for signup, settings change, and reset.'),
  ('password.require_upper', 'true', 'boolean', 'auth',
   'Require at least one uppercase letter.'),
  ('password.require_number', 'true', 'boolean', 'auth',
   'Require at least one digit.'),
  ('password.require_special', 'false', 'boolean', 'auth',
   'Require at least one non-alphanumeric character. Off by default; admins can flip on without a deploy.')
ON CONFLICT (key) DO NOTHING;
