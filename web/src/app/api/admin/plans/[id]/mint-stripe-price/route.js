// @migrated-to-permissions 2026-04-27
// @feature-verified admin_api 2026-04-27
//
// T57 — POST /api/admin/plans/[id]/mint-stripe-price
//
// Mints a Stripe `prices` resource for the given plan and writes the
// returned id into plans.stripe_price_id. Eliminates the
// "no stripe_price_id configured" silent-fail class at
// /api/stripe/checkout/route.js:62-66 — pre-T57, ops had to create the
// price in Stripe Dashboard manually and paste the id into the DB.
//
// Idempotency: Stripe's `prices.create` doesn't have a built-in
// uniqueness key on (product, currency, recurring) — running this twice
// against the same plan creates two prices. We pass a stable
// Idempotency-Key (`mint-stripe-price:<plan_id>:<price_cents>:<period>`)
// so within Stripe's ~24h replay window a retry returns the same id.
// And we refuse to mint if the plan already has stripe_price_id set —
// callers should explicitly clear it via the existing PATCH if they
// want to re-mint at a new price (rare; usually means a new plan row).
//
// Permission: admin.plans.edit (same as the PATCH route).
// Audit: plan.mint_stripe_price via recordAdminAction.

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { recordAdminAction } from '@/lib/adminMutation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STRIPE_API = 'https://api.stripe.com/v1';

// Map our billing_period values to Stripe's recurring.interval. Plans
// with billing_period='' or NULL are one-time and use a non-recurring
// price; the route refuses these for now since no caller expects them.
const PERIOD_TO_STRIPE_INTERVAL = {
  month: 'month',
  year: 'year',
};

export async function POST(_request, { params }) {
  let actor;
  try {
    actor = await requirePermission('admin.plans.edit');
  } catch (err) {
    if (err.status) {
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = params?.id;
  if (!id) {
    return NextResponse.json({ error: 'plan id required' }, { status: 400 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json(
      { error: 'STRIPE_SECRET_KEY not configured on this environment' },
      { status: 503 }
    );
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `admin.plans.mint:${actor.id}`,
    policyKey: 'admin.plans.mint',
    max: 20,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many mint attempts' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  // Load the plan + verify it's mintable.
  const { data: plan } = await service
    .from('plans')
    .select(
      'id, name, display_name, tier, price_cents, currency, billing_period, stripe_price_id, is_active'
    )
    .eq('id', id)
    .maybeSingle();

  if (!plan) {
    return NextResponse.json({ error: 'plan not found' }, { status: 404 });
  }
  if (plan.stripe_price_id) {
    return NextResponse.json(
      {
        error:
          'plan already has a stripe_price_id; clear it via PATCH first if you want to re-mint',
        stripe_price_id: plan.stripe_price_id,
      },
      { status: 409 }
    );
  }
  if (!plan.price_cents || plan.price_cents <= 0) {
    return NextResponse.json(
      { error: 'plan price_cents must be > 0 before minting a Stripe price' },
      { status: 400 }
    );
  }
  const interval = PERIOD_TO_STRIPE_INTERVAL[plan.billing_period];
  if (!interval) {
    return NextResponse.json(
      {
        error:
          "plan billing_period must be 'month' or 'year' before minting a Stripe price; one-time prices are not supported here",
      },
      { status: 400 }
    );
  }

  const currency = (plan.currency || 'USD').toLowerCase();
  const productName = plan.display_name || plan.name;

  // Stripe's price create requires a `product` reference. We use the
  // shorthand `product_data` form so the call is one round-trip — Stripe
  // creates a Product on the fly with the plan's display name. If the
  // product already exists in Stripe with the same lookup_key, we
  // shouldn't get here (we'd have a stripe_price_id set already).
  const formBody = new URLSearchParams();
  formBody.set('currency', currency);
  formBody.set('unit_amount', String(plan.price_cents));
  formBody.set('product_data[name]', productName);
  formBody.set(`product_data[metadata][plan_id]`, plan.id);
  formBody.set(`product_data[metadata][plan_name]`, plan.name);
  formBody.set('recurring[interval]', interval);
  formBody.set('lookup_key', `${plan.name}_${plan.billing_period}`);
  formBody.set(`metadata[plan_id]`, plan.id);
  formBody.set(`metadata[plan_name]`, plan.name);
  formBody.set(`metadata[tier]`, plan.tier);

  const idempotencyKey = `mint-stripe-price:${plan.id}:${plan.price_cents}:${plan.billing_period}`;

  let stripePrice;
  try {
    const res = await fetch(`${STRIPE_API}/prices`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': idempotencyKey,
      },
      body: formBody.toString(),
    });
    const json = await res.json();
    if (!res.ok) {
      console.error('[admin.plans.mint-stripe-price]', json?.error?.message || res.status);
      return NextResponse.json(
        {
          error: json?.error?.message || `Stripe ${res.status}`,
          stripe_error_code: json?.error?.code,
        },
        { status: 502 }
      );
    }
    stripePrice = json;
  } catch (err) {
    console.error('[admin.plans.mint-stripe-price] fetch threw', err);
    return NextResponse.json({ error: 'Stripe call failed' }, { status: 502 });
  }

  const newPriceId = stripePrice?.id;
  if (!newPriceId) {
    return NextResponse.json({ error: 'Stripe returned no price id' }, { status: 502 });
  }

  // Write the id back to the plan row. service-role only because
  // stripe_price_id is intentionally NOT in the PATCH route's
  // ALLOWED_FIELDS — this mint route is the one path that sets it.
  const { error: updErr } = await service
    .from('plans')
    .update({ stripe_price_id: newPriceId })
    .eq('id', id);
  if (updErr) {
    // Stripe price minted but our DB write failed — surface the price id
    // so the operator can paste it manually rather than mint a duplicate.
    console.error('[admin.plans.mint-stripe-price.write]', updErr.message);
    return NextResponse.json(
      {
        error: 'Stripe price minted but write to plans row failed; paste manually',
        stripe_price_id: newPriceId,
        write_error: updErr.message,
      },
      { status: 500 }
    );
  }

  await recordAdminAction({
    action: 'plan.mint_stripe_price',
    targetTable: 'plans',
    targetId: id,
    newValue: {
      stripe_price_id: newPriceId,
      lookup_key: stripePrice.lookup_key,
      stripe_product: stripePrice.product,
    },
  });

  return NextResponse.json({
    ok: true,
    stripe_price_id: newPriceId,
    lookup_key: stripePrice.lookup_key,
  });
}
