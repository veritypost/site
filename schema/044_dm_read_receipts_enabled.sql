-- 044_dm_read_receipts_enabled.sql
-- D11 follow-up polish: per-user opt-out for DM read receipts. When
-- false, the user's client stops emitting message_receipts rows on
-- conversation open, and senders stop seeing "Read" for messages
-- this user reads.
--
-- Client-side gate only — a determined user could bypass by calling
-- the RPC directly. The feature is a social convention (parity with
-- Signal/iMessage/WhatsApp), not a security boundary. Acceptable per
-- Pass-6 Task-62 spec.
--
-- Additive + idempotent. Default true preserves current always-on
-- behavior; existing users continue emitting receipts until they opt
-- out. No data migration needed.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS dm_read_receipts_enabled boolean NOT NULL DEFAULT true;

COMMIT;
