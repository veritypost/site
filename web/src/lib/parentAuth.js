// Parent-mode auth helpers — server-side only.
//
// Centralizes the JWT, session-revocation, audit-log, and lockout-policy
// logic shared by every /api/kids/parent/* route. Routes stay thin and
// route-specific; everything else lives here so a future change to the
// elevated-token shape or the lockout tiers is a one-file edit.
//
// Concepts
// --------
//
//   Kid token       — the JWT minted by /api/kids/pair{,-direct} or rotated
//                     by /api/kids/refresh. Carries is_kid_delegated=true
//                     and kid_profile_id/parent_user_id (top-level + in
//                     app_metadata, per S3-Q3b). The kids iOS app holds
//                     this token even when the parent is signed out — so
//                     it is the only proof of "this device is paired to
//                     this parent" available at the elevate moment.
//
//   Elevated parent — a separate, short-lived (30min default) JWT minted
//   token             AFTER the parent enters their PIN against a kid
//                     token. Carries is_parent_elevated=true plus a unique
//                     parent_session_id (jti). The single-row revocation
//                     gate is parent_pins.active_session_id — if a token's
//                     parent_session_id doesn't match the row, the token
//                     is dead even if its signature + exp are valid.
//
//   Lockout tiers   — per spec:
//                       tier 1: 5 wrong  → 60s cooldown
//                       tier 2: 10 wrong → 15min cooldown + email alert
//                       tier 3: 20 wrong → PIN locked, must reset via OTP
//                     pin_attempts is the cumulative counter on the row;
//                     it is reset to 0 only on a successful elevate or a
//                     successful reset-pin/confirm. Tier transitions are
//                     evaluated at the new attempt count after a failure.

import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sentinel used as `pin_locked_until` when tier-3 fires. Far enough in the
// future that any retry from the device sees "locked"; reset-pin/confirm
// clears it. We avoid a separate boolean column (Chunk 1 schema doesn't
// have one) and instead let iOS interpret a long lockout (>1h) as
// "tier-3 — must reset via OTP".
const TIER3_LOCK_ISO = '9999-12-31T23:59:59.000Z';

// ── Kid-token verification ────────────────────────────────────────────────
//
// Mirrors the inline pattern used by /api/kids/refresh (kid_token shape
// guard) and /api/kids/pair-direct (UUID guard on parent_user_id). Reads
// claims from BOTH top-level and app_metadata for forward-compat with the
// post-Q3b Supabase-issuer shape.
//
// Returns { parentUserId, kidProfileId } on success, null on any failure.
// Never throws — caller decides the response code.
export function verifyKidToken(token) {
  if (typeof token !== 'string' || token.length < 16) return null;
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;

  let decoded;
  try {
    decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch {
    return null;
  }

  const meta =
    decoded && decoded.app_metadata && typeof decoded.app_metadata === 'object'
      ? decoded.app_metadata
      : {};

  const isKidDelegated =
    decoded?.is_kid_delegated === true || meta.is_kid_delegated === true;
  const kidProfileId =
    (typeof decoded?.kid_profile_id === 'string' && decoded.kid_profile_id) ||
    (typeof meta.kid_profile_id === 'string' && meta.kid_profile_id) ||
    null;
  const parentUserId =
    (typeof decoded?.parent_user_id === 'string' && decoded.parent_user_id) ||
    (typeof meta.parent_user_id === 'string' && meta.parent_user_id) ||
    null;

  if (!isKidDelegated || !kidProfileId || !parentUserId) return null;
  if (!UUID_RE.test(parentUserId) || !UUID_RE.test(kidProfileId)) return null;

  return { parentUserId, kidProfileId };
}

// ── Elevated-parent-token verification ────────────────────────────────────
//
// Returns { parentUserId, parentSessionId, kidContext, exp } on signature/
// claim success, null otherwise. The CALLER must additionally call
// `isElevatedSessionLive` to confirm the jti still matches
// parent_pins.active_session_id — that's the single-row revocation gate.
// Verification alone is not sufficient because end-session, set-pin, and
// reset-pin/confirm all clear active_session_id while the token's exp may
// still be in the future.
export function verifyElevatedParentToken(token) {
  if (typeof token !== 'string' || token.length < 16) return null;
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;

  let decoded;
  try {
    decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch {
    return null;
  }

  const meta =
    decoded && decoded.app_metadata && typeof decoded.app_metadata === 'object'
      ? decoded.app_metadata
      : {};

  const isElevated =
    decoded?.is_parent_elevated === true || meta.is_parent_elevated === true;
  const parentUserId = typeof decoded?.sub === 'string' ? decoded.sub : null;
  const parentSessionId =
    (typeof decoded?.parent_session_id === 'string' && decoded.parent_session_id) ||
    (typeof meta.parent_session_id === 'string' && meta.parent_session_id) ||
    null;
  const kidContext =
    (typeof decoded?.kid_context === 'string' && decoded.kid_context) ||
    (typeof meta.kid_context === 'string' && meta.kid_context) ||
    null;

  if (!isElevated || !parentUserId || !parentSessionId) return null;
  if (!UUID_RE.test(parentUserId) || !UUID_RE.test(parentSessionId)) return null;

  return {
    parentUserId,
    parentSessionId,
    kidContext,
    exp: typeof decoded?.exp === 'number' ? decoded.exp : null,
  };
}

// Single-row revocation gate. Returns true iff parent_pins.active_session_id
// equals the supplied parentSessionId. Service-role read.
export async function isElevatedSessionLive(svc, parentUserId, parentSessionId) {
  if (!parentUserId || !parentSessionId) return false;
  const { data, error } = await svc
    .from('parent_pins')
    .select('active_session_id')
    .eq('parent_user_id', parentUserId)
    .maybeSingle();
  if (error || !data) return false;
  return data.active_session_id === parentSessionId;
}

// ── Mint elevated parent JWT ──────────────────────────────────────────────
//
// HS256, signed with SUPABASE_JWT_SECRET. Issuer matches the Supabase auth
// URL so any Supabase-aware decoder treats this as a first-class session;
// the is_parent_elevated marker is what gates parent-only routes (we never
// rely on this token for a kids-side identity).
//
// Returns { token, expiresAt: ISO string, sessionId }.
export function mintElevatedParentJwt({ parentUserId, kidProfileId, ttlSeconds }) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error('SUPABASE_JWT_SECRET not configured');
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('SUPABASE_URL not configured');
  if (!parentUserId || !UUID_RE.test(parentUserId)) {
    throw new Error('mintElevatedParentJwt: bad parentUserId');
  }

  const sessionId = crypto.randomUUID();
  const nowSec = Math.floor(Date.now() / 1000);
  const ttl = Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : 1800;
  const exp = nowSec + ttl;
  const issuer = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`;

  const payload = {
    iss: issuer,
    aud: 'authenticated',
    role: 'authenticated',
    sub: parentUserId,
    iat: nowSec,
    exp,
    is_parent_elevated: true,
    parent_session_id: sessionId,
    kid_context: kidProfileId || null,
    app_metadata: {
      is_parent_elevated: true,
      parent_session_id: sessionId,
      kid_context: kidProfileId || null,
    },
  };

  const token = jwt.sign(payload, secret, { algorithm: 'HS256' });
  return {
    token,
    expiresAt: new Date(exp * 1000).toISOString(),
    sessionId,
  };
}

// ── Audit log ─────────────────────────────────────────────────────────────
//
// Best-effort INSERT into parent_auth_events. A failure here MUST NOT block
// the calling route — we log to the server console and swallow. Audit
// gaps are operationally-detectable; a failed elevate due to a
// transient audit-table write is not.
export async function logParentEvent(
  svc,
  { parentUserId, eventType, metadata, ip, userAgent }
) {
  if (!svc || !parentUserId || !eventType) return;
  try {
    const { error } = await svc.from('parent_auth_events').insert({
      parent_user_id: parentUserId,
      event_type: eventType,
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
      ip: ip || null,
      user_agent: typeof userAgent === 'string' ? userAgent.slice(0, 512) : null,
    });
    if (error) {
      console.error('[parentAuth.logEvent]', eventType, error.message || error);
    }
  } catch (err) {
    console.error('[parentAuth.logEvent.threw]', eventType, err?.message || err);
  }
}

// ── Lockout policy ────────────────────────────────────────────────────────
//
// Pure function. Given the current parent_pins row + the loaded settings
// snapshot, returns the patch the caller should write back after a failed
// PIN entry:
//
//   {
//     pin_attempts:           <new count>,
//     pin_locked_until:       <ISO string | null>,
//     tier:                   1 | 2 | 3 | 0,            // 0 = no lockout
//     emailAlert:             true | false,             // fire tier-2 alert
//     tier3:                  true | false,             // tier-3 sentinel
//   }
//
// Caller is responsible for writing pin_attempts + pin_locked_until back
// to the row, sending the email alert (best-effort), and shaping the HTTP
// response (always 401 incorrect_pin to avoid leaking attempt counts;
// 429 with Retry-After when the row WAS already locked at request time).
export function applyLockoutOnFailure(row, settings) {
  const get = (k, fb) => {
    const v = settings ? settings[k] : undefined;
    if (v === undefined || v === null) return fb;
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
  };
  const tier1Threshold = get('kids.parent_pin.max_attempts', 5);
  const tier1Lockout = get('kids.parent_pin.tier1_lockout_seconds', 60);
  const tier2Threshold = get('kids.parent_pin.tier2_threshold', 10);
  const tier2Lockout = get('kids.parent_pin.tier2_lockout_seconds', 900);
  const tier3Threshold = get('kids.parent_pin.tier3_threshold', 20);
  const emailAlertThreshold = get('kids.parent_pin.email_alert_threshold', 10);

  const prev = Number.isFinite(row?.pin_attempts) ? row.pin_attempts : 0;
  const next = prev + 1;

  let tier = 0;
  let lockSec = 0;
  let tier3 = false;

  if (next >= tier3Threshold) {
    tier = 3;
    tier3 = true;
  } else if (next >= tier2Threshold) {
    tier = 2;
    lockSec = tier2Lockout;
  } else if (next >= tier1Threshold) {
    tier = 1;
    lockSec = tier1Lockout;
  }

  let pinLockedUntil = null;
  if (tier3) {
    pinLockedUntil = TIER3_LOCK_ISO;
  } else if (lockSec > 0) {
    pinLockedUntil = new Date(Date.now() + lockSec * 1000).toISOString();
  }

  // Email alert: fires on the FIRST failure that crosses the threshold,
  // not every failure thereafter. Caller can also short-circuit by
  // checking `prev < threshold && next >= threshold` if it wants.
  const emailAlert =
    prev < emailAlertThreshold && next >= emailAlertThreshold;

  return {
    pin_attempts: next,
    pin_locked_until: pinLockedUntil,
    tier,
    emailAlert,
    tier3,
    lockSec,
  };
}

// Helper for routes that want to render a "you're locked" 429 from a row
// whose pin_locked_until is in the future. Returns { locked: bool,
// retryAfter: seconds, tier3: bool }.
export function readActiveLockout(row) {
  if (!row || !row.pin_locked_until) return { locked: false, retryAfter: 0, tier3: false };
  const t = Date.parse(row.pin_locked_until);
  if (!Number.isFinite(t) || t <= Date.now()) {
    return { locked: false, retryAfter: 0, tier3: false };
  }
  const retryAfter = Math.max(1, Math.ceil((t - Date.now()) / 1000));
  // Treat anything > 1 hour as tier-3 (real cooldowns are 60s / 900s).
  const tier3 = retryAfter > 3600;
  return { locked: true, retryAfter, tier3 };
}
