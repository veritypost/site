// @migrated-to-permissions 2026-04-18
// @feature-verified subscription 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { createBillingPortalSession } from '@/lib/stripe';

export async function POST(request) {
  let user;
  try { user = await requirePermission('billing.portal.open'); }
  catch (err) { if (err.status) return NextResponse.json({ error: err.message }, { status: err.status }); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }

  const service = createServiceClient();
  const { data: me } = await service
    .from('users').select('stripe_customer_id').eq('id', user.id).maybeSingle();
  if (!me?.stripe_customer_id) {
    return NextResponse.json({ error: 'No Stripe customer on file yet — complete checkout first.' }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  try {
    const session = await createBillingPortalSession({
      customerId: me.stripe_customer_id,
      returnUrl: `${origin}/profile/settings/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
