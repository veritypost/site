'use client';
import { useEffect, useMemo } from 'react';

// Route-level error boundary. Next.js calls this when a Server or
// Client component in this segment throws. We POST the error to
// /api/errors for aggregation and show the user a safe fallback.
//
// Y5-#4 — error type detection + Contact support CTA. Old version was
// "Something went wrong / Try again" with a single home link. Now we
// classify the error broadly (network vs server vs unknown) and surface
// /help as a fallback when retry isn't likely to help.
function classifyError(error) {
  const msg = String(error?.message || '').toLowerCase();
  if (
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('networkerror') ||
    msg.includes('load failed')
  ) {
    return {
      kind: 'network',
      title: 'Connection problem',
      body: 'We couldn’t reach the server. Check your internet connection and try again.',
    };
  }
  if (
    msg.includes('500') ||
    msg.includes('internal server') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504')
  ) {
    return {
      kind: 'server',
      title: 'Server error',
      body: 'Something went wrong on our end. The error has been reported — please try again in a moment.',
    };
  }
  return {
    kind: 'unknown',
    title: 'Something went wrong',
    body: 'The error has been reported. You can try again or head back to the home page.',
  };
}

export default function RouteError({ error, reset }) {
  useEffect(() => {
    fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error?.message || 'Unknown error',
        stack: error?.stack || null,
        route: typeof window !== 'undefined' ? window.location.pathname : null,
        severity: 'error',
        metadata: { digest: error?.digest || null },
      }),
    }).catch(() => {});
  }, [error]);

  const meta = useMemo(() => classifyError(error), [error]);

  const btnBase = {
    padding: '10px 18px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    textDecoration: 'none',
    cursor: 'pointer',
  };

  return (
    <div style={{ padding: '48px 20px', textAlign: 'center', color: '#5a5a5a' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#111', marginBottom: 8 }}>
        {meta.title}
      </div>
      <div style={{ fontSize: 14, marginBottom: 20, maxWidth: 480, margin: '0 auto 20px' }}>
        {meta.body}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 10,
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={() => reset()}
          style={{
            ...btnBase,
            border: 'none',
            background: '#111',
            color: '#fff',
          }}
        >
          Try again
        </button>
        <a
          href="/"
          style={{
            ...btnBase,
            border: '1px solid #e5e5e5',
            background: 'transparent',
            color: '#111',
          }}
        >
          Go home
        </a>
        <a
          href="/help"
          style={{
            ...btnBase,
            border: '1px solid #e5e5e5',
            background: 'transparent',
            color: '#111',
          }}
        >
          Contact support
        </a>
      </div>
    </div>
  );
}
