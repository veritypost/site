'use client';
import { useEffect } from 'react';

// Route-level error boundary. Next.js calls this when a Server or
// Client component in this segment throws. We POST the error to
// /api/errors for aggregation and show the user a safe fallback.
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

  return (
    <div style={{ padding: '48px 20px', textAlign: 'center', color: '#666' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#111', marginBottom: 8 }}>
        Something went wrong.
      </div>
      <div style={{ fontSize: 14, marginBottom: 20 }}>
        The error has been reported. You can try again or head back to the home page.
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button
          onClick={() => reset()}
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: 'none',
            background: '#111',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
        <a
          href="/"
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: '1px solid #e5e5e5',
            background: 'transparent',
            color: '#111',
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Go home
        </a>
      </div>
    </div>
  );
}
