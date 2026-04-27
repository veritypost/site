// @migrated-to-permissions 2026-04-18
// @feature-verified subscription 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { createBillingPortalSession } from '@/lib/stripe';
import { checkRateLimit } from '@/lib/rateLimit';

// T170/T209 — billing portal URLs are single-use, customer-specific
// session links; never cache them at any tier.
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function POST(request) {
  let user;
  try {
    user = await requirePermission('billing.portal.open');
  } catch (err) {
    console.error('[stripe.portal] auth:', err?.message);
    if (err.status)
      return NextResponse.json({ error: 'Forbidden' }, { status: err.status, headers: NO_STORE });
    return NextResponse.json({ error: 'Internal error' }, { status: 500, headers: NO_STORE });
  }

  const service = createServiceClient();

  // Mirror the rate-limit shape from /api/stripe/checkout: 20 portal
  // sessions per hour per user. Stripe portal sessions are billable
  // observability events; keep a sane cap.
  const rate = await checkRateLimit(service, {
    key: `stripe-portal:${user.id}`,
    policyKey: 'stripe_portal',
    max: 20,
    windowSec: 3600,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many portal requests. Try again later.' },
      { status: 429, headers: { ...NO_STORE, 'Retry-After': '3600' } }
    );
  }

  const { data: me } = await service
    .from('users')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!me?.stripe_customer_id) {
    return NextResponse.json(
      { error: 'No Stripe customer on file yet — complete checkout first.' },
      { status: 400, headers: NO_STORE }
    );
  }

  const origin = new URL(request.url).origin;
  try {
    const session = await createBillingPortalSession({
      customerId: me.stripe_customer_id,
      returnUrl: `${origin}/profile/settings/billing`,
    });
    return NextResponse.json({ url: session.url }, { headers: NO_STORE });
  } catch (err) {
    console.error('[stripe.portal]', err);
    return NextResponse.json(
      { error: 'Portal unavailable' },
      { status: err.status || 500, headers: NO_STORE }
    );
  }
}
