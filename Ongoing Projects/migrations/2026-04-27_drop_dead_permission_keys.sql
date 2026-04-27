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
-- Owner applies via SQL editor.

DELETE FROM permissions
WHERE key IN (
  'kids.bookmark.add',
  'kids.bookmarks.add',
  'kids.streak.use_freeze',
  'kids.leaderboard.global_opt_in',
  'kids.leaderboard.global.opt_in',
  'kids.streak.view_own',
  'kids.streaks.view_own'
);
