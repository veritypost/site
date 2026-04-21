-- 111_rollback_parallel_score_ledger.sql
--
-- Correction for a mistake shipped in schema/109. I wrote a parallel
-- "verity_score_events" ledger + quiz-attempts trigger without
-- realizing the codebase already has a mature scoring system backed
-- by `score_events` + `score_rules` + `award_points()` + per-event
-- RPCs (score_on_quiz_submit, score_on_reading_complete,
-- score_on_comment_post — see schema/022_phase14_scoring.sql).
--
-- Net effect of 109: every quiz pass was credited twice — once by
-- the legacy app path (award_points → score_events → updates
-- users.verity_score via award_points' internal logic) and once by
-- my trigger calling increment_verity_score with a fallback 10
-- points. Impact is small if you caught it quickly; proportional to
-- quiz passes completed between when 109 applied and this rolls back.
--
-- This migration:
--   1. Drops the quiz_attempts trigger + its function.
--   2. Subtracts the double-credit from users.verity_score for
--      every user who had increment_verity_score fire against them
--      since 109 applied. Uses verity_score_events.source='quiz_pass'
--      rows (NOT 'backfill_initial') as the record of the bad writes.
--   3. Drops increment_verity_score and reconcile_verity_scores.
--   4. Drops verity_score_events.
--   5. Adds a correct reconciliation function keyed on the real
--      ledger (score_events), so admin ops can still audit drift.
--
-- Apply with: Supabase SQL Editor → paste → run. Idempotent.

BEGIN;

-- =========================================================================
-- 1. Drop the parallel trigger + function before it can fire again
-- =========================================================================

DROP TRIGGER IF EXISTS quiz_attempt_score ON public.quiz_attempts;
DROP FUNCTION IF EXISTS public.on_quiz_attempt_score();

-- =========================================================================
-- 2. Corrective cleanup — undo the double-credit
-- =========================================================================

-- For every user who had a quiz_pass row in the parallel ledger, the
-- legacy path ALSO credited them. Subtract the parallel delta so
-- users.verity_score reflects only the legacy-path total.
--
-- Safe-guarded with a floor at 0 so we never push a score negative
-- (in case legacy path credited less than the parallel trigger did —
-- unlikely, since the parallel trigger's flat 10 points was usually
-- MORE than the legacy rule).
DO $cleanup$
DECLARE
  r record;
  v_new_score int;
BEGIN
  -- Only run cleanup if the table still exists (idempotent).
  IF EXISTS (
    SELECT 1 FROM pg_tables
     WHERE schemaname = 'public' AND tablename = 'verity_score_events'
  ) THEN
    FOR r IN
      SELECT user_id, SUM(delta)::int AS total_double_credit
        FROM public.verity_score_events
       WHERE source = 'quiz_pass'
       GROUP BY user_id
    LOOP
      -- Unlock the guarded UPDATE path. (Guard trigger isn't live yet,
      -- but harmless to set the GUC anyway.)
      PERFORM set_config('vp.allow_score_update', 'true', true);
      UPDATE public.users
         SET verity_score = GREATEST(0, verity_score - r.total_double_credit)
       WHERE id = r.user_id;
      PERFORM set_config('vp.allow_score_update', 'false', true);

      RAISE NOTICE 'rollback: user % had % parallel quiz_pass points removed',
                   r.user_id, r.total_double_credit;
    END LOOP;
  END IF;
END
$cleanup$;

-- =========================================================================
-- 3. Drop the parallel-ledger objects
-- =========================================================================

DROP FUNCTION IF EXISTS public.increment_verity_score(uuid, text, int, uuid, jsonb);
DROP FUNCTION IF EXISTS public.reconcile_verity_scores();
DROP TABLE    IF EXISTS public.verity_score_events CASCADE;

-- =========================================================================
-- 4. Correct reconciliation — uses the REAL ledger (score_events)
-- =========================================================================

-- Drift between users.verity_score and the sum of their score_events.
-- Empty result = clean. Wire to a nightly cron + alert when you're ready.
CREATE OR REPLACE FUNCTION public.reconcile_verity_scores()
RETURNS TABLE (
  user_id        uuid,
  current_score  int,
  ledger_sum     int,
  drift          int
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    u.id,
    u.verity_score,
    COALESCE(SUM(se.points), 0)::int,
    (u.verity_score - COALESCE(SUM(se.points), 0))::int
  FROM public.users u
  LEFT JOIN public.score_events se ON se.user_id = u.id
  GROUP BY u.id, u.verity_score
  HAVING u.verity_score <> COALESCE(SUM(se.points), 0);
$$;

COMMENT ON FUNCTION public.reconcile_verity_scores IS
  'Returns rows where users.verity_score doesn''t match the sum of '
  'score_events.points for that user. Empty result = clean. '
  'score_events is written by award_points(); see schema/022.';

COMMIT;
