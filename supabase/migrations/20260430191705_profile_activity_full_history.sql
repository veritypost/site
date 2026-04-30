-- Q1: add profile.activity.full_history permission key.
-- Free users hold profile.activity only (30-day view).
-- Pro/expert/admin/editor/moderator/family hold both keys (full history).

INSERT INTO permissions (key, display_name, description, category, sort_order)
VALUES ('profile.activity.full_history', 'Full activity history (all time)', 'Full reading history (all time)', 'ui', 31)
ON CONFLICT (key) DO NOTHING;

INSERT INTO permission_set_perms (permission_set_id, permission_id)
SELECT ps.id, p.id
FROM permission_sets ps
CROSS JOIN permissions p
WHERE ps.key IN ('pro', 'expert', 'admin', 'editor', 'moderator', 'family')
  AND p.key = 'profile.activity.full_history'
ON CONFLICT DO NOTHING;
