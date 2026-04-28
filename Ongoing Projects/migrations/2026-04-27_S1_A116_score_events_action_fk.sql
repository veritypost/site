-- S1-A116 — score_events.action: add FK to score_rules.action
--
-- score_events.action (varchar) records which scoring rule triggered an event
-- but has no FK constraint. score_rules.action already has UNIQUE (confirmed
-- 2026-04-27: constraint score_rules_action_key). Orphan check: 0 score_events
-- rows reference an action not in score_rules (verified 2026-04-27).
--
-- The constraint prevents inserting score_events for undefined rule names,
-- which would silently corrupt leaderboard queries that JOIN on action.
--
-- ON DELETE RESTRICT: if a rule is ever removed, we need to decide whether
-- to keep or purge the historical events — RESTRICT forces that decision.
--
-- Acceptance: pg_constraint contains fk_score_events_action for score_events.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='public.score_events'::regclass
       AND conname='fk_score_events_action'
  ) THEN
    RAISE NOTICE 'S1-A116 no-op: FK already present';
  END IF;
  -- Orphan guard: abort if any score_events.action has no matching rule.
  IF EXISTS (
    SELECT 1 FROM score_events se
     WHERE NOT EXISTS (SELECT 1 FROM score_rules sr WHERE sr.action = se.action)
       AND se.action IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'S1-A116 abort: orphan score_events.action values found — resolve before adding FK';
  END IF;
END $$;

ALTER TABLE public.score_events
  ADD CONSTRAINT fk_score_events_action
  FOREIGN KEY (action) REFERENCES public.score_rules(action)
  ON DELETE RESTRICT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='public.score_events'::regclass
       AND conname='fk_score_events_action'
  ) THEN
    RAISE EXCEPTION 'S1-A116 post-check failed: fk_score_events_action not found';
  END IF;
  RAISE NOTICE 'S1-A116 applied: score_events.action → score_rules.action FK added';
END $$;

COMMIT;
