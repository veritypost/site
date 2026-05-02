'use client';

import { useState } from 'react';

export function CheckoutButton({
  planName,
  cta,
  highlight,
}: {
  planName: string;
  cta: string;
  highlight?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_name: planName }),
      });
      const data = await res.json();
      if (res.status === 401 || res.status === 403) {
        window.location.href = '/login?redirect=/pricing';
        return;
      }
      if (!res.ok || !data.url) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 'auto' }}>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          width: '100%',
          padding: '12px 16px',
          textAlign: 'center',
          fontSize: 14,
          fontWeight: 700,
          cursor: loading ? 'wait' : 'pointer',
          background: highlight ? '#0a0a0a' : 'transparent',
          color: highlight ? '#fff' : '#0a0a0a',
          border: '1px solid #0a0a0a',
          borderRadius: 10,
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? 'Loading…' : cta}
      </button>
      {error && (
        <p style={{ marginTop: 8, fontSize: 12, color: '#dc2626', textAlign: 'center', margin: '8px 0 0' }}>
          {error}
        </p>
      )}
    </div>
  );
}
