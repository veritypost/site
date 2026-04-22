// Sentry client-side init. Loaded automatically by @sentry/nextjs
// during browser bundling. DSN-guarded so a missing
// NEXT_PUBLIC_SENTRY_DSN produces a silent no-op (dev + pre-rotation
// prod both safe).
//
// DA-133 / F-207 — pre-Chunk-10 this file did not exist and
// observability.js held commented-out stubs. Wiring here is the
// minimum launch-grade error visibility.

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  // Dynamic require keeps the bundle shape intact when the package is
  // not yet installed. Post-`npm install` this resolves.
  // eslint-disable-next-line global-require
  const Sentry = require('@sentry/nextjs');
  // eslint-disable-next-line global-require
  const { scrubPII } = require('./sentry.shared');
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || 'development',
    // Keep tracing off until we have a performance budget. Errors
    // only is cheap and covers the P0 "we are blind in prod" gap.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Release tagging lets us group errors per deploy. Vercel sets
    // this automatically.
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    // Avoid firing Sentry self-errors into Sentry (loop prevention).
    ignoreErrors: ['Non-Error promise rejection captured', 'ResizeObserver loop'],
    // T-033 — strip emails, Authorization headers, request-body secrets.
    beforeSend: scrubPII,
  });
}
