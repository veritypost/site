/**
 * Phase 6 of AI + Plan Change Implementation — Pro grandfather migration.
 *
 * Two-stage flow:
 *   1. **Notify** — daily, find Stripe Pro subscriptions whose
 *      `current_period_end` is between 25-31 days out AND who have not
 *      yet received the migration heads-up. Send the "Verity Pro is now
 *      Verity at $7.99 — same features, lower price" email + stamp
 *      `metadata.pro_migration_notified_at`.
 *   2. **Migrate** — for any sub with `current_period_end` <= now() + 24h
 *      AND `notified_at` set, swap the Stripe subscription's price ID
 *      from the Pro SKU to the Verity SKU at next renewal. Stripe handles
 *      the price change at the boundary.
 *
 * Apple Pro subscribers can't be programmatically migrated (Apple
 * StoreKit doesn't support cross-tier updates the same way). They get
 * an in-app banner asking them to manually switch — outside this cron.
 *
 * Auth: verifyCronAuth.
 *
 * Status: scaffolded but the email-send + Stripe price-swap branches
 * require operator input (Pro Stripe price IDs, Verity replacement
 * price IDs, email-send infra). Cron runs in dry-run mode until the
 * env vars listed below are set:
 *
 *   STRIPE_PRO_MONTHLY_PRICE_ID  — current Pro monthly price
 *   STRIPE_PRO_ANNUAL_PRICE_ID   — current Pro annual price
 *   STRIPE_VERITY_MONTHLY_PRICE_ID
 *   STRIPE_VERITY_ANNUAL_PRICE_ID
 *
 * When unset: cron runs read-only, logs counts, no writes.
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/cronHeartbeat';
import { captureMessage } from '@/lib/observability';

const CRON_NAME = 'pro-grandfather-notify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Project's Stripe client is fetch-based; the SDK isn't installed.
type StripeSubscription = {
  id: string;
  items: { data: Array<{ id: string; price: { id: string } }> };
};

async function stripeRetrieveSubscription(id: string): Promise<StripeSubscription | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${id}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as StripeSubscription;
}

async function stripeUpdateSubscriptionItemPrice(
  subId: string,
  itemId: string,
  newPriceId: string
): Promise<boolean> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return false;
  const body = new URLSearchParams();
  body.append(`items[0][id]`, itemId);
  body.append(`items[0][price]`, newPriceId);
  body.append(`proration_behavior`, 'none');
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  return res.ok;
}

type SubRow = {
  id: string;
  user_id: string;
  stripe_subscription_id: string | null;
  current_period_end: string;
  metadata: Record<string, unknown>;
};

async function handle() {
  const service = createServiceClient();
  const proMonthlyPrice = process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
  const proAnnualPrice = process.env.STRIPE_PRO_ANNUAL_PRICE_ID;
  const verityMonthlyPrice = process.env.STRIPE_VERITY_MONTHLY_PRICE_ID;
  const verityAnnualPrice = process.env.STRIPE_VERITY_ANNUAL_PRICE_ID;
  const dryRun =
    !process.env.STRIPE_SECRET_KEY ||
    !proMonthlyPrice ||
    !proAnnualPrice ||
    !verityMonthlyPrice ||
    !verityAnnualPrice;

  // Find Pro subscribers (Stripe-billed) with active sub.
  const { data: proPlans, error: planErr } = await service
    .from('plans')
    .select('id')
    .in('name', ['verity_pro_monthly', 'verity_pro_annual']);
  if (planErr || !proPlans?.length) {
    return { processed: 0, notified: 0, migrated: 0, dry_run: dryRun, errors: planErr ? 1 : 0 };
  }
  const proPlanIds = (proPlans as Array<{ id: string }>).map((p) => p.id);

  const { data, error } = await service
    .from('subscriptions')
    .select('id, user_id, stripe_subscription_id, current_period_end, metadata, plan_id')
    .eq('platform', 'stripe')
    .in('status', ['active', 'trialing'])
    .in('plan_id', proPlanIds)
    .not('stripe_subscription_id', 'is', null)
    .limit(500);
  if (error) {
    console.error('[pro-grandfather.fetch]', error.message);
    return { processed: 0, notified: 0, migrated: 0, dry_run: dryRun, errors: 1 };
  }
  const subs = (data as unknown as SubRow[]) ?? [];

  const now = Date.now();
  const notifyMin = now + 25 * 24 * 60 * 60 * 1000;
  const notifyMax = now + 31 * 24 * 60 * 60 * 1000;
  const migrateBy = now + 24 * 60 * 60 * 1000;

  let notified = 0;
  let migrated = 0;
  let errors = 0;

  for (const sub of subs) {
    const renewalAt = new Date(sub.current_period_end).getTime();
    const meta = sub.metadata || {};
    const notifiedAt = (meta as { pro_migration_notified_at?: string }).pro_migration_notified_at;

    // Notify path. Until the engagement-email pipeline ships (per memory:
    // "email scope is security-only"), this branch only emits a captureMessage
    // for operator visibility. The `pro_migration_notified_at` stamp MUST
    // happen in the same transaction as a successful sendEmail() call —
    // stamping without sending creates silent users who never get warned.
    if (renewalAt >= notifyMin && renewalAt <= notifyMax && !notifiedAt) {
      if (!dryRun) {
        await captureMessage('pro_migration_notify_due', 'info', {
          subscription_id: sub.id,
          user_id: sub.user_id,
          renewal_at: sub.current_period_end,
        });
      }
      notified++;
      continue;
    }

    // Migrate path
    // Owner flips this on after engagement-email pipeline ships + notify campaign runs.
    if (
      process.env.PRO_GRANDFATHER_MIGRATE_ENABLED === 'true' &&
      renewalAt <= migrateBy &&
      notifiedAt &&
      process.env.STRIPE_SECRET_KEY
    ) {
      if (!dryRun) {
        try {
          const remote = await stripeRetrieveSubscription(sub.stripe_subscription_id!);
          const item = remote?.items.data[0];
          const isAnnual = item?.price.id === proAnnualPrice;
          const newPrice = isAnnual ? verityAnnualPrice : verityMonthlyPrice;
          if (item && newPrice) {
            const ok = await stripeUpdateSubscriptionItemPrice(
              sub.stripe_subscription_id!,
              item.id,
              newPrice
            );
            if (ok) migrated++;
            else errors++;
          }
        } catch (err) {
          console.error('[pro-grandfather.migrate]', sub.id, err);
          errors++;
        }
      } else {
        migrated++;
      }
    }
  }

  return { processed: subs.length, notified, migrated, dry_run: dryRun, errors };
}

export const GET = withCronLog(CRON_NAME, async (request: Request) => {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const result = await handle();
  await logCronHeartbeat(CRON_NAME, result);
  return NextResponse.json(result);
});
