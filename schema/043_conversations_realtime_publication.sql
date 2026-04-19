-- 043_conversations_realtime_publication.sql
-- Adds `conversations` to supabase_realtime so the UPDATE channel wired in
-- Pass-2 Task-10 (web) and Pass-4 Task-44 (iOS) stops being a silent noop.
-- Observable symptom pre-apply: when a counterparty sends a new DM, the list
-- preview + timestamp stay stale until next full reload. Unread pill still
-- updates via the cross-convo `messages` INSERT channel (Pass-4 Task-45), so
-- the gap is polish-only, not functional.
-- Mirrors the DO-block pattern in reset_and_rebuild_v2.sql:6487-6500.

BEGIN;

DO $$ BEGIN
  PERFORM 1 FROM pg_publication WHERE pubname = 'supabase_realtime';
  IF FOUND THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Already a member, or publication doesn't exist on non-Supabase Postgres. Safe to ignore.
  NULL;
END $$;

COMMIT;
