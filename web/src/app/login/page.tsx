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

const C = {
  bg: 'var(--bg)',
  card: 'var(--card)',
  border: 'var(--border)',
  accent: 'var(--accent)',
} as const;

function LoginFallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: C.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: `3px solid ${C.border}`,
          borderTopColor: C.accent,
          animation: 'vpSpin 0.75s linear infinite',
        }}
      />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  usePageViewTrack('login');

  const rawNext = searchParams?.get('next') ?? null;
  const prefillEmail = searchParams?.get('email') ?? '';
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const toastParam = searchParams?.get('toast') ?? null;
    const errorParam = searchParams?.get('error') ?? null;
    if (toastParam === 'session_expired') {
      setNotice('Your session expired.');
    } else if (errorParam === 'link_expired') {
      setNotice('Your sign-in link has expired.');
    } else if (errorParam === 'missing_params') {
      setNotice('This sign-in link is invalid.');
    } else if (errorParam === 'link_deprecated') {
      setNotice('Sign-in links are no longer used. We’ll send you a code instead.');
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
          borderRadius: '12px',
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
              fontWeight: 600,
              color: 'var(--text)',
              letterSpacing: '-0.02em',
              marginBottom: '24px',
            }}
          >
            verity post
          </div>
        </a>

        <SingleDoorForm notice={notice} rawNext={rawNext} prefillEmail={prefillEmail} />
      </div>
    </div>
  );
}
