/**
 * Phase 6 of AI + Plan Change Implementation — Stripe drift reconciliation.
 *
 * Daily cron. For each `subscriptions` row with `platform='stripe'` and
 * `status IN ('active','trialing')`, compute the expected `kid_seats_paid`
 * from the live Stripe subscription's items (specifically the item whose
 * `price.metadata.seat_role='extra_kid'` quantity, plus the base 1 included).
 * If the local DB value drifts from the live source-of-truth, update DB to
 * match + log a warning so we can investigate the drift cause.
 *
 * Webhook handlers usually keep the two in sync, but missed events,
 * out-of-order delivery, and stripe.subscription.update events that
 * arrive while the row is being created can leave drift. This cron is
 * the safety net.
 *
 * Runs once daily; capped at 200 subscriptions/run (well above any
 * realistic single-day Stripe-side activity volume).
 *
 * Auth: verifyCronAuth.
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/cronHeartbeat';
import { captureMessage } from '@/lib/observability';

const CRON_NAME = 'subscription-reconcile-stripe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Project's Stripe client is fetch-based (web/src/lib/stripe.js wraps the
// REST API directly, no npm dep). We hit /v1/subscriptions/{id} with the
// expand[] params for items + price metadata.
type StripeSubscription = {
  id: string;
  items: {
    data: Array<{
      id: string;
      quantity?: number;
      price: { id: string; metadata?: Record<string, string> };
    }>;
  };
};

async function stripeRetrieveSubscription(id: string): Promise<StripeSubscription | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const params = new URLSearchParams();
  params.append('expand[]', 'items.data.price.product');
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${id}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as StripeSubscription;
}

type SubRow = {
  id: string;
  user_id: string;
  stripe_subscription_id: string | null;
  kid_seats_paid: number;
};

async function handle() {
  if (!process.env.STRIPE_SECRET_KEY) {
    return { processed: 0, drifted: 0, fixed: 0, errors: 0, skipped: 'stripe_key_missing' };
  }

  const service = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (service.from('subscriptions') as any)
    .select('id, user_id, stripe_subscription_id, kid_seats_paid')
    .eq('platform', 'stripe')
    .in('status', ['active', 'trialing'])
    .not('stripe_subscription_id', 'is', null)
    .limit(200);
  if (error) {
    console.error('[reconcile-stripe.fetch]', error.message);
    await captureMessage('reconcile-stripe fetch failed', 'warning', {
      error: error.message,
    });
    return { processed: 0, drifted: 0, fixed: 0, errors: 1 };
  }

  const subs = (data as unknown as SubRow[]) ?? [];
  let drifted = 0;
  let fixed = 0;
  let errors = 0;

  for (const sub of subs) {
    if (!sub.stripe_subscription_id) continue;
    try {
      const remote = await stripeRetrieveSubscription(sub.stripe_subscription_id);
      if (!remote) {
        errors++;
        continue;
      }
      let extras = 0;
      let isFamilyBase = false;
      for (const item of remote.items.data) {
        const meta = item.price.metadata || {};
        const role = (meta.seat_role || '').toLowerCase();
        if (role === 'extra_kid') {
          extras += item.quantity ?? 0;
        } else if (role === 'family_base') {
          isFamilyBase = true;
        }
      }
      const expected = isFamilyBase ? Math.min(4, 1 + extras) : sub.kid_seats_paid;
      if (expected !== sub.kid_seats_paid) {
        drifted++;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updErr } = await (service.from('subscriptions') as any)
          .update({ kid_seats_paid: expected, updated_at: new Date().toISOString() })
          .eq('id', sub.id);
        if (updErr) {
          console.error('[reconcile-stripe.update]', sub.id, updErr.message);
          errors++;
          continue;
        }
        fixed++;
        await captureMessage('subscription kid_seats drift fixed', 'info', {
          subscription_id: sub.id,
          stripe_subscription_id: sub.stripe_subscription_id,
          previous: sub.kid_seats_paid,
          expected,
        });
      }
    } catch (err) {
      console.error('[reconcile-stripe.row]', sub.id, err);
      errors++;
    }
  }

  return { processed: subs.length, drifted, fixed, errors };
}

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return withCronLog(CRON_NAME, async () => {
    const result = await handle();
    await logCronHeartbeat(CRON_NAME, result);
    return NextResponse.json(result);
  });
}
