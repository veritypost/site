-- 188 — fix billing_cancel_subscription: allow frozen users to cancel.
--
-- Prior behavior (migration 157): a frozen user hitting billing_cancel_subscription
-- received a no-op-success response (already_frozen=true, skipped=true) instead of
-- the RPC actually performing the cancellation. The subscription was never marked
-- cancelled, and no grace period was recorded. The user had no recovery path —
-- they were stuck paying for a subscription they could not cancel.
--
-- Root cause: migration 157 targeted idempotency for a state where cancellation is
-- genuinely impossible (e.g., already in grace), but incorrectly grouped frozen
-- users into that bucket. Frozen and cancelled are orthogonal states — a user can
-- and should be able to cancel their subscription regardless of whether their
-- account is frozen. Canceling is an exit action that must always be available.
--
-- Fix: remove the frozen_at short-circuit entirely. The rest of the RPC body is
-- preserved byte-for-byte from migration 157 (MCP-verified live definition as of
-- 2026-04-26). The grace-period guard remains — if the user is already in grace
-- (cancel already scheduled), that's a genuine no-op and still throws. Missing
-- active subscription still throws. perms_version bump preserved.
--
-- Call sites unaffected by this change:
--   - /api/admin/billing/cancel     — already handles non-2xx gracefully
--   - /api/billing/cancel           — already handles non-2xx gracefully
--   - api/stripe/webhook/route.js   — handleSubscriptionUpdated; frozen users
--                                     clicking Stripe Portal cancel will now
--                                     have their DB subscription correctly marked
--                                     rather than the webhook log entry being
--                                     "succeeded" with a silently skipped action.

CREATE OR REPLACE FUNCTION public.billing_cancel_subscription(
  p_user_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user users%ROWTYPE;
  v_sub subscriptions%ROWTYPE;
  v_grace_end timestamptz := now() + interval '7 days';
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found: %', p_user_id;
  END IF;

  -- Frozen users are explicitly allowed to cancel. frozen_at and cancellation
  -- are orthogonal states. Removing the 157 short-circuit that returned a
  -- no-op for frozen users — they must be able to exit their subscription.

  IF v_user.plan_grace_period_ends_at IS NOT NULL THEN
    RAISE EXCEPTION 'user % is already in grace period (ends %)',
      p_user_id, v_user.plan_grace_period_ends_at;
  END IF;

  SELECT * INTO v_sub FROM subscriptions
    WHERE user_id = p_user_id AND status = 'active'
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no active subscription for user %', p_user_id;
  END IF;

  UPDATE subscriptions
     SET cancelled_at = now(),
         cancel_at = v_grace_end,
         cancel_reason = p_reason,
         auto_renew = false,
         grace_period_started_at = now(),
         grace_period_ends_at = v_grace_end,
         updated_at = now()
   WHERE id = v_sub.id;

  UPDATE users
     SET plan_grace_period_ends_at = v_grace_end,
         updated_at = now()
   WHERE id = p_user_id;

  INSERT INTO subscription_events
    (subscription_id, user_id, event_type, from_plan, to_plan, provider, reason)
  SELECT v_sub.id, p_user_id, 'cancel_scheduled',
         p.name, NULL, v_sub.source, p_reason
    FROM plans p WHERE p.id = v_sub.plan_id;

  -- B1: cache invalidation. plan_status/plan_grace_period_ends_at
  -- changed; clients must re-fetch effective perms before next gate.
  PERFORM bump_user_perms_version(p_user_id);

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'subscription_id', v_sub.id,
    'grace_ends_at', v_grace_end,
    'dms_revoked', true
  );
END;
$function$;

COMMENT ON FUNCTION public.billing_cancel_subscription(uuid, text) IS
  'Cancel-at-period-end flow. Frozen users are permitted to cancel (188: removed 157 no-op short-circuit). Grace-period guard still throws — already-cancelling users remain idempotent. Bumps perms_version internally.';
