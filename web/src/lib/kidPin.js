// Kid PIN hashing — server-side only.
//
// Used by:
//   - /api/kids           (POST; first PIN set on profile creation)
//   - /api/kids/trial     (POST; first PIN set on trial creation)
//   - /api/kids/set-pin   (PIN change)
//   - /api/kids/verify-pin (PIN entry; transparent rehash of legacy rows)
//
// History
// -------
// The pre-Chunk-5 code hashed kid PINs as raw SHA-256(utf-8(pin)) on the
// client AND on the server (matching function), then stored the hash
// directly in `kid_profiles.pin_hash`. PIN space is 10,000 (four
// digits). A full rainbow table fits in ~200 KB. Any DB dump recovered
// every kid's PIN instantly. See DA-109 / F-085.
//
// After migration 058 each kid_profiles row carries:
//   pin_hash       — hex-encoded digest bytes
//   pin_salt       — hex-encoded random salt (NULL for legacy rows)
//   pin_hash_algo  — 'sha256' (legacy) or 'pbkdf2' (current)
//
// Verification dispatches on the algo; on a successful legacy verify,
// the caller transparently rehashes to pbkdf2 and updates the row —
// no forced PIN reset flow.

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_BITS = 256;
const SALT_BYTES = 16;

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0) {
    throw new Error('kidPin: invalid hex string');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

export function generateSalt() {
  const buf = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(buf);
  return toHex(buf);
}

export async function hashPinPbkdf2(pin, saltHex) {
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    throw new Error('kidPin: pin must be 4 digits');
  }
  if (typeof saltHex !== 'string' || saltHex.length !== SALT_BYTES * 2) {
    throw new Error('kidPin: salt must be hex of configured length');
  }
  const pinBytes = new TextEncoder().encode(pin);
  const saltBytes = fromHex(saltHex);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    pinBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
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

// Legacy unsalted SHA-256. Present only to verify kid_profiles rows
// created before migration 058. Not used for new hashes.
export async function hashPinSha256Legacy(pin) {
  const data = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
}

// Constant-time-ish string compare to avoid timing leaks on the final
// hash comparison. Hex strings only; both sides hashed with the same
// algo before this is called.
function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// Verify a submitted PIN against stored credentials.
// Returns { ok: boolean, needsRehash: boolean }.
// `needsRehash = true` signals the caller to write a fresh PBKDF2 hash
// + salt + algo after a successful legacy match.
export async function verifyPinForRow(pin, row) {
  if (!row || !row.pin_hash) return { ok: false, needsRehash: false };

  if (row.pin_hash_algo === 'pbkdf2') {
    if (!row.pin_salt) return { ok: false, needsRehash: false };
    const computed = await hashPinPbkdf2(pin, row.pin_salt);
    return { ok: constantTimeEqual(computed, row.pin_hash), needsRehash: false };
  }

  // Default legacy path — treats missing or 'sha256' algo the same.
  const computed = await hashPinSha256Legacy(pin);
  const ok = constantTimeEqual(computed, row.pin_hash);
  return { ok, needsRehash: ok };
}

// Produce a fresh (hash, salt, algo) triple for a new or rotated PIN.
export async function buildPbkdf2Credential(pin) {
  const salt = generateSalt();
  const hash = await hashPinPbkdf2(pin, salt);
  return { pin_hash: hash, pin_salt: salt, pin_hash_algo: 'pbkdf2' };
}
