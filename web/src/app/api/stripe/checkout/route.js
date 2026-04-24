// @migrated-to-permissions 2026-04-18
// @feature-verified subscription 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { createCheckoutSession } from '@/lib/stripe';
import { checkRateLimit } from '@/lib/rateLimit';

// POST /api/stripe/checkout — body: { plan_name }
//
// H-06 (Round D): success_url / cancel_url are no longer accepted from
// the client. A caller-controlled post-checkout redirect lets an
// attacker craft a Stripe session whose completion lands the victim
// (plus their Stripe session_id) on an attacker domain. Both URLs are
// now derived from `request.nextUrl.origin` so there is nothing to
// validate — Next.js normalises that against the Vercel edge's
// forwarded host/proto, matching how middleware already resolves origin.
export async function POST(request) {
  let user;
  try {
    user = await requirePermission('billing.upgrade.checkout');
  } catch (err) {
    console.error('[stripe.checkout] auth:', err?.message);
    if (err.status) return NextResponse.json({ error: 'Forbidden' }, { status: err.status });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const service = createServiceClient();

  // Rate-limit: 20 checkout sessions per hour per user. Stripe session
  // creation is billable/observable on Stripe side; an abusive caller
  // could spam this endpoint to rack up session noise.
  const rate = await checkRateLimit(service, {
    key: `stripe-checkout:${user.id}`,
    policyKey: 'stripe_checkout',
    max: 20,
    windowSec: 3600,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many checkout attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': '3600' } }
    );
  }

  const { plan_name } = await request.json().catch(() => ({}));
  if (!plan_name) return NextResponse.json({ error: 'plan_name required' }, { status: 400 });
  // Web checkout refuses plans not marked visible. Family + family_xl tiers
  // are sold via iOS StoreKit only — their plan rows stay `is_active=true`
  // so billing RPCs can mint subscriptions when Apple signs a receipt, but
  // `is_visible=false` locks the web Stripe path. A direct POST from a
  // crafted client with `plan_name='verity_family_monthly'` 404s here
  // instead of succeeding against an invisible plan.
  const { data: plan } = await service
    .from('plans')
    .select('id, tier, stripe_price_id, display_name')
    .eq('name', plan_name)
    .eq('is_active', true)
    .eq('is_visible', true)
    .maybeSingle();
  if (!plan) return NextResponse.json({ error: 'Unknown plan' }, { status: 404 });
  if (!plan.stripe_price_id) {
    return NextResponse.json(
      { error: `plan "${plan_name}" has no stripe_price_id configured` },
      { status: 400 }
    );
  }

  const { data: me } = await service
    .from('users')
    .select('id, stripe_customer_id, email')
    .eq('id', user.id)
    .maybeSingle();

  const origin = request.nextUrl.origin;
  try {
    const session = await createCheckoutSession({
      userId: user.id,
      customerId: me?.stripe_customer_id || undefined,
      priceId: plan.stripe_price_id,
      planName: plan_name,
      successUrl: `${origin}/profile/settings/billing?success=1`,
      cancelUrl: `${origin}/profile/settings/billing?canceled=1`,
    });
    return NextResponse.json({ url: session.url, session_id: session.id });
  } catch (err) {
    console.error('[stripe.checkout]', err);
    return NextResponse.json({ error: 'Checkout failed' }, { status: err.status || 500 });
  }
}
