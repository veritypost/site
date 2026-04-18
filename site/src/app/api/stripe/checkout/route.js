import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { createCheckoutSession } from '@/lib/stripe';

// POST /api/stripe/checkout — body: { plan_name, success_url?, cancel_url? }
export async function POST(request) {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  const { plan_name, success_url, cancel_url } = await request.json().catch(() => ({}));
  if (!plan_name) return NextResponse.json({ error: 'plan_name required' }, { status: 400 });

  const service = createServiceClient();
  const { data: plan } = await service
    .from('plans')
    .select('id, tier, stripe_price_id, display_name')
    .eq('name', plan_name)
    .maybeSingle();
  if (!plan) return NextResponse.json({ error: 'Unknown plan' }, { status: 404 });
  if (!plan.stripe_price_id) {
    return NextResponse.json({ error: `plan "${plan_name}" has no stripe_price_id configured` }, { status: 400 });
  }

  const { data: me } = await service
    .from('users').select('id, stripe_customer_id, email').eq('id', user.id).maybeSingle();

  const origin = new URL(request.url).origin;
  try {
    const session = await createCheckoutSession({
      userId: user.id,
      customerId: me?.stripe_customer_id || undefined,
      priceId: plan.stripe_price_id,
      planName: plan_name,
      successUrl: success_url || `${origin}/profile/settings/billing?success=1`,
      cancelUrl: cancel_url || `${origin}/profile/settings/billing?canceled=1`,
    });
    return NextResponse.json({ url: session.url, session_id: session.id });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
