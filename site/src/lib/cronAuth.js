import crypto from 'node:crypto';

// F-079 / F-080 — cron routes previously authenticated via
// `sent === 'Bearer ${secret}'`, a non-constant-time string compare
// that leaks the secret through timing. Vercel also sets a platform
// signal (`x-vercel-cron: 1`) when the Vercel scheduler invokes a
// cron; if present, we accept that as an additional proof of origin.
//
// Policy:
//   - If x-vercel-cron header is present AND the request bears a
//     valid secret, allow.
//   - If only the secret is present (external invocation for manual
//     backfill or third-party pings), still allow — but constant-time
//     compare.
//   - Otherwise deny 403.
export function verifyCronAuth(request) {
  const sent = request.headers.get('authorization') || '';
  const expected = process.env.CRON_SECRET;
  if (!expected) return { ok: false, reason: 'CRON_SECRET missing' };

  const expectedHeader = `Bearer ${expected}`;

  // crypto.timingSafeEqual throws on length mismatch, so normalize
  // lengths via padEnd before compare. A mismatched length can still
  // leak "wrong length" through the throw, but we catch and return
  // false the same way a mismatch returns false.
  const a = Buffer.from(sent);
  const b = Buffer.from(expectedHeader);
  let match = false;
  try {
    match = a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    match = false;
  }

  if (!match) return { ok: false, reason: 'bad_secret' };
  return { ok: true, vercel_cron: request.headers.get('x-vercel-cron') === '1' };
}
