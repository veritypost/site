-- 149_rollback_148.sql
-- Reverts the billing-RPC perms_version bumps from migration 148.
-- Restores the pre-148 bodies (which themselves are CREATE OR REPLACE
-- of 011_phase3_billing_helpers.sql + Phase 15.2 convert_kid_trial
-- additions for change_plan/resubscribe).
--
-- Note: this rollback removes the perms cache invalidation, restoring
-- the prior bug. Use only if something downstream depends on the RPC
-- NOT bumping (none currently).

CREATE OR REPLACE FUNCTION public.billing_cancel_subscription(
  p_user_id uuid,
  p_reason text DEFAULT NULL::text
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
  IF v_user.frozen_at IS NOT NULL THEN
    RAISE EXCEPTION 'user % is already frozen', p_user_id;
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
  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'subscription_id', v_sub.id,
    'grace_ends_at', v_grace_end,
    'dms_revoked', true
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.billing_freeze_profile(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user users%ROWTYPE;
  v_free_plan_id uuid;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found: %', p_user_id;
  END IF;
  IF v_user.frozen_at IS NOT NULL THEN
    RETURN jsonb_build_object('user_id', p_user_id, 'already_frozen', true);
  END IF;
  SELECT id INTO v_free_plan_id FROM plans WHERE name = 'free' LIMIT 1;
  IF v_free_plan_id IS NULL THEN
    RAISE EXCEPTION 'free plan row missing from plans table';
  END IF;
  UPDATE users
     SET frozen_at = now(),
         frozen_verity_score = verity_score,
         plan_id = v_free_plan_id,
         plan_status = 'frozen',
         plan_grace_period_ends_at = NULL,
         updated_at = now()
   WHERE id = p_user_id;
  UPDATE subscriptions
     SET status = 'cancelled',
         updated_at = now()
   WHERE user_id = p_user_id
     AND status IN ('active', 'past_due');
  INSERT INTO subscription_events
    (subscription_id, user_id, event_type, from_plan, to_plan, provider, reason)
  SELECT s.id, p_user_id, 'profile_frozen',
         fp.name, 'free', s.source, 'grace period expired'
    FROM subscriptions s
    JOIN plans fp ON fp.id = s.plan_id
   WHERE s.user_id = p_user_id
   ORDER BY s.created_at DESC LIMIT 1;
  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'frozen_at', now(),
    'frozen_verity_score', v_user.verity_score
  );
END;
$function$;

-- billing_resubscribe and billing_change_plan rollbacks include the
-- Phase 15.2 convert_kid_trial calls present in live state pre-148.

CREATE OR REPLACE FUNCTION public.billing_resubscribe(
  p_user_id uuid,
  p_new_plan_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user users%ROWTYPE;
  v_plan plans%ROWTYPE;
  v_new_sub_id uuid;
  v_restored_score integer;
  v_period_end timestamptz;
  v_kids_converted int := 0;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found: %', p_user_id; END IF;
  SELECT * INTO v_plan FROM plans WHERE id = p_new_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan not found: %', p_new_plan_id; END IF;
  IF v_plan.tier = 'free' THEN RAISE EXCEPTION 'billing_resubscribe requires a paid plan; got free'; END IF;
  IF v_user.frozen_at IS NOT NULL THEN
    v_restored_score := COALESCE(v_user.frozen_verity_score, v_user.verity_score);
  ELSE
    v_restored_score := v_user.verity_score;
  END IF;
  v_period_end := CASE v_plan.billing_period
    WHEN 'year'  THEN now() + interval '1 year'
    WHEN 'month' THEN now() + interval '1 month'
    ELSE now() + interval '1 month'
  END;
  UPDATE users
     SET plan_id = p_new_plan_id,
         plan_status = 'active',
         verity_score = v_restored_score,
         frozen_at = NULL,
         frozen_verity_score = NULL,
         plan_grace_period_ends_at = NULL,
         updated_at = now()
   WHERE id = p_user_id;
  IF v_plan.tier IN ('verity_family', 'verity_family_xl') THEN
    v_kids_converted := convert_kid_trial(p_user_id);
  END IF;
  INSERT INTO subscriptions
    (user_id, plan_id, status, source, current_period_start, current_period_end, auto_renew)
  VALUES
    (p_user_id, p_new_plan_id, 'active', 'manual', now(), v_period_end, true)
  RETURNING id INTO v_new_sub_id;
  INSERT INTO subscription_events
    (subscription_id, user_id, event_type, from_plan, to_plan, provider, reason)
  VALUES
    (v_new_sub_id, p_user_id, 'resubscribe', 'free', v_plan.name, 'manual',
     CASE WHEN v_user.frozen_at IS NOT NULL
          THEN 'restored from frozen state' ELSE 'grace period cancelled' END);
  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'subscription_id', v_new_sub_id,
    'plan', v_plan.name,
    'restored_score', v_restored_score,
    'was_frozen', v_user.frozen_at IS NOT NULL,
    'kids_converted', v_kids_converted
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.billing_change_plan(
  p_user_id uuid,
  p_new_plan_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user users%ROWTYPE;
  v_new_plan plans%ROWTYPE;
  v_old_plan plans%ROWTYPE;
  v_sub subscriptions%ROWTYPE;
  v_is_downgrade boolean;
  v_kids_converted int := 0;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found: %', p_user_id; END IF;
  IF v_user.frozen_at IS NOT NULL THEN
    RAISE EXCEPTION 'user % is frozen; use billing_resubscribe', p_user_id;
  END IF;
  SELECT * INTO v_new_plan FROM plans WHERE id = p_new_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan not found: %', p_new_plan_id; END IF;
  IF v_new_plan.tier = 'free' THEN
    RAISE EXCEPTION 'use billing_cancel_subscription to drop to free';
  END IF;
  SELECT * INTO v_old_plan FROM plans WHERE id = v_user.plan_id;
  SELECT * INTO v_sub FROM subscriptions
    WHERE user_id = p_user_id AND status = 'active'
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  v_is_downgrade := COALESCE(v_old_plan.price_cents, 0) > v_new_plan.price_cents;
  IF FOUND THEN
    UPDATE subscriptions
       SET plan_id = p_new_plan_id,
           downgraded_at = CASE WHEN v_is_downgrade THEN now() ELSE downgraded_at END,
           downgraded_from_plan_id = CASE WHEN v_is_downgrade THEN v_user.plan_id ELSE downgraded_from_plan_id END,
           updated_at = now()
     WHERE id = v_sub.id;
  ELSE
    INSERT INTO subscriptions
      (user_id, plan_id, status, source, current_period_start, current_period_end, auto_renew)
    VALUES
      (p_user_id, p_new_plan_id, 'active', 'manual', now(),
       CASE v_new_plan.billing_period
         WHEN 'year' THEN now() + interval '1 year'
         ELSE now() + interval '1 month'
       END, true)
    RETURNING * INTO v_sub;
  END IF;
  UPDATE users
     SET plan_id = p_new_plan_id,
         plan_status = 'active',
         plan_grace_period_ends_at = NULL,
         updated_at = now()
   WHERE id = p_user_id;
  IF v_new_plan.tier IN ('verity_family', 'verity_family_xl') THEN
    v_kids_converted := convert_kid_trial(p_user_id);
  END IF;
  INSERT INTO subscription_events
    (subscription_id, user_id, event_type, from_plan, to_plan, provider, reason)
  VALUES
    (v_sub.id, p_user_id,
     CASE WHEN v_is_downgrade THEN 'downgrade' ELSE 'upgrade' END,
     v_old_plan.name, v_new_plan.name,
     COALESCE(v_sub.source, 'manual'),
     NULL);
  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'subscription_id', v_sub.id,
    'from_plan', v_old_plan.name,
    'to_plan', v_new_plan.name,
    'direction', CASE WHEN v_is_downgrade THEN 'downgrade' ELSE 'upgrade' END,
    'kids_converted', v_kids_converted
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.billing_cancel_subscription(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_freeze_profile(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_resubscribe(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_change_plan(uuid, uuid) TO service_role;
