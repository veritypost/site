// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyWebhook, retrieveSubscription } from '@/lib/stripe';

// Auth: Stripe HMAC signature on raw body via verifyWebhook (see lib/stripe.js).
// Raw body is read before JSON parse; signature is verified BEFORE any DB write.
// Fail-closed 400 on bad/missing signature.
//
// Stripe webhook entry point. Signature-verified. Events flow into
// the existing billing RPCs so the webhook is just a dumb router.
//
// Handled events:
//   checkout.session.completed        → resubscribe / change_plan
//   customer.subscription.updated     → change_plan, cancel, or un-cancel
//   customer.subscription.deleted     → freeze_profile
//   invoice.payment_failed            → log + in-app notification
//   charge.refunded                   → revoke plan (freeze)
//   charge.dispute.created            → flag for admin review
//
// Idempotency
// -----------
// `webhook_log.event_id` has a UNIQUE constraint (reset_and_rebuild_v2.sql:225).
// We exploit that to implement an atomic claim:
//
//   1. Try to INSERT a new log row with status='processing'. Unique
//      violation = another invocation already claimed this event.
//   2. If a prior row exists with status='processed', this is a replay;
//      return 200 immediately so Stripe stops retrying.
//   3. If a prior row exists with status='received' or 'processing',
//      treat it as in-flight; return 200 (Stripe's next retry will
//      either find it processed or re-claim via status='failed').
//   4. If a prior row has status='failed', try to re-claim via
//      conditional UPDATE (only if still 'failed'), then process.
//
// This closes DA-113: the pre-fix code would re-execute a retry that
// arrived after a prior attempt had inserted 'received' but before it
// marked 'processed' — potentially double-applying billing RPCs.

export const runtime = 'nodejs';           // need node crypto
export const dynamic = 'force-dynamic';

// Belt-and-braces body-size cap. Stripe events are small (<100 KB in
// practice); reject anything above 1 MiB so a malformed / hostile caller
// can't force the Node runtime to buffer an unbounded body before the
// HMAC check. Checked twice: once against the declared Content-Length
// (cheap, pre-read) and once against the actual buffered length.
const MAX_BODY_SIZE = 1024 * 1024;

export async function POST(request) {
  const sig = request.headers.get('stripe-signature');

  const declaredLen = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_SIZE) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_SIZE) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  let event;
  try { event = verifyWebhook(raw, sig); }
  catch (err) {
    return NextResponse.json({ error: `Signature: ${err.message}` }, { status: 400 });
  }

  const service = createServiceClient();

  // Step A: try to INSERT and claim processing in one step.
  let logId = null;
  const { data: inserted, error: insertError } = await service.from('webhook_log').insert({
    source: 'stripe',
    event_type: event.type,
    event_id: event.id,
    payload: event,
    processing_status: 'processing',
    signature_valid: true,
  }).select('id').maybeSingle();

  if (inserted) {
    logId = inserted.id;
  } else {
    // Insert failed, almost certainly due to the event_id UNIQUE
    // constraint. Look up the existing row and decide what to do.
    const { data: prior } = await service
      .from('webhook_log')
      .select('id, processing_status')
      .eq('event_id', event.id)
      .maybeSingle();

    if (!prior) {
      // Insert failed for some other reason (RLS, network) — log and
      // return 500 so Stripe retries.
      console.error('[stripe.webhook] insert failed with no prior row:', insertError?.message);
      return NextResponse.json({ error: 'webhook_log insert failed' }, { status: 500 });
    }

    if (prior.processing_status === 'processed') {
      return NextResponse.json({ received: true, replay: true });
    }
    if (prior.processing_status === 'processing' || prior.processing_status === 'received') {
      // Another invocation is handling it. 200 stops Stripe's retry
      // cycle; the other invocation's completion update closes the loop.
      return NextResponse.json({ received: true, in_flight: true });
    }
    if (prior.processing_status === 'failed') {
      // Re-claim by conditional UPDATE; if two retries race here, only
      // one wins.
      const { data: reclaimed } = await service
        .from('webhook_log')
        .update({ processing_status: 'processing', processing_error: null })
        .eq('id', prior.id)
        .eq('processing_status', 'failed')
        .select('id')
        .maybeSingle();
      if (!reclaimed) {
        return NextResponse.json({ received: true, in_flight: true });
      }
      logId = reclaimed.id;
    } else {
      // Unknown status — surface for investigation.
      return NextResponse.json(
        { error: `unexpected processing_status=${prior.processing_status}` },
        { status: 500 }
      );
    }
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(service, event.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(service, event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(service, event.data.object);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(service, event.data.object);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(service, event.data.object);
        break;
      case 'charge.dispute.created':
        await handleChargeDispute(service, event.data.object);
        break;
      default:
        // Unknown event types are logged but not treated as errors.
        break;
    }
    await service.from('webhook_log').update({
      processing_status: 'processed',
      processed_at: new Date().toISOString(),
    }).eq('id', logId);
    return NextResponse.json({ received: true });
  } catch (err) {
    await service.from('webhook_log').update({
      processing_status: 'failed',
      processing_error: err.message,
    }).eq('id', logId);
    // Returning 500 tells Stripe to retry.
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ----- Event handlers -----

async function lookupUserAndPlan(service, customerId, priceId, fallbackUserId) {
  let userRow = null;
  if (customerId) {
    const { data } = await service.from('users')
      .select('id, plan_id, plan_status, frozen_at, plan_grace_period_ends_at')
      .eq('stripe_customer_id', customerId).maybeSingle();
    if (data) userRow = data;
  }
  if (!userRow && fallbackUserId) {
    const { data } = await service.from('users')
      .select('id, plan_id, plan_status, frozen_at, plan_grace_period_ends_at')
      .eq('id', fallbackUserId).maybeSingle();
    if (data) userRow = data;
  }

  let planRow = null;
  if (priceId) {
    const { data } = await service.from('plans')
      .select('id, name, tier').eq('stripe_price_id', priceId).maybeSingle();
    if (data) planRow = data;
  }
  return { userRow, planRow };
}

// F-016 — `client_reference_id` (and `metadata.user_id`) are attacker-
// controllable if anyone outside our /api/stripe/checkout route ever
// creates a Stripe checkout session against our account (compromised
// key, leaked secret, Payment-Link abuse). Trusting them blindly lets
// a crafted session attach an attacker's Stripe customer to a victim's
// user row. Defenses:
//
//   1. Shape-validate the claimed user id (UUID).
//   2. Prefer the existing `users.stripe_customer_id` → user row mapping
//      over the claimed id. If the customer already resolves to a user,
//      the claim must either match or we refuse.
//   3. Never overwrite an existing, different `stripe_customer_id` on a
//      user row. That is the core exploit path — attacker tries to steal
//      a live subscriber's customer mapping.
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleCheckoutCompleted(service, session) {
  const claimedUserId = session.client_reference_id || session.metadata?.user_id;
  const customerId = session.customer;
  if (!claimedUserId || !UUID_RX.test(claimedUserId)) {
    throw new Error('checkout.session.completed: missing or malformed client_reference_id');
  }

  // Step 1: resolve by existing customer → user mapping if one exists.
  let userRow = null;
  if (customerId) {
    const { data } = await service.from('users')
      .select('id, stripe_customer_id, plan_id, plan_status, frozen_at, plan_grace_period_ends_at')
      .eq('stripe_customer_id', customerId).maybeSingle();
    if (data) userRow = data;
  }

  // Step 2: if no prior mapping, fall back to the claimed id.
  if (!userRow) {
    const { data } = await service.from('users')
      .select('id, stripe_customer_id, plan_id, plan_status, frozen_at, plan_grace_period_ends_at')
      .eq('id', claimedUserId).maybeSingle();
    if (data) userRow = data;
  }
  if (!userRow) {
    throw new Error(`checkout.session.completed: user not found (claimed=${claimedUserId}, customer=${customerId})`);
  }

  // Step 3: the resolved row must match the claimed id. If the customer
  // already mapped to a different user, the claim is either a stale
  // replay or an attempted takeover — refuse and surface for review.
  if (userRow.id !== claimedUserId) {
    throw new Error(
      `checkout.session.completed: customer/user mismatch (claimed=${claimedUserId}, resolved=${userRow.id}).`
    );
  }

  // Step 4: only write the customer mapping on a first-seen row. Never
  // overwrite an existing, different customer id.
  if (customerId) {
    if (userRow.stripe_customer_id && userRow.stripe_customer_id !== customerId) {
      throw new Error(
        `checkout.session.completed: user ${userRow.id} already bound to a different stripe_customer_id; refusing overwrite.`
      );
    }
    if (!userRow.stripe_customer_id) {
      await service.from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', userRow.id)
        .is('stripe_customer_id', null);
    }
  }

  // Get subscription → extract price → resolve plan.
  const subId = session.subscription;
  if (!subId) return;
  const sub = await retrieveSubscription(subId);
  const priceId = sub.items?.data?.[0]?.price?.id;

  const { data: plan } = await service.from('plans')
    .select('id, name, tier').eq('stripe_price_id', priceId).maybeSingle();
  if (!plan) throw new Error(`no plan row for stripe_price_id=${priceId}`);

  if (userRow.frozen_at) {
    await service.rpc('billing_resubscribe', {
      p_user_id: userRow.id, p_new_plan_id: plan.id,
    });
  } else {
    await service.rpc('billing_change_plan', {
      p_user_id: userRow.id, p_new_plan_id: plan.id,
    });
  }
}

async function handleSubscriptionUpdated(service, sub) {
  const customerId = sub.customer;
  const priceId = sub.items?.data?.[0]?.price?.id;
  const { userRow, planRow } = await lookupUserAndPlan(service, customerId, priceId);
  if (!userRow) throw new Error(`no user for customer=${customerId}`);

  // `cancel_at_period_end=true` means user clicked cancel in portal.
  if (sub.cancel_at_period_end && !userRow.plan_grace_period_ends_at) {
    await service.rpc('billing_cancel_subscription', {
      p_user_id: userRow.id,
      p_reason: 'stripe: cancel_at_period_end',
    });
    return;
  }

  // DA-159 — un-cancel. User had scheduled cancellation (visible to us
  // as `plan_grace_period_ends_at` set), then clicked "Keep subscription"
  // in Stripe Portal. Stripe sends customer.subscription.updated with
  // cancel_at_period_end=false. We clear the grace marker so the
  // nightly sweeper does not freeze the account when the grace elapses.
  if (!sub.cancel_at_period_end && userRow.plan_grace_period_ends_at) {
    try {
      await service.rpc('billing_uncancel_subscription', {
        p_user_id: userRow.id,
      });
    } catch (rpcErr) {
      // RPC may not exist in older DBs yet. Fall back to a direct
      // column clear so un-cancel still works before the next schema
      // migration. Audit the fallback for observability.
      if (/billing_uncancel_subscription/i.test(rpcErr?.message || '')) {
        await service.from('users')
          .update({
            plan_grace_period_ends_at: null,
            plan_status: 'active',
          })
          .eq('id', userRow.id);
        await service.from('audit_log').insert({
          actor_id: userRow.id,
          action: 'billing:uncancel_fallback',
          target_type: 'user',
          target_id: userRow.id,
          metadata: { source: 'stripe_webhook', customer_id: customerId },
        });
      } else {
        throw rpcErr;
      }
    }
    // Fall through to plan-change branch in case the same event also
    // carries a price change.
  }

  // Plan change.
  if (planRow && planRow.id !== userRow.plan_id) {
    if (userRow.frozen_at) {
      await service.rpc('billing_resubscribe', {
        p_user_id: userRow.id, p_new_plan_id: planRow.id,
      });
    } else {
      await service.rpc('billing_change_plan', {
        p_user_id: userRow.id, p_new_plan_id: planRow.id,
      });
    }
  }
}

// DA-160 / DA-165 — a successful refund from Stripe Dashboard or Stripe
// Portal was silently ignored. Policy: treat a full refund as plan
// revocation (freeze the user); partial refunds log only. This is a
// conservative default; admins can escalate partial refunds manually.
async function handleChargeRefunded(service, charge) {
  const customerId = charge.customer;
  if (!customerId) return;
  const { userRow } = await lookupUserAndPlan(service, customerId, null);
  if (!userRow) return;

  const fullyRefunded = Boolean(charge.refunded)
    || (charge.amount && charge.amount_refunded && charge.amount === charge.amount_refunded);

  await service.from('audit_log').insert({
    actor_id: userRow.id,
    action: fullyRefunded ? 'billing:refund_full' : 'billing:refund_partial',
    target_type: 'user',
    target_id: userRow.id,
    metadata: {
      source: 'stripe_webhook',
      charge_id: charge.id,
      amount: charge.amount,
      amount_refunded: charge.amount_refunded,
      currency: charge.currency,
    },
  });

  if (fullyRefunded && !userRow.frozen_at) {
    await service.rpc('billing_freeze_profile', { p_user_id: userRow.id });
  }
}

// DA-160 / DA-165 — dispute created (chargeback). Flag for admin
// review; do not auto-freeze because a dispute often resolves in the
// merchant's favor. A dedicated `users.dispute_flagged_at` column is
// out of scope for this chunk; we write to audit_log + create an
// admin-visible notification via the existing notification RPC.
async function handleChargeDispute(service, dispute) {
  const customerId = dispute.charge && typeof dispute.charge === 'object'
    ? dispute.charge.customer
    : null;

  let userRow = null;
  if (customerId) {
    const { userRow: row } = await lookupUserAndPlan(service, customerId, null);
    userRow = row;
  }

  await service.from('audit_log').insert({
    actor_id: userRow?.id || null,
    action: 'billing:dispute_created',
    target_type: 'user',
    target_id: userRow?.id || null,
    metadata: {
      source: 'stripe_webhook',
      dispute_id: dispute.id,
      reason: dispute.reason,
      amount: dispute.amount,
      currency: dispute.currency,
      charge_id: typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id,
      customer_id: customerId,
    },
  });

  // Best-effort user-facing notice so the account holder sees that a
  // dispute was opened against their card. Does not block the webhook
  // ack if the RPC is missing.
  if (userRow?.id) {
    try {
      await service.rpc('create_notification', {
        p_user_id: userRow.id,
        p_type: 'billing_alert',
        p_title: 'Dispute opened on your card',
        p_body: 'We received a dispute from your card issuer. If this was not you, contact support so we can reach out to your bank.',
        p_action_url: '/profile/settings/billing',
        p_action_type: 'billing',
        p_action_id: null,
        p_priority: 'high',
        p_metadata: { dispute_id: dispute.id },
      });
    } catch { /* notification RPC best-effort */ }
  }
}

async function handleSubscriptionDeleted(service, sub) {
  const customerId = sub.customer;
  const { userRow } = await lookupUserAndPlan(service, customerId, null);
  if (!userRow) return;
  // Skip if already frozen (replay).
  if (userRow.frozen_at) return;
  await service.rpc('billing_freeze_profile', { p_user_id: userRow.id });
}

async function handlePaymentFailed(service, invoice) {
  // D40 only freezes on eventual Stripe cancel. A failed payment may be a
  // transient card issue — we stay out of the way of Stripe's retry schedule.
  // Bug 87: add a gentle in-app notification ("Your last payment didn't go
  // through — update your card to stay subscribed") so the user has a chance
  // to fix it before Stripe gives up. Best-effort; any DB error is swallowed
  // so webhook acks stay fast.
  try {
    const { userRow } = await lookupUserAndPlan(service, invoice.customer, null);
    if (!userRow) return invoice.id;
    await service.rpc('create_notification', {
      p_user_id: userRow.id,
      p_type: 'billing_alert',
      p_title: 'Payment failed',
      p_body: "We couldn't charge your card for your last payment. Update your payment method to keep your subscription active.",
      p_action_url: '/profile/settings/billing',
      p_action_type: 'billing',
      p_action_id: null,
      p_priority: 'high',
      p_metadata: { invoice_id: invoice.id, stripe_customer_id: invoice.customer },
    });
  } catch { /* swallow — webhook ack takes precedence */ }
  return invoice.id;
}
