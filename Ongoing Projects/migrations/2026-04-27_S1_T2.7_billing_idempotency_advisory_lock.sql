-- S1-T2.7 — billing_change_plan + billing_resubscribe: advisory lock + idempotency
--
-- Both functions already SELECT users FOR UPDATE (row-level serialization).
-- Missing pieces:
--   1. Advisory lock: prevents concurrent Stripe webhook + manual call from
--      both landing simultaneously even if they hit different transactions;
--      pg_try_advisory_xact_lock raises lock_not_available on contention rather
--      than queueing indefinitely.
--   2. Idempotency guard: Stripe webhook retries and double-click submit must
--      be safe. If the user is already active on the requested plan with no
--      frozen state, return a no-op result rather than inserting a duplicate
--      subscription_events row.
--
-- Verified state (2026-04-27): neither function has pg_advisory nor an early-
-- return idempotency check. Both are SECURITY DEFINER, SET search_path=public,
-- return jsonb, args (p_user_id uuid, p_new_plan_id uuid).
--
-- Advisory lock key: hashtext('billing:' || p_user_id::text)::bigint — stable
-- per user, collision probability negligible at this scale.
--
-- Acceptance: prosrc for both functions contains 'pg_try_advisory_xact_lock'
-- and the idempotent early-return branch.

BEGIN;

DO $$
DECLARE
  bcp_src text;
  brs_src text;
BEGIN
  SELECT prosrc INTO bcp_src FROM pg_proc
   WHERE proname='billing_change_plan' AND pronamespace='public'::regnamespace;
  SELECT prosrc INTO brs_src FROM pg_proc
   WHERE proname='billing_resubscribe' AND pronamespace='public'::regnamespace;
  IF bcp_src IS NULL OR brs_src IS NULL THEN
    RAISE EXCEPTION 'S1-T2.7 abort: billing functions not found';
  END IF;
  IF bcp_src LIKE '%pg_try_advisory_xact_lock%' THEN
    RAISE NOTICE 'S1-T2.7 no-op: billing_change_plan already has advisory lock';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.billing_change_plan(
  p_user_id    uuid,
  p_new_plan_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_user users%ROWTYPE;
  v_new_plan plans%ROWTYPE;
  v_old_plan plans%ROWTYPE;
  v_sub subscriptions%ROWTYPE;
  v_is_downgrade boolean;
  v_kids_converted int := 0;
BEGIN
  -- Serialize concurrent billing calls for this user. lock_not_available
  -- (55P03) is re-tryable by callers; it's preferable to queueing forever.
  IF NOT pg_try_advisory_xact_lock(hashtext('billing:' || p_user_id::text)::bigint) THEN
    RAISE EXCEPTION 'concurrent billing operation in progress for user %', p_user_id
      USING ERRCODE = '55P03';
  END IF;

  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found: %', p_user_id;
  END IF;

  IF v_user.frozen_at IS NOT NULL THEN
    RAISE EXCEPTION 'user % is frozen; use billing_resubscribe', p_user_id;
  END IF;

  SELECT * INTO v_new_plan FROM plans WHERE id = p_new_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan not found: %', p_new_plan_id;
  END IF;

  IF v_new_plan.tier = 'free' THEN
    RAISE EXCEPTION 'use billing_cancel_subscription to drop to free';
  END IF;

  -- Idempotency: already on this plan and active — no work to do.
  IF v_user.plan_id = p_new_plan_id AND v_user.plan_status = 'active' THEN
    RETURN jsonb_build_object(
      'user_id',    p_user_id,
      'idempotent', true,
      'plan',       v_new_plan.name
    );
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
      (user_id, plan_id, status, source,
       current_period_start, current_period_end, auto_renew)
    VALUES
      (p_user_id, p_new_plan_id, 'active', 'manual',
       now(),
       CASE v_new_plan.billing_period
         WHEN 'year' THEN now() + interval '1 year'
         ELSE now() + interval '1 month'
       END,
       true)
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

  PERFORM bump_user_perms_version(p_user_id);

  RETURN jsonb_build_object(
    'user_id',        p_user_id,
    'subscription_id', v_sub.id,
    'from_plan',      v_old_plan.name,
    'to_plan',        v_new_plan.name,
    'direction',      CASE WHEN v_is_downgrade THEN 'downgrade' ELSE 'upgrade' END,
    'kids_converted', v_kids_converted
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_resubscribe(
  p_user_id     uuid,
  p_new_plan_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_user users%ROWTYPE;
  v_plan plans%ROWTYPE;
  v_new_sub_id uuid;
  v_restored_score integer;
  v_period_end timestamptz;
  v_kids_converted int := 0;
BEGIN
  -- Serialize concurrent billing calls for this user.
  IF NOT pg_try_advisory_xact_lock(hashtext('billing:' || p_user_id::text)::bigint) THEN
    RAISE EXCEPTION 'concurrent billing operation in progress for user %', p_user_id
      USING ERRCODE = '55P03';
  END IF;

  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found: %', p_user_id;
  END IF;

  SELECT * INTO v_plan FROM plans WHERE id = p_new_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan not found: %', p_new_plan_id;
  END IF;

  IF v_plan.tier = 'free' THEN
    RAISE EXCEPTION 'billing_resubscribe requires a paid plan; got free';
  END IF;

  -- Idempotency: already active on this plan with no frozen state.
  IF v_user.plan_id = p_new_plan_id AND v_user.plan_status = 'active'
     AND v_user.frozen_at IS NULL THEN
    RETURN jsonb_build_object(
      'user_id',    p_user_id,
      'idempotent', true,
      'plan',       v_plan.name
    );
  END IF;

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
    (user_id, plan_id, status, source,
     current_period_start, current_period_end, auto_renew)
  VALUES
    (p_user_id, p_new_plan_id, 'active', 'manual',
     now(), v_period_end, true)
  RETURNING id INTO v_new_sub_id;

  INSERT INTO subscription_events
    (subscription_id, user_id, event_type, from_plan, to_plan, provider, reason)
  VALUES
    (v_new_sub_id, p_user_id, 'resubscribe',
     'free', v_plan.name, 'manual',
     CASE WHEN v_user.frozen_at IS NOT NULL
          THEN 'restored from frozen state' ELSE 'grace period cancelled' END);

  PERFORM bump_user_perms_version(p_user_id);

  RETURN jsonb_build_object(
    'user_id',         p_user_id,
    'subscription_id', v_new_sub_id,
    'plan',            v_plan.name,
    'restored_score',  v_restored_score,
    'was_frozen',      v_user.frozen_at IS NOT NULL,
    'kids_converted',  v_kids_converted
  );
END;
$$;

DO $$
DECLARE
  bcp_src text;
  brs_src text;
BEGIN
  SELECT prosrc INTO bcp_src FROM pg_proc
   WHERE proname='billing_change_plan' AND pronamespace='public'::regnamespace;
  SELECT prosrc INTO brs_src FROM pg_proc
   WHERE proname='billing_resubscribe' AND pronamespace='public'::regnamespace;
  IF bcp_src NOT LIKE '%pg_try_advisory_xact_lock%' THEN
    RAISE EXCEPTION 'S1-T2.7 post-check failed: advisory lock not in billing_change_plan';
  END IF;
  IF brs_src NOT LIKE '%pg_try_advisory_xact_lock%' THEN
    RAISE EXCEPTION 'S1-T2.7 post-check failed: advisory lock not in billing_resubscribe';
  END IF;
  RAISE NOTICE 'S1-T2.7 applied: advisory lock + idempotency in both billing functions';
END $$;

COMMIT;
