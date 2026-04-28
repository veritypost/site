-- =====================================================================
-- 2026-04-28_S1_T2.7_billing_idempotency.sql
-- S1-T2.7 — billing_change_plan + billing_resubscribe idempotency
-- Source: Ongoing Projects/Sessions/Session_01_DB_Migrations.md (S1-T2.7)
-- Severity: P0 (Stripe webhook re-runs corrupt billing state)
-- =====================================================================
-- Verified state (2026-04-28 via pg_get_functiondef):
--   billing_change_plan: every call writes a subscription_events row +
--   re-runs convert_kid_trial(p_user_id) + bumps perms_version. Stripe
--   stuck-300s reclaims redeliver the same event → duplicate event row,
--   redundant kid trial reactivation, double perms bump.
--   billing_resubscribe: every call INSERTs a new subscriptions row →
--   second hit gives the user TWO active subs, plan_id may flap.
--
-- Fix: per-user advisory lock + state-equivalence check. If the call's
-- target state already matches the user's current state (and a recent
-- event row exists for change_plan), the function returns the prior
-- result shape as a no-op rather than re-applying.
--
-- Race protection: pg_advisory_xact_lock(hashtext('billing:'||p_user_id))
-- serializes concurrent calls per user — Stripe webhook + admin
-- manual-sync racing on the same user can't both pass the
-- state-equivalence check before either commits.
--
-- Caller dependencies (no edits required):
--   - /api/billing/* and Stripe webhook callers consume only the jsonb
--     return shape, which is preserved verbatim.
--   - convert_kid_trial is idempotent (UPDATE WHERE trial=true →
--     no-op on re-run).
--   - bump_user_perms_version is cheap (single UPDATE) so the no-op
--     branch can omit it without coherence risk.
--
-- Rollback:
--   Restore prior bodies (lose idempotency).
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc
                 WHERE proname='billing_change_plan' AND pronamespace='public'::regnamespace) THEN
    RAISE EXCEPTION 'billing_change_plan RPC missing — abort';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc
                 WHERE proname='billing_resubscribe' AND pronamespace='public'::regnamespace) THEN
    RAISE EXCEPTION 'billing_resubscribe RPC missing — abort';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.billing_change_plan(p_user_id uuid, p_new_plan_id uuid)
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
  v_recent_event_id uuid;
BEGIN
  -- Per-user advisory lock — serialize concurrent webhook + manual-sync
  -- calls on the same user so the no-op check below is race-safe.
  PERFORM pg_advisory_xact_lock(hashtext('billing:' || p_user_id::text));

  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found: %', p_user_id;
  END IF;

  SELECT * INTO v_new_plan FROM plans WHERE id = p_new_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan not found: %', p_new_plan_id;
  END IF;

  IF v_new_plan.tier = 'free' THEN
    RAISE EXCEPTION 'use billing_cancel_subscription to drop to free';
  END IF;

  -- Idempotency: if the user is already on this plan AND a recent
  -- (<24h) plan_changed event matches, treat as no-op and return the
  -- previously-computed shape. Frozen-state check is *intentionally*
  -- skipped on the no-op branch — a frozen user paying through to a new
  -- plan would have been resubscribed; arriving here at all means
  -- they're not frozen.
  IF v_user.plan_id = p_new_plan_id AND v_user.frozen_at IS NULL THEN
    SELECT id INTO v_recent_event_id
      FROM public.subscription_events
     WHERE user_id = p_user_id
       AND event_type IN ('upgrade','downgrade')
       AND to_plan = v_new_plan.name
       AND created_at > now() - interval '24 hours'
     ORDER BY created_at DESC
     LIMIT 1;
    IF v_recent_event_id IS NOT NULL THEN
      SELECT * INTO v_old_plan FROM plans WHERE id = v_user.plan_id;
      SELECT * INTO v_sub FROM public.subscriptions
        WHERE user_id = p_user_id AND status = 'active'
        ORDER BY created_at DESC LIMIT 1;
      RAISE NOTICE 'billing_change_plan no-op: plan already %, recent event %',
        v_new_plan.name, v_recent_event_id;
      RETURN jsonb_build_object(
        'user_id', p_user_id,
        'subscription_id', v_sub.id,
        'from_plan', COALESCE(v_old_plan.name, v_new_plan.name),
        'to_plan', v_new_plan.name,
        'direction', 'noop',
        'kids_converted', 0
      );
    END IF;
  END IF;

  IF v_user.frozen_at IS NOT NULL THEN
    RAISE EXCEPTION 'user % is frozen; use billing_resubscribe', p_user_id;
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

  -- Phase 15.2: reactivate any frozen trial kid profile when
  -- transitioning into a Family plan.
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

  -- B1: plan_id changed; perms cache must invalidate or paid features
  -- (DM compose, ad-free, expert Q&A) misalign with the new tier.
  PERFORM bump_user_perms_version(p_user_id);

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

CREATE OR REPLACE FUNCTION public.billing_resubscribe(p_user_id uuid, p_new_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user users%ROWTYPE;
  v_plan plans%ROWTYPE;
  v_new_sub_id uuid;
  v_existing_sub_id uuid;
  v_restored_score integer;
  v_period_end timestamptz;
  v_kids_converted int := 0;
  v_was_frozen boolean;
BEGIN
  -- Per-user advisory lock — same race protection as billing_change_plan.
  PERFORM pg_advisory_xact_lock(hashtext('billing:' || p_user_id::text));

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

  -- Idempotency: if the user already has an active sub on this plan
  -- AND is not frozen, treat as no-op. A second webhook delivery for
  -- the same resubscribe event would otherwise create a parallel
  -- active subscriptions row.
  IF v_user.plan_id = p_new_plan_id AND v_user.frozen_at IS NULL THEN
    SELECT id INTO v_existing_sub_id
      FROM public.subscriptions
     WHERE user_id = p_user_id
       AND plan_id = p_new_plan_id
       AND status = 'active'
     ORDER BY created_at DESC
     LIMIT 1;
    IF v_existing_sub_id IS NOT NULL THEN
      RAISE NOTICE 'billing_resubscribe no-op: active sub % already exists on plan %',
        v_existing_sub_id, v_plan.name;
      RETURN jsonb_build_object(
        'user_id', p_user_id,
        'subscription_id', v_existing_sub_id,
        'plan', v_plan.name,
        'restored_score', v_user.verity_score,
        'was_frozen', false,
        'kids_converted', 0
      );
    END IF;
  END IF;

  v_was_frozen := v_user.frozen_at IS NOT NULL;
  IF v_was_frozen THEN
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

  -- Phase 15.2: reactivate any frozen trial kid profile when
  -- resubscribing to a Family plan.
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
     CASE WHEN v_was_frozen
          THEN 'restored from frozen state' ELSE 'grace period cancelled' END);

  -- B1: restored to paid plan; perms cache must invalidate so the
  -- client picks up paid features without waiting for the 60s TTL.
  PERFORM bump_user_perms_version(p_user_id);

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'subscription_id', v_new_sub_id,
    'plan', v_plan.name,
    'restored_score', v_restored_score,
    'was_frozen', v_was_frozen,
    'kids_converted', v_kids_converted
  );
END;
$function$;

DO $$ BEGIN RAISE NOTICE 'S1-T2.7 applied: billing RPCs idempotent under per-user advisory lock'; END $$;

COMMIT;
