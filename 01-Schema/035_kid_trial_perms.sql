-- ============================================================
-- 035_kid_trial_perms.sql
--
-- Bug: start_kid_trial (017) created the kid profile and stamped
-- users.kid_trial_started_at / kid_trial_ends_at, but never granted
-- the parent the `profile.kids` permission. As a result:
--   - The Kids row never appears in /profile (UI gated on
--     has_permission('profile.kids')).
--   - The kid_profiles RLS policy hides the trial kid from its own
--     creator (same has_permission check).
--
-- Fix: extend `my_permission_keys()` so a user with an active kid
-- trial (kid_trial_ends_at IS NOT NULL AND kid_trial_ends_at > now())
-- inherits the `family_perks` permission set for the trial window —
-- exactly the same set Verity Family / Family XL plans grant.
--
-- This is a single SECURITY DEFINER function replace; no schema
-- changes, no policy changes, no permission table edits.
-- ============================================================

CREATE OR REPLACE FUNCTION public.my_permission_keys(
  p_as_kid uuid DEFAULT NULL,
  p_kid_token text DEFAULT NULL
)
RETURNS TABLE (permission_key varchar) AS $$
  WITH me AS (
    SELECT u.id, u.email_verified, u.is_banned, u.plan_id, u.plan_status,
           u.kid_trial_ends_at,
           CASE
             WHEN p_as_kid IS NOT NULL
              AND p_kid_token IS NOT NULL
              AND public.kid_session_valid(p_as_kid, p_kid_token)
             THEN p_as_kid
             ELSE NULL
           END AS active_kid
    FROM users u WHERE u.id = auth.uid()
  ),
  granted_set_ids AS (
    -- Explicit role grants.
    SELECT DISTINCT rps.permission_set_id
      FROM role_permission_sets rps
      JOIN user_roles ur ON ur.role_id = rps.role_id
     WHERE ur.user_id = (SELECT id FROM me)
       AND (ur.expires_at IS NULL OR ur.expires_at > now())
    UNION
    -- Implicit default 'user' role.
    SELECT DISTINCT rps.permission_set_id
      FROM role_permission_sets rps
      JOIN roles r ON r.id = rps.role_id
     WHERE r.name = 'user'
       AND (SELECT id FROM me) IS NOT NULL
    UNION
    -- Plan grants.
    SELECT DISTINCT pps.permission_set_id
      FROM plan_permission_sets pps
     WHERE pps.plan_id = (SELECT plan_id FROM me)
       AND (SELECT plan_status FROM me) IN ('active','trialing')
    UNION
    -- Explicit user grants.
    SELECT DISTINCT ups.permission_set_id
      FROM user_permission_sets ups
     WHERE ups.user_id = (SELECT id FROM me)
       AND (ups.expires_at IS NULL OR ups.expires_at > now())
    UNION
    -- D44 kid trial: while the trial window is open, grant the
    -- `family_perks` set so profile.kids appears and the kid_profiles
    -- RLS lets the parent see / manage the trial kid.
    SELECT ps.id
      FROM permission_sets ps
     WHERE ps.key = 'family_perks'
       AND (SELECT kid_trial_ends_at FROM me) IS NOT NULL
       AND (SELECT kid_trial_ends_at FROM me) > now()
  ),
  from_sets AS (
    SELECT DISTINCT p.key
      FROM granted_set_ids gs
      JOIN permission_sets      ps  ON ps.id  = gs.permission_set_id
      JOIN permission_set_perms psp ON psp.permission_set_id = ps.id
      JOIN permissions          p   ON p.id   = psp.permission_id
      LEFT JOIN feature_flags   ff  ON ff.key = p.feature_flag_key
     WHERE p.is_active = true
       AND NOT COALESCE((SELECT is_banned FROM me), false)
       AND (NOT p.requires_verified OR COALESCE((SELECT email_verified FROM me), false))
       AND (p.feature_flag_key IS NULL OR COALESCE(ff.is_enabled, false) = true)
       AND (
         CASE WHEN (SELECT active_kid FROM me) IS NOT NULL
              THEN ps.is_kids_set = true
              ELSE ps.is_kids_set = false
         END
       )
  ),
  from_public AS (
    SELECT DISTINCT p.key
      FROM permissions p
      LEFT JOIN feature_flags ff ON ff.key = p.feature_flag_key
     WHERE p.is_active = true
       AND p.is_public = true
       AND NOT COALESCE((SELECT is_banned FROM me), false)
       AND (p.feature_flag_key IS NULL OR COALESCE(ff.is_enabled, false) = true)
  )
  SELECT key::varchar FROM from_sets
  UNION
  SELECT key::varchar FROM from_public;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.my_permission_keys(uuid, text) TO anon, authenticated;

-- Bump the global perms version so any cached client capabilities refresh.
SELECT public.bump_perms_global_version();
