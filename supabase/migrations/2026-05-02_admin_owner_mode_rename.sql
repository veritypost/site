-- DECISION #013 — rename `admin.god_mode` → `admin.owner_mode` per the
-- Owner Mode unification (god mode + owner mode merged into one
-- grantable permission). The hardcoded `OWNER_EMAILS` allowlist in
-- web/src/lib/{permissions,auth}.js is removed in the same commit;
-- DB role-grant is now the sole identification path for Owner Mode.
--
-- This migration:
--   1. Renames the `admin.god_mode` permission row + its display copy.
--   2. Renames the `god_mode` permission_set row + its display copy.
--   3. Recreates `my_permission_keys` and `compute_effective_perms` so
--      the in-function string literals reference `admin.owner_mode`
--      and the `granted_via` attribution emits `'owner_mode'` instead
--      of `'god_mode'`.
--
-- After this lands the prior `2026-05-01_admin_god_mode_*.sql` migrations
-- are historical only — their RPC bodies are superseded here, and the
-- catalog rows are renamed in place (no schema drift).

BEGIN;

-- The `permissions` and `permission_sets` tables are guarded by the
-- `guard_system_permissions()` trigger, which forbids key renames so
-- that callers don't accidentally invalidate downstream string lookups.
-- The trigger ships with an explicit, transaction-scoped escape hatch
-- (`app.allow_system_perm_edits = 'true'`) for exactly the case at hand:
-- a one-shot, well-reviewed rename that flips every callsite at the
-- same time. Set it for this txn only — `SET LOCAL` reverts on COMMIT
-- so the next session is back to the protected default.
SET LOCAL app.allow_system_perm_edits = 'true';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Rename the catalog row.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.permissions
   SET key          = 'admin.owner_mode',
       display_name = 'Owner Mode',
       description  = 'Bypass every plan and permission gate. Owner-equivalent access; grantable to other accounts.'
 WHERE key = 'admin.god_mode';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rename the permission_set row.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.permission_sets
   SET key          = 'owner_mode',
       display_name = 'Owner Mode (full bypass)'
 WHERE key = 'god_mode';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Rebuild my_permission_keys with the new key string.
--    Body identical to 2026-05-01_admin_god_mode_rpc_patches.sql apart
--    from the `gp.key = 'admin.owner_mode'` swap.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.my_permission_keys(
  p_as_kid    uuid    DEFAULT NULL::uuid,
  p_kid_token text    DEFAULT NULL::text
)
RETURNS TABLE(permission_key character varying)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT u.id, u.email_verified, u.is_banned, u.plan_id, u.plan_status,
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
    SELECT DISTINCT rps.permission_set_id
      FROM role_permission_sets rps
      JOIN user_roles ur ON ur.role_id = rps.role_id
     WHERE ur.user_id = (SELECT id FROM me)
       AND (ur.expires_at IS NULL OR ur.expires_at > now())
    UNION
    SELECT DISTINCT rps.permission_set_id
      FROM role_permission_sets rps
      JOIN roles r ON r.id = rps.role_id
     WHERE r.name = 'user'
       AND (SELECT id FROM me) IS NOT NULL
    UNION
    SELECT DISTINCT pps.permission_set_id
      FROM plan_permission_sets pps
     WHERE pps.plan_id = (SELECT plan_id FROM me)
       AND (SELECT plan_status FROM me) IN ('active','trialing')
    UNION
    SELECT DISTINCT ups.permission_set_id
      FROM user_permission_sets ups
     WHERE ups.user_id = (SELECT id FROM me)
       AND (ups.expires_at IS NULL OR ups.expires_at > now())
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
  ),
  -- Owner Mode short-circuit: return every active permission key when the
  -- caller has admin.owner_mode and is NOT in a kid session. Bypasses
  -- banned / email-verified / feature-flag gates deliberately.
  owner_mode_keys AS (
    SELECT p.key
    FROM permissions p
    WHERE p.is_active = true
      AND (SELECT active_kid FROM me) IS NULL
      AND EXISTS (
        SELECT 1
        FROM user_permission_sets ups
        JOIN permission_set_perms psp ON psp.permission_set_id = ups.permission_set_id
        JOIN permissions gp           ON gp.id = psp.permission_id
        WHERE ups.user_id = (SELECT id FROM me)
          AND gp.key = 'admin.owner_mode'
          AND gp.is_active = true
          AND (ups.expires_at IS NULL OR ups.expires_at > now())
        UNION ALL
        SELECT 1
        FROM user_roles ur
        JOIN role_permission_sets rps ON rps.role_id = ur.role_id
        JOIN permission_set_perms psp ON psp.permission_set_id = rps.permission_set_id
        JOIN permissions gp           ON gp.id = psp.permission_id
        WHERE ur.user_id = (SELECT id FROM me)
          AND gp.key = 'admin.owner_mode'
          AND gp.is_active = true
          AND (ur.expires_at IS NULL OR ur.expires_at > now())
      )
  )
  SELECT key::varchar FROM from_sets
  UNION
  SELECT key::varchar FROM from_public
  UNION
  SELECT key::varchar FROM owner_mode_keys;
$function$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Rebuild compute_effective_perms with the new key string and the
--    `granted_via='owner_mode'` attribution.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compute_effective_perms(p_user_id uuid)
RETURNS TABLE(
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
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH
  -- Non-recursive Owner Mode detection: walk grants directly rather than
  -- calling compute_effective_perms (this function) or my_permission_keys.
  is_owner AS (
    SELECT EXISTS(
      SELECT 1
      FROM user_permission_sets ups
      JOIN permission_set_perms psp ON psp.permission_set_id = ups.permission_set_id
      JOIN permissions gp           ON gp.id = psp.permission_id
      WHERE ups.user_id = p_user_id
        AND gp.key = 'admin.owner_mode'
        AND gp.is_active = true
        AND (ups.expires_at IS NULL OR ups.expires_at > now())
      UNION ALL
      SELECT 1
      FROM user_roles ur
      JOIN role_permission_sets rps ON rps.role_id = ur.role_id
      JOIN permission_set_perms psp ON psp.permission_set_id = rps.permission_set_id
      JOIN permissions gp           ON gp.id = psp.permission_id
      WHERE ur.user_id = p_user_id
        AND gp.key = 'admin.owner_mode'
        AND gp.is_active = true
        AND (ur.expires_at IS NULL OR ur.expires_at > now())
    ) AS value
  ),
  u AS (
    SELECT
      id,
      plan_id,
      COALESCE(email_verified, false) AS email_verified,
      COALESCE(is_banned, false)      AS is_banned,
      verify_locked_at
    FROM public.users
    WHERE id = p_user_id
  ),
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
  resolved AS (
    SELECT
      perms.id                                           AS permission_id,
      perms.key::text                                    AS permission_key,
      perms.display_name::text                           AS permission_display_name,
      COALESCE(perms.ui_section, '')::text               AS surface,
      perms.deny_mode::text                              AS deny_mode,
      COALESCE(perms.requires_verified, false)           AS requires_verified,
      perms.lock_message::text                           AS lock_message,
      perms.is_public                                    AS is_public,
      ovr.override_action                                AS ovr_action,
      ovr.scope_type                                     AS ovr_scope_type,
      ovr.scope_id                                       AS ovr_scope_id,
      ovr.reason                                         AS ovr_reason,
      usp.set_key                                        AS user_set_key,
      usp.reason                                         AS user_set_reason,
      rp.role_name                                       AS role_name,
      rp.set_key                                         AS role_set_key,
      pp.plan_name                                       AS plan_name,
      pp.set_key                                         AS plan_set_key
    FROM perms
    LEFT JOIN ovr_user       ovr ON ovr.permission_key  = perms.key
    LEFT JOIN user_set_perms usp ON usp.permission_id   = perms.id
    LEFT JOIN role_perms     rp  ON rp.permission_id    = perms.id
    LEFT JOIN plan_perms     pp  ON pp.permission_id    = perms.id
  ),
  final AS (
    SELECT
      r.*,
      (SELECT is_banned        FROM u) AS u_is_banned,
      (SELECT email_verified   FROM u) AS u_email_verified,
      (SELECT verify_locked_at FROM u) AS u_verify_locked_at,
      (
        r.permission_key LIKE 'appeal.%'  OR
        r.permission_key LIKE 'account.%' OR
        r.permission_key LIKE 'login.%'   OR
        r.permission_key LIKE 'signup.%'  OR
        r.permission_key LIKE 'settings.%'
      ) AS on_lockout_allowlist
    FROM resolved r
  )
SELECT
  f.permission_id,
  f.permission_key,
  f.permission_display_name,
  f.surface,
  CASE
    WHEN io.value                                              THEN true
    WHEN f.u_is_banned AND NOT f.on_lockout_allowlist          THEN false
    WHEN f.u_verify_locked_at IS NOT NULL
         AND NOT f.on_lockout_allowlist                        THEN false
    WHEN f.requires_verified
         AND COALESCE(f.u_email_verified, false) = false       THEN false
    WHEN f.ovr_action = 'allow'                                THEN true
    WHEN f.ovr_action IS NOT NULL                              THEN false
    WHEN f.user_set_key IS NOT NULL                            THEN true
    WHEN f.is_public                                           THEN true
    WHEN f.role_name IS NOT NULL                               THEN true
    WHEN f.plan_name IS NOT NULL                               THEN true
    ELSE false
  END AS granted,
  CASE
    WHEN io.value                                              THEN 'owner_mode'
    WHEN f.u_is_banned AND NOT f.on_lockout_allowlist          THEN ''
    WHEN f.u_verify_locked_at IS NOT NULL
         AND NOT f.on_lockout_allowlist                        THEN ''
    WHEN f.requires_verified
         AND COALESCE(f.u_email_verified, false) = false       THEN ''
    WHEN f.ovr_action IS NOT NULL                              THEN 'scope_override'
    WHEN f.user_set_key IS NOT NULL                            THEN 'user_set'
    WHEN f.is_public                                           THEN 'public'
    WHEN f.role_name IS NOT NULL                               THEN 'role'
    WHEN f.plan_name IS NOT NULL                               THEN 'plan'
    ELSE ''
  END AS granted_via,
  CASE
    WHEN io.value
      THEN jsonb_build_object('owner_mode', true)
    WHEN f.u_is_banned AND NOT f.on_lockout_allowlist
      THEN jsonb_build_object('reason', 'banned')
    WHEN f.u_verify_locked_at IS NOT NULL AND NOT f.on_lockout_allowlist
      THEN jsonb_build_object('reason', 'verify_locked', 'locked_at', f.u_verify_locked_at)
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
FROM final f CROSS JOIN is_owner io
ORDER BY f.surface, f.permission_key;
$function$;

COMMIT;
