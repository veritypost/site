-- =====================================================================
-- 2026-04-26_access_request_email_confirm.sql
-- access_requests — email-confirm step before admin review
-- =====================================================================
-- Two-step request flow:
--   1. User enters email at /request-access. Row inserted with
--      email_confirmed_at=null + a random email_confirm_token + 24h
--      expiry. Confirmation email sent.
--   2. User clicks confirm link. Token validated, email_confirmed_at
--      stamped, token cleared. Admin queue now shows the row.
-- Admin queue filters pending tab to email_confirmed_at IS NOT NULL so
-- unconfirmed requests don't clutter review.
-- =====================================================================

BEGIN;

ALTER TABLE public.access_requests
  ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_confirm_token text,
  ADD COLUMN IF NOT EXISTS email_confirm_expires_at timestamptz;

-- Token must be unique while active so we can resolve a row from a
-- click without ambiguity. Partial unique because nulls (post-confirm)
-- are allowed and wouldn't conflict.
CREATE UNIQUE INDEX IF NOT EXISTS uq_access_requests_email_confirm_token
  ON public.access_requests(email_confirm_token)
  WHERE email_confirm_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_access_requests_email_confirmed_at
  ON public.access_requests(email_confirmed_at)
  WHERE email_confirmed_at IS NOT NULL;

COMMIT;
