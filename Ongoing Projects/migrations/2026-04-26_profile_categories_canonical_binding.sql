-- ===========================================================================
-- 2026-04-26 — profile.categories: align binding with the other two
--              canonical short-form profile permissions
-- ===========================================================================
--
-- WHY
-- ---
-- The three short-form "profile.*" tab permissions are intended (per CLAUDE.md
-- canonical guidance + the post-rollback shape of migration 143) to cover the
-- three Profile tabs: Activity, Categories, Achievements (Milestones).
--
-- MCP-verified live state on 2026-04-26:
--
--   permission key                       set bindings
--   ----------------------------------   --------------------------------
--   profile.activity                     admin, editor, expert, family,
--                                        free, moderator, owner, pro       (8)
--   profile.achievements                 admin, editor, expert, family,
--                                        free, moderator, owner, pro       (8)
--   profile.categories                   anon                              (1)  <-- drift
--
-- `profile.categories` is bound only to `anon`. The /profile route is
-- middleware-protected from anon, so the binding is a no-op for everyone:
-- nobody on web sees the Categories tab today. The drift was never noticed
-- because the tab just disappears quietly.
--
-- iOS uses an orphan key (`profile.score.view.own.categories`, bound to
-- admin/free/owner — 3 sets) which is the migration-142 leftover the 143
-- rollback was supposed to clean up. The platform divergence is real and
-- observable: a free user sees the Categories tab on iOS but not on web.
--
-- WHAT THIS MIGRATION DOES
-- ------------------------
-- 1. Bind `profile.categories` to the same 8 plan sets that already carry
--    `profile.activity` (the canonical pattern for short-form profile perms).
-- 2. Remove the `anon` binding (it's a no-op anyway, but its presence
--    invites future drift questions).
--
-- Net effect:
-- - Web Categories tab returns for every logged-in plan
-- - iOS code change (separate commit) switches to short-form `profile.categories`
--   so iOS uses the exact same binding source as web — full cross-platform parity
-- - Orphan key `profile.score.view.own.categories` is deletable in a follow-up
--   once iOS code change has shipped and the orphan stops being read
--
-- AFTER APPLYING
-- --------------
-- Bump `users.perms_version` so live sessions invalidate their 60s perms
-- cache and pick up the new binding on next refresh — no stale-perm window:
--
--     UPDATE users SET perms_version = perms_version + 1;
--
-- (Or use whatever bump RPC the resolver exposes — check
--  `web/src/lib/permissions.js` for the canonical bump path.)
--
-- ROLLBACK
-- --------
-- Single statement, restores prior state exactly:
--
--   DELETE FROM permission_set_perms
--   WHERE permission_id = (SELECT id FROM permissions WHERE key = 'profile.categories')
--     AND permission_set_id IN (
--       SELECT id FROM permission_sets
--       WHERE key IN ('admin','editor','expert','family','free','moderator','owner','pro')
--     );
--
--   INSERT INTO permission_set_perms (permission_id, permission_set_id)
--   SELECT
--     (SELECT id FROM permissions WHERE key = 'profile.categories'),
--     (SELECT id FROM permission_sets WHERE key = 'anon')
--   WHERE NOT EXISTS (
--     SELECT 1 FROM permission_set_perms
--     WHERE permission_id = (SELECT id FROM permissions WHERE key = 'profile.categories')
--       AND permission_set_id = (SELECT id FROM permission_sets WHERE key = 'anon')
--   );
--
-- VERIFICATION (run after apply)
-- ------------------------------
--   SELECT p.key, ps.key AS set_key
--   FROM permissions p
--   JOIN permission_set_perms psp ON psp.permission_id = p.id
--   JOIN permission_sets ps ON ps.id = psp.permission_set_id
--   WHERE p.key = 'profile.categories'
--   ORDER BY ps.key;
--
-- Expected result: 8 rows — admin, editor, expert, family, free, moderator,
-- owner, pro. No 'anon' row. Identical to running the same query for
-- 'profile.activity' or 'profile.achievements'.
-- ===========================================================================

BEGIN;

-- 1. Add the 8 canonical plan-set bindings, idempotent via NOT EXISTS so
--    re-running the migration after partial application is safe.
INSERT INTO permission_set_perms (permission_id, permission_set_id)
SELECT
  (SELECT id FROM permissions WHERE key = 'profile.categories'),
  ps.id
FROM permission_sets ps
WHERE ps.key IN ('admin', 'editor', 'expert', 'family', 'free', 'moderator', 'owner', 'pro')
  AND NOT EXISTS (
    SELECT 1 FROM permission_set_perms psp2
    WHERE psp2.permission_id = (SELECT id FROM permissions WHERE key = 'profile.categories')
      AND psp2.permission_set_id = ps.id
  );

-- 2. Remove the anon binding. Anon never reaches /profile (middleware blocks
--    the route), so this binding has been a no-op; removing it removes a
--    drift surface for future audits.
DELETE FROM permission_set_perms
WHERE permission_id = (SELECT id FROM permissions WHERE key = 'profile.categories')
  AND permission_set_id = (SELECT id FROM permission_sets WHERE key = 'anon');

COMMIT;

-- Then bump the perms version so live caches invalidate. Run separately
-- (the bump might be wrapped in a function on this DB):
--   UPDATE users SET perms_version = perms_version + 1;
