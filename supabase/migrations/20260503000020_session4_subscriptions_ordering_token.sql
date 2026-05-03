-- Session 4 — PM-11 Apple S2S out-of-order delivery guard
--
-- Adds two columns to subscriptions to track the last terminal event
-- (REVOKE / REFUND / EXPIRED) received from Apple for a given original
-- transaction. The renewal handlers (SUBSCRIBED / DID_RENEW / REFUND_REVERSED)
-- compare transaction.signedDate against last_terminal_event_at before
-- calling billing_resubscribe. An out-of-order DID_RENEW whose signedDate
-- is <= the terminal event's signedDate is discarded rather than reactivating
-- a refunded subscription.
--
-- Invariant: last_terminal_event_at is always the signedDate (from the JWS
-- transaction payload) of the most-recently-processed terminal notification,
-- NOT the wall-clock time of processing. This means reorder detection works
-- even when notifications arrive hours apart.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS last_terminal_event_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_terminal_event_type text NULL;

-- Index used by the renewal handlers' ordering lookup:
-- WHERE apple_original_transaction_id = $1 AND last_terminal_event_at IS NOT NULL
CREATE INDEX IF NOT EXISTS idx_subscriptions_apple_ordering
  ON public.subscriptions (apple_original_transaction_id, last_terminal_event_at)
  WHERE apple_original_transaction_id IS NOT NULL;
