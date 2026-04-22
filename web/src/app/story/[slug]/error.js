'use client';
import { useEffect } from 'react';

export default function Error({ error, reset }) {
  useEffect(() => {
    fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error?.message || 'Unknown story error',
        stack: error?.stack || null,
        route: typeof window !== 'undefined' ? window.location.pathname : null,
        severity: 'error',
        metadata: { digest: error?.digest || null, boundary: 'story' },
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <p style={{ color: '#ef4444', marginBottom: '16px' }}>
        Failed to load article. Please try again.
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
        }}
      >
        Try again
      </button>
    </div>
  );
}
