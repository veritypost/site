// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
'use client';

import { Suspense, useState, FormEvent, CSSProperties } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { resolveNext } from '@/lib/authRedirect';
import { usePageViewTrack } from '@/lib/useTrack';
import type { Tables } from '@/types/database-helpers';

// This page has no role/plan/tier/verify gates — it's a pre-auth login
// form. The `email_verified` + `onboarding_completed_at` read after
// successful sign-in is part of the post-login redirect decision
// (first-time sign-ins land on /welcome), NOT a permission gate.
// Permission migration adds types only.

const C = {
  bg: '#ffffff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111111',
  dim: '#666666',
  accent: '#111111',
  success: '#22c55e',
  danger: '#ef4444',
} as const;

type FocusField = 'identifier' | 'password' | null;

type MeRow = Pick<Tables<'users'>, 'onboarding_completed_at' | 'email_verified'>;

type OAuthProvider = 'google' | 'apple';

// Next.js 14 requires useSearchParams() callers to sit inside a Suspense
// boundary for static generation. Wrap the inner component once here.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const nextParam = resolveNext(searchParams?.get('next') ?? null);
  usePageViewTrack('login');
  // Single input accepts either an email or a username. If the typed
  // value contains `@`, we route through Supabase signin directly;
  // otherwise we POST to /api/auth/resolve-username first and use the
  // returned email.
  const [identifier, setIdentifier] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [focused, setFocused] = useState<FocusField>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const field = (name: Exclude<FocusField, null>): CSSProperties => ({
    width: '100%',
    padding: '11px 14px',
    fontSize: '15px',
    color: C.text,
    backgroundColor: C.bg,
    border: `1.5px solid ${focused === name ? C.accent : C.border}`,
    borderRadius: '10px',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s',
  });

  const handleOAuth = async (provider: OAuthProvider) => {
    const supabase = createClient();
    const callback = new URL('/api/auth/callback', window.location.origin);
    if (nextParam) callback.searchParams.set('next', nextParam);
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callback.toString() },
    });
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();

      // Resolve the input to an email. "Invalid credentials" is the
      // shared error copy for every failure branch below so the form
      // never reveals whether a username exists.
      const trimmed = identifier.trim();
      let email = trimmed;
      if (!trimmed.includes('@')) {
        const res = await fetch('/api/auth/resolve-username', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: trimmed }),
        });
        if (res.status === 429) {
          setError('Too many attempts. Try again in a minute.');
          setLoading(false);
          return;
        }
        if (!res.ok) {
          setError('Invalid credentials');
          setLoading(false);
          return;
        }
        const body = (await res.json().catch(() => ({}))) as { email?: string };
        if (!body?.email) {
          setError('Invalid credentials');
          setLoading(false);
          return;
        }
        email = body.email;
      }

      // Pass 17 / Task 140e: pre-flight lockout check. If this account
      // has 5+ recent failures it's locked for 15 minutes; skip the auth
      // call entirely and surface a countdown.
      try {
        const pre = await fetch('/api/auth/login-precheck', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        if (pre.ok) {
          const body = (await pre.json().catch(() => ({}))) as { locked?: boolean; locked_until?: string };
          if (body?.locked && body?.locked_until) {
            setError(`Too many failed attempts. Try again after ${new Date(body.locked_until).toLocaleTimeString()}.`);
            setLoading(false);
            return;
          }
        }
      } catch {}

      const { data: { user: authUser }, error: authError } = await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        // Distinguish a real credentials failure from a network /
        // DNS failure. Supabase-js surfaces network errors with
        // name="AuthRetryableFetchError" or messages containing
        // "fetch" / "network" / "NetworkError". Don't record those
        // against the lockout counter — the user didn't type
        // anything wrong, and flagging the account for 5 retries
        // on flaky wifi would lock them out for 15 minutes.
        const msg = String(authError.message || '').toLowerCase();
        const isNetwork =
          authError.name === 'AuthRetryableFetchError' ||
          msg.includes('failed to fetch') ||
          msg.includes('networkerror') ||
          msg.includes('network request');
        if (isNetwork) {
          setError('Network error. Check your connection and try again.');
          setLoading(false);
          return;
        }
        // Record the failed attempt so the server can start the countdown.
        // Best-effort — if this fails the next attempt just counts normally.
        // F-012: send password so the server can verify the failure is
        // genuine before writing to the lockout counter. An unauthenticated
        // third party cannot force this path because they do not know the
        // password.
        try {
          await fetch('/api/auth/login-failed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
        } catch {}
        setError('Invalid credentials');
        setLoading(false);
        return;
      }

      // Bug 10: server bookkeeping (rate-limit, audit-log, login_count,
      // last_login_at, D40 deletion cancel) now runs in a single awaited
      // POST that uses the session cookie the client just set. If this
      // fails, surface the error and don't navigate.
      const bkRes = await fetch('/api/auth/login', { method: 'POST' });
      if (!bkRes.ok) {
        const body = (await bkRes.json().catch(() => ({}))) as { error?: string };
        setError(body.error || 'Sign in failed');
        setLoading(false);
        return;
      }

      // First-time sign-ins land on /welcome; returning users go to the
      // explicit ?next= target if present, else home.
      let nextUrl = nextParam || '/';
      if (authUser?.id) {
        const { data: me } = await supabase
          .from('users')
          .select('onboarding_completed_at, email_verified')
          .eq('id', authUser.id)
          .maybeSingle();
        const row = me as MeRow | null;
        if (row?.email_verified && !row?.onboarding_completed_at) nextUrl = '/welcome';
      }
      window.location.href = nextUrl;
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: C.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxSizing: 'border-box',
    }}>
      <div style={{
        backgroundColor: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: '18px',
        padding: '40px 36px',
        width: '100%',
        maxWidth: '420px',
        boxSizing: 'border-box',
      }}>
        <a href="/" style={{ textDecoration: 'none' }}>
          <div style={{ fontSize: '20px', fontWeight: 800, color: C.accent, letterSpacing: '-0.5px', marginBottom: '28px' }}>
            Verity Post
          </div>
        </a>

        <h1 style={{ fontSize: '26px', fontWeight: 700, color: C.text, margin: '0 0 6px 0' }}>Welcome back</h1>
        <p style={{ fontSize: '14px', color: C.dim, margin: '0 0 28px 0' }}>Sign in to your account to continue reading</p>

        {error && (
          <div id="login-form-error" role="alert" style={{ padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: `1px solid ${C.danger}33`, color: C.danger, fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} aria-describedby={error ? 'login-form-error' : undefined}>
          {/* DA-057 / DA-058 — inputs have matching id + htmlFor so
              clicking the label focuses the field and screen readers
              announce the label on focus. Error banner above carries
              id="login-form-error" and the form aria-describedby
              threads it into focus announcements. */}
          <div style={{ marginBottom: '14px' }}>
            <label htmlFor="login-identifier" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: C.text, marginBottom: '7px' }}>Email or username</label>
            <input
              id="login-identifier"
              name="identifier"
              type="text"
              placeholder="you@example.com or yourname"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              onFocus={() => setFocused('identifier')}
              onBlur={() => setFocused(null)}
              style={field('identifier')}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>

          <div style={{ marginBottom: '10px' }}>
            <label htmlFor="login-password" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: C.text, marginBottom: '7px' }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
                style={{ ...field('password'), paddingRight: '56px' }}
                autoComplete="current-password"
              />
              {/* DA-009 / DA-056 — show-password toggle has an
                  aria-label + aria-pressed state so screen readers
                  announce it as a toggle button. */}
              <button type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: C.dim, fontFamily: 'inherit' }}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '20px' }}>
            <a href="/forgot-password"
              style={{ fontSize: '13px', color: C.accent, fontWeight: 500, textDecoration: 'none' }}>
              Forgot password?
            </a>
          </div>

          <button type="submit" disabled={loading || !identifier || !password}
            style={{ width: '100%', padding: '13px', fontSize: '15px', fontWeight: 600, color: '#fff', backgroundColor: (loading || !identifier || !password) ? '#cccccc' : C.accent, border: 'none', borderRadius: '10px', cursor: (loading || !identifier || !password) ? 'not-allowed' : 'pointer', marginBottom: '20px', fontFamily: 'inherit' }}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: C.border }} />
          <span style={{ fontSize: '12px', color: C.dim, whiteSpace: 'nowrap' }}>or sign in with</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: C.border }} />
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
          <button type="button" onClick={() => handleOAuth('google')}
            style={{ flex: 1, padding: '11px', fontSize: '14px', fontWeight: 500, color: C.text, backgroundColor: C.bg, border: `1px solid ${C.border}`, borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontFamily: 'inherit' }}>
            <svg width="16" height="16" viewBox="0 0 48 48" fill="none">
              <path d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.3-.2-2.7-.5-4z" fill="#FFC107"/>
              <path d="M6.3 14.7l7 5.1C15.1 16 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3c-7.6 0-14.2 4.3-17.7 11.7z" fill="#FF3D00"/>
              <path d="M24 45c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 35.9 26.9 37 24 37c-6.1 0-10.7-3.1-11.8-8.5l-7 5.4C8.9 41.1 15.9 45 24 45z" fill="#4CAF50"/>
              <path d="M44.5 20H24v8.5h11.8c-.5 2.7-2 5-4.2 6.5l6.6 5.6C41.8 37.3 45 31 45 24c0-1.3-.2-2.7-.5-4z" fill="#1976D2"/>
            </svg>
            Google
          </button>
          <button type="button" onClick={() => handleOAuth('apple')}
            style={{ flex: 1, padding: '11px', fontSize: '14px', fontWeight: 500, color: C.text, backgroundColor: C.bg, border: `1px solid ${C.border}`, borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontFamily: 'inherit' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill={C.text}>
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            Apple
          </button>
        </div>

        <p style={{ textAlign: 'center', fontSize: '13px', color: C.dim, margin: 0 }}>
          Don&apos;t have an account?{' '}
          <a href="/signup" style={{ color: C.accent, fontWeight: 600, fontSize: '13px', textDecoration: 'none' }}>
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}
