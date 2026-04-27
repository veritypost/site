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

// T82 — values point at globals.css CSS vars so brand-color edits cascade.
// `danger` was already locked to canonical `--danger` (#b91c1c) per DA-055.
const C = {
  bg: 'var(--bg)',
  card: 'var(--card)',
  border: 'var(--border)',
  text: 'var(--text)',
  dim: 'var(--dim)',
  accent: 'var(--accent)',
  success: 'var(--success)',
  danger: 'var(--danger)',
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

  // Closed-beta invite redemption: paste a slug or full /r/<code> URL.
  // POSTs to /api/access-redeem; on success the server sets vp_ref and
  // we route to /signup so the user can create their account.
  // 'signin'  → existing user enters email+password to log in
  // 'invite'  → new user pastes their access code to set the vp_ref cookie
  // 'create'  → user with valid vp_ref cookie creates account (email+password)
  // /r/<slug> and /api/access-redeem both redirect to /login?mode=create
  // after setting the cookie, so first-time invitees land directly in
  // 'create'. The visible toggle has 2 tabs (Sign in / Use access code);
  // 'create' is treated as a sub-state of "Use access code".
  const initialMode: 'signin' | 'invite' | 'create' =
    searchParams?.get('mode') === 'create' ? 'create' : 'signin';
  const [mode, setMode] = useState<'signin' | 'invite' | 'create'>(initialMode);
  const [inviteCode, setInviteCode] = useState<string>('');
  const [inviteBusy, setInviteBusy] = useState<boolean>(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const inviteReasonText: Record<string, string> = {
    invalid_format: "That doesn't look like a valid code.",
    code_not_found: "We couldn't find that invite.",
    code_disabled: 'That invite has been disabled.',
    code_expired: 'That invite has expired.',
    code_exhausted: 'That invite has already been used.',
    rate_limited: 'Too many attempts. Try again in a minute.',
    server_misconfig: 'Server is missing config. Contact the team.',
    internal_error: 'Something went wrong. Please try again.',
  };

  const submitInvite = async (e: FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    if (!inviteCode.trim()) return;
    setInviteBusy(true);
    try {
      const res = await fetch('/api/access-redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inviteCode.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setInviteError(inviteReasonText[json.reason] || 'Could not redeem that invite.');
        return;
      }
      // Cookie is set; flip into 'create' mode so the same form swaps
      // into email+password create-account fields without a hard reload.
      setInviteCode('');
      setMode('create');
    } catch {
      setInviteError('Network issue. Please try again.');
    } finally {
      setInviteBusy(false);
    }
  };

  // Used by mode='create' to call the existing signup API (which is
  // gated on vp_ref via checkSignupGate). On success the response sets
  // the supabase auth cookie via the GoTrue session that signUp returns,
  // and we route the user into the post-signup chain.
  const submitCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: identifier.trim(),
          password,
          ageConfirmed: true,
          agreedToTerms: true,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        redirect_to?: string;
        needsEmailConfirmation?: boolean;
      };
      if (!res.ok) {
        if (res.status === 403 && body?.redirect_to) {
          window.location.href = body.redirect_to;
          return;
        }
        setError(body.error || "Couldn't create account. Try again.");
        setLoading(false);
        return;
      }
      // Account created. Owner-link signups are auto-Pro and skip
      // /verify-email; user-tier signups have verify_locked_at stamped
      // until they verify. Either way, ship them through the welcome
      // chain — pick-username → /welcome — same as OAuth callback flow.
      window.location.href = '/signup/pick-username';
    } catch {
      setError('Network issue. Please try again.');
      setLoading(false);
    }
  };

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

        <h1 style={{ fontSize: '26px', fontWeight: 700, color: C.text, margin: '0 0 16px 0' }}>
          {mode === 'signin'
            ? 'Welcome back.'
            : mode === 'create'
              ? 'Set up your account.'
              : 'Have an access code?'}
        </h1>

        {/* Segmented toggle between sign-in (existing users) and invite-code
            (new users with /r/<slug> code). Equal prominence — both are
            valid entry paths during closed beta. */}
        <div
          role="tablist"
          aria-label="Login mode"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 0,
            padding: 4,
            background: '#f3f4f6',
            borderRadius: 10,
            marginBottom: 22,
          }}
        >
          {(['signin', 'invite'] as const).map((m) => {
            const active =
              m === 'signin' ? mode === 'signin' : mode === 'invite' || mode === 'create';
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  // Keep the user inside 'create' if they already
                  // redeemed; they shouldn't be sent back to the paste
                  // form on a stray tap of the same tab.
                  if (m === 'invite' && mode !== 'create') setMode('invite');
                  else if (m === 'signin') setMode('signin');
                  setError(null);
                  setInviteError(null);
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: active ? '#ffffff' : 'transparent',
                  color: active ? C.text : C.dim,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  transition: 'background 120ms, color 120ms',
                }}
              >
                {m === 'signin' ? 'Sign in' : 'Use access code'}
              </button>
            );
          })}
        </div>

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

        {/* SSO (Apple + Google) hidden during closed beta. The /r/<slug>
            invite-cookie flow + email signup is the only entry path while
            beta gate is on. To re-enable: restore the two button blocks
            and the divider above the email/password fields. The
            handleOAuth handler stays in place for the unhide. */}

        {mode === 'signin' && (
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
                autoFocus
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
                    right: '4px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: C.dim,
                    fontFamily: 'inherit',
                    minHeight: '44px',
                    minWidth: '44px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
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
        )}

        {mode === 'create' && (
          <form onSubmit={submitCreate} style={{ marginBottom: 12 }}>
            <p
              style={{
                fontSize: 13,
                color: C.dim,
                marginTop: 0,
                marginBottom: 16,
                lineHeight: 1.5,
              }}
            >
              Your invite is good. Pick the email + password you want to use here.
            </p>
            <div style={{ marginBottom: '14px' }}>
              <label
                htmlFor="create-email"
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: C.text,
                  marginBottom: '7px',
                }}
              >
                Email
              </label>
              <input
                id="create-email"
                type="email"
                required
                autoComplete="email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                onFocus={() => setFocused('identifier')}
                onBlur={() => setFocused(null)}
                style={field('identifier')}
                placeholder="you@example.com"
              />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label
                htmlFor="create-password"
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
              <input
                id="create-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
                style={field('password')}
                placeholder="At least 8 characters"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !identifier.trim() || password.length < 8}
              style={{
                width: '100%',
                minHeight: '48px',
                padding: '13px',
                fontSize: '15px',
                fontWeight: 600,
                color: '#fff',
                backgroundColor:
                  loading || !identifier.trim() || password.length < 8 ? '#cccccc' : C.accent,
                border: 'none',
                borderRadius: '10px',
                cursor:
                  loading || !identifier.trim() || password.length < 8 ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                marginBottom: 8,
              }}
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        )}

        {mode === 'invite' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 13, color: C.dim, margin: 0, lineHeight: 1.5 }}>
              Paste the code or full link from the invite email someone sent you.
            </p>
            <form
              onSubmit={submitInvite}
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <label
                htmlFor="invite-code"
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: C.dim,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Invite code or link
              </label>
              <input
                id="invite-code"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                disabled={inviteBusy}
                placeholder="abc123xyz9 or full URL"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${C.border}`,
                  fontSize: 14,
                  background: '#ffffff',
                  color: C.text,
                  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                }}
              />
              {inviteError && (
                <div
                  style={{
                    fontSize: 13,
                    color: C.danger,
                    background: '#fef2f2',
                    border: `1px solid ${C.danger}`,
                    borderRadius: 6,
                    padding: '6px 10px',
                  }}
                >
                  {inviteError}
                </div>
              )}
              <button
                type="submit"
                disabled={inviteBusy || !inviteCode.trim()}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: C.accent,
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: inviteBusy ? 'wait' : 'pointer',
                  opacity: !inviteCode.trim() ? 0.5 : 1,
                }}
              >
                {inviteBusy ? 'Checking…' : 'Continue'}
              </button>
              <div style={{ fontSize: 12, color: C.dim, textAlign: 'center' }}>
                Don&apos;t have an invite?{' '}
                <a href="/request-access" style={{ color: C.accent, fontWeight: 600 }}>
                  Request access
                </a>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
