-- 189_billing_uncancel_bump_perms_version.sql
-- B1 tail: billing_uncancel_subscription did not call bump_user_perms_version.
--
-- Context: migration 148 added internal bump_user_perms_version calls to the
-- four core billing RPCs (billing_change_plan, billing_resubscribe,
-- billing_cancel_subscription, billing_freeze_profile). billing_uncancel_subscription
-- was introduced in schema/059 and was not updated at that time. The Stripe
-- webhook handleSubscriptionUpdated also has a direct-write fallback path
-- (for environments where the RPC is not yet applied) that writes users directly
-- without bumping; that path gets a route-level bump in the same commit.
--
-- Effect of this gap: a user who cancels a subscription (entering grace period)
-- then un-cancels via Stripe Portal gets plan_status='active' and
-- plan_grace_period_ends_at=null written to users, but their perms cache
-- version is not incremented. Their permissions stay stale until the 60s
-- cache TTL expires naturally.
--
-- Fix: add PERFORM bump_user_perms_version(p_user_id) to the success path,
-- matching the pattern established in migration 148. The already_active no-op
-- path correctly skips the bump (no state change = no cache invalidation needed).
--
-- Bodies copy live state via mcp__supabase__execute_sql against pg_proc
-- (per the always-MCP-verify rule).

CREATE OR REPLACE FUNCTION public.billing_uncancel_subscription(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user users%ROWTYPE;
  v_sub subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found: %', p_user_id;
  END IF;

  IF v_user.plan_grace_period_ends_at IS NULL THEN
    -- Not in grace — nothing to reverse. Return a stable shape so the
    -- webhook caller can treat this as an idempotent no-op.
    RETURN jsonb_build_object(
      'user_id', p_user_id,
      'already_active', true
    );
  END IF;

  IF v_user.frozen_at IS NOT NULL THEN
    -- Grace already elapsed to freeze; un-cancel is no longer the
    -- right operation here. The caller should run resubscribe
    -- instead. Raise so the mismatch surfaces loudly.
    RAISE EXCEPTION 'user % is frozen; use billing_resubscribe', p_user_id;
  END IF;

  SELECT * INTO v_sub FROM subscriptions
    WHERE user_id = p_user_id AND grace_period_ends_at IS NOT NULL
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  UPDATE subscriptions
     SET cancelled_at = NULL,
         cancel_at = NULL,
         cancel_reason = NULL,
         auto_renew = true,
         grace_period_started_at = NULL,
         grace_period_ends_at = NULL,
         status = 'active',
         updated_at = now()
   WHERE id = v_sub.id;

  UPDATE users
     SET plan_grace_period_ends_at = NULL,
         plan_status = 'active',
         updated_at = now()
   WHERE id = p_user_id;

  INSERT INTO subscription_events
    (subscription_id, user_id, event_type, from_plan, to_plan, provider, reason)
  SELECT v_sub.id, p_user_id, 'cancel_rescinded',
         p.name, p.name, v_sub.source, 'stripe: cancel_at_period_end=false'
    FROM plans p WHERE p.id = v_sub.plan_id;

  -- B1 tail: plan_status restored to 'active' and grace cleared;
  -- clients must re-fetch permissions so the now-active plan features
  -- are visible immediately rather than waiting for the 60s cache TTL.
  PERFORM bump_user_perms_version(p_user_id);

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'subscription_id', v_sub.id,
    'already_active', false
  );
END;
$$;

-- Preserve existing grants (matching schema/059).
REVOKE EXECUTE ON FUNCTION public.billing_uncancel_subscription(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.billing_uncancel_subscription(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.billing_uncancel_subscription(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.billing_uncancel_subscription(uuid) TO service_role;
