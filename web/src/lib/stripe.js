// Minimal Stripe wrapper — fetch-only, no npm dep.
// Reads STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET from env.

import crypto from 'node:crypto';

const STRIPE_API = 'https://api.stripe.com/v1';

function secret() {
  const k = process.env.STRIPE_SECRET_KEY;
  if (!k) throw new Error('STRIPE_SECRET_KEY missing');
  return k;
}

// POST to Stripe REST API with form-urlencoded body. Supports nested
// params via flat bracket notation (Stripe's convention).
function toForm(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === 'object') toForm(item, `${key}[${i}]`, out);
        else out.push([`${key}[${i}]`, String(item)]);
      });
    } else if (typeof v === 'object') {
      toForm(v, key, out);
    } else {
      out.push([key, String(v)]);
    }
  }
  return out;
}

async function stripeFetch(path, { method = 'GET', body, idempotencyKey } = {}) {
  const headers = {
    Authorization: `Bearer ${secret()}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers,
    body: body ? new URLSearchParams(toForm(body)).toString() : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json?.error?.message || `Stripe ${res.status}`);
    err.stripe = json;
    err.status = res.status;
    throw err;
  }
  return json;
}

export async function createCheckoutSession({
  userId,
  customerId,
  priceId,
  planName,
  successUrl,
  cancelUrl,
}) {
  const body = {
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: userId,
    metadata: { plan_name: planName, user_id: userId },
    allow_promotion_codes: true,
  };
  if (customerId) body.customer = customerId;

  // DA-166 — without Idempotency-Key, a double-submit from the client
  // (network stall, impatient button tap) creates two Stripe Checkout
  // Sessions for the same intent. The day-bucket keeps the key stable
  // for ~24h which matches user retry behavior for a single intent,
  // but still lets the user start a fresh checkout the next day.
  const day = new Date().toISOString().slice(0, 10);
  const idempotencyKey = `checkout:${userId}:${planName}:${day}`;
  return stripeFetch('/checkout/sessions', { method: 'POST', body, idempotencyKey });
}

export async function createBillingPortalSession({ customerId, returnUrl }) {
  return stripeFetch('/billing_portal/sessions', {
    method: 'POST',
    body: { customer: customerId, return_url: returnUrl },
  });
}

export async function retrieveSubscription(subscriptionId) {
  return stripeFetch(`/subscriptions/${subscriptionId}`);
}

// Look up the customer's currently-active subscription. We don't
// persist `stripe_subscription_id` on `users` (the webhook only stores
// the customer mapping), so reconciliation routes have to query Stripe
// for the live subscription. Returns the most recent non-canceled
// subscription, or null if none exists.
export async function listCustomerSubscriptions(customerId, { status = 'all', limit = 10 } = {}) {
  const qs = new URLSearchParams({ customer: customerId, status, limit: String(limit) });
  return stripeFetch(`/subscriptions?${qs.toString()}`);
}

// Cancel at period end (Apple-friendly: user keeps access until paid
// period expires; Stripe handles the actual cancellation event which
// our webhook then reconciles into freeze_profile).
export async function cancelSubscriptionAtPeriodEnd(subscriptionId) {
  return stripeFetch(`/subscriptions/${subscriptionId}`, {
    method: 'POST',
    body: { cancel_at_period_end: 'true' },
  });
}

// Remove the cancellation flag — the Stripe-side resume.
export async function resumeSubscription(subscriptionId) {
  return stripeFetch(`/subscriptions/${subscriptionId}`, {
    method: 'POST',
    body: { cancel_at_period_end: 'false' },
  });
}

// Swap the subscription's price item to a new price (upgrade/downgrade).
// Stripe needs the existing item id to update in-place; pass it in.
// proration_behavior=create_prorations is the default and matches
// what the user expects when changing tiers mid-cycle.
export async function updateSubscriptionPrice(subscriptionId, itemId, newPriceId) {
  return stripeFetch(`/subscriptions/${subscriptionId}`, {
    method: 'POST',
    body: {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: 'create_prorations',
      cancel_at_period_end: 'false',
    },
  });
}

// Adjust the quantity on an existing subscription item — used for the
// per-extra-kid seat add-on on Verity Family. Caller passes the live
// subscription id, the seat-add-on item id, and the new total quantity
// (e.g. 1 baseline + 1 extra = quantity 2 on the seat item, or a
// separate item dedicated to extras with its own quantity).
//
// We pass an `idempotencyKey` so a retry from /api/family/add-kid-with-seat
// (network stall, double-tap) doesn't double-charge — Stripe replays the
// same response for the same key within ~24h.
export async function updateSubscriptionItemQuantity(
  subscriptionId,
  itemId,
  newQuantity,
  { idempotencyKey } = {}
) {
  return stripeFetch(`/subscription_items/${itemId}`, {
    method: 'POST',
    body: {
      quantity: String(newQuantity),
      proration_behavior: 'create_prorations',
    },
    idempotencyKey,
  });
}

// Attach a new item (price + quantity) to an existing subscription —
// used when the per-extra-kid add-on price hasn't been added to the
// subscription yet (first extra kid). For subsequent extras, prefer
// updateSubscriptionItemQuantity.
export async function addSubscriptionItem(
  subscriptionId,
  priceId,
  quantity,
  { idempotencyKey } = {}
) {
  return stripeFetch(`/subscription_items`, {
    method: 'POST',
    body: {
      subscription: subscriptionId,
      price: priceId,
      quantity: String(quantity),
      proration_behavior: 'create_prorations',
    },
    idempotencyKey,
  });
}

// S4-T0.4 — remove a subscription item entirely. Used as the rollback
// for add-path failures in /api/family/add-kid-with-seat: when the
// route just attached a new line item via addSubscriptionItem and the
// kid_profiles insert then fails, restoring quantity to 0 leaves the
// item alive (Stripe still bills $0 line items on some plans, and
// future patch ops have to special-case it). The right rollback is
// to DELETE the item.
//
// proration_behavior=create_prorations rebates any partial-period
// charges back to the customer's balance. Pass an idempotencyKey so
// retries (network stall during the rollback itself) don't double-act.
export async function removeSubscriptionItem(itemId, { idempotencyKey } = {}) {
  return stripeFetch(`/subscription_items/${itemId}`, {
    method: 'DELETE',
    body: {
      proration_behavior: 'create_prorations',
    },
    idempotencyKey,
  });
}

// Verify webhook signature per Stripe spec. Returns the parsed event
// or throws. Accepts the raw request body as a string.
export function verifyWebhook(rawBody, signatureHeader) {
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;
  if (!whsec) throw new Error('STRIPE_WEBHOOK_SECRET missing');
  if (!signatureHeader) throw new Error('stripe-signature header missing');

  // Format: t=TIMESTAMP,v1=SIG[,v1=SIG...]
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => {
      const eq = p.indexOf('=');
      return [p.slice(0, eq), p.slice(eq + 1)];
    })
  );
  const timestamp = parts.t;
  const signatures = signatureHeader
    .split(',')
    .filter((p) => p.startsWith('v1='))
    .map((p) => p.slice(3));
  if (!timestamp || signatures.length === 0) throw new Error('malformed signature');

  const payload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', whsec).update(payload).digest('hex');

  const match = signatures.some((sig) => {
    try {
      return (
        sig.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
      );
    } catch {
      return false;
    }
  });
  if (!match) throw new Error('signature mismatch');

  // F-047 — the pre-fix check was `Math.abs(now - t) > 300`, bidirectional
  // so a crafted future timestamp passed the guard, and `NaN > 300` is
  // false so a non-numeric `t` also passed. Stripe's reference verifier
  // uses one-directional `now - t > tolerance` with `t` validated as a
  // finite number first.
  const tSec = Number(timestamp);
  if (!Number.isFinite(tSec)) throw new Error('timestamp not a finite number');
  const ageSec = Date.now() / 1000 - tSec;
  // Accept small future-skew (up to 30s, covers NTP drift) but reject
  // anything older than 5 minutes.
  if (ageSec < -30) throw new Error('timestamp too far in the future');
  if (ageSec > 300) throw new Error('timestamp too old');

  return JSON.parse(rawBody);
}
