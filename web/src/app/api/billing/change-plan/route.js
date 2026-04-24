// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-18
// @feature-verified subscription 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';
import { listCustomerSubscriptions, updateSubscriptionPrice } from '@/lib/stripe';

// Upgrade/downgrade between paid plans. Stripe-first: swap the
// subscription's price item upstream, then mirror state locally.
// If Stripe fails, the local plan does not change.
export async function POST(request) {
  let user;
  try {
    user = await requirePermission('billing.change_plan');
  } catch (err) {
    if (err.status) {
      console.error('[billing.change-plan.permission]', err?.message || err);
      return NextResponse.json({ error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const { planName } = await request.json();
  if (!planName) {
    return NextResponse.json({ error: 'planName required' }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: plan, error: planErr } = await service
    .from('plans')
    .select('id, tier, stripe_price_id')
    .eq('name', planName)
    .maybeSingle();
  if (planErr || !plan) {
    return NextResponse.json({ error: 'Unknown plan' }, { status: 404 });
  }
  if (!plan.stripe_price_id) {
    return NextResponse.json(
      { error: `plan "${planName}" has no stripe_price_id configured` },
      { status: 400 }
    );
  }

  const { data: me } = await service
    .from('users')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle();

  if (me?.stripe_customer_id) {
    try {
      const subs = await listCustomerSubscriptions(me.stripe_customer_id, { status: 'all' });
      const active = subs?.data?.find(
        (s) => s.status === 'active' || s.status === 'trialing' || s.status === 'past_due'
      );
      if (active) {
        const item = active.items?.data?.[0];
        if (!item) {
          console.error('[billing.change_plan] subscription has no item', active.id);
          return NextResponse.json(
            { error: 'Stripe subscription is in an unexpected state. Contact support.' },
            { status: 500 }
          );
        }
        // Skip the Stripe call if the user is already on this price —
        // saves a round-trip and avoids a no-op proration event.
        if (item.price?.id !== plan.stripe_price_id) {
          await updateSubscriptionPrice(active.id, item.id, plan.stripe_price_id);
        }
      }
      // No active sub: user hasn't paid yet on this customer record.
      // Local RPC will set the plan; checkout flow handles the actual
      // first payment.
    } catch (err) {
      console.error('[billing.change_plan] stripe', err?.message);
      return NextResponse.json(
        { error: 'Could not reach Stripe. Try again in a moment.' },
        { status: 502 }
      );
    }
  }

  const { data, error } = await service.rpc('billing_change_plan', {
    p_user_id: user.id,
    p_new_plan_id: plan.id,
  });
  if (error) {
    return safeErrorResponse(NextResponse, error, {
      route: 'billing.change_plan',
      fallbackStatus: 400,
    });
  }
  return NextResponse.json(data);
}
