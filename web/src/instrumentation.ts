// T-027 — Sentry instrumentation hook.
//
// Replaces the deprecated `sentry.server.config.js` + `sentry.edge.config.js`
// pattern that Next.js 13.4+ warns about at boot:
//
//   [@sentry/nextjs] Please ensure to put this file's content into
//   the register() function of a Next.js instrumentation hook instead.
//
// Client-side init stays in `web/sentry.client.config.js` — that's
// still the supported browser-bundle entry point.
//
// Both runtime branches share the same config; only the Sentry.init
// call is per-runtime so @sentry/nextjs picks the right transport.

export async function register() {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  const Sentry = await import('@sentry/nextjs');
  // Shared PII scrubber lives at web/sentry.shared.js (CJS).
  const sentryShared = (await import('../sentry.shared.js')) as {
    scrubPII: (e: unknown) => unknown;
  };
  const { scrubPII } = sentryShared;

  const baseConfig = {
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    tracesSampleRate: 0,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    beforeSend: scrubPII as (event: unknown, hint: unknown) => unknown,
  } as Parameters<typeof Sentry.init>[0];

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init(baseConfig);
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init(baseConfig);
  }
}
