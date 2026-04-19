import crypto from 'node:crypto';

// F-079 / F-080 / H-21 — cron routes previously authenticated via
// `sent === 'Bearer ${secret}'`, a non-constant-time string compare
// that leaks the secret through timing. Vercel also sets a platform
// signal (`x-vercel-cron: 1`) when the Vercel scheduler invokes a
// cron; Vercel strips this header from any non-cron inbound request,
// so external callers cannot set it.
//
// Policy (H-21):
//   - If x-vercel-cron: 1 is present, allow on that alone. The
//     platform signal is sufficient proof of origin and means the
//     scheduler does not need to carry the bearer.
//   - Else, require a valid bearer in the Authorization header via
//     constant-time compare. This path covers manual backfills and
//     third-party pings.
//   - Otherwise deny.
export function verifyCronAuth(request) {
  const vercelCron = request.headers.get('x-vercel-cron') === '1';

  // Vercel platform scheduler path: trust the header on its own.
  if (vercelCron) return { ok: true, vercel_cron: true };

  // External / manual invocation: require bearer, constant-time.
  const expected = process.env.CRON_SECRET;
  if (!expected) return { ok: false, reason: 'CRON_SECRET missing' };

  const sent = request.headers.get('authorization') || '';
  const expectedHeader = `Bearer ${expected}`;

  // crypto.timingSafeEqual throws on length mismatch, so gate on
  // length first. A mismatched length can still leak "wrong length"
  // through the length check, but we return the same `bad_secret`
  // reason either way.
  const a = Buffer.from(sent);
  const b = Buffer.from(expectedHeader);
  let match = false;
  try {
    match = a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    match = false;
  }

  if (!match) return { ok: false, reason: 'bad_secret' };
  return { ok: true, vercel_cron: false };
}
