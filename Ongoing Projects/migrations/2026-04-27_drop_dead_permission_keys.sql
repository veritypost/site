-- T4.1 — Drop 7 dead permission keys (zero callers across web/ + VerityPost/ + VerityPostKids/).
--
-- Verified 2026-04-27 via grep across .ts / .tsx / .swift / .sql:
--   kids.bookmark.add               — zero callers
--   kids.bookmarks.add              — zero callers
--   kids.streak.use_freeze          — zero callers (live key is `kids.streak.freeze.use`)
--   kids.leaderboard.global_opt_in  — zero callers
--   kids.leaderboard.global.opt_in  — zero callers
--   kids.streak.view_own            — zero callers
--   kids.streaks.view_own           — zero callers
--
-- The `guard_system_permissions` trigger refuses DELETE on permissions
-- by default; it honors `app.allow_system_perm_edits=true` GUC as an
-- escape hatch. We set it LOCAL so the bypass is scoped to this txn.
-- 15 dependent permission_set_perms FK rows are removed first.

BEGIN;
SET LOCAL app.allow_system_perm_edits = 'true';

-- 1. Remove FK references in permission_set_perms.
DELETE FROM public.permission_set_perms
WHERE permission_id IN (
  SELECT id FROM public.permissions
  WHERE key IN (
    'kids.bookmark.add',
    'kids.bookmarks.add',
    'kids.streak.use_freeze',
    'kids.leaderboard.global_opt_in',
    'kids.leaderboard.global.opt_in',
    'kids.streak.view_own',
    'kids.streaks.view_own'
  )
);

-- 2. Drop the dead permission rows.
DELETE FROM public.permissions
WHERE key IN (
  'kids.bookmark.add',
  'kids.bookmarks.add',
  'kids.streak.use_freeze',
  'kids.leaderboard.global_opt_in',
  'kids.leaderboard.global.opt_in',
  'kids.streak.view_own',
  'kids.streaks.view_own'
);

-- 3. Verify zero remain.
DO $$
DECLARE
  remaining int;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM public.permissions
  WHERE key IN (
    'kids.bookmark.add',
    'kids.bookmarks.add',
    'kids.streak.use_freeze',
    'kids.leaderboard.global_opt_in',
    'kids.leaderboard.global.opt_in',
    'kids.streak.view_own',
    'kids.streaks.view_own'
  );
  IF remaining > 0 THEN
    RAISE EXCEPTION 'T4.1 abort: % dead permission rows still present', remaining;
  END IF;
  RAISE NOTICE 'T4.1 applied: 7 dead permission keys removed';
END $$;

COMMIT;
