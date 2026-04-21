-- 109_verity_score_events.sql
-- Master-plan Phase E, commit #2.
--
-- The Verity Score is the product's spine. Hardening it to authoritative,
-- auditable, reconcilable:
--
--   * `verity_score_events` — append-only ledger. Every score change
--     records one row with delta, score_before, score_after, source,
--     source_ref.
--   * `increment_verity_score(user, source, delta, source_ref, metadata)`
--     RPC — the only supported path to change a user's score. Atomic
--     within a single transaction. Idempotent via unique (user, source,
--     source_ref).
--   * DB trigger on `quiz_attempts` — auto-credits score on quiz_pass.
--     Guarantees the score updates even if a future route forgets the
--     RPC call. The trigger is the only code path.
--   * `reconcile_verity_scores()` function — returns drift rows where
--     users.verity_score <> SUM(ledger.delta). Ops nightly cron pins
--     this to zero; any drift is a bug surface.
--   * Initial backfill row per user — lets the reconciliation query
--     return zero drift from day one.
--
-- Not in this commit (deliberate, layered in next):
--   * Guard trigger that blocks non-RPC updates to users.verity_score.
--     Adding it now would break every legacy direct-update call site.
--     Migrate those to the RPC first, THEN enable the guard. Stub is at
--     the bottom of this file, commented out.
--   * reading_log trigger — the read-completion scoring path. Pending
--     a confirm on the table's column shape.
--   * max_per_day rate limiting via score_rules — layered on once the
--     RPC is the sole caller and behavior is stable.
--
-- Apply with: Supabase SQL Editor → paste → run. Idempotent (all
-- CREATE-IF-NOT-EXISTS and DROP+CREATE where required).

BEGIN;

-- =========================================================================
-- 1. Ledger table
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.verity_score_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- e.g. 'quiz_pass', 'read_complete', 'streak_milestone',
  -- 'comment_upvoted', 'achievement_unlock', 'admin_manual',
  -- 'backfill_initial'.
  source        text NOT NULL,

  -- FK-ish pointer to the causing row (quiz_attempts.id,
  -- reading_log.id, etc.). Null for score-changes that have no
  -- single causing row (backfills, admin adjustments).
  source_ref    uuid,

  delta         int NOT NULL,
  score_before  int NOT NULL,
  score_after   int NOT NULL,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.verity_score_events IS
  'Append-only ledger for every Verity Score change. Reconciles against '
  'users.verity_score; any drift is a bug. Writes must go through the '
  'increment_verity_score RPC.';

-- Idempotency: passing the same source_ref twice for the same user+source
-- is a no-op. Partial index (WHERE source_ref IS NOT NULL) lets admin_manual
-- etc. with null refs still insert multiple rows.
CREATE UNIQUE INDEX IF NOT EXISTS verity_score_events_idempotency
  ON public.verity_score_events (user_id, source, source_ref)
  WHERE source_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS verity_score_events_user_created
  ON public.verity_score_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS verity_score_events_source
  ON public.verity_score_events (source, created_at DESC);

-- RLS — users can read their own events (for subject-access requests +
-- future user-facing score history views). Writes blocked to everyone;
-- only service role + the RPC path reach this table.
ALTER TABLE public.verity_score_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own verity_score_events"
  ON public.verity_score_events;
CREATE POLICY "users read own verity_score_events"
  ON public.verity_score_events FOR SELECT
  USING (user_id = auth.uid());

-- =========================================================================
-- 2. The one RPC that mutates scores
-- =========================================================================

CREATE OR REPLACE FUNCTION public.increment_verity_score(
  p_user_id    uuid,
  p_source     text,
  p_delta      int,
  p_source_ref uuid DEFAULT NULL,
  p_metadata   jsonb DEFAULT '{}'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_score     int;
  v_new_score     int;
  v_event_id      uuid;
BEGIN
  IF p_delta = 0 THEN
    RETURN json_build_object('ok', true, 'noop', true, 'reason', 'zero_delta');
  END IF;

  -- Lock the user row; serializes concurrent increments for the same user.
  SELECT verity_score INTO v_old_score
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'reason', 'user_not_found');
  END IF;

  v_new_score := GREATEST(0, v_old_score + p_delta);

  -- Insert the ledger row. If a same-(user,source,source_ref) row already
  -- exists, the partial unique index rejects the insert; we treat that as
  -- idempotent no-op and skip the score update.
  BEGIN
    INSERT INTO public.verity_score_events (
      user_id, source, source_ref, delta, score_before, score_after, metadata
    ) VALUES (
      p_user_id, p_source, p_source_ref, p_delta, v_old_score, v_new_score, p_metadata
    ) RETURNING id INTO v_event_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('ok', true, 'noop', true, 'reason', 'already_credited');
  END;

  -- Score update. The future guard trigger (bottom of file, disabled today)
  -- will require this RPC to set the `vp.allow_score_update` GUC before
  -- this UPDATE; enabling it is a follow-up commit once direct-update call
  -- sites are migrated.
  PERFORM set_config('vp.allow_score_update', 'true', true);
  UPDATE public.users SET verity_score = v_new_score WHERE id = p_user_id;
  PERFORM set_config('vp.allow_score_update', 'false', true);

  RETURN json_build_object(
    'ok', true,
    'event_id', v_event_id,
    'delta', p_delta,
    'score_before', v_old_score,
    'score_after', v_new_score
  );
END;
$$;

COMMENT ON FUNCTION public.increment_verity_score IS
  'Sole supported path to mutate users.verity_score. Atomic; idempotent '
  'per (user,source,source_ref); writes to verity_score_events in the '
  'same transaction.';

-- =========================================================================
-- 3. Quiz pass → auto-credit trigger
-- =========================================================================

-- Fires on every INSERT into quiz_attempts. If the attempt is a pass,
-- credit the configured points. Unique index on the ledger makes retries
-- safe even if the trigger fires twice.
CREATE OR REPLACE FUNCTION public.on_quiz_attempt_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points int;
BEGIN
  IF NEW.passed IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS NULL THEN
    -- Kid quizzes write with kid_profile_id not user_id; scoring for kids
    -- flows through a separate path (kid_profiles.verity_score). Ignore.
    RETURN NEW;
  END IF;

  -- Points come from the score_rules config table. Fallback 10 if the rule
  -- row isn't present — keeps the trigger from silently crediting zero
  -- when config isn't seeded.
  BEGIN
    SELECT points INTO v_points
      FROM public.score_rules
      WHERE key = 'quiz_pass'
      LIMIT 1;
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    v_points := NULL;
  END;
  v_points := COALESCE(v_points, 10);

  PERFORM public.increment_verity_score(
    NEW.user_id,
    'quiz_pass',
    v_points,
    NEW.id,
    jsonb_build_object(
      'article_id', NEW.article_id,
      'correct', NEW.correct,
      'total', NEW.total
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quiz_attempt_score ON public.quiz_attempts;
CREATE TRIGGER quiz_attempt_score
  AFTER INSERT ON public.quiz_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.on_quiz_attempt_score();

-- =========================================================================
-- 4. Reconciliation helper
-- =========================================================================

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
    COALESCE(SUM(e.delta), 0)::int,
    (u.verity_score - COALESCE(SUM(e.delta), 0))::int
  FROM public.users u
  LEFT JOIN public.verity_score_events e ON e.user_id = u.id
  GROUP BY u.id, u.verity_score
  HAVING u.verity_score <> COALESCE(SUM(e.delta), 0);
$$;

COMMENT ON FUNCTION public.reconcile_verity_scores IS
  'Returns one row per user whose verity_score doesn''t match the sum of '
  'their verity_score_events ledger. Empty result = all clean. Wire to '
  'a nightly cron + alert.';

-- =========================================================================
-- 5. One-time backfill
-- =========================================================================

-- Every user with a non-zero score at migration time gets a single
-- `backfill_initial` ledger row so reconciliation returns zero drift
-- from day one. Safe to re-run — the NOT EXISTS guard makes it idempotent.
INSERT INTO public.verity_score_events (
  user_id, source, source_ref, delta, score_before, score_after, metadata
)
SELECT
  u.id,
  'backfill_initial',
  NULL,
  u.verity_score,
  0,
  u.verity_score,
  jsonb_build_object('backfilled_at', now())
FROM public.users u
WHERE u.verity_score IS NOT NULL
  AND u.verity_score <> 0
  AND NOT EXISTS (
    SELECT 1 FROM public.verity_score_events e
    WHERE e.user_id = u.id AND e.source = 'backfill_initial'
  );

-- =========================================================================
-- 6. Guard trigger (DISABLED; enable in a follow-up commit)
-- =========================================================================
--
-- The future hardening step: block any UPDATE of users.verity_score that
-- didn't go through increment_verity_score (which sets the vp.allow_score_
-- update GUC within its transaction). Enabling this NOW would break every
-- legacy direct-update path in the codebase — migrate those first, then
-- uncomment and run this block.
--
-- CREATE OR REPLACE FUNCTION public.guard_verity_score_update()
-- RETURNS trigger
-- LANGUAGE plpgsql
-- AS $$
-- BEGIN
--   IF NEW.verity_score IS DISTINCT FROM OLD.verity_score THEN
--     IF current_setting('vp.allow_score_update', true) IS NULL
--        OR current_setting('vp.allow_score_update', true) <> 'true' THEN
--       RAISE EXCEPTION
--         'verity_score must be updated via increment_verity_score(). '
--         'Direct UPDATE blocked.';
--     END IF;
--   END IF;
--   RETURN NEW;
-- END;
-- $$;
--
-- DROP TRIGGER IF EXISTS guard_verity_score ON public.users;
-- CREATE TRIGGER guard_verity_score
--   BEFORE UPDATE ON public.users
--   FOR EACH ROW
--   EXECUTE FUNCTION public.guard_verity_score_update();

COMMIT;
