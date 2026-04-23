-- 132_trigger_reading_log_score.sql
-- Migration: 20260422_trigger_reading_log_score
--
-- Y2 / #67: route kids iOS reading_log inserts through scoring + streak.
--
-- Background. The kids iOS app (`VerityPostKids/KidReaderView.swift`)
-- inserts directly into `reading_log` using the kid JWT — it never
-- POSTs to `/api/stories/read`, so the existing scoring path
-- (route → `score_on_reading_complete` → `advance_streak`) is bypassed
-- for every kid read. Result: kid streaks never advance, kid
-- `read_article` points are never granted, kid achievements never
-- unlock. The adult web reader and adult iOS reader both DO call the
-- API route, so they're already wired.
--
-- Option A (chosen): a Postgres AFTER INSERT trigger on `reading_log`
-- that fires when `completed = true` and dispatches to
-- `score_on_reading_complete` with the right subject. This makes the
-- DB the single source of truth for "completed reads get scored" —
-- adults, kids, future ingestion paths, and any backfill all flow
-- through the same gate. We considered Option B (a parallel
-- `/api/kids/stories/read` route) but rejected it: it duplicates
-- scoring logic in the application layer, requires a synchronous iOS
-- release to ship, and leaves direct-DB inserts (admin tools, future
-- importers) silently un-scored. A trigger is the architecturally
-- clean answer.
--
-- Subject resolution.
--   - Adult row: NEW.kid_profile_id IS NULL, NEW.user_id IS NOT NULL.
--     Pass (user_id, NULL, article_id, id).
--   - Kid row:   NEW.kid_profile_id IS NOT NULL. NEW.user_id may be
--     NULL (the kid JWT INSERT policy 096 allows that) or the parent
--     uuid. Either way, pass (NULL, kid_profile_id, article_id, id) —
--     `score_on_reading_complete` only uses p_user_id for the adult
--     branch, and `advance_streak` keys off p_kid_profile_id.
--
-- Idempotency.
--   - `score_on_reading_complete` writes via `award_points`, which is
--     deduped on (subject, action, source_type, source_id) — a re-INSERT
--     of the same reading_log id would no-op (different id, but same
--     award per article is capped by max_per_article=1 in score_rules
--     for `read_article`).
--   - The trigger only fires on completed=true. The web route (adult
--     path) also calls `score_on_reading_complete` directly — that's a
--     duplicate award attempt for adult web reads, but `award_points`
--     dedupes on source_id (the reading_log row id), so the second call
--     returns awarded=false. No double-award risk.
--   - Trigger uses BEGIN/EXCEPTION WHEN OTHERS to swallow scoring
--     failures: a DB-side scoring bug must NEVER block the
--     read-completion write itself (the read happened, it gets logged).
--
-- Trigger definition is SECURITY DEFINER so it runs with the table
-- owner's privileges (matches `score_on_reading_complete`'s SECURITY
-- DEFINER body — both are server-side bookkeeping, not user-scoped).

CREATE OR REPLACE FUNCTION public.tg_reading_log_score_on_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.completed IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Kid row: dispatch with kid subject. `score_on_reading_complete`
  -- ignores p_user_id when p_kid_profile_id is set, so NULL is safe.
  -- Adult row: dispatch with user subject.
  BEGIN
    IF NEW.kid_profile_id IS NOT NULL THEN
      PERFORM public.score_on_reading_complete(
        NULL::uuid, NEW.kid_profile_id, NEW.article_id, NEW.id
      );
    ELSIF NEW.user_id IS NOT NULL THEN
      PERFORM public.score_on_reading_complete(
        NEW.user_id, NULL::uuid, NEW.article_id, NEW.id
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Scoring failure must not block the read log itself. Surface to
    -- Postgres logs for ops; the row already wrote.
    RAISE WARNING 'tg_reading_log_score_on_complete: % %', SQLSTATE, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- AFTER INSERT — fire only when the new row arrived completed=true.
-- (Kids iOS always inserts completed=true; adult web inserts may flip
-- via UPDATE later, which is handled by the UPDATE trigger below.)
DROP TRIGGER IF EXISTS trg_reading_log_score_insert ON public.reading_log;
CREATE TRIGGER trg_reading_log_score_insert
  AFTER INSERT ON public.reading_log
  FOR EACH ROW
  WHEN (NEW.completed IS TRUE)
  EXECUTE FUNCTION public.tg_reading_log_score_on_complete();

-- AFTER UPDATE — fire when `completed` flips from false→true (the
-- adult web pattern: insert with completed=false, later UPDATE to true).
-- The web route also calls `score_on_reading_complete` directly on
-- that flip; the trigger duplicates that call, but the underlying
-- award_points dedupe on source_id makes the second call a no-op.
-- Keeping both paths means: if the route ever stops calling scoring
-- explicitly, the trigger still catches it.
DROP TRIGGER IF EXISTS trg_reading_log_score_update ON public.reading_log;
CREATE TRIGGER trg_reading_log_score_update
  AFTER UPDATE OF completed ON public.reading_log
  FOR EACH ROW
  WHEN (OLD.completed IS DISTINCT FROM NEW.completed AND NEW.completed IS TRUE)
  EXECUTE FUNCTION public.tg_reading_log_score_on_complete();

-- The trigger function is SECURITY DEFINER and called only from
-- triggers — no direct callers. Revoke from PUBLIC for hygiene.
REVOKE ALL ON FUNCTION public.tg_reading_log_score_on_complete() FROM PUBLIC;
