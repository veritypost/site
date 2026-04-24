// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-18
// @feature-verified subscription 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';
import { checkRateLimit } from '@/lib/rateLimit';
import { listCustomerSubscriptions, resumeSubscription } from '@/lib/stripe';

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

  const { planName } = await request.json();
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
    .select('id, tier')
    .eq('name', planName)
    .eq('is_active', true)
    .eq('is_visible', true)
    .maybeSingle();
  if (planErr || !plan) {
    return NextResponse.json({ error: 'Unknown plan' }, { status: 404 });
  }

  const { data: me } = await service
    .from('users')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle();

  if (me?.stripe_customer_id) {
    try {
      const subs = await listCustomerSubscriptions(me.stripe_customer_id, { status: 'all' });
      // Prefer a subscription that's still active-with-cancel-pending.
      const cancelling = subs?.data?.find(
        (s) => (s.status === 'active' || s.status === 'trialing') && s.cancel_at_period_end === true
      );
      if (cancelling) {
        await resumeSubscription(cancelling.id);
      }
      // No cancelling sub: user must re-checkout. Local RPC still
      // updates DB state; the UI is expected to push them to checkout.
    } catch (err) {
      console.error('[billing.resubscribe] stripe', err?.message);
      return NextResponse.json(
        { error: 'Could not reach Stripe. Try again in a moment.' },
        { status: 502 }
      );
    }
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
  return NextResponse.json(data);
}
