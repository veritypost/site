// /request-access — Early Access signup. Single email field; same backend
// as the prior /login?mode=request|waitlist branches (now removed).

'use client';

import { usePageViewTrack } from '@/lib/useTrack';
import { BRAND_NAME } from '@/lib/brand';
import RequestAccessForm from './_RequestAccessForm';

const C = {
  bg: 'var(--vp-bg)',
  card: 'var(--vp-surface)',
  border: 'var(--vp-border)',
  accent: 'var(--vp-accent)',
} as const;

export default function RequestAccessPage() {
  usePageViewTrack('request_access');

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: C.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          backgroundColor: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: '18px',
          padding: '40px 36px',
          width: '100%',
          maxWidth: '480px',
          boxSizing: 'border-box',
        }}
      >
        <a href="/" style={{ textDecoration: 'none' }}>
          <div
            style={{
              fontSize: '20px',
              fontWeight: 800,
              color: C.accent,
              letterSpacing: '-0.5px',
              marginBottom: '24px',
            }}
          >
            {BRAND_NAME.toLowerCase()}
          </div>
        </a>

        <RequestAccessForm />
      </div>
    </div>
  );
}
