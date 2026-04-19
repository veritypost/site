-- 090_fix_round8_permission_drift_2026_04_19.sql
-- Migration: 20260419141342 fix_round8_permission_drift_2026_04_19
--
-- ============================================================
-- Round 8 permission drift fixes
-- Idempotent. See 05-Working/PERMISSION_MIGRATION.md Round 8
-- ============================================================

-- 1. Reactivate profile.activity.view.own and bind to all tiers
UPDATE permissions
   SET is_active = true
 WHERE key = 'profile.activity.view.own';

WITH perm AS (
  SELECT id FROM permissions WHERE key = 'profile.activity.view.own'
),
sets AS (
  SELECT id FROM permission_sets
   WHERE key IN ('free','pro','family','expert','moderator','editor','admin','owner')
)
INSERT INTO permission_set_perms (permission_set_id, permission_id)
SELECT sets.id, perm.id FROM sets CROSS JOIN perm
ON CONFLICT (permission_set_id, permission_id) DO NOTHING;

-- 2. ios.* / supervisor.* binding fixes

WITH perm AS (SELECT id FROM permissions WHERE key = 'ios.article.share_sheet'),
sets AS (SELECT id FROM permission_sets WHERE key IN ('free','pro','family','expert','moderator','editor','admin','owner'))
INSERT INTO permission_set_perms (permission_set_id, permission_id)
SELECT sets.id, perm.id FROM sets CROSS JOIN perm
ON CONFLICT (permission_set_id, permission_id) DO NOTHING;

WITH perm AS (SELECT id FROM permissions WHERE key = 'ios.bookmarks.view'),
sets AS (SELECT id FROM permission_sets WHERE key IN ('free','pro','family','expert','moderator','editor','admin','owner'))
INSERT INTO permission_set_perms (permission_set_id, permission_id)
SELECT sets.id, perm.id FROM sets CROSS JOIN perm
ON CONFLICT (permission_set_id, permission_id) DO NOTHING;

WITH perm AS (SELECT id FROM permissions WHERE key = 'ios.iap.manage_subscription'),
sets AS (SELECT id FROM permission_sets WHERE key IN ('free','pro','family','expert','moderator','editor','admin','owner'))
INSERT INTO permission_set_perms (permission_set_id, permission_id)
SELECT sets.id, perm.id FROM sets CROSS JOIN perm
ON CONFLICT (permission_set_id, permission_id) DO NOTHING;

WITH perm AS (SELECT id FROM permissions WHERE key = 'ios.profile.view.public'),
sets AS (SELECT id FROM permission_sets WHERE key IN ('anon','free','pro','family','expert','moderator','editor','admin','owner'))
INSERT INTO permission_set_perms (permission_set_id, permission_id)
SELECT sets.id, perm.id FROM sets CROSS JOIN perm
ON CONFLICT (permission_set_id, permission_id) DO NOTHING;

WITH perm AS (SELECT id FROM permissions WHERE key = 'settings.supervisor.view'),
sets AS (SELECT id FROM permission_sets WHERE key IN ('pro','family','expert','moderator','editor','admin','owner'))
INSERT INTO permission_set_perms (permission_set_id, permission_id)
SELECT sets.id, perm.id FROM sets CROSS JOIN perm
ON CONFLICT (permission_set_id, permission_id) DO NOTHING;

WITH perm AS (SELECT id FROM permissions WHERE key = 'supervisor.categories.view'),
sets AS (SELECT id FROM permission_sets WHERE key IN ('pro','family','expert','moderator','editor','admin','owner'))
INSERT INTO permission_set_perms (permission_set_id, permission_id)
SELECT sets.id, perm.id FROM sets CROSS JOIN perm
ON CONFLICT (permission_set_id, permission_id) DO NOTHING;

WITH perm AS (SELECT id FROM permissions WHERE key = 'supervisor.eligibility.view'),
sets AS (SELECT id FROM permission_sets WHERE key IN ('pro','family','expert','moderator','editor','admin','owner'))
INSERT INTO permission_set_perms (permission_set_id, permission_id)
SELECT sets.id, perm.id FROM sets CROSS JOIN perm
ON CONFLICT (permission_set_id, permission_id) DO NOTHING;

-- 3. Duplicate key pairs
UPDATE permissions
   SET is_active = false
 WHERE key = 'billing.stripe.portal'
   AND is_active = true;

UPDATE permissions
   SET is_active = false
 WHERE key = 'kids.streak.use_freeze'
   AND is_active = true;

UPDATE permissions
   SET is_active = false
 WHERE key IN ('kids.leaderboard.global_opt_in','kids.leaderboard.global.opt_in')
   AND is_active = true;

WITH perm AS (SELECT id FROM permissions WHERE key = 'profile.achievements.view.own'),
sets AS (SELECT id FROM permission_sets WHERE key IN ('free','pro','family','expert','moderator','editor','admin','owner'))
INSERT INTO permission_set_perms (permission_set_id, permission_id)
SELECT sets.id, perm.id FROM sets CROSS JOIN perm
ON CONFLICT (permission_set_id, permission_id) DO NOTHING;

WITH perm AS (SELECT id FROM permissions WHERE key = 'profile.achievements.view.other'),
sets AS (SELECT id FROM permission_sets WHERE key IN ('free','pro','family','expert','moderator','editor','admin','owner'))
INSERT INTO permission_set_perms (permission_set_id, permission_id)
SELECT sets.id, perm.id FROM sets CROSS JOIN perm
ON CONFLICT (permission_set_id, permission_id) DO NOTHING;

WITH perm AS (SELECT id FROM permissions WHERE key = 'home.breaking_banner.view'),
sets AS (SELECT id FROM permission_sets WHERE key IN ('free','pro','family','expert','moderator','editor'))
INSERT INTO permission_set_perms (permission_set_id, permission_id)
SELECT sets.id, perm.id FROM sets CROSS JOIN perm
ON CONFLICT (permission_set_id, permission_id) DO NOTHING;

UPDATE perms_global_version
   SET version = version + 1,
       bumped_at = now()
 WHERE id = 1;
