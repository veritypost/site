-- 075_fix_notifications_core_bindings.sql
-- Migration: 20260418232222 fix_notifications_core_bindings
--
-- Notifications core gates (inbox view + mark read + prefs) were only on
-- admin/owner, silently breaking the inbox for every signed-in non-admin
-- user. Mirror the pattern from fix_anon_leak_bindings / fix_article_reading_bindings:
-- bind to free+pro+family+expert (moderator/editor inherit via admin set
-- relationships where applicable).

INSERT INTO permission_set_perms (permission_set_id, permission_id)
SELECT ps.id, p.id
FROM permission_sets ps
CROSS JOIN permissions p
WHERE ps.key IN ('free','pro','family','expert','moderator','editor')
  AND p.key IN (
    'notifications.inbox.view',
    'notifications.mark_read',
    'notifications.mark_all_read',
    'notifications.dismiss',
    'notifications.prefs.view',
    'notifications.prefs.toggle_push',
    'notifications.prefs.toggle_in_app',
    'notifications.prefs.quiet_hours'
  )
ON CONFLICT DO NOTHING;

-- notifications.subscription.keyword was only on pro (not free). Free
-- users with the "keyword alerts" UI would silently fail. The AlertsView
-- gates the UI on this key so free users now see the section hidden,
-- but pro+ users should retain it. Add family+expert for completeness.
INSERT INTO permission_set_perms (permission_set_id, permission_id)
SELECT ps.id, p.id
FROM permission_sets ps
CROSS JOIN permissions p
WHERE ps.key IN ('family','expert','moderator','editor')
  AND p.key = 'notifications.subscription.keyword'
ON CONFLICT DO NOTHING;

-- Also add subscription.category / .subcategory / .unsubscribe to pro+
-- (free already has them, but higher tiers shouldn't lose them via role
-- override semantics).
INSERT INTO permission_set_perms (permission_set_id, permission_id)
SELECT ps.id, p.id
FROM permission_sets ps
CROSS JOIN permissions p
WHERE ps.key IN ('pro','family','expert','moderator','editor')
  AND p.key IN (
    'notifications.subscription.category',
    'notifications.subscription.subcategory',
    'notifications.subscription.unsubscribe'
  )
ON CONFLICT DO NOTHING;
