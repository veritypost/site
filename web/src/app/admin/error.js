'use client';
import { useEffect } from 'react';

// T169 — admin-segment error boundary. Mirrors story/[slug]/error.js
// and profile/error.js: post the failure to /api/errors so admin
// crashes show up in the same triage stream as user-facing ones,
// then offer a reset button. Without this, an admin sub-route
// throwing client-side fell back to global-error.js which has less
// admin context and no reporting tag.
export default function Error({ error, reset }) {
  useEffect(() => {
    fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error?.message || 'Unknown admin error',
        stack: error?.stack || null,
        route: typeof window !== 'undefined' ? window.location.pathname : null,
        severity: 'error',
        metadata: { digest: error?.digest || null, boundary: 'admin' },
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <div
      style={{
        padding: '40px',
        textAlign: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#111',
      }}
    >
      <p style={{ color: '#b91c1c', marginBottom: '16px', fontSize: 14 }}>
        Admin tool failed to load. The error has been recorded.
      </p>
      <button
        onClick={() => reset()}
        style={{
          padding: '8px 16px',
          background: '#111111',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        Try again
      </button>
    </div>
  );
}
