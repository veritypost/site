-- 144_articles_hero_pick.sql
--
-- Adds the Phase-1 hero-pick mechanism for the rebuilt home page
-- (Future Projects/09_HOME_FEED_REBUILD.md, staged version).
--
-- Date-typed (not boolean) so the flag auto-clears via date semantics —
-- no midnight cron needed. The home page renders today's hero by matching
-- `hero_pick_for_date = today_in_editorial_tz` (America/New_York).
--
-- BRIDGE NOTE: this is a Phase-1 proxy for the `front_page_state` table
-- described in Future Projects/09_HOME_FEED_REBUILD.md and
-- Future Projects/05_EDITOR_SYSTEM.md. When the editor system ships
-- (multi-editor shifts + slot rotation), migrate to `front_page_state`
-- and drop these columns. Until then: this is the source of truth for
-- the hero slot. Do NOT build new features against these columns.

BEGIN;

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS hero_pick_for_date DATE NULL,
  ADD COLUMN IF NOT EXISTS hero_pick_set_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hero_pick_set_at timestamptz NULL;

COMMENT ON COLUMN public.articles.hero_pick_for_date IS
  'Editorial flag — when this date matches today in editorial TZ (America/New_York), the article surfaces as the hero on the home page. Auto-clears via date semantics; no cron needed. Phase-1 proxy for front_page_state per Future Projects/09_HOME_FEED_REBUILD.md.';

COMMENT ON COLUMN public.articles.hero_pick_set_by IS
  'User ID of the editor/owner who flagged this article as hero pick. Audit trail for the human-curation Charter Commitment.';

COMMENT ON COLUMN public.articles.hero_pick_set_at IS
  'When the hero pick was last set or unset (null when never set or after clear).';

-- Partial index optimised for the home-page query: "is this article today's hero?"
-- WHERE clause filters out null + non-published rows, so the index stays tiny.
-- For a small `articles` table this CREATE INDEX takes a brief exclusive lock;
-- if the table has grown to millions of rows by apply time, owner can convert
-- to `CREATE INDEX CONCURRENTLY` (which can't run inside this transaction —
-- comment out the BEGIN/COMMIT and run the CONCURRENTLY form standalone).
CREATE INDEX IF NOT EXISTS idx_articles_hero_pick_today
  ON public.articles (hero_pick_for_date)
  WHERE hero_pick_for_date IS NOT NULL AND status = 'published';

COMMIT;
