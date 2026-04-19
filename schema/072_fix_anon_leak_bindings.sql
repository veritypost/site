-- 072_fix_anon_leak_bindings.sql
-- Migration: 20260418230241 fix_anon_leak_bindings
--
-- Fix 4 permission-set binding leaks where the anon set over-grants permissions.
-- The anon set is inherited by every signed-in role, so anything granted to anon
-- leaks to every user. This migration fixes the intended gating for 4 keys.

-- =========================================================================
-- 1) article.ad_slot.view.paid
--    "The paid ad slot" - should not be visible to free/anon
--    Target: remove from anon; keep pro; add family, expert, admin, owner
-- =========================================================================
DELETE FROM permission_set_perms
WHERE permission_set_id = (SELECT id FROM permission_sets WHERE key='anon')
  AND permission_id = (SELECT id FROM permissions WHERE key='article.ad_slot.view.paid');

INSERT INTO permission_set_perms(permission_set_id, permission_id)
SELECT ps.id, p.id FROM permission_sets ps, permissions p
WHERE ps.key='family' AND p.key='article.ad_slot.view.paid'
ON CONFLICT DO NOTHING;

INSERT INTO permission_set_perms(permission_set_id, permission_id)
SELECT ps.id, p.id FROM permission_sets ps, permissions p
WHERE ps.key='expert' AND p.key='article.ad_slot.view.paid'
ON CONFLICT DO NOTHING;

INSERT INTO permission_set_perms(permission_set_id, permission_id)
SELECT ps.id, p.id FROM permission_sets ps, permissions p
WHERE ps.key='admin' AND p.key='article.ad_slot.view.paid'
ON CONFLICT DO NOTHING;

INSERT INTO permission_set_perms(permission_set_id, permission_id)
SELECT ps.id, p.id FROM permission_sets ps, permissions p
WHERE ps.key='owner' AND p.key='article.ad_slot.view.paid'
ON CONFLICT DO NOTHING;

-- =========================================================================
-- 2) article.editorial_cost.view
--    Internal cost data - editorial staff only
--    Target: remove from anon; keep only editor, moderator, admin, owner
-- =========================================================================
DELETE FROM permission_set_perms
WHERE permission_set_id = (SELECT id FROM permission_sets WHERE key='anon')
  AND permission_id = (SELECT id FROM permissions WHERE key='article.editorial_cost.view');

INSERT INTO permission_set_perms(permission_set_id, permission_id)
SELECT ps.id, p.id FROM permission_sets ps, permissions p
WHERE ps.key='editor' AND p.key='article.editorial_cost.view'
ON CONFLICT DO NOTHING;

INSERT INTO permission_set_perms(permission_set_id, permission_id)
SELECT ps.id, p.id FROM permission_sets ps, permissions p
WHERE ps.key='moderator' AND p.key='article.editorial_cost.view'
ON CONFLICT DO NOTHING;

INSERT INTO permission_set_perms(permission_set_id, permission_id)
SELECT ps.id, p.id FROM permission_sets ps, permissions p
WHERE ps.key='admin' AND p.key='article.editorial_cost.view'
ON CONFLICT DO NOTHING;

INSERT INTO permission_set_perms(permission_set_id, permission_id)
SELECT ps.id, p.id FROM permission_sets ps, permissions p
WHERE ps.key='owner' AND p.key='article.editorial_cost.view'
ON CONFLICT DO NOTHING;

-- =========================================================================
-- 3) article.other_scores.view
--    Paid analytics
--    Target: remove from anon; keep pro; add family, expert, admin, owner
-- =========================================================================
DELETE FROM permission_set_perms
WHERE permission_set_id = (SELECT id FROM permission_sets WHERE key='anon')
  AND permission_id = (SELECT id FROM permissions WHERE key='article.other_scores.view');

INSERT INTO permission_set_perms(permission_set_id, permission_id)
SELECT ps.id, p.id FROM permission_sets ps, permissions p
WHERE ps.key='family' AND p.key='article.other_scores.view'
ON CONFLICT DO NOTHING;

INSERT INTO permission_set_perms(permission_set_id, permission_id)
SELECT ps.id, p.id FROM permission_sets ps, permissions p
WHERE ps.key='expert' AND p.key='article.other_scores.view'
ON CONFLICT DO NOTHING;

INSERT INTO permission_set_perms(permission_set_id, permission_id)
SELECT ps.id, p.id FROM permission_sets ps, permissions p
WHERE ps.key='admin' AND p.key='article.other_scores.view'
ON CONFLICT DO NOTHING;

INSERT INTO permission_set_perms(permission_set_id, permission_id)
SELECT ps.id, p.id FROM permission_sets ps, permissions p
WHERE ps.key='owner' AND p.key='article.other_scores.view'
ON CONFLICT DO NOTHING;

-- =========================================================================
-- 4) profile.categories + profile.header_stats
--    Public profile display - everyone sees them. Keep ONLY anon; anon-to-role
--    inheritance is the single source of grant. Redundant per-set grants are noise.
-- =========================================================================
DELETE FROM permission_set_perms
WHERE permission_id = (SELECT id FROM permissions WHERE key='profile.categories')
  AND permission_set_id <> (SELECT id FROM permission_sets WHERE key='anon');

DELETE FROM permission_set_perms
WHERE permission_id = (SELECT id FROM permissions WHERE key='profile.header_stats')
  AND permission_set_id <> (SELECT id FROM permission_sets WHERE key='anon');

-- Idempotent insurance: ensure anon still has these (public)
INSERT INTO permission_set_perms(permission_set_id, permission_id)
SELECT ps.id, p.id FROM permission_sets ps, permissions p
WHERE ps.key='anon' AND p.key='profile.categories'
ON CONFLICT DO NOTHING;

INSERT INTO permission_set_perms(permission_set_id, permission_id)
SELECT ps.id, p.id FROM permission_sets ps, permissions p
WHERE ps.key='anon' AND p.key='profile.header_stats'
ON CONFLICT DO NOTHING;

-- =========================================================================
-- Bump perms global version so effective-perms caches invalidate.
-- =========================================================================
UPDATE perms_global_version SET version = version + 1, bumped_at = now();
