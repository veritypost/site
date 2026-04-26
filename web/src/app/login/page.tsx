// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
'use client';

import { Suspense, useEffect, useState, FormEvent, CSSProperties } from 'react';
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
  // DA-055 — canonical `--danger`. `#ef4444` fails AA on `#fef2f2` bg;
  // `#b91c1c` pushes above 7:1 contrast and matches web globals.css.
  danger: '#b91c1c',
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
  const toastParam = searchParams?.get('toast') ?? null;
  const emailParam = searchParams?.get('email') ?? null;
  usePageViewTrack('login');
  // Single input accepts either an email or a username. If the typed
  // value contains `@`, we route through Supabase signin directly;
  // otherwise we POST to /api/auth/resolve-username first and use the
  // returned email.
  const [identifier, setIdentifier] = useState<string>(emailParam ?? '');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [focused, setFocused] = useState<FocusField>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Inbound ?toast=... query-string notices from other flows. Currently
  // the reset-password page bounces here with toast=reset_invalid when a
  // recovery link is missing or expired, so the user gets a clean reason
  // for the redirect instead of a silent landing.
  useEffect(() => {
    if (!toastParam) return;
    if (toastParam === 'reset_invalid') {
      setNotice(
        'That reset link has expired or already been used. Enter your email below to get a new one.'
      );
    } else if (toastParam === 'password_updated') {
      setNotice('Password updated. Sign in with your new password.');
    }
  }, [toastParam]);

  const field = (name: Exclude<FocusField, null>): CSSProperties => ({
    width: '100%',
    padding: '12px 14px',
    fontSize: '15px',
    color: C.text,
    backgroundColor: C.bg,
    border: `1.5px solid ${focused === name ? C.accent : C.border}`,
    borderRadius: '10px',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s',
    minHeight: '44px',
  });

  const handleOAuth = async (provider: OAuthProvider) => {
    const supabase = createClient();
    const callback = new URL('/api/auth/callback', window.location.origin);
    if (nextParam) callback.searchParams.set('next', nextParam);
    // Same defensive check as /signup — signInWithOAuth doesn't throw
    // when the provider isn't configured server-side; it returns
    // { error }. Surfacing the error keeps the button from looking
    // frozen and tells the user to fall back to email.
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callback.toString() },
    });
    if (oauthError) {
      setError(
        `Sign in with ${provider === 'apple' ? 'Apple' : 'Google'} is unavailable right now. Use email below.`
      );
    }
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
          setError(
            'That email or password is incorrect. Check the spelling or reset your password.'
          );
          setLoading(false);
          return;
        }
        const body = (await res.json().catch(() => ({}))) as { email?: string };
        if (!body?.email) {
          setError(
            'That email or password is incorrect. Check the spelling or reset your password.'
          );
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
          const body = (await pre.json().catch(() => ({}))) as {
            locked?: boolean;
            locked_until?: string;
          };
          if (body?.locked && body?.locked_until) {
            // Audit fix: absolute clock time ("Try again after 3:45 PM")
            // confused users in different timezones and wasn't actionable.
            // Show a relative countdown ("Try again in 12 minutes") that
            // works the same anywhere in the world.
            const minsLeft = Math.max(
              1,
              Math.ceil((new Date(body.locked_until).getTime() - Date.now()) / 60_000)
            );
            const minLabel = minsLeft === 1 ? 'minute' : 'minutes';
            setError(`Too many failed attempts. Try again in ${minsLeft} ${minLabel}.`);
            setLoading(false);
            return;
          }
        }
      } catch {}

      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.signInWithPassword({ email, password });

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
        setError('That email or password is incorrect. Check the spelling or reset your password.');
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
      setError('Network error — check your connection and try again.');
      setLoading(false);
    }
  };

  const canSubmit = !loading && identifier.trim().length > 0 && password.length > 0;

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
              marginBottom: '28px',
            }}
          >
            Verity Post
          </div>
        </a>

        <h1 style={{ fontSize: '26px', fontWeight: 700, color: C.text, margin: '0 0 24px 0' }}>
          Welcome back.
        </h1>

        {notice && (
          <div
            role="status"
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              background: '#fef3c7',
              border: '1px solid #fcd34d',
              color: '#78350f',
              fontSize: 13,
              marginBottom: 16,
              lineHeight: 1.5,
            }}
          >
            {notice}
          </div>
        )}

        {error && (
          <div
            id="login-form-error"
            role="alert"
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              background: '#fef2f2',
              border: `1px solid ${C.danger}33`,
              color: C.danger,
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        {/* Apple HIG — Sign in with Apple sits above password fields. */}
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}
        >
          <button
            type="button"
            onClick={() => handleOAuth('apple')}
            style={{
              width: '100%',
              minHeight: '44px',
              padding: '12px',
              fontSize: '15px',
              fontWeight: 600,
              color: '#ffffff',
              backgroundColor: '#000000',
              border: '1px solid #000000',
              borderRadius: '10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontFamily: 'inherit',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            Sign in with Apple
          </button>
          <button
            type="button"
            onClick={() => handleOAuth('google')}
            style={{
              width: '100%',
              minHeight: '44px',
              padding: '12px',
              fontSize: '15px',
              fontWeight: 500,
              color: C.text,
              backgroundColor: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: '10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontFamily: 'inherit',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <path
                d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.3-.2-2.7-.5-4z"
                fill="#FFC107"
              />
              <path
                d="M6.3 14.7l7 5.1C15.1 16 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3c-7.6 0-14.2 4.3-17.7 11.7z"
                fill="#FF3D00"
              />
              <path
                d="M24 45c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 35.9 26.9 37 24 37c-6.1 0-10.7-3.1-11.8-8.5l-7 5.4C8.9 41.1 15.9 45 24 45z"
                fill="#4CAF50"
              />
              <path
                d="M44.5 20H24v8.5h11.8c-.5 2.7-2 5-4.2 6.5l6.6 5.6C41.8 37.3 45 31 45 24c0-1.3-.2-2.7-.5-4z"
                fill="#1976D2"
              />
            </svg>
            Continue with Google
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '18px',
          }}
        >
          <div style={{ flex: 1, height: '1px', backgroundColor: C.border }} />
          <span style={{ fontSize: '12px', color: C.dim, whiteSpace: 'nowrap' }}>
            or sign in with email
          </span>
          <div style={{ flex: 1, height: '1px', backgroundColor: C.border }} />
        </div>

        <form onSubmit={handleSubmit} aria-describedby={error ? 'login-form-error' : undefined}>
          <div style={{ marginBottom: '14px' }}>
            <label
              htmlFor="login-identifier"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: C.text,
                marginBottom: '7px',
              }}
            >
              Email or username
            </label>
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
              inputMode="email"
            />
          </div>

          <div style={{ marginBottom: '8px' }}>
            <label
              htmlFor="login-password"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: C.text,
                marginBottom: '7px',
              }}
            >
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
                style={{ ...field('password'), paddingRight: '60px' }}
                autoComplete="current-password"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: C.dim,
                  fontFamily: 'inherit',
                  padding: '6px 8px',
                  minHeight: '32px',
                }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              marginBottom: '20px',
            }}
          >
            <a
              href="/forgot-password"
              style={{
                fontSize: '13px',
                color: C.accent,
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              Forgot password?
            </a>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              width: '100%',
              minHeight: '48px',
              padding: '13px',
              fontSize: '15px',
              fontWeight: 600,
              color: '#fff',
              backgroundColor: !canSubmit ? '#cccccc' : C.accent,
              border: 'none',
              borderRadius: '10px',
              cursor: !canSubmit ? 'not-allowed' : 'pointer',
              marginBottom: '22px',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {loading && (
              <span
                aria-hidden="true"
                style={{
                  width: 14,
                  height: 14,
                  border: '2px solid rgba(255,255,255,0.4)',
                  borderTopColor: '#fff',
                  borderRadius: '50%',
                  display: 'inline-block',
                  animation: 'vpSpin 0.7s linear infinite',
                }}
              />
            )}
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '13px', color: C.dim, margin: 0 }}>
          New here?{' '}
          <a
            href="/signup"
            style={{ color: C.accent, fontWeight: 600, fontSize: '13px', textDecoration: 'none' }}
          >
            Create an account
          </a>
        </p>
      </div>
    </div>
  );
}
