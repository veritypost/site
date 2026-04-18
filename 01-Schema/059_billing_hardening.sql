-- ============================================================
-- 059_billing_hardening.sql
-- Chunk 7 of the post-audit repair pass.
--
-- Closes:
--   - F-049 (subscriptions_insert RLS permits user_id = auth.uid()):
--     Tighten to admin-only. Real subscriptions are written by the
--     service-role Stripe webhook path; letting a user self-insert a
--     `subscriptions` row forges entitlement.
--   - DA-159 (no un-cancel handler in Stripe webhook): Add
--     `billing_uncancel_subscription(p_user_id)` RPC so the webhook
--     handler has a purpose-built, transactional reversal when a user
--     clicks "Keep subscription" in Stripe Portal after scheduling
--     cancellation.
--
-- Dependencies: apply after 058_kid_pin_salt.sql.
-- Idempotent. Service-role retains full access to subscriptions via
-- `bypass RLS`; nothing the webhook does changes.
-- ============================================================

-- ------------------------------------------------------------
-- F-049: subscriptions_insert / subscriptions_update admin-only
-- ------------------------------------------------------------
-- Existing policy:
--   "subscriptions_insert" USING (user_id = auth.uid() OR public.is_admin_or_above())
--   "subscriptions_update" USING (user_id = auth.uid() OR public.is_admin_or_above())
--
-- Drop and recreate without the self-insert/self-update clause. The
-- service role (used by /api/stripe/webhook) bypasses RLS entirely, so
-- this change does not affect the billing path.

DROP POLICY IF EXISTS "subscriptions_insert" ON public.subscriptions;
CREATE POLICY "subscriptions_insert" ON public.subscriptions
  FOR INSERT
  WITH CHECK (public.is_admin_or_above());

DROP POLICY IF EXISTS "subscriptions_update" ON public.subscriptions;
CREATE POLICY "subscriptions_update" ON public.subscriptions
  FOR UPDATE
  USING (public.is_admin_or_above());

COMMENT ON POLICY "subscriptions_insert" ON public.subscriptions IS
  'F-049: user_id = auth.uid() clause removed. Real subscriptions '
  'are created by the Stripe webhook on the service client; admins '
  'may insert manually for recovery. Self-insert let users forge '
  'entitlement.';

COMMENT ON POLICY "subscriptions_update" ON public.subscriptions IS
  'F-049: user_id = auth.uid() clause removed. Subscription state '
  'changes originate from Stripe events via the webhook.';

-- ------------------------------------------------------------
-- DA-159: billing_uncancel_subscription RPC
-- ------------------------------------------------------------
-- Mirror of billing_cancel_subscription in shape. Reverses the grace
-- timer + subscription cancellation markers when a user clicks "Keep
-- subscription" in Stripe Portal after cancel_at_period_end was set.
-- No-op (raises informative exception) if the user is not in grace.
-- Transactional: the `FOR UPDATE` lock on the user row ensures a
-- concurrent cancel_subscription cannot interleave.

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

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'subscription_id', v_sub.id,
    'already_active', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.billing_uncancel_subscription(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.billing_uncancel_subscription(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.billing_uncancel_subscription(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.billing_uncancel_subscription(uuid) TO service_role;

COMMENT ON FUNCTION public.billing_uncancel_subscription(uuid) IS
  'DA-159: reverses billing_cancel_subscription. Called from Stripe '
  'webhook when cancel_at_period_end flips back to false. '
  'Idempotent no-op when user is not in grace.';
