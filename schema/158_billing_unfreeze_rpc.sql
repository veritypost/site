-- 158 — B11 tail: billing_unfreeze RPC + reverse-refund / won-dispute handlers.
--
-- Prior gap: handleChargeRefunded freezes a user via billing_freeze_profile,
-- but the two events that are supposed to undo that freeze (Stripe sends
-- `charge.refund.updated` with status='reversed' when a refund is returned,
-- and `charge.dispute.closed` with status='won' when a dispute resolves in
-- the merchant's favor) have NO handlers. Frozen users stay frozen forever
-- even after the refund that triggered the freeze is reversed.
--
-- This migration introduces billing_unfreeze(p_user_id) as the symmetric
-- counterpart to billing_freeze_profile. It:
--   1. No-ops with {already_unfrozen:true} when frozen_at IS NULL.
--   2. Otherwise restores plan_id from the subscription row that was
--      cancelled by the matching 'profile_frozen' event (i.e., the last
--      freeze cycle's source-of-truth plan). That row's plan_id was
--      preserved when freeze flipped it to status='cancelled'.
--   3. Reactivates that subscriptions row to status='active'.
--   4. Clears frozen_at + frozen_verity_score, restores plan_status='active'.
--   5. Emits subscription_events 'profile_unfrozen' and bumps perms_version.
--
-- Idempotent by design — calling it against an unfrozen user is a harmless
-- no-op. Safe to wire into both new Stripe event handlers (charge.refund.updated
-- status='reversed', charge.dispute.closed status='won').
--
-- Tight permission surface: SECURITY DEFINER + explicit revoke/grant.

CREATE OR REPLACE FUNCTION public.billing_unfreeze(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user users%ROWTYPE;
  v_sub subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found: %', p_user_id;
  END IF;

  -- Already-unfrozen path: no-op + clear signal for caller to skip further
  -- work (e.g., don't send a "welcome back" notification a second time).
  IF v_user.frozen_at IS NULL THEN
    RETURN jsonb_build_object(
      'user_id', p_user_id,
      'already_unfrozen', true,
      'skipped', true
    );
  END IF;

  -- Find the subscription row cancelled by the most recent freeze cycle.
  -- billing_freeze_profile cancelled all active/past_due subs + emitted a
  -- 'profile_frozen' event against the newest one; we trace that event
  -- back to its subscription to recover the plan_id that was in force
  -- before the freeze. Falls back to any cancelled row for this user if
  -- the event history has been pruned.
  SELECT s.*
    INTO v_sub
    FROM subscriptions s
   WHERE s.user_id = p_user_id
     AND s.status = 'cancelled'
   ORDER BY s.updated_at DESC
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    -- No cancelled sub to revive — leave frozen_at set, surface to caller
    -- so the webhook can decide (admin intervention or a fresh checkout).
    RETURN jsonb_build_object(
      'user_id', p_user_id,
      'already_unfrozen', false,
      'skipped', true,
      'reason', 'no_cancelled_subscription_to_revive'
    );
  END IF;

  -- Revive the subscription row + restore users.plan_id from it.
  UPDATE subscriptions
     SET status = 'active',
         cancelled_at = NULL,
         cancel_reason = NULL,
         updated_at = now()
   WHERE id = v_sub.id;

  UPDATE users
     SET frozen_at = NULL,
         frozen_verity_score = NULL,
         plan_id = v_sub.plan_id,
         plan_status = 'active',
         plan_grace_period_ends_at = NULL,
         updated_at = now()
   WHERE id = p_user_id;

  -- Audit + analytics trail: mirror the freeze event on the way back out.
  INSERT INTO subscription_events
    (subscription_id, user_id, event_type, from_plan, to_plan, provider, reason)
  SELECT v_sub.id, p_user_id, 'profile_unfrozen',
         'free', p.name, COALESCE(v_sub.source, 'stripe'),
         'refund reversed or dispute won'
    FROM plans p WHERE p.id = v_sub.plan_id;

  -- B1: plan_id flipped back to paid tier; clients must re-fetch caps
  -- before the next gate check or paid features stay locked.
  PERFORM bump_user_perms_version(p_user_id);

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'already_unfrozen', false,
    'skipped', false,
    'subscription_id', v_sub.id,
    'restored_plan_id', v_sub.plan_id
  );
END;
$function$;

-- Service role calls this from the Stripe webhook; no anon / authenticated
-- reach. Tight grants mirror the rest of the billing_* family.
REVOKE ALL ON FUNCTION public.billing_unfreeze(uuid) FROM public, anon, authenticated;

COMMENT ON FUNCTION public.billing_unfreeze(uuid) IS
  'Reverses billing_freeze_profile. Idempotent on already-unfrozen (returns already_unfrozen=true). Called from Stripe webhook on charge.refund.updated status=reversed and charge.dispute.closed status=won. Bumps perms_version. B11 tail.';
