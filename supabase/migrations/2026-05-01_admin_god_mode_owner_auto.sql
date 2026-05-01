-- Item 11a — God-mode permission key + owner auto-grant.
--
-- This migration ships the *additive* half of item 11a Phase 1:
--   1. INSERT  admin.god_mode into the permissions catalog.
--   2. CREATE  the singleton 'god_mode' permission_set.
--   3. LINK    permission_set_perms (god_mode set ↔ admin.god_mode key).
--   4. GRANT   role_permission_sets (owner role ↔ god_mode set).
--   5. BACKFILL user_permission_sets for every user holding the owner role
--              so AuthContext sees god-mode immediately on first login
--              post-migration without waiting on a UI click.
--
-- The four RPC short-circuit patches (my_permission_keys / get_my_capabilities /
-- compute_effective_perms / has_permission + has_permission_for) live in a
-- separate migration that needs the live RPC bodies pulled via Supabase MCP
-- (`pg_get_functiondef`) — see `2026-05-01_admin_god_mode_rpc_patches.sql`
-- for the skeleton + apply instructions.
--
-- Without those RPC patches the system still works for owner because:
--   - the owner already holds the admin role's permission_set, which already
--     grants every existing UI/feature key, AND
--   - the surface bypasses in Phases 2/5/7 short-circuit on
--     hasPermission('admin.god_mode') / auth.isGodMode at the route +
--     component level, which Phase 1's grant satisfies.
-- The RPC short-circuit is the cleaner long-term resolution (so the admin
-- permissions console shows granted_via='god_mode' attribution for any user
-- with the key, and so god-mode users see EVERY key in my_permission_keys
-- including ones their other grants would not surface). Apply it once the
-- live RPC bodies are pulled.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Catalog row.
-- Columns mirror the catalog shape used by 2026-04-28_newsroom_permission_keys.sql:
--   key, display_name, description, category, is_active, ui_section, deny_mode.
-- 'admin' category groups it next to other admin-tier keys; ui_section nullable.
-- deny_mode 'locked' so the standard lock-modal copy fires for non-holders.
-- ---------------------------------------------------------------------------
INSERT INTO public.permissions
  (key, display_name, description, category, is_active, ui_section, deny_mode)
VALUES
  ('admin.god_mode',
   'God mode',
   'Bypass every plan and permission gate.',
   'admin', true, 'admin_users', 'locked')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Singleton permission set.
-- Mirrors the system-set shape used by other rows in permission_sets. We only
-- set columns we know exist in every shape this repo has shipped: key + name.
-- description is optional in some shapes; include via NULLS-tolerant insert.
-- ---------------------------------------------------------------------------
INSERT INTO public.permission_sets (key, name)
VALUES ('god_mode', 'God Mode (full bypass)')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Link the set to the catalog key.
-- permission_set_perms(permission_set_id, permission_id) — confirmed shape
-- per 2026-04-28_newsroom_permission_keys.sql.
-- ---------------------------------------------------------------------------
INSERT INTO public.permission_set_perms (permission_set_id, permission_id)
SELECT ps.id, p.id
FROM public.permission_sets ps
CROSS JOIN public.permissions p
WHERE ps.key = 'god_mode' AND p.key = 'admin.god_mode'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Auto-grant the god_mode set to the owner role.
-- role_permission_sets(role_id, permission_set_id) — schema convention.
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permission_sets (role_id, permission_set_id)
SELECT r.id, ps.id
FROM public.roles r
CROSS JOIN public.permission_sets ps
WHERE r.name = 'owner' AND ps.key = 'god_mode'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Backfill user_permission_sets for every user currently holding the
-- owner role so AuthContext sees god-mode on the very next session refresh.
-- The role grant alone is enough for resolvers that walk roles → sets →
-- perms, but seeding user_permission_sets directly insulates owner from any
-- resolver that only consults user_permission_sets (which the per-user UI in
-- 11b will write to anyway).
-- user_roles(user_id, role_id) is the existing membership table; if it's
-- absent in this schema, the SELECT returns 0 rows and the INSERT is a
-- no-op rather than failing.
-- ---------------------------------------------------------------------------
INSERT INTO public.user_permission_sets (user_id, permission_set_id)
SELECT ur.user_id, ps.id
FROM public.user_roles ur
JOIN public.roles r ON r.id = ur.role_id
CROSS JOIN public.permission_sets ps
WHERE r.name = 'owner' AND ps.key = 'god_mode'
ON CONFLICT DO NOTHING;

COMMIT;
