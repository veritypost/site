// Parent PIN hashing — server-side only.
//
// Used by:
//   - /api/kids/parent/set-pin     (POST; first PIN set or rotation)
//   - /api/kids/parent/elevate     (POST; PIN entry; mints elevated parent JWT)
//   - /api/kids/parent/reset-pin   (POST; OTP-gated PIN reset)
//
// Differences from web/src/lib/kidPin.js:
//   - Accepts 4–6 digit PINs (kid PIN is fixed at 4). iOS UI recommends 6
//     for parents but we accept 4 so devices that already trained users on
//     a 4-digit kid PIN aren't forced to a different keypad geometry.
//   - Adds a weak-PIN denylist (4-of-a-kind, ascending/descending runs) so
//     parent PINs cannot be `0000`, `1234`, `654321`, etc.
//   - Reuses the kid module's PBKDF2 primitives (100k iters, SHA-256, 16-byte
//     salt, hex encoding) — same algorithm/iterations/format on disk so a
//     future "unify" refactor is a column-swap, not a rehash sweep.
//
// `parent_pins` row shape (Chunk 1 migration):
//   pin_hash       — hex-encoded PBKDF2 digest
//   pin_salt       — hex-encoded random salt
//   pin_hash_algo  — 'pbkdf2' (no legacy values; this table is new)

import { generateSalt, verifyPinForRow as kidVerifyPinForRow } from './kidPin';

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_BITS = 256;
const SALT_BYTES = 16;

// Trivially weak PINs we refuse to hash. The 4-digit list mirrors what the
// iOS Kids app rejects on first-time PIN setup (sequential + same-digit).
// 6-digit list is the parent-recommended default; 5-digit is in between.
const WEAK_PINS = new Set([
  // 4-digit
  '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '1234', '2345', '3456', '4567', '5678', '6789',
  '4321', '5432', '6543', '7654', '8765', '9876',
  '0123', '9210',
  // 5-digit
  '00000', '11111', '22222', '33333', '44444', '55555', '66666', '77777', '88888', '99999',
  '12345', '23456', '34567', '45678', '56789',
  '54321', '65432', '76543', '87654', '98765',
  // 6-digit
  '000000', '111111', '222222', '333333', '444444',
  '555555', '666666', '777777', '888888', '999999',
  '123456', '234567', '345678', '456789',
  '654321', '765432', '876543', '987654',
  '012345', '098765',
]);

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0) {
    throw new Error('parentPin: invalid hex string');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

// Returns null on success, a short machine-readable error string on failure.
// Caller maps to its own 400 response shape.
export function validateParentPin(pin) {
  if (typeof pin !== 'string') return 'pin_required';
  if (!/^\d{4,6}$/.test(pin)) return 'pin_format';
  if (WEAK_PINS.has(pin)) return 'pin_too_weak';
  return null;
}

// PBKDF2 hash for parent PINs. Same algorithm/iters as kidPin.hashPinPbkdf2;
// the only difference is the input length assertion (4–6 vs exactly 4).
// Re-implemented locally rather than re-exported because kidPin.hashPinPbkdf2
// throws on `pin.length !== 4` and we don't want a stringly-coupled try/catch.
async function hashParentPinPbkdf2(pin, saltHex) {
  if (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) {
    throw new Error('parentPin: pin must be 4–6 digits');
  }
  if (typeof saltHex !== 'string' || saltHex.length !== SALT_BYTES * 2) {
    throw new Error('parentPin: salt must be hex of configured length');
  }
  const pinBytes = new TextEncoder().encode(pin);
  const saltBytes = fromHex(saltHex);
  const keyMaterial = await crypto.subtle.importKey('raw', pinBytes, { name: 'PBKDF2' }, false, [
    'deriveBits',
  ]);
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    PBKDF2_KEY_BITS
  );
  return toHex(derived);
}

// Produce a fresh (hash, salt, algo) triple for a new or rotated parent PIN.
// Pure function over the PIN input; no DB writes.
export async function buildParentPinCredential(pin) {
  const salt = generateSalt();
  const hash = await hashParentPinPbkdf2(pin, salt);
  return { pin_hash: hash, pin_salt: salt, pin_hash_algo: 'pbkdf2' };
}

// Verify a submitted parent PIN against a parent_pins row.
// Returns { ok: boolean, needsRehash: boolean }.
//
// Today every parent_pins row is born with algo='pbkdf2' (the table is new
// in Chunk 1). If a future migration ever introduces a legacy algo we'd
// branch here the way kidPin does. For pbkdf2 rows we delegate to kidPin's
// verifyPinForRow because its PBKDF2 path is digit-count-agnostic — it
// recomputes the hash with whatever PIN the caller passed, salts match,
// constant-time-ish compare. Reusing it keeps a single audited compare.
export async function verifyParentPinForRow(pin, row) {
  if (!row || !row.pin_hash) return { ok: false, needsRehash: false };
  // kidPin.verifyPinForRow's pbkdf2 branch calls hashPinPbkdf2 which asserts
  // exactly 4 digits — so we can't delegate for 5/6-digit parent PINs. Do
  // the verify locally for any non-4-digit input; only delegate for the
  // 4-digit case so we stay consistent with the audited kid-side path.
  if (row.pin_hash_algo === 'pbkdf2') {
    if (!row.pin_salt) return { ok: false, needsRehash: false };
    if (typeof pin === 'string' && pin.length === 4) {
      return kidVerifyPinForRow(pin, row);
    }
    const computed = await hashParentPinPbkdf2(pin, row.pin_salt);
    // Constant-time-ish hex compare (mirrors kidPin's helper).
    if (typeof computed !== 'string' || computed.length !== row.pin_hash.length) {
      return { ok: false, needsRehash: false };
    }
    let diff = 0;
    for (let i = 0; i < computed.length; i++) {
      diff |= computed.charCodeAt(i) ^ row.pin_hash.charCodeAt(i);
    }
    return { ok: diff === 0, needsRehash: false };
  }
  // No legacy algo defined for parent_pins — refuse.
  return { ok: false, needsRehash: false };
}
