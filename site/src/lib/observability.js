// Error + analytics sink for the Verity Post app.
//
// DA-133 / DA-134 / F-207 — pre-Chunk-10 this module was commented-
// out stubs, so 35 `console.error` sites across the codebase went
// into Vercel function logs with 7-day retention and no alerting.
// Now: every `captureException` call routes to Sentry when
// NEXT_PUBLIC_SENTRY_DSN (client) or SENTRY_DSN (server) is set.
// Missing DSN → silent no-op on client, dev console on server.
//
// PostHog analytics is intentionally deferred (owner decision, out
// of audit rapid-repair scope). The track/identify/resetIdentity
// helpers are kept as no-op stubs to avoid churn at call sites when
// the analytics vendor lands.

function hasClientDsn() {
  return typeof process !== 'undefined' && Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);
}

function hasServerDsn() {
  return typeof process !== 'undefined'
    && Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);
}

async function loadSentryIfInstalled() {
  try {
    const mod = await import('@sentry/nextjs');
    return mod;
  } catch {
    return null;
  }
}

// Capture an exception with optional context.
// Safe to call before @sentry/nextjs is installed — falls back to
// console.error in development. Always awaitable so callers can
// `await` without branching.
export async function captureException(err, context) {
  const isServer = typeof window === 'undefined';
  const dsnPresent = isServer ? hasServerDsn() : hasClientDsn();

  if (dsnPresent) {
    const Sentry = await loadSentryIfInstalled();
    if (Sentry?.captureException) {
      Sentry.withScope((scope) => {
        if (context && typeof context === 'object') {
          for (const [k, v] of Object.entries(context)) {
            scope.setExtra(k, v);
          }
        }
        Sentry.captureException(err);
      });
      return;
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    console.error('[observability] captureException', err, context);
  }
}

// Low-severity breadcrumb / log. Sentry has `captureMessage`; we use
// it for interesting non-error events ("admin granted owner role",
// "cron exceeded batch size", etc.).
export async function captureMessage(message, level = 'info', context) {
  const isServer = typeof window === 'undefined';
  const dsnPresent = isServer ? hasServerDsn() : hasClientDsn();

  if (dsnPresent) {
    const Sentry = await loadSentryIfInstalled();
    if (Sentry?.captureMessage) {
      Sentry.withScope((scope) => {
        scope.setLevel(level);
        if (context && typeof context === 'object') {
          for (const [k, v] of Object.entries(context)) {
            scope.setExtra(k, v);
          }
        }
        Sentry.captureMessage(message);
      });
      return;
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[observability] ${level}: ${message}`, context || '');
  }
}

// Tag the current Sentry scope with user identity so subsequent
// errors carry it. Client side only (Sentry server scope is
// per-request and managed by the SDK).
export async function setUser(userId, extra) {
  if (typeof window === 'undefined') return;
  if (!hasClientDsn()) return;
  const Sentry = await loadSentryIfInstalled();
  if (!Sentry?.setUser) return;
  Sentry.setUser(userId ? { id: userId, ...(extra || {}) } : null);
}

// ---- Analytics stubs (deferred) -----------------------------------
// PostHog wiring is intentionally out of scope for the rapid repair
// pass. These stubs preserve the call shape so existing callers
// continue to work; a future chunk replaces the bodies.

export async function track(event, props) { void event; void props; }
export async function identify(userId, traits) { void userId; void traits; }
export async function resetIdentity() {}

export function initObservability() {
  // Sentry is initialized via sentry.client.config.js /
  // sentry.server.config.js / sentry.edge.config.js, which
  // @sentry/nextjs loads automatically. Nothing to do here at
  // runtime. Kept as a named export because app/layout.js mounts
  // <ObservabilityInit /> which calls this on app boot.
}
