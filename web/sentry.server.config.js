// Sentry server-side init (Node runtime routes, server components,
// API handlers). Loaded automatically by @sentry/nextjs.
// DSN-guarded.

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  // eslint-disable-next-line global-require
  const Sentry = require('@sentry/nextjs');
  // eslint-disable-next-line global-require
  const { scrubPII } = require('./sentry.shared');
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    tracesSampleRate: 0,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    // T-033 — strip PII before events leave the server.
    beforeSend: scrubPII,
  });
}
