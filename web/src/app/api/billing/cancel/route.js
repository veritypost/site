// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-18
// @feature-verified subscription 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';
import { listCustomerSubscriptions, cancelSubscriptionAtPeriodEnd } from '@/lib/stripe';

// D40: user cancels → DMs revoked immediately, 7-day grace for
// everything else, freeze on day 7. The DB-side state machine handles
// access; Stripe needs to learn about the cancel so future invoices
// stop. Reconciliation order: Stripe FIRST (so we never flip local
// state without the upstream change landing). If Stripe fails, the
// local DB stays untouched and the user can retry.
export async function POST(request) {
  let user;
  try {
    user = await requirePermission('billing.cancel.own');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  let reason = null;
  try {
    const body = await request.json();
    reason = body?.reason || null;
  } catch {}

  const service = createServiceClient();

  // Look up the user's Stripe customer id so we can cancel the active
  // subscription upstream. If the user has never paid (no customer
  // id), skip the Stripe call — there's nothing to cancel — and let
  // the local RPC clean up whatever state survived.
  const { data: me } = await service
    .from('users')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle();

  if (me?.stripe_customer_id) {
    try {
      const subs = await listCustomerSubscriptions(me.stripe_customer_id, { status: 'active' });
      const active = subs?.data?.find((s) => s.status === 'active' || s.status === 'trialing');
      if (active && !active.cancel_at_period_end) {
        await cancelSubscriptionAtPeriodEnd(active.id);
      }
    } catch (err) {
      console.error('[billing.cancel] stripe', err?.message);
      return NextResponse.json(
        { error: 'Could not reach Stripe. Try again in a moment.' },
        { status: 502 }
      );
    }
  }

  const { data, error } = await service.rpc('billing_cancel_subscription', {
    p_user_id: user.id,
    p_reason: reason,
  });

  if (error) {
    return safeErrorResponse(NextResponse, error, { route: 'billing.cancel', fallbackStatus: 400 });
  }
  return NextResponse.json(data);
}
