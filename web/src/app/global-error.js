'use client';
import { useEffect } from 'react';

// Root-level error boundary — only fires when the root layout itself
// throws (or anything deeper that app/error.js couldn't catch). Must
// render its own <html>/<body>. POSTs to /api/errors then offers a
// reload.
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error?.message || 'Unknown fatal error',
        stack: error?.stack || null,
        route: typeof window !== 'undefined' ? window.location.pathname : null,
        severity: 'fatal',
        metadata: { digest: error?.digest || null },
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          background: '#ffffff',
          color: '#111111',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>
              Something broke hard.
            </div>
            <div style={{ fontSize: 14, color: '#666', marginBottom: 20 }}>
              The error has been reported. Try reloading. If it keeps happening, email
              admin@veritypost.com.
            </div>
            <button
              onClick={() => reset()}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: 'none',
                background: '#111',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
