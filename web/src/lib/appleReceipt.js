// Apple StoreKit 2 JWS verification.
//
// iOS sends us `Transaction.jsonRepresentation.base64EncodedString()`, which
// is the UTF-8 bytes of a JWS (a compact JWT signed by Apple) encoded in
// base64. We:
//   1. base64-decode to get the JWS string.
//   2. split on '.' into header / payload / signature (all base64url).
//   3. extract x5c cert chain from the header.
//   4. verify leaf signed by intermediate, intermediate signed by Apple Root
//      CA - G3 (vendored).
//   5. verify the JWT signature (ES256 = ECDSA-P256-SHA256, raw r||s in the
//      JWS) against the leaf cert's public key.
//
// No external Apple API call. No APPLE_SHARED_SECRET (that's for legacy
// StoreKit 1 /verifyReceipt). The root cert is immutable and vendored at
// web/src/lib/certs/apple-root-ca-g3.der (see certs/README.md) or provided
// via APPLE_ROOT_CA_DER_BASE64.

import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// L10: bundle id env override so staging / TestFlight builds with a
// distinct bundle (e.g. com.veritypost.app.dev) don't need a code change
// to verify their own receipts. Defaults to the production bundle so
// existing deploys behave identically without setting the env var.
const EXPECTED_BUNDLE_ID = process.env.APPLE_BUNDLE_ID || 'com.veritypost.app';
const FUTURE_SKEW_MS = 5 * 60 * 1000;

// B14 — signedDate anti-replay windows.
//
// App Store Server Notifications V2 carry a top-level `signedDate` (when
// Apple signed the envelope). The inner transaction JWS also carries a
// `signedDate` distinct from `purchaseDate`. Without a past-date bound,
// a captured-and-replayed old receipt passes signature verification and
// gets treated as fresh — the attacker can re-mint a sub after cancellation
// or re-activate a refunded one.
//
// Tolerances:
//   - Notifications: tight (5 min). S2S delivery is near-realtime; anything
//     older is either a retry storm (Apple caps retries at ~5 days but a
//     5-min window still lets legit retries land) or a replay.
//   - Transaction sync on first pair: LOOSE (24h). A user may pair their
//     device hours or a day after completing the purchase in another app;
//     rejecting a day-old receipt would lock out legitimate first-time
//     sync. 24h is the cap because Apple re-signs receipts on each fetch
//     so a stale signedDate at this magnitude is suspicious.
const SIGNED_DATE_MAX_AGE_NOTIFICATION_MS = 5 * 60 * 1000;
const SIGNED_DATE_MAX_AGE_TRANSACTION_MS = 24 * 60 * 60 * 1000;

function assertSignedDateFresh(signedDate, maxAgeMs, context) {
  if (typeof signedDate !== 'number') {
    // Absent signedDate is suspicious — every real Apple JWS carries one.
    // Refuse rather than silently accepting an unverifiable timestamp.
    throw new Error(`${context}: signedDate missing`);
  }
  const now = Date.now();
  if (signedDate > now + FUTURE_SKEW_MS) {
    throw new Error(`${context}: signedDate is in the future`);
  }
  if (now - signedDate > maxAgeMs) {
    throw new Error(`${context}: signedDate older than allowed window`);
  }
}

let cachedRootCert = null;

function loadRootCert() {
  if (cachedRootCert) return cachedRootCert;

  const envB64 = process.env.APPLE_ROOT_CA_DER_BASE64;
  if (envB64) {
    cachedRootCert = new crypto.X509Certificate(Buffer.from(envB64, 'base64'));
    return cachedRootCert;
  }

  const filePath = path.join(process.cwd(), 'src', 'lib', 'certs', 'apple-root-ca-g3.der');
  let der;
  try {
    der = readFileSync(filePath);
  } catch {
    throw new Error(
      'Apple Root CA - G3 cert not found. Run:\n' +
        '  curl -o web/src/lib/certs/apple-root-ca-g3.der \\\n' +
        '    https://www.apple.com/certificateauthority/AppleRootCA-G3.cer\n' +
        'or set APPLE_ROOT_CA_DER_BASE64.'
    );
  }
  cachedRootCert = new crypto.X509Certificate(der);
  return cachedRootCert;
}

function b64urlDecode(str) {
  const pad = str.length % 4;
  const padded = pad ? str + '='.repeat(4 - pad) : str;
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function parseJws(jwsString) {
  const parts = jwsString.split('.');
  if (parts.length !== 3) throw new Error('malformed JWS');
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = JSON.parse(b64urlDecode(headerB64).toString('utf8'));
  const payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
  const signature = b64urlDecode(signatureB64);

  if (header.alg !== 'ES256') throw new Error(`unsupported alg: ${header.alg}`);
  if (!Array.isArray(header.x5c) || header.x5c.length < 2) {
    throw new Error('JWS header missing x5c chain');
  }

  const signingInput = Buffer.from(`${headerB64}.${payloadB64}`, 'utf8');
  return { header, payload, signature, signingInput };
}

// Verify each cert in the chain is signed by the next. The final cert must be
// signed by the vendored Apple Root CA. Node's X509Certificate.verify(key)
// checks the cert's signature against the issuer's public key.
function verifyChain(x5c) {
  const certs = x5c.map((b64) => new crypto.X509Certificate(Buffer.from(b64, 'base64')));
  const root = loadRootCert();

  for (let i = 0; i < certs.length - 1; i += 1) {
    if (!certs[i].verify(certs[i + 1].publicKey)) {
      throw new Error(`chain break at index ${i}`);
    }
  }
  // The last cert in x5c must be signed by (or be) the root. JWS from Apple
  // commonly includes the root as the last element; accept either.
  const top = certs[certs.length - 1];
  const topSerial = top.serialNumber;
  const rootSerial = root.serialNumber;
  if (topSerial !== rootSerial) {
    if (!top.verify(root.publicKey)) {
      throw new Error('chain does not terminate at Apple Root CA - G3');
    }
  }

  const now = Date.now();
  for (const c of certs) {
    const notBefore = Date.parse(c.validFrom);
    const notAfter = Date.parse(c.validTo);
    if (now < notBefore || now > notAfter) {
      throw new Error(`cert expired or not yet valid (serial=${c.serialNumber})`);
    }
  }

  return certs[0];
}

// ECDSA signatures in JWS are raw r||s (IEEE P1363), not DER. Node's verify
// needs dsaEncoding: 'ieee-p1363' to accept that format directly.
function verifySignature(leaf, signingInput, signature) {
  const ok = crypto.verify(
    'SHA256',
    signingInput,
    { key: leaf.publicKey, dsaEncoding: 'ieee-p1363' },
    signature
  );
  if (!ok) throw new Error('JWS signature invalid');
}

// Pure crypto. Parses a compact JWS string (no base64 wrapper), verifies the
// x5c chain terminates at Apple Root CA - G3, and verifies the ES256
// signature. Returns the parsed payload. Does no application-level checks.
export function verifyJWS(jwsString) {
  if (!jwsString || typeof jwsString !== 'string') {
    throw new Error('JWS missing');
  }
  const { header, payload, signature, signingInput } = parseJws(jwsString);
  const leaf = verifyChain(header.x5c);
  verifySignature(leaf, signingInput, signature);
  return payload;
}

// iOS sends Transaction.jsonRepresentation base64-wrapped. This wrapper
// peels the wrapper, delegates to verifyJWS, then applies transaction-level
// checks (bundleId, clock skew).
export function verifyTransactionJWS(receiptBase64) {
  if (!receiptBase64 || typeof receiptBase64 !== 'string') {
    throw new Error('receipt missing');
  }
  const jwsString = Buffer.from(receiptBase64, 'base64').toString('utf8');
  const payload = verifyJWS(jwsString);

  if (payload.bundleId !== EXPECTED_BUNDLE_ID) {
    throw new Error(`bundleId mismatch: ${payload.bundleId}`);
  }

  const now = Date.now();
  if (typeof payload.purchaseDate === 'number' && payload.purchaseDate > now + FUTURE_SKEW_MS) {
    throw new Error('purchaseDate is in the future');
  }

  // B14 — reject past-dated receipts to close the replay window. Transaction
  // JWSes re-sign on each fetch so a stale signedDate past 24h is either a
  // captured-and-replayed blob or a dramatically stale device state; either
  // way we should refuse to mint / re-activate subscription state.
  assertSignedDateFresh(payload.signedDate, SIGNED_DATE_MAX_AGE_TRANSACTION_MS, 'transaction JWS');

  return payload;
}

// App Store Server Notifications V2: Apple posts { signedPayload }. The JWS
// payload has shape { notificationType, notificationUUID, data: { bundleId,
// environment, signedTransactionInfo, signedRenewalInfo } } where the two
// signed* fields are nested JWSes with their own chains.
//
// Returns { notification, transaction, renewal } — each verified. transaction
// and renewal may be null if absent (some notification types omit them).
export function verifyNotificationJWS(signedPayload) {
  const notification = verifyJWS(signedPayload);

  const bundleId = notification?.data?.bundleId;
  if (bundleId !== EXPECTED_BUNDLE_ID) {
    throw new Error(`notification bundleId mismatch: ${bundleId}`);
  }

  // B14 — S2S notifications have tight freshness. Apple signs + delivers
  // in near-realtime; a >5min gap means either an abusive retry / replay
  // or a clock-skewed server we'd rather surface than silently accept.
  assertSignedDateFresh(
    notification.signedDate,
    SIGNED_DATE_MAX_AGE_NOTIFICATION_MS,
    'notification JWS'
  );

  let transaction = null;
  if (notification.data?.signedTransactionInfo) {
    transaction = verifyJWS(notification.data.signedTransactionInfo);
    if (transaction.bundleId !== EXPECTED_BUNDLE_ID) {
      throw new Error(`nested transaction bundleId mismatch: ${transaction.bundleId}`);
    }
    // Nested transaction gets the same notification-tight window — if
    // Apple signed the envelope now, the embedded transaction should be
    // recent too. A stale nested transaction + fresh envelope is the
    // classic replay pattern.
    assertSignedDateFresh(
      transaction.signedDate,
      SIGNED_DATE_MAX_AGE_NOTIFICATION_MS,
      'nested transaction JWS'
    );
  }

  let renewal = null;
  if (notification.data?.signedRenewalInfo) {
    renewal = verifyJWS(notification.data.signedRenewalInfo);
  }

  return { notification, transaction, renewal };
}

// Resolve the StoreKit product ID to the plans row. plans.apple_product_id
// is seeded by migration schema/036_ios_subscription_plans.sql.
export async function resolvePlanByAppleProductId(service, productId) {
  const { data, error } = await service
    .from('plans')
    .select('id, name, tier')
    .eq('apple_product_id', productId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`no plan for apple_product_id=${productId}`);
  return data;
}
