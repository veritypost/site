-- 064_compute_effective_perms.sql
-- Resolves every active permission for a user, plus the source of the grant.
--
-- Resolution order (first match wins):
--   1. permission_scope_overrides  -> granted_via = 'scope_override'
--   2. user_permission_sets        -> granted_via = 'user_set'
--   3. permissions.is_public       -> granted_via = 'public'
--   4. role_permission_sets        -> granted_via = 'role'
--   5. plan_permission_sets        -> granted_via = 'plan'
--
-- Notes on the live schema (differs slightly from the task spec):
--  - permission_scope_overrides keys permissions by `permission_key` (varchar),
--    not `permission_id`. Rows use (scope_type, scope_id); per-user overrides
--    are represented by scope_type='user' AND scope_id=<user_id>.
--  - override_action is one of: allow, block, require_verified,
--    require_premium, require_family, require_role. We treat `allow` as a
--    grant, `block` as an explicit deny, and the `require_*` forms as
--    conditional denies (recorded so callers can render the correct gate).
--
-- Banned users: all permissions deny except for the safety allow-list
-- (appeal.*, account.*, login.*, signup.*, settings.*).
--
-- requires_verified permissions deny when users.email_verified = false, even
-- if a role/plan/set would otherwise grant them.

CREATE OR REPLACE FUNCTION public.compute_effective_perms(p_user_id uuid)
RETURNS TABLE (
  permission_id           uuid,
  permission_key          text,
  permission_display_name text,
  surface                 text,
  granted                 boolean,
  granted_via             text,
  source_detail           jsonb,
  deny_mode               text,
  requires_verified       boolean,
  lock_message            text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH
  -- Pull the user once (may be NULL for anon / missing id).
  u AS (
    SELECT
      id,
      plan_id,
      COALESCE(email_verified, false) AS email_verified,
      COALESCE(is_banned, false)      AS is_banned
    FROM public.users
    WHERE id = p_user_id
  ),

  -- Every active permission is the outer frame: we always return one row per
  -- active permission, even when nothing grants it.
  perms AS (
    SELECT
      p.id,
      p.key,
      p.display_name,
      p.ui_section,
      p.is_public,
      p.deny_mode,
      p.requires_verified,
      p.lock_message
    FROM public.permissions p
    WHERE p.is_active = true
  ),

  -- Layer 1: per-user scope overrides.  Only scope_type='user' rows apply at
  -- the user level; article/category/source overrides are contextual and are
  -- surfaced verbatim so callers can decide.
  ovr_user AS (
    SELECT DISTINCT ON (o.permission_key)
      o.permission_key,
      o.override_action,
      o.scope_type,
      o.scope_id,
      o.reason
    FROM public.permission_scope_overrides o
    WHERE o.scope_type = 'user'
      AND o.scope_id   = p_user_id
      AND (o.expires_at IS NULL OR o.expires_at > now())
    ORDER BY o.permission_key, o.created_at DESC
  ),

  -- Layer 2: direct user->permission_set grants.
  user_set_perms AS (
    SELECT DISTINCT ON (psp.permission_id)
      psp.permission_id,
      ps.key AS set_key,
      ups.reason
    FROM public.user_permission_sets ups
    JOIN public.permission_sets ps
      ON ps.id = ups.permission_set_id AND ps.is_active = true
    JOIN public.permission_set_perms psp
      ON psp.permission_set_id = ps.id
    WHERE ups.user_id = p_user_id
      AND (ups.expires_at IS NULL OR ups.expires_at > now())
    ORDER BY psp.permission_id, ups.granted_at DESC NULLS LAST
  ),

  -- Layer 4: role -> set -> permission.
  role_perms AS (
    SELECT DISTINCT ON (psp.permission_id)
      psp.permission_id,
      r.name  AS role_name,
      ps.key  AS set_key
    FROM public.user_roles ur
    JOIN public.roles r
      ON r.id = ur.role_id
    JOIN public.role_permission_sets rps
      ON rps.role_id = r.id
    JOIN public.permission_sets ps
      ON ps.id = rps.permission_set_id AND ps.is_active = true
    JOIN public.permission_set_perms psp
      ON psp.permission_set_id = ps.id
    WHERE ur.user_id = p_user_id
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
    ORDER BY psp.permission_id, r.hierarchy_level DESC NULLS LAST
  ),

  -- Layer 5: plan -> set -> permission.
  plan_perms AS (
    SELECT DISTINCT ON (psp.permission_id)
      psp.permission_id,
      pl.name AS plan_name,
      ps.key  AS set_key
    FROM u
    JOIN public.plans pl
      ON pl.id = u.plan_id
    JOIN public.plan_permission_sets pps
      ON pps.plan_id = pl.id
    JOIN public.permission_sets ps
      ON ps.id = pps.permission_set_id AND ps.is_active = true
    JOIN public.permission_set_perms psp
      ON psp.permission_set_id = ps.id
    ORDER BY psp.permission_id, pl.name
  ),

  -- Allow-list of permission key prefixes that banned users may still use.
  -- Implemented as a boolean expression inline below.

  resolved AS (
    SELECT
      perms.id                                           AS permission_id,
      perms.key::text                                    AS permission_key,
      perms.display_name::text                           AS permission_display_name,
      COALESCE(perms.ui_section, '')::text              AS surface,
      perms.deny_mode::text                              AS deny_mode,
      COALESCE(perms.requires_verified, false)           AS requires_verified,
      perms.lock_message::text                           AS lock_message,
      perms.is_public                                    AS is_public,

      -- Layer 1: scope override (per-user).
      ovr.override_action                                AS ovr_action,
      ovr.scope_type                                     AS ovr_scope_type,
      ovr.scope_id                                       AS ovr_scope_id,
      ovr.reason                                         AS ovr_reason,

      -- Layer 2: user_permission_sets.
      usp.set_key                                        AS user_set_key,
      usp.reason                                         AS user_set_reason,

      -- Layer 4: role.
      rp.role_name                                       AS role_name,
      rp.set_key                                         AS role_set_key,

      -- Layer 5: plan.
      pp.plan_name                                       AS plan_name,
      pp.set_key                                         AS plan_set_key
    FROM perms
    LEFT JOIN ovr_user       ovr ON ovr.permission_key  = perms.key
    LEFT JOIN user_set_perms usp ON usp.permission_id   = perms.id
    LEFT JOIN role_perms     rp  ON rp.permission_id    = perms.id
    LEFT JOIN plan_perms     pp  ON pp.permission_id    = perms.id
  ),

  -- Apply user state (ban, requires_verified) and decide layer precedence.
  final AS (
    SELECT
      r.permission_id,
      r.permission_key,
      r.permission_display_name,
      r.surface,
      r.deny_mode,
      r.requires_verified,
      r.lock_message,

      -- Context flags used in CASE below.
      (SELECT is_banned      FROM u) AS u_is_banned,
      (SELECT email_verified FROM u) AS u_email_verified,

      -- Is this permission on the ban safe-list?
      (
        r.permission_key LIKE 'appeal.%'  OR
        r.permission_key LIKE 'account.%' OR
        r.permission_key LIKE 'login.%'   OR
        r.permission_key LIKE 'signup.%'  OR
        r.permission_key LIKE 'settings.%'
      ) AS on_ban_allowlist,

      r.*
    FROM resolved r
  )

SELECT
  f.permission_id,
  f.permission_key,
  f.permission_display_name,
  f.surface,

  -- granted
  CASE
    -- Banned users: deny everything except the allow-list.
    WHEN f.u_is_banned AND NOT f.on_ban_allowlist THEN false

    -- requires_verified + unverified email: deny (but still show the row).
    WHEN f.requires_verified
         AND COALESCE(f.u_email_verified, false) = false THEN false

    -- Layer 1: explicit allow.
    WHEN f.ovr_action = 'allow' THEN true
    -- Layer 1: explicit block (or any require_* gate) -> not granted.
    WHEN f.ovr_action IS NOT NULL THEN false

    -- Layer 2: direct user set grant.
    WHEN f.user_set_key IS NOT NULL THEN true

    -- Layer 3: public permission.
    WHEN f.is_public THEN true

    -- Layer 4: role-derived grant.
    WHEN f.role_name IS NOT NULL THEN true

    -- Layer 5: plan-derived grant.
    WHEN f.plan_name IS NOT NULL THEN true

    ELSE false
  END AS granted,

  -- granted_via
  CASE
    WHEN f.u_is_banned AND NOT f.on_ban_allowlist THEN ''
    WHEN f.requires_verified
         AND COALESCE(f.u_email_verified, false) = false THEN ''
    WHEN f.ovr_action IS NOT NULL THEN 'scope_override'
    WHEN f.user_set_key IS NOT NULL THEN 'user_set'
    WHEN f.is_public THEN 'public'
    WHEN f.role_name IS NOT NULL THEN 'role'
    WHEN f.plan_name IS NOT NULL THEN 'plan'
    ELSE ''
  END AS granted_via,

  -- source_detail
  CASE
    WHEN f.u_is_banned AND NOT f.on_ban_allowlist
      THEN jsonb_build_object('reason', 'banned')
    WHEN f.requires_verified
         AND COALESCE(f.u_email_verified, false) = false
      THEN jsonb_build_object('reason', 'email_not_verified')
    WHEN f.ovr_action IS NOT NULL
      THEN jsonb_strip_nulls(jsonb_build_object(
             'override_action', f.ovr_action,
             'override_scope',  f.ovr_scope_type,
             'scope_id',        f.ovr_scope_id,
             'reason',          f.ovr_reason
           ))
    WHEN f.user_set_key IS NOT NULL
      THEN jsonb_strip_nulls(jsonb_build_object(
             'set_key', f.user_set_key,
             'reason',  f.user_set_reason
           ))
    WHEN f.is_public
      THEN jsonb_build_object('is_public', true)
    WHEN f.role_name IS NOT NULL
      THEN jsonb_build_object(
             'role_name', f.role_name,
             'set_key',   f.role_set_key
           )
    WHEN f.plan_name IS NOT NULL
      THEN jsonb_build_object(
             'plan_name', f.plan_name,
             'set_key',   f.plan_set_key
           )
    ELSE '{}'::jsonb
  END AS source_detail,

  f.deny_mode,
  f.requires_verified,
  f.lock_message
FROM final f
ORDER BY f.surface, f.permission_key;
$$;

-- Allow the authenticated role to call this.  SECURITY DEFINER means the
-- function always runs with the owner's privileges, so we still need EXECUTE
-- granted to callers.
REVOKE ALL ON FUNCTION public.compute_effective_perms(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_effective_perms(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_effective_perms(uuid) TO service_role;

COMMENT ON FUNCTION public.compute_effective_perms(uuid) IS
'Returns one row per active permission for the given user, with granted flag
and the source layer (scope_override/user_set/public/role/plan). Applies ban
allow-list and requires_verified gating. See 01-Schema/064_compute_effective_perms.sql.';
