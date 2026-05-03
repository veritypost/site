'use client';

import { useState } from 'react';

const CHECKOUT_IN_FLIGHT_KEY = 'verity:checkout-in-flight';
const CHECKOUT_IN_FLIGHT_TTL_MS = 60_000;

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
    // Cross-tab idempotency guard: abort if another tab started checkout
    // within the last 60 seconds to prevent duplicate Stripe sessions.
    // Note: server-side idempotency for /api/stripe/checkout is a
    // separate concern (webhook route GAP-001) outside this stream.
    const inflight = localStorage.getItem(CHECKOUT_IN_FLIGHT_KEY);
    if (inflight) {
      const ts = parseInt(inflight, 10);
      if (!isNaN(ts) && Date.now() - ts < CHECKOUT_IN_FLIGHT_TTL_MS) {
        setError('Checkout already opened in another tab — switch to that tab.');
        return;
      }
    }

    setLoading(true);
    setError(null);
    localStorage.setItem(CHECKOUT_IN_FLIGHT_KEY, String(Date.now()));
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_name: planName }),
      });
      const data = await res.json();
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem(CHECKOUT_IN_FLIGHT_KEY);
        window.location.href = '/login?redirect=/pricing';
        return;
      }
      if (!res.ok || !data.url) {
        localStorage.removeItem(CHECKOUT_IN_FLIGHT_KEY);
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }
      // Clear the in-flight key on redirect so returning to /pricing
      // (e.g. after cancelling Stripe checkout) resets cleanly.
      localStorage.removeItem(CHECKOUT_IN_FLIGHT_KEY);
      window.location.href = data.url;
    } catch {
      localStorage.removeItem(CHECKOUT_IN_FLIGHT_KEY);
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
