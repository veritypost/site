-- 068_round4_permission_key_cleanup.sql
-- Round 4 Track W - permission key cleanup + new key + duplicate deactivation.
-- Safe to re-run: INSERT ... ON CONFLICT DO NOTHING, UPDATE filtered by is_active.
-- Migration name: fix_round4_hygiene_2026_04_19

BEGIN;

-- 1. Create missing profile.expert.badge.view
-- Expert badge is a PUBLIC visibility concern; everyone who can view a profile
-- should see the badge. Bind to anon + every authenticated tier.
INSERT INTO public.permissions
  (key, display_name, description, category, ui_section, ui_element,
   requires_verified, is_public, is_active, sort_order)
VALUES
  ('profile.expert.badge.view',
   'View expert badge',
   'Render expert badge on public profile pages',
   'ui', 'profile', 'expert_badge',
   false, true, true, 50)
ON CONFLICT (key) DO NOTHING;

-- Bind to anon + every authenticated tier.
INSERT INTO public.permission_set_perms (permission_set_id, permission_id)
SELECT ps.id, p.id
FROM public.permission_sets ps
CROSS JOIN public.permissions p
WHERE p.key = 'profile.expert.badge.view'
  AND ps.key IN ('anon','free','pro','family','expert','moderator','editor','admin','owner')
ON CONFLICT DO NOTHING;

-- 2. Deactivate duplicates (five keys)
UPDATE public.permissions
SET is_active = false
WHERE is_active = true
  AND key IN (
    'billing.frozen.banner.view',     -- keep billing.frozen_banner.view
    'profile.activity.view',          -- keep profile.activity
    'profile.activity.view.own',      -- keep profile.activity
    'leaderboard.global.view',        -- keep leaderboard.view
    'leaderboard.global.full.view'    -- keep leaderboard.view
  );

-- 3. notifications.mark_read and notifications.mark_all_read already exist and
-- are bound to every authenticated tier. Defensive no-op insert for re-runs.
INSERT INTO public.permissions
  (key, display_name, description, category, ui_section, ui_element,
   requires_verified, is_public, is_active, sort_order)
VALUES
  ('notifications.mark_read',
   'Mark notification read',
   'Mark a single notification as read',
   'action', 'notifications', 'mark_read',
   false, false, true, 20),
  ('notifications.mark_all_read',
   'Mark all notifications read',
   'Bulk-mark notifications as read',
   'action', 'notifications', 'mark_all_read',
   false, false, true, 21)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_set_perms (permission_set_id, permission_id)
SELECT ps.id, p.id
FROM public.permission_sets ps
CROSS JOIN public.permissions p
WHERE p.key IN ('notifications.mark_read','notifications.mark_all_read')
  AND ps.key IN ('free','pro','family','expert','moderator','editor','admin','owner')
ON CONFLICT DO NOTHING;

-- 4. Bump perms_global_version so all clients refresh their capability cache.
UPDATE public.perms_global_version
SET version = version + 1,
    bumped_at = now()
WHERE id = 1;

COMMIT;
