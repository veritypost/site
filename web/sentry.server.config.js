// Sentry server-side init (Node runtime routes, server components,
// API handlers). Loaded automatically by @sentry/nextjs.
// DSN-guarded.

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  // eslint-disable-next-line global-require
  const Sentry = require('@sentry/nextjs');
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    tracesSampleRate: 0,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
  });
}
