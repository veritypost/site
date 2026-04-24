-- 155 — UNIQUE(user_id, apple_original_transaction_id)
--
-- B8 — concurrent Restore Purchases calls from iOS could produce duplicate
-- subscription rows for the same (user, Apple receipt). Code paths like
-- /api/ios/subscriptions/sync use `.upsert()` via apple_original_transaction_id
-- but there was no DB-side constraint to enforce it, so a race between two
-- syncs (or a stolen-receipt replay combined with the user_id guard in
-- sync/route.js) could still land two active rows.
--
-- The index is PARTIAL on apple_original_transaction_id IS NOT NULL so
-- Stripe-only subscriptions (where the column is NULL) don't all collide
-- against the "NULL-means-equal-NULL" semantics of a plain UNIQUE index.
--
-- Precondition verified via MCP before writing this migration: no duplicate
-- (user_id, apple_original_transaction_id) rows exist, so the constraint can
-- land without a data-fix migration first.

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_apple_unique
  ON public.subscriptions (user_id, apple_original_transaction_id)
  WHERE apple_original_transaction_id IS NOT NULL;

COMMENT ON INDEX public.subscriptions_user_apple_unique IS
  'B8 — one active subscription row per (user, Apple original_transaction_id). Prevents duplicate rows from concurrent Restore Purchases + S2S reconciliation races.';
