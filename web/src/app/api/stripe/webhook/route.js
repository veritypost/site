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
//   invoice.payment_succeeded         → clear grace + keep plan active  (B2)
//   invoice.payment_failed            → log + in-app notification
//   invoice.upcoming                  → card-expiring notification      (B6)
//   customer.deleted                  → clear orphan stripe_customer_id (B7)
//   charge.refunded                   → revoke plan (freeze)
//   charge.refund.updated             → unfreeze on status='reversed'   (B11 tail)
//   charge.dispute.created            → flag for admin review
//   charge.dispute.closed             → unfreeze on status='won'        (B11 tail)
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

export const runtime = 'nodejs'; // need node crypto
export const dynamic = 'force-dynamic';

// Belt-and-braces body-size cap. Stripe events are small (<100 KB in
// practice); reject anything above 1 MiB so a malformed / hostile caller
// can't force the Node runtime to buffer an unbounded body before the
// HMAC check. Checked twice: once against the declared Content-Length
// (cheap, pre-read) and once against the actual buffered length.
const MAX_BODY_SIZE = 1024 * 1024;

// B4: a webhook_log row stuck at processing_status='processing' or 'received'
// for more than this many seconds is assumed abandoned (prior invocation
// crashed or timed out). The next retry can reclaim it for processing instead
// of returning in_flight forever. Same tuning as the iOS notification reclaim
// path (#30, commit 24b6675).
const STUCK_PROCESSING_SECONDS = 5 * 60;

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
  try {
    event = verifyWebhook(raw, sig);
  } catch (err) {
    console.error('[stripe.webhook] signature verification failed:', err?.message);
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 400 });
  }

  const service = createServiceClient();

  // Step A: try to INSERT and claim processing in one step.
  let logId = null;
  const { data: inserted, error: insertError } = await service
    .from('webhook_log')
    .insert({
      source: 'stripe',
      event_type: event.type,
      event_id: event.id,
      payload: event,
      processing_status: 'processing',
      signature_valid: true,
    })
    .select('id')
    .maybeSingle();

  if (inserted) {
    logId = inserted.id;
  } else {
    // Insert failed, almost certainly due to the event_id UNIQUE
    // constraint. Look up the existing row and decide what to do.
    const { data: prior } = await service
      .from('webhook_log')
      .select('id, processing_status, created_at')
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
      // B4: if the claim is older than STUCK_PROCESSING_SECONDS, assume the
      // prior invocation crashed and try to reclaim. A conditional UPDATE
      // on the same status + same id ensures only one racing retry wins.
      const createdAt = Date.parse(prior.created_at || '');
      const isStuck =
        Number.isFinite(createdAt) && Date.now() - createdAt > STUCK_PROCESSING_SECONDS * 1000;
      if (isStuck) {
        const { data: reclaimed } = await service
          .from('webhook_log')
          .update({ processing_status: 'processing', processing_error: null })
          .eq('id', prior.id)
          .in('processing_status', ['processing', 'received'])
          .select('id')
          .maybeSingle();
        if (reclaimed) {
          logId = reclaimed.id;
        } else {
          return NextResponse.json({ received: true, in_flight: true });
        }
      } else {
        // Another invocation is handling it. 200 stops Stripe's retry
        // cycle; the other invocation's completion update closes the loop.
        return NextResponse.json({ received: true, in_flight: true });
      }
    } else if (prior.processing_status === 'failed') {
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
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(service, event.data.object);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(service, event.data.object);
        break;
      case 'invoice.upcoming':
        await handleInvoiceUpcoming(service, event.data.object);
        break;
      case 'customer.deleted':
        await handleCustomerDeleted(service, event.data.object);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(service, event.data.object);
        break;
      case 'charge.refund.updated':
        await handleRefundUpdated(service, event.data.object);
        break;
      case 'charge.dispute.created':
        await handleChargeDispute(service, event.data.object);
        break;
      case 'charge.dispute.closed':
        await handleDisputeClosed(service, event.data.object);
        break;
      default:
        // Unknown event types are logged but not treated as errors.
        break;
    }
    await service
      .from('webhook_log')
      .update({
        processing_status: 'processed',
        processed_at: new Date().toISOString(),
      })
      .eq('id', logId);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[stripe.webhook] processing failed:', err);
    // Server-side audit row stores the raw message for debugging; response
    // to Stripe stays generic.
    await service
      .from('webhook_log')
      .update({
        processing_status: 'failed',
        processing_error: err?.message || 'unknown',
      })
      .eq('id', logId);

    // B18: mirror to audit_log so admin surfaces (op dashboards, compliance
    // review) see handler failures alongside other billing actions. webhook_log
    // is the machine-facing state machine; audit_log is the human-facing op
    // trail. Best-effort — if the audit insert fails we still return 500 so
    // Stripe retries the underlying event.
    try {
      const actorId = await resolveUserFromEvent(service, event).catch(() => null);
      const rawMessage = typeof err?.message === 'string' ? err.message : String(err);
      const safeMessage = rawMessage.replace(/\s+/g, ' ').slice(0, 500);
      await service.from('audit_log').insert({
        actor_id: actorId,
        action: 'billing:webhook_handler_failed',
        target_type: 'user',
        target_id: actorId,
        metadata: {
          source: 'stripe_webhook',
          event_type: event.type,
          event_id: event.id,
          error_message: safeMessage,
          webhook_log_id: logId,
        },
      });
    } catch (auditErr) {
      console.error('[stripe.webhook] audit_log mirror failed:', auditErr);
    }

    // Returning 500 tells Stripe to retry; body text doesn't affect retry.
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

// B18 helper: best-effort user resolution from an arbitrary Stripe event
// so the audit_log row carries a target_id when possible. Never throws —
// falls through to `null` if the event shape doesn't carry a customer id
// we can resolve, or if the lookup errors.
async function resolveUserFromEvent(service, event) {
  const obj = event?.data?.object;
  if (!obj) return null;

  // Most billing events carry `customer` on the top-level object. Charge /
  // dispute events nest one level deeper through the charge object.
  const customerId =
    typeof obj.customer === 'string'
      ? obj.customer
      : typeof obj.charge === 'object'
        ? obj.charge?.customer
        : null;

  const fallbackUserId = obj.client_reference_id || obj.metadata?.user_id || null;

  if (!customerId && !fallbackUserId) return null;

  const { userRow } = await lookupUserAndPlan(service, customerId, null, fallbackUserId);
  return userRow?.id || null;
}

// ----- Event handlers -----

async function lookupUserAndPlan(service, customerId, priceId, fallbackUserId) {
  let userRow = null;
  if (customerId) {
    const { data } = await service
      .from('users')
      .select('id, plan_id, plan_status, frozen_at, plan_grace_period_ends_at')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    if (data) userRow = data;
  }
  if (!userRow && fallbackUserId) {
    const { data } = await service
      .from('users')
      .select('id, plan_id, plan_status, frozen_at, plan_grace_period_ends_at')
      .eq('id', fallbackUserId)
      .maybeSingle();
    if (data) userRow = data;
  }

  let planRow = null;
  if (priceId) {
    const { data } = await service
      .from('plans')
      .select('id, name, tier')
      .eq('stripe_price_id', priceId)
      .maybeSingle();
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
    const { data } = await service
      .from('users')
      .select('id, stripe_customer_id, plan_id, plan_status, frozen_at, plan_grace_period_ends_at')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    if (data) userRow = data;
  }

  // Step 2: if no prior mapping, fall back to the claimed id.
  if (!userRow) {
    const { data } = await service
      .from('users')
      .select('id, stripe_customer_id, plan_id, plan_status, frozen_at, plan_grace_period_ends_at')
      .eq('id', claimedUserId)
      .maybeSingle();
    if (data) userRow = data;
  }
  if (!userRow) {
    throw new Error(
      `checkout.session.completed: user not found (claimed=${claimedUserId}, customer=${customerId})`
    );
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
      await service
        .from('users')
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

  const { data: plan } = await service
    .from('plans')
    .select('id, name, tier')
    .eq('stripe_price_id', priceId)
    .maybeSingle();
  if (!plan) throw new Error(`no plan row for stripe_price_id=${priceId}`);

  if (userRow.frozen_at) {
    await service.rpc('billing_resubscribe', {
      p_user_id: userRow.id,
      p_new_plan_id: plan.id,
    });
  } else {
    await service.rpc('billing_change_plan', {
      p_user_id: userRow.id,
      p_new_plan_id: plan.id,
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
        await service
          .from('users')
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
        p_user_id: userRow.id,
        p_new_plan_id: planRow.id,
      });
    } else {
      await service.rpc('billing_change_plan', {
        p_user_id: userRow.id,
        p_new_plan_id: planRow.id,
      });
    }
  }
}

// DA-160 / DA-165 — a successful refund from Stripe Dashboard or Stripe
// Portal was silently ignored. Policy: treat a full refund as plan
// revocation (freeze the user); partial refunds log only. This is a
// conservative default; admins can escalate partial refunds manually.
//
// B11 — the prior `Boolean(charge.refunded) || amount === amount_refunded`
// fallback misclassified partial refunds as full when Stripe's webhook
// payload was momentarily stale (race during the Stripe API write). Per
// Stripe docs, `charge.refunded` is the authoritative full-refund flag —
// it's set to true IFF amount_refunded === amount. The `||` math fallback
// was redundant AND failure-mode-unsafe (it could fire even when
// `charge.refunded` is false, freezing a user mid-partial-refund). Use
// the boolean alone.
//
// B11 also adds an in-app notification on freeze — prior code silently
// locked users out of paid features. Matches the handlePaymentFailed
// notification pattern below. Best-effort.
//
// Deferred (separate items):
//   - charge.refund.updated (status='reversed') handler + billing_unfreeze
//     RPC. Stripe DOES fire this and we currently leave reversed-refund
//     users frozen forever.
//   - charge.dispute.closed handler. Won-disputes leave the user frozen
//     if a refund had also fired; today admin must manually unfreeze.
//   - Apple-side REFUND parity — touched independently. Multi-provider
//     sync (iOS subscriptions/sync re-validates Apple receipts on launch)
//     can undo any state change unless both sides agree, which is a
//     bigger architectural fix.
async function handleChargeRefunded(service, charge) {
  const customerId = charge.customer;
  if (!customerId) return;
  const { userRow } = await lookupUserAndPlan(service, customerId, null);
  if (!userRow) return;

  const fullyRefunded = charge.refunded === true;

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
    // B11: tell the user. Best-effort; webhook ack takes precedence.
    try {
      await service.rpc('create_notification', {
        p_user_id: userRow.id,
        p_type: 'billing_alert',
        p_title: 'Subscription cancelled — refund processed',
        p_body:
          'A refund was processed on your subscription, so paid features are now paused. Contact support if this is unexpected, or resubscribe from Settings.',
        p_action_url: '/profile/settings/billing',
        p_action_type: 'billing',
        p_action_id: null,
        p_priority: 'high',
        p_metadata: { charge_id: charge.id, stripe_customer_id: customerId },
      });
    } catch {
      /* swallow — freeze is the source of truth, notification is observability */
    }
  }
}

// DA-160 / DA-165 — dispute created (chargeback). Flag for admin
// review; do not auto-freeze because a dispute often resolves in the
// merchant's favor. A dedicated `users.dispute_flagged_at` column is
// out of scope for this chunk; we write to audit_log + create an
// admin-visible notification via the existing notification RPC.
async function handleChargeDispute(service, dispute) {
  const customerId =
    dispute.charge && typeof dispute.charge === 'object' ? dispute.charge.customer : null;

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
        p_body:
          'We received a dispute from your card issuer. If this was not you, contact support so we can reach out to your bank.',
        p_action_url: '/profile/settings/billing',
        p_action_type: 'billing',
        p_action_id: null,
        p_priority: 'high',
        p_metadata: { dispute_id: dispute.id },
      });
    } catch {
      /* notification RPC best-effort */
    }
  }
}

// B11 tail — charge.dispute.closed. Stripe sets `status` to 'won', 'lost',
// 'warning_closed', or 'charge_refunded' when a dispute resolves. Only
// 'won' is actionable on our side: the dispute was resolved in our favor,
// so if a prior refund or freeze put the user into a frozen state, we
// should unfreeze them now that the funds are back with the merchant.
// Losses stay frozen (merchant paid); warnings + charge_refunded are
// pre-existing cases already handled by other events.
async function handleDisputeClosed(service, dispute) {
  const customerId =
    dispute.charge && typeof dispute.charge === 'object' ? dispute.charge.customer : null;
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;

  let userRow = null;
  if (customerId) {
    const { userRow: row } = await lookupUserAndPlan(service, customerId, null);
    userRow = row;
  }

  await service.from('audit_log').insert({
    actor_id: userRow?.id || null,
    action: `billing:dispute_${dispute.status || 'closed'}`,
    target_type: 'user',
    target_id: userRow?.id || null,
    metadata: {
      source: 'stripe_webhook',
      dispute_id: dispute.id,
      status: dispute.status,
      amount: dispute.amount,
      currency: dispute.currency,
      charge_id: chargeId,
      customer_id: customerId,
    },
  });

  if (dispute.status !== 'won') {
    // 'lost' / 'warning_closed' / 'charge_refunded' — no state change needed.
    return;
  }

  if (!userRow?.id) {
    console.warn('[stripe.webhook] dispute.closed won — no user resolved', {
      dispute_id: dispute.id,
      charge_id: chargeId,
    });
    return;
  }

  const { data: rpcResult, error: rpcErr } = await service.rpc('billing_unfreeze', {
    p_user_id: userRow.id,
  });
  if (rpcErr) {
    console.error('[stripe.webhook] billing_unfreeze on dispute-won failed:', rpcErr);
    throw new Error(`billing_unfreeze: ${rpcErr.message}`);
  }

  if (!rpcResult?.already_unfrozen && !rpcResult?.skipped) {
    try {
      await service.rpc('create_notification', {
        p_user_id: userRow.id,
        p_type: 'billing_alert',
        p_title: 'Subscription restored',
        p_body: 'The card dispute resolved in your favor, so your paid subscription is back on.',
        p_action_url: '/profile/settings/billing',
        p_action_type: 'billing',
        p_action_id: null,
        p_priority: 'high',
        p_metadata: { dispute_id: dispute.id, source: 'dispute_won' },
      });
    } catch {
      /* notification best-effort */
    }
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

// B11 tail — charge.refund.updated with status='reversed' means the refund
// that triggered handleChargeRefunded's freeze has been returned to us
// (e.g., customer cancelled their refund request, or the card network
// reversed it). Symmetric undo: call billing_unfreeze + notify the user
// their subscription is back.
//
// Stripe also fires this event for status='pending' / 'succeeded' / 'failed'
// at other lifecycle points; only 'reversed' warrants state change on our
// side. Everything else is logged + ignored.
async function handleRefundUpdated(service, refund) {
  if (refund?.status !== 'reversed') {
    // Not the status we care about — just log and drop.
    return;
  }
  const chargeId = typeof refund.charge === 'string' ? refund.charge : refund.charge?.id;
  const customerId = typeof refund.charge === 'object' ? refund.charge?.customer : null;

  // Prefer the customer id from the embedded charge object (Stripe sends
  // it when expand is set). Fall back to refetching via metadata.user_id
  // if present.
  const fallbackUserId = refund.metadata?.user_id || null;
  const { userRow } = await lookupUserAndPlan(service, customerId, null, fallbackUserId);
  if (!userRow) {
    console.warn('[stripe.webhook] charge.refund.updated reversed — no user resolved', {
      refund_id: refund.id,
      charge_id: chargeId,
    });
    return;
  }

  const { data: rpcResult, error: rpcErr } = await service.rpc('billing_unfreeze', {
    p_user_id: userRow.id,
  });
  if (rpcErr) {
    console.error('[stripe.webhook] billing_unfreeze failed:', rpcErr);
    throw new Error(`billing_unfreeze: ${rpcErr.message}`);
  }

  await service.from('audit_log').insert({
    actor_id: userRow.id,
    action: 'billing:refund_reversed',
    target_type: 'user',
    target_id: userRow.id,
    metadata: {
      source: 'stripe_webhook',
      refund_id: refund.id,
      charge_id: chargeId,
      already_unfrozen: rpcResult?.already_unfrozen || false,
    },
  });

  // User-facing notification only when we actually unfroze. Idempotency
  // guard: if billing_unfreeze already-no-oped (user wasn't frozen, or a
  // prior event already unfroze), don't re-notify.
  if (!rpcResult?.already_unfrozen && !rpcResult?.skipped) {
    try {
      await service.rpc('create_notification', {
        p_user_id: userRow.id,
        p_type: 'billing_alert',
        p_title: 'Subscription restored',
        p_body:
          "The refund on your subscription was reversed, so your paid plan is active again. Let us know if anything's off.",
        p_action_url: '/profile/settings/billing',
        p_action_type: 'billing',
        p_action_id: null,
        p_priority: 'high',
        p_metadata: { refund_id: refund.id, source: 'refund_reversed' },
      });
    } catch {
      /* notification best-effort — unfreeze is source of truth */
    }
  }
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
      p_body:
        "We couldn't charge your card for your last payment. Update your payment method to keep your subscription active.",
      p_action_url: '/profile/settings/billing',
      p_action_type: 'billing',
      p_action_id: null,
      p_priority: 'high',
      p_metadata: { invoice_id: invoice.id, stripe_customer_id: invoice.customer },
    });
  } catch {
    /* swallow — webhook ack takes precedence */
  }
  return invoice.id;
}

// B2 — invoice.payment_succeeded closes the loop on a subscription renewal
// that landed cleanly. Prior gap: if customer.subscription.updated arrived
// out of order with the payment result (rare, but Stripe doesn't guarantee
// ordering), grace-period state could linger after the charge cleared. This
// handler clears any outstanding grace marker + plan_status != 'active' on a
// successful billing charge so the user doesn't sit in a soft-locked state
// after paying.
//
// Scope: only touches users whose plan_status is NOT already 'active' OR has
// a non-null plan_grace_period_ends_at. A no-op on the common path keeps the
// webhook fast.
async function handlePaymentSucceeded(service, invoice) {
  // We only care about subscription-sourced invoices. One-off invoices
  // (e.g. an admin manual charge) don't carry subscription state.
  if (
    invoice.billing_reason !== 'subscription_cycle' &&
    invoice.billing_reason !== 'subscription_create' &&
    invoice.billing_reason !== 'subscription_update'
  ) {
    return;
  }
  const customerId = invoice.customer;
  if (!customerId) return;

  const { userRow } = await lookupUserAndPlan(service, customerId, null);
  if (!userRow) return;

  // Only clear if something needs clearing.
  if (userRow.plan_status === 'active' && !userRow.plan_grace_period_ends_at) {
    return;
  }

  await service
    .from('users')
    .update({
      plan_grace_period_ends_at: null,
      plan_status: 'active',
    })
    .eq('id', userRow.id);

  await service.from('audit_log').insert({
    actor_id: userRow.id,
    action: 'billing:payment_succeeded',
    target_type: 'user',
    target_id: userRow.id,
    metadata: {
      source: 'stripe_webhook',
      invoice_id: invoice.id,
      stripe_customer_id: customerId,
      cleared: {
        plan_grace_period_ends_at: userRow.plan_grace_period_ends_at || null,
        prior_plan_status: userRow.plan_status || null,
      },
    },
  });
}

// B6 — invoice.upcoming fires ~7 days before the next charge. We surface a
// gentle in-app notification so users see the renewal before the card is
// hit; card-expiring can be inferred from upcoming with a past-or-soon
// customer.invoice_settings.default_payment_method.exp date, but Stripe
// also sends a `billing.upcoming` paper trail without that data. For now
// the notification is informational. Best-effort — any DB error is silent.
async function handleInvoiceUpcoming(service, invoice) {
  const customerId = invoice.customer;
  if (!customerId) return;
  try {
    const { userRow } = await lookupUserAndPlan(service, customerId, null);
    if (!userRow) return;
    const amountDollars = Number.isFinite(invoice.amount_due)
      ? (invoice.amount_due / 100).toFixed(2)
      : null;
    const currency = (invoice.currency || 'usd').toUpperCase();
    const bodyAmount = amountDollars ? `${amountDollars} ${currency}` : 'your subscription';
    await service.rpc('create_notification', {
      p_user_id: userRow.id,
      p_type: 'billing_alert',
      p_title: 'Upcoming renewal',
      p_body: `Your subscription renews soon for ${bodyAmount}. Update your card if anything's changed to avoid an interruption.`,
      p_action_url: '/profile/settings/billing',
      p_action_type: 'billing',
      p_action_id: null,
      p_priority: 'normal',
      p_metadata: {
        invoice_id: invoice.id,
        stripe_customer_id: customerId,
        amount_due: invoice.amount_due,
        currency: invoice.currency,
      },
    });
  } catch {
    /* notification RPC best-effort — webhook ack takes precedence */
  }
}

// B7 — customer.deleted orphans users.stripe_customer_id if it isn't cleared.
// Our F-016 takeover defense then refuses a future upgrade because the dangling
// customer id on the user row resolves to no live Stripe customer. Clear the
// column so the next /api/stripe/checkout session can mint a fresh customer.
//
// A deleted customer should not carry a live subscription on our side; if a
// row with plan_status='active' exists anyway we log a warning so an operator
// notices, but don't auto-freeze — the cleaner handler for a real cancellation
// is customer.subscription.deleted, which we already handle.
async function handleCustomerDeleted(service, customer) {
  const customerId = customer?.id;
  if (!customerId) return;

  const { data: userRow } = await service
    .from('users')
    .select('id, stripe_customer_id, plan_status, plan_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (!userRow) return;

  if (userRow.plan_status === 'active') {
    console.warn(
      '[stripe.webhook] customer.deleted for user with active plan_status — ' +
        `user_id=${userRow.id} customer_id=${customerId}`
    );
  }

  await service
    .from('users')
    .update({ stripe_customer_id: null })
    .eq('id', userRow.id)
    // Guard against clobbering a user whose row was reassigned between the
    // select + update — only clear if the same customer id still matches.
    .eq('stripe_customer_id', customerId);

  await service.from('audit_log').insert({
    actor_id: userRow.id,
    action: 'billing:customer_deleted',
    target_type: 'user',
    target_id: userRow.id,
    metadata: {
      source: 'stripe_webhook',
      stripe_customer_id: customerId,
      plan_status_at_delete: userRow.plan_status || null,
      plan_id_at_delete: userRow.plan_id || null,
    },
  });
}
