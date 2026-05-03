// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-18
// @feature-verified subscription 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';
import { checkRateLimit } from '@/lib/rateLimit';
import { listCustomerSubscriptions, resumeSubscription } from '@/lib/stripe';
import { getActiveCrossPlatformSub, CROSS_PLATFORM_409 } from '@/lib/billingPlatformGuard';

// D40: restore from frozen state. Score picks up from frozen_verity_score.
// Activity during the frozen period does not count.
//
// Stripe-side: if the subscription is still cancel_at_period_end,
// flip it back. If the subscription has fully ended, the user must
// re-checkout (frontend should route them there).
export async function POST(request) {
  let user;
  try {
    user = await requirePermission('billing.resubscribe');
  } catch (err) {
    if (err.status) {
      console.error('[billing.resubscribe.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const { planName } = await request.json().catch(() => ({}));
  if (!planName) {
    return NextResponse.json({ error: 'planName required' }, { status: 400 });
  }

  const service = createServiceClient();

  // Ext-Q1 — cap resubscribe attempts to prevent Stripe-call thrash.
  const rate = await checkRateLimit(service, {
    key: `billing.resubscribe:${user.id}`,
    policyKey: 'billing_resubscribe',
    max: 5,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  // Web resubscribe refuses invisible plans (family tiers are iOS-only).
  // is_active=true + is_visible=false = "billing RPCs accept the plan_id
  // when iOS StoreKit mints it, but the web surface can't revive into it."
  const { data: plan, error: planErr } = await service
    .from('plans')
    .select('id, tier, stripe_price_id')
    .eq('name', planName)
    .eq('is_active', true)
    .eq('is_visible', true)
    .maybeSingle();
  if (planErr || !plan) {
    return NextResponse.json({ error: 'Unknown plan' }, { status: 404 });
  }

  const { data: me, error: meErr } = await service
    .from('users')
    .select('stripe_customer_id, cohort, comped_until, trial_extension_until')
    .eq('id', user.id)
    .maybeSingle();

  if (meErr) {
    console.error('[billing.resubscribe] users lookup failed:', meErr.message);
    return NextResponse.json(
      { error: 'Could not load account. Try again in a moment.' },
      { status: 500 }
    );
  }

  // T304 — mirror the checkout route guard. A beta user with an active comp
  // or trial extension must not resubscribe via this route either; the sweeper
  // only mutates local state at expiry and never cancels an upstream Stripe
  // sub, so creating a Stripe sub on top risks double-billing.
  if (me?.cohort === 'beta' && me?.comped_until && new Date(me.comped_until) > new Date()) {
    return NextResponse.json(
      { error: 'comp_or_trial_active', redirectTo: '/profile/settings?section=plan' },
      { status: 409 }
    );
  }
  if (me?.trial_extension_until && new Date(me.trial_extension_until) > new Date()) {
    return NextResponse.json(
      { error: 'comp_or_trial_active', redirectTo: '/profile/settings?section=plan' },
      { status: 409 }
    );
  }

  // Q06 — cross-platform precheck. If the user already has an active Apple
  // subscription, block the web resubscribe with a structured 409.
  const activeCross = await getActiveCrossPlatformSub(service, user.id);
  if (activeCross.platform === 'apple') {
    return NextResponse.json(CROSS_PLATFORM_409.apple_sub_active, { status: 409 });
  }

  if (me?.stripe_customer_id) {
    try {
      const subs = await listCustomerSubscriptions(me.stripe_customer_id, { status: 'all' });
      // Prefer a subscription that's still active-with-cancel-pending
      // AND on the same plan the user is requesting to resume.
      const cancelling = subs?.data?.find(
        (s) =>
          (s.status === 'active' || s.status === 'trialing') &&
          s.cancel_at_period_end === true
      );
      if (cancelling) {
        // Only resume the Stripe sub when it matches the requested plan.
        // Cross-plan resume must go through checkout.
        const cancellingPriceId = cancelling.items?.data?.[0]?.price?.id;
        if (cancellingPriceId !== plan.stripe_price_id) {
          return NextResponse.json(
            { error: 'no_active_subscription', redirectTo: '/pricing' },
            { status: 409 }
          );
        }
        await resumeSubscription(cancelling.id);
      } else {
        // No cancelling sub: user must re-checkout. Do not write DB state.
        return NextResponse.json(
          { error: 'no_active_subscription', redirectTo: '/pricing' },
          { status: 409 }
        );
      }
    } catch (err) {
      console.error('[billing.resubscribe] stripe', err?.message);
      return NextResponse.json(
        { error: 'Could not reach Stripe. Try again in a moment.' },
        { status: 502 }
      );
    }
  } else {
    // No Stripe customer at all — must go through checkout.
    return NextResponse.json(
      { error: 'no_active_subscription', redirectTo: '/pricing' },
      { status: 409 }
    );
  }

  const { data, error } = await service.rpc('billing_resubscribe', {
    p_user_id: user.id,
    p_new_plan_id: plan.id,
  });
  if (error) {
    return safeErrorResponse(NextResponse, error, {
      route: 'billing.resubscribe',
      fallbackStatus: 400,
    });
  }

  // Ext-Q2 — audit-log self-resubscribe.
  try {
    await service.from('audit_log').insert({
      actor_id: user.id,
      action: 'billing:resubscribe_self',
      target_type: 'subscription',
      target_id: user.id,
      metadata: { plan_name: planName, plan_id: plan.id, tier: plan.tier },
    });
  } catch (auditErr) {
    console.error('[billing.resubscribe] audit_log insert failed:', auditErr);
  }

  return NextResponse.json(data);
}
