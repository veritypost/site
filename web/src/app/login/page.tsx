// [S3-Q2-b][S3-Q2-d] /login — OTP-only single-door entry point.
//
// Single email form → 6-digit code. No tabs, no invite code, no password.
// The invite-code redemption path (/api/access-redeem) is still live but
// entry happens via /signup, not here.
//
// OAuth (Apple + Google) is preserved in _SingleDoorForm but gated by
// OAUTH_ENABLED (default false). One-line flip re-enables both buttons.

'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePageViewTrack } from '@/lib/useTrack';
import SingleDoorForm from './_SingleDoorForm';
import RequestAccessForm from './_RequestAccessForm';

const C = {
  bg: 'var(--bg)',
  card: 'var(--card)',
  border: 'var(--border)',
  accent: 'var(--accent)',
} as const;

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  usePageViewTrack('login');

  const mode = searchParams?.get('mode') ?? null;
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const toastParam = searchParams?.get('toast') ?? null;
    if (!toastParam) return;
    if (toastParam === 'session_expired') {
      setNotice('Your session expired. Enter your email to sign back in.');
    }
  }, [searchParams]);

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
            verity post
          </div>
        </a>

        {mode === 'request' ? <RequestAccessForm /> : <SingleDoorForm notice={notice} />}
      </div>
    </div>
  );
}
