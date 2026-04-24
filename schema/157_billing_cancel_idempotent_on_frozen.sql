-- 157 — B17: make billing_cancel_subscription idempotent on already-frozen users.
--
-- Prior behavior: `RAISE EXCEPTION 'user % is already frozen'` when a cancel
-- request arrives for a user whose row has frozen_at IS NOT NULL. Three
-- live call sites break on this throw:
--   - /api/admin/billing/cancel             (admin endpoint)
--   - /api/billing/cancel                   (self-serve)
--   - api/stripe/webhook/route.js           (handleSubscriptionUpdated on
--                                            cancel_at_period_end=true)
-- The webhook path is the worst: a frozen user clicking Stripe Portal's
-- cancel button crashes the webhook handler → webhook_log row marked
-- 'failed' → no retry ever resolves it because the frozen state doesn't
-- clear.
--
-- New behavior: when the user is already frozen, return a no-op-success
-- jsonb payload instead of throwing. Callers that don't inspect the body
-- (most of them) see a clean success; new callers can branch on
-- `already_frozen=true` if they care. An audit_log row still lands so
-- admins see the skipped action.
--
-- Everything else in the RPC body is mirrored byte-for-byte from the live
-- definition as of 2026-04-24 (MCP-verified): grace-period detection still
-- throws (that's a different guard for already-cancelling users), missing
-- active subscription still throws, perms_version bump preserved.

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

  -- B17: short-circuit on already-frozen. Prior code threw here; three
  -- call sites (admin, self-serve, Stripe webhook) all hit the throw
  -- under normal user behavior (frozen user clicks cancel in Portal).
  -- Audit the skip so the admin UI still has a trail.
  IF v_user.frozen_at IS NOT NULL THEN
    INSERT INTO audit_log (actor_id, action, target_type, target_id, metadata)
    VALUES (
      p_user_id,
      'billing:cancel_skipped_frozen',
      'user',
      p_user_id,
      jsonb_build_object(
        'reason', COALESCE(p_reason, 'no reason supplied'),
        'frozen_at', v_user.frozen_at
      )
    );
    RETURN jsonb_build_object(
      'user_id', p_user_id,
      'already_frozen', true,
      'skipped', true
    );
  END IF;

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
  'Cancel-at-period-end flow. Idempotent on frozen (B17): already-frozen users get a no-op jsonb with already_frozen=true, audit row logged. Bumps perms_version internally.';
