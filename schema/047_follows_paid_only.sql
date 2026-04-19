-- 047_follows_paid_only.sql
-- Bug 76: follows_insert RLS let free users INSERT via direct client if they
-- found the right column names (Bug 75's fix made that possible on iOS).
-- D28 states follows are paid-only. Belt + suspenders with the server RPC:
-- RLS must also enforce paid status.
--
-- Idempotent.

BEGIN;

DROP POLICY IF EXISTS "follows_insert" ON "follows";

CREATE POLICY "follows_insert" ON "follows" FOR INSERT WITH CHECK (
  follower_id = auth.uid()
  AND public.has_verified_email()
  AND NOT public.is_banned()
  AND public.is_premium()
);

COMMIT;
