-- =====================================================================
-- 2026-04-27_phase6b_add_kid_idempotency_table.sql
-- Phase 6b: dedicated idempotency table for /api/family/add-kid-with-seat.
-- =====================================================================
-- Background:
--   The bundled add-kid + seat-bump route used a JSON map on
--   subscriptions.metadata.add_kid_idempotency for dedupe. That layout
--   has a non-atomic read-modify-write race: two concurrent requests
--   with the same Idempotency-Key could both pass the replay check,
--   both call Stripe (Stripe-side dedupe catches the second charge),
--   and both INSERT into kid_profiles — producing a duplicate kid row.
--
-- Fix:
--   PRIMARY KEY (user_id, idempotency_key) on a dedicated table acts
--   as the lock. The first request INSERTs and proceeds; the second
--   fails 23505 immediately and either returns the stored result
--   (replay) or 409 (in-flight). Atomic at the DB level — no app-side
--   race.
--
--   Stripe-side idempotency continues to defend the charge, but the
--   table is what guarantees one-and-only-one kid_profiles INSERT per
--   key.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.add_kid_idempotency (
  user_id          uuid       NOT NULL,
  idempotency_key  text       NOT NULL,
  status           int        NOT NULL DEFAULT 0,        -- 0 = in flight; final HTTP status once completed
  body             jsonb      NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  PRIMARY KEY (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS add_kid_idem_created_idx
  ON public.add_kid_idempotency (created_at);

-- Service-role-only. No public policies — only the route's service
-- client touches this table, and RLS denies everyone else by default.
ALTER TABLE public.add_kid_idempotency ENABLE ROW LEVEL SECURITY;

COMMIT;
