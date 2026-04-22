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
