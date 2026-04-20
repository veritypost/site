// T-010 — resolve NEXT_PUBLIC_SITE_URL with a production-hard fallback.
// Prior routes used `process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3333'`
// directly. If the env var is missing in prod (e.g., a new Vercel env
// not wired up before deploy), password-reset and email-verification
// links end up pointing at `localhost:3333` on the user's own machine.
// This helper throws instead, turning the defect into a 500 that
// Sentry catches, rather than a silent delivery of a broken link.

const DEV_FALLBACK = 'http://localhost:3333';

function isProdLike() {
  return (
    process.env.VERCEL_ENV === 'production' ||
    process.env.VERCEL_ENV === 'preview' ||
    process.env.NODE_ENV === 'production'
  );
}

// Returns the resolved site URL as a string, with trailing slashes
// trimmed. Throws in prod-like environments when the env var is
// missing or empty. In dev, returns the localhost fallback so
// `npm run dev` keeps working without env setup.
export function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (raw && raw.trim()) return raw.trim().replace(/\/+$/, '');
  if (isProdLike()) {
    throw new Error('NEXT_PUBLIC_SITE_URL is required in production');
  }
  return DEV_FALLBACK;
}

// Same resolution, but returns `null` instead of throwing in prod.
// Use where the caller already has a sensible fallback (e.g., the
// send-emails cron defaults to `https://veritypost.com`).
export function getSiteUrlOrNull() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (raw && raw.trim()) return raw.trim().replace(/\/+$/, '');
  return isProdLike() ? null : DEV_FALLBACK;
}
