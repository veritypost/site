-- directory_permissions
--
-- Five-step idempotent seed for the new /directory surface gating:
--   1. Introduce a new `verity` permission set so the Verity tier has
--      a home for its perks (currently verity_monthly + verity_annual
--      plans map to NULL — orphan-plan hazard).
--   2. Insert 4 new ui-category permission keys for directory features.
--   3. Attach the two "verity-and-up" keys to {verity, pro, family}.
--   4. Attach the two "pro-and-up" keys to {pro, family}.
--   5. Map verity_monthly + verity_annual plans to {free, verity},
--      mirroring the verity_pro_* → {free, pro} pattern.
--
-- Re-running is a no-op: every INSERT is ON CONFLICT DO NOTHING. The
-- set-perm and plan-set joins use SELECT/INSERT patterns so missing
-- target rows simply produce zero inserts rather than errors.

-- ---------------------------------------------------------------------------
-- 1. New `verity` permission set (mirrors `pro` / `family` pattern).
-- ---------------------------------------------------------------------------
INSERT INTO public.permission_sets (key, display_name, is_system, is_active, is_kids_set)
VALUES ('verity', 'Verity', TRUE, TRUE, FALSE)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Four new directory permission keys (category='ui', deny_mode='locked').
-- ---------------------------------------------------------------------------
INSERT INTO public.permissions (
  key, display_name, description, category, is_active, deny_mode, sort_order
) VALUES
  (
    'directory.sort_trending',
    E'Directory: Trending sort',
    E'Sort the Directory article list by trending (7-day view_count) instead of latest.',
    'ui', TRUE, 'locked', 200
  ),
  (
    'directory.expert_depth',
    E'Directory: Expert coverage tooltip',
    E'See the list of experts covering a story and follow them all from the Directory.',
    'ui', TRUE, 'locked', 201
  ),
  (
    'directory.advanced_filters',
    E'Directory: Advanced filters',
    E'Filter Directory articles by date range, source, and expert.',
    'ui', TRUE, 'locked', 202
  ),
  (
    'directory.alerts_subcategory',
    E'Directory: Subcategory alerts',
    E'Subscribe to notifications when new articles publish in a Directory subcategory.',
    'ui', TRUE, 'locked', 203
  )
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Attach `directory.sort_trending` + `directory.expert_depth` to
--    {verity, pro, family}.
-- ---------------------------------------------------------------------------
INSERT INTO public.permission_set_perms (permission_set_id, permission_id)
SELECT ps.id, p.id
FROM public.permission_sets ps, public.permissions p
WHERE p.key IN ('directory.sort_trending', 'directory.expert_depth')
  AND ps.key IN ('verity', 'pro', 'family')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Attach `directory.advanced_filters` + `directory.alerts_subcategory`
--    to {pro, family}.
-- ---------------------------------------------------------------------------
INSERT INTO public.permission_set_perms (permission_set_id, permission_id)
SELECT ps.id, p.id
FROM public.permission_sets ps, public.permissions p
WHERE p.key IN ('directory.advanced_filters', 'directory.alerts_subcategory')
  AND ps.key IN ('pro', 'family')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Map verity_monthly + verity_annual plans to {free, verity}. This
--    fixes the orphan-plan hazard (both plans currently map to no
--    permission set, so paying subscribers receive zero perks).
-- ---------------------------------------------------------------------------
INSERT INTO public.plan_permission_sets (plan_id, permission_set_id)
SELECT pl.id, ps.id
FROM public.plans pl, public.permission_sets ps
WHERE pl.name IN ('verity_monthly', 'verity_annual')
  AND ps.key IN ('free', 'verity')
ON CONFLICT DO NOTHING;

-- Zombie verity_perks + verity_pro_perks cleanup considered (2026-05-13 panel)
-- but dropped before apply: guard_system_permissions trigger refuses DELETE on
-- system rows and refuses key renames; the trigger's prescribed retirement is
-- is_active=false, which both zombies already satisfy. They also carry zero
-- permission_set_perms attachments (MCP-verified), so reactivating one would
-- grant nothing — the reactivation footgun is fangless. If a future cleanup
-- truly wants the rows gone, it must SET LOCAL app.allow_system_perm_edits =
-- 'true' inside its own transaction and be deliberate about it.
