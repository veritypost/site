-- ============================================================
-- Phase 21.5 — Onboarding tracking
--
-- Stamps users.onboarding_completed_at when a new signup finishes
-- (or skips) the /welcome walkthrough. Login flow reads this column
-- to decide whether to redirect to /welcome vs. home.
-- ============================================================

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "onboarding_completed_at" timestamptz;

-- Backfill: anyone who already has activity (verified email + past
-- activity) has implicitly "finished" onboarding, so we won't force
-- the welcome screen on existing users.
UPDATE "users"
   SET onboarding_completed_at = COALESCE(email_verified_at, created_at)
 WHERE onboarding_completed_at IS NULL
   AND email_verified = true;
