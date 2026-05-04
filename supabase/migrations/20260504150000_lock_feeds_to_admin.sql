-- Lock /admin/feeds to admin/owner only.
-- Editors do NOT curate sources per owner decision (2026-05-04).
-- Page guard at web/src/app/admin/feeds/page.tsx already gated on owner|admin
-- role names; this migration aligns the API permission to match.

DELETE FROM permission_set_perms
WHERE permission_id = (SELECT id FROM permissions WHERE key = 'admin.feeds.manage')
  AND permission_set_id = (SELECT id FROM permission_sets WHERE key = 'editor');
