// [S3-Q2-c] /signup — magic-link signup entry.
//
// Real route (no longer a redirect to /login). Mirrors the /login
// shape but with signup-mode copy. Posts to the same
// /api/auth/send-magic-link endpoint — Supabase resolves whether the
// email is new (signup) or existing (signin) and the response stays
// uniform either way. The 11 codebase CTAs pointing at /signup keep
// working unchanged.
//
// OAuth section preserved in MagicLinkForm; gated by the same
// OAUTH_ENABLED flag as /login.

'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePageViewTrack } from '@/lib/useTrack';
import MagicLinkForm from '../login/_MagicLinkForm';

// [S3-Q2-d] OAuth feature flag. Default false during closed beta /
// pre-launch hide. Mirror /login.
const OAUTH_ENABLED = false;

const C = {
  bg: 'var(--bg)',
  card: 'var(--card)',
  border: 'var(--border)',
  text: 'var(--text)',
  dim: 'var(--dim)',
  accent: 'var(--accent)',
} as const;

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageInner />
    </Suspense>
  );
}

function SignupPageInner() {
  const searchParams = useSearchParams();
  usePageViewTrack('signup');

  const handleOAuth = async (provider: 'google' | 'apple') => {
    if (!OAUTH_ENABLED) return;
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const callback = new URL('/api/auth/callback', window.location.origin);
    const nextParam = searchParams?.get('next') ?? null;
    if (nextParam) callback.searchParams.set('next', nextParam);
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callback.toString() },
    });
  };

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
            Verity Post
          </div>
        </a>

        <MagicLinkForm mode="signup" oauthEnabled={OAUTH_ENABLED} onOAuth={handleOAuth} />

        <p
          style={{
            fontSize: 13,
            color: C.dim,
            textAlign: 'center',
            marginTop: 22,
            marginBottom: 0,
          }}
        >
          Already have an account?{' '}
          <a href="/login" style={{ color: C.accent, fontWeight: 600 }}>
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
