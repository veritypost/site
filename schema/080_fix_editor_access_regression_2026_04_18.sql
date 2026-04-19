-- 080_fix_editor_access_regression_2026_04_18.sql
-- Migration: 20260419003140 fix_editor_access_regression_2026_04_18
--
-- Phase 5 / Track P — restore editor hierarchy-based access that was lost
-- when Track M migrated `requireRole('editor')` call-sites to
-- `requirePermission(...)`. 10 admin.* keys were bound only to admin+owner;
-- editors used to reach these routes via the role-hierarchy level check
-- (editor=70 outranks moderator=60 but was blocked at admin=80 only where
-- the route used `requireRole('admin')`). Pre-migration these were
-- `requireRole('editor')` routes — editors had access. Post-migration they
-- bind to admin/owner-only keys. Binding editor explicitly restores parity.
--
-- Idempotent via ON CONFLICT DO NOTHING on (permission_set_id, permission_id) PK.

INSERT INTO permission_set_perms(permission_set_id, permission_id)
SELECT ps.id, p.id FROM permission_sets ps, permissions p
WHERE ps.key = 'editor' AND p.key = 'admin.expert.answers.approve'
ON CONFLICT DO NOTHING;

INSERT INTO permission_set_perms(permission_set_id, permission_id)
SELECT ps.id, p.id FROM permission_sets ps, permissions p
WHERE ps.key = 'editor' AND p.key = 'admin.expert.applications.approve'
ON CONFLICT DO NOTHING;

INSERT INTO permission_set_perms(permission_set_id, permission_id)
SELECT ps.id, p.id FROM permission_sets ps, permissions p
WHERE ps.key = 'editor' AND p.key = 'admin.expert.applications.reject'
ON CONFLICT DO NOTHING;

INSERT INTO permission_set_perms(permission_set_id, permission_id)
SELECT ps.id, p.id FROM permission_sets ps, permissions p
WHERE ps.key = 'editor' AND p.key = 'admin.expert.applications.view'
ON CONFLICT DO NOTHING;

INSERT INTO permission_set_perms(permission_set_id, permission_id)
SELECT ps.id, p.id FROM permission_sets ps, permissions p
WHERE ps.key = 'editor' AND p.key = 'admin.users.data_requests.view'
ON CONFLICT DO NOTHING;

INSERT INTO permission_set_perms(permission_set_id, permission_id)
SELECT ps.id, p.id FROM permission_sets ps, permissions p
WHERE ps.key = 'editor' AND p.key = 'admin.users.data_requests.process'
ON CONFLICT DO NOTHING;

INSERT INTO permission_set_perms(permission_set_id, permission_id)
SELECT ps.id, p.id FROM permission_sets ps, permissions p
WHERE ps.key = 'editor' AND p.key = 'admin.broadcasts.breaking.send'
ON CONFLICT DO NOTHING;

INSERT INTO permission_set_perms(permission_set_id, permission_id)
SELECT ps.id, p.id FROM permission_sets ps, permissions p
WHERE ps.key = 'editor' AND p.key = 'admin.articles.create'
ON CONFLICT DO NOTHING;

INSERT INTO permission_set_perms(permission_set_id, permission_id)
SELECT ps.id, p.id FROM permission_sets ps, permissions p
WHERE ps.key = 'editor' AND p.key = 'admin.articles.edit.any'
ON CONFLICT DO NOTHING;

INSERT INTO permission_set_perms(permission_set_id, permission_id)
SELECT ps.id, p.id FROM permission_sets ps, permissions p
WHERE ps.key = 'editor' AND p.key = 'admin.articles.delete'
ON CONFLICT DO NOTHING;

-- Bump global perms version so client caches re-fetch.
SELECT bump_perms_global_version();
