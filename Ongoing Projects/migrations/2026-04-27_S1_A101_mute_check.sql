-- S1-A101 — users: add silent-mute CHECK constraint (Q4.16 lock)
--
-- Decision (Q4.16): "Both halves — DB CHECK constraint requires muted_until IS NOT NULL
-- when is_muted=true, AND appeal page surfaces silent mutes honestly. Permanent mutes are
-- not a thing; if needed, set muted_until to a far-future date."
--
-- Verified state (2026-04-27): is_muted (boolean), muted_until (timestamptz) both present.
-- 0 users have is_muted=true AND muted_until IS NULL (pre-flight safe).
-- Existing CHECKs: chk_users_plan_status, users_cohort_check (no mute check).
--
-- Migration: pre-heal any violations (0 now), then add CHECK.
-- Pre-heal sets muted_until = now()+7d for any silent-muted user so the
-- constraint can be added without row-level failures.
--
-- Acceptance: pg_constraint shows users_mute_requires_until; attempt
-- UPDATE users SET is_muted=true WHERE id=<x> (with muted_until NULL) → 23514.

BEGIN;

DO $$
DECLARE bad_count int;
BEGIN
  SELECT COUNT(*) INTO bad_count FROM public.users
   WHERE is_muted = true AND muted_until IS NULL;
  IF bad_count > 0 THEN
    RAISE NOTICE 'S1-A101: % silent-muted users — setting muted_until = now()+7d', bad_count;
    UPDATE public.users SET muted_until = now() + interval '7 days'
     WHERE is_muted = true AND muted_until IS NULL;
  END IF;
END $$;

ALTER TABLE public.users
  ADD CONSTRAINT users_mute_requires_until
  CHECK (NOT is_muted OR muted_until IS NOT NULL);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='public.users'::regclass AND conname='users_mute_requires_until'
  ) THEN
    RAISE EXCEPTION 'S1-A101 post-check failed: constraint not found';
  END IF;
  RAISE NOTICE 'S1-A101 applied: users_mute_requires_until CHECK live';
END $$;

COMMIT;
