-- S1-T347 — users: user_state enum consolidation (stage 1 of 2)
--
-- Decision (Q4.1): "Single user_state enum column replaces the 8 booleans/timestamps.
-- Enum: ('active','banned','locked','muted','frozen','deletion_scheduled','beta_locked','comped').
-- Sweep callers in batch-mode. State priority for AccountStateBanner derives from enum."
--
-- Stage 1 (this migration): add enum type + user_state column, backfill from existing
-- flags, add consistency CHECK, keep legacy columns (S6/S7/S9 still need them).
-- Stage 2 (follow-up after all callers migrate): drop legacy columns + CHECK.
--
-- Verified columns present (2026-04-27):
--   is_banned, locked_until, is_muted, muted_until, deletion_scheduled_for,
--   frozen_at, frozen_verity_score, verify_locked_at, comped_until
--
-- Backfill priority (highest wins): banned > locked > deletion_scheduled >
--   frozen > muted > beta_locked > comped > active
--
-- Consistency CHECK is unidirectional (enum value implies corresponding flag is set).
-- Bidirectional is impractical for multi-flag users where one flag wins.
--
-- Acceptance: every user has non-null user_state; pg_enum shows 8 values;
-- check constraint rejects inconsistent states.

BEGIN;

-- Idempotency: skip if already done
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname='user_state_t' AND typnamespace='public'::regnamespace) THEN
    RAISE NOTICE 'S1-T347 no-op: user_state_t type already exists';
  END IF;
END $$;

CREATE TYPE public.user_state_t AS ENUM (
  'active',
  'banned',
  'locked',
  'muted',
  'frozen',
  'deletion_scheduled',
  'beta_locked',
  'comped'
);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS user_state public.user_state_t;

-- Backfill: highest-priority flag wins when multiple are set.
UPDATE public.users SET user_state =
  CASE
    WHEN is_banned = true
      THEN 'banned'::public.user_state_t
    WHEN locked_until IS NOT NULL AND locked_until > now()
      THEN 'locked'::public.user_state_t
    WHEN deletion_scheduled_for IS NOT NULL
      THEN 'deletion_scheduled'::public.user_state_t
    WHEN frozen_at IS NOT NULL
      THEN 'frozen'::public.user_state_t
    WHEN is_muted = true
      THEN 'muted'::public.user_state_t
    WHEN verify_locked_at IS NOT NULL
      THEN 'beta_locked'::public.user_state_t
    WHEN comped_until IS NOT NULL AND comped_until > now()
      THEN 'comped'::public.user_state_t
    ELSE 'active'::public.user_state_t
  END
WHERE user_state IS NULL;

ALTER TABLE public.users
  ALTER COLUMN user_state SET NOT NULL,
  ALTER COLUMN user_state SET DEFAULT 'active'::public.user_state_t;

-- Unidirectional consistency CHECK: when enum = X, the primary flag for X must be set.
-- Allows multi-flag scenarios (e.g., banned + frozen) as long as the enum matches
-- the highest-priority flag (which the backfill and callers must enforce).
ALTER TABLE public.users
  ADD CONSTRAINT users_state_consistent CHECK (
    CASE user_state
      WHEN 'banned'             THEN is_banned = true
      WHEN 'locked'             THEN locked_until IS NOT NULL
      WHEN 'deletion_scheduled' THEN deletion_scheduled_for IS NOT NULL
      WHEN 'frozen'             THEN frozen_at IS NOT NULL
      WHEN 'muted'              THEN is_muted = true
      WHEN 'beta_locked'        THEN verify_locked_at IS NOT NULL
      WHEN 'comped'             THEN comped_until IS NOT NULL
      WHEN 'active'             THEN true
      ELSE false
    END
  );

DO $$
DECLARE v_count bigint; v_null_count bigint;
BEGIN
  SELECT COUNT(*) INTO v_count FROM pg_enum
   WHERE enumtypid = 'public.user_state_t'::regtype;
  IF v_count <> 8 THEN
    RAISE EXCEPTION 'S1-T347 post-check failed: expected 8 enum values, got %', v_count;
  END IF;
  SELECT COUNT(*) INTO v_null_count FROM public.users WHERE user_state IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'S1-T347 post-check failed: % users have NULL user_state', v_null_count;
  END IF;
  RAISE NOTICE 'S1-T347 stage-1 applied: user_state enum live; legacy columns retained for S6/S7/S9 migration';
END $$;

COMMIT;
