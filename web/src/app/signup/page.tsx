// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
'use client';

import { useState, FormEvent, CSSProperties } from 'react';
import { passwordStrength as strengthScore, PASSWORD_REQS } from '../../lib/password';
import { usePageViewTrack, useTrack } from '@/lib/useTrack';

// This page has no role/plan/tier/verify gates — it's a pre-auth
// account-creation form. Permission migration adds types only.

const C = {
  bg: '#ffffff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111111',
  dim: '#666666',
  accent: '#111111',
  success: '#22c55e',
} as const;

type FocusField = 'email' | 'pw' | 'cpw' | null;

type EmailCheck =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'taken' };

interface PasswordStrength {
  bars: number;
  label: string;
  color: string;
}

interface PasswordRule {
  id: string;
  label: string;
  test: (p: string) => boolean;
}

export default function SignupPage() {
  usePageViewTrack('signup');
  const trackEvent = useTrack();
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [agreedToTerms, setAgreedToTerms] = useState<boolean>(false);
  const [ageConfirmed, setAgeConfirmed] = useState<boolean>(false);
  const [keepSignedIn, setKeepSignedIn] = useState<boolean>(true);
  const [focused, setFocused] = useState<FocusField>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [duplicateEmail, setDuplicateEmail] = useState<string>('');

  const strength: PasswordStrength = strengthScore(password);
  const match = !!(password && confirmPassword && password === confirmPassword);
  const mismatch = !!(password && confirmPassword && password !== confirmPassword);
  // Pass 17 / UJ-720: submit disabled until the password meets every
  // server-side PASSWORD_REQS rule — keeps the client gate aligned with
  // `validatePasswordServer` so users don't POST only to be bounced.
  const passwordMeetsPolicy = (PASSWORD_REQS as PasswordRule[]).every((r) => r.test(password));
  // Pass 17 / UJ-708: async email-availability feedback on blur.
  const [emailCheck, setEmailCheck] = useState<EmailCheck>({ status: 'idle' });
  const checkEmailAvailability = async (value: string) => {
    const v = (value || '').trim().toLowerCase();
    if (!v || !v.includes('@')) {
      setEmailCheck({ status: 'idle' });
      return;
    }
    setEmailCheck({ status: 'checking' });
    try {
      const res = await fetch(`/api/auth/check-email?email=${encodeURIComponent(v)}`);
      if (!res.ok) {
        setEmailCheck({ status: 'idle' });
        return;
      }
      const body = (await res.json()) as { checked?: boolean; available?: boolean };
      if (!body.checked) {
        setEmailCheck({ status: 'idle' });
        return;
      }
      setEmailCheck({ status: body.available ? 'available' : 'taken' });
    } catch {
      setEmailCheck({ status: 'idle' });
    }
  };

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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (mismatch) return;
    setLoading(true);
    setError('');
    setDuplicateEmail('');
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, ageConfirmed, agreedToTerms, keepSignedIn }),
      });

      const data = (await res.json()) as { error?: string; needsEmailConfirmation?: boolean };

      if (!res.ok) {
        // Duplicate-email detection. The signup route flattens Supabase
        // GoTrue's "User already registered" error into a generic 400
        // "Signup failed", so we can't rely on status/body alone. If the
        // on-blur availability probe already marked this email as taken,
        // use that. Otherwise, on a 400 from the signup route, re-probe
        // /api/auth/check-email to confirm before changing copy — this
        // prevents hijacking unrelated 400s (password policy, etc.).
        const trimmedEmail = email.trim().toLowerCase();
        let isDuplicate = emailCheck.status === 'taken';
        if (!isDuplicate && res.status === 400 && trimmedEmail.includes('@')) {
          try {
            const probe = await fetch(
              `/api/auth/check-email?email=${encodeURIComponent(trimmedEmail)}`
            );
            if (probe.ok) {
              const probeBody = (await probe.json()) as { checked?: boolean; available?: boolean };
              if (probeBody.checked && probeBody.available === false) isDuplicate = true;
            }
          } catch {}
        }
        if (isDuplicate) {
          setDuplicateEmail(trimmedEmail);
          setError('An account with this email already exists. Sign in instead.');
          return;
        }
        throw new Error(data.error || 'Failed to create account');
      }

      trackEvent('signup_complete', 'product', {
        content_type: 'signup',
        payload: {
          needs_email_confirmation: !!data.needsEmailConfirmation,
          method: 'email',
        },
      });
      window.location.href = data.needsEmailConfirmation
        ? '/verify-email'
        : '/signup/pick-username';
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to create account. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    const { createClient } = await import('../../lib/supabase/client');
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/api/auth/callback' },
    });
  };

  const handleAppleSignUp = async () => {
    const { createClient } = await import('../../lib/supabase/client');
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: window.location.origin + '/api/auth/callback' },
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
          maxWidth: '440px',
          boxSizing: 'border-box',
        }}
      >
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

        <h1 style={{ fontSize: '26px', fontWeight: 700, color: C.text, margin: '0 0 6px 0' }}>
          Join Verity Post
        </h1>
        <p style={{ fontSize: '14px', color: C.dim, margin: '0 0 28px 0' }}>
          News you can trust — create your free account
        </p>

        {error && (
          <div
            id="signup-form-error"
            role="alert"
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '10px',
              padding: '12px 14px',
              marginBottom: '16px',
            }}
          >
            <p style={{ margin: 0, fontSize: '13px', color: '#dc2626' }}>
              {error}
              {duplicateEmail && (
                <>
                  {' '}
                  <a
                    href={`/login?email=${encodeURIComponent(duplicateEmail)}`}
                    style={{ color: '#dc2626', fontWeight: 600, textDecoration: 'underline' }}
                  >
                    Go to sign in
                  </a>
                </>
              )}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} aria-describedby={error ? 'signup-form-error' : undefined}>
          <div style={{ marginBottom: '14px' }}>
            <label
              htmlFor="signup-email"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: C.text,
                marginBottom: '7px',
              }}
            >
              Email address
            </label>
            <input
              id="signup-email"
              type="email"
              placeholder="jane@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailCheck({ status: 'idle' });
              }}
              onFocus={() => setFocused('email')}
              onBlur={() => {
                setFocused(null);
                checkEmailAvailability(email);
              }}
              style={field('email')}
              autoComplete="email"
            />
            {emailCheck.status === 'checking' && (
              <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>Checking availability…</div>
            )}
            {emailCheck.status === 'available' && (
              <div style={{ fontSize: 11, color: C.success, marginTop: 4 }}>
                Email is available.
              </div>
            )}
            {emailCheck.status === 'taken' && (
              <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>
                An account already exists for that email.{' '}
                <a
                  href={`/login?email=${encodeURIComponent(email)}`}
                  style={{ color: '#ef4444', fontWeight: 600, textDecoration: 'underline' }}
                >
                  Sign in instead
                </a>
                .
              </div>
            )}
          </div>

          <div style={{ marginBottom: '6px' }}>
            <label
              htmlFor="signup-password"
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
                id="signup-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Create a strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocused('pw')}
                onBlur={() => setFocused(null)}
                style={{ ...field('pw'), paddingRight: '56px' }}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                style={{
                  position: 'absolute',
                  right: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: C.dim,
                  fontFamily: 'inherit',
                }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {password && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', gap: '4px', marginBottom: '5px' }}>
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: '3px',
                      borderRadius: '99px',
                      backgroundColor: i <= strength.bars ? strength.color : C.border,
                      transition: 'background-color 0.2s',
                    }}
                  />
                ))}
              </div>
              <span style={{ fontSize: '11px', color: strength.color, fontWeight: 600 }}>
                {strength.label}
              </span>
            </div>
          )}

          <div style={{ marginBottom: '20px' }}>
            <label
              htmlFor="signup-confirm-password"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: C.text,
                marginBottom: '7px',
              }}
            >
              Confirm password
            </label>
            <input
              id="signup-confirm-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Repeat your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onFocus={() => setFocused('cpw')}
              onBlur={() => setFocused(null)}
              style={{
                ...field('cpw'),
                borderColor: mismatch
                  ? '#ef4444'
                  : match
                    ? C.success
                    : focused === 'cpw'
                      ? C.accent
                      : C.border,
              }}
              autoComplete="new-password"
            />
            {mismatch && (
              <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                Passwords don&apos;t match
              </p>
            )}
            {match && (
              <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: C.success }}>
                Passwords match
              </p>
            )}
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              marginBottom: '12px',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={ageConfirmed}
              onChange={(e) => setAgeConfirmed(e.target.checked)}
              style={{
                accentColor: C.accent,
                width: '16px',
                height: '16px',
                marginTop: '2px',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: '13px', color: C.dim, lineHeight: '1.5' }}>
              I confirm I am 13 or older.
            </span>
          </label>

          {/* Pass 17 / UJ-713: default-on "Keep me signed in". When
           * unchecked, the signup API is asked to issue a shorter
           * session. Default-on matches the platform's typical mobile
           * flow where users expect to stay logged in. */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '16px',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={keepSignedIn}
              onChange={(e) => setKeepSignedIn(e.target.checked)}
              style={{ accentColor: C.accent, width: '16px', height: '16px', flexShrink: 0 }}
            />
            <span style={{ fontSize: '13px', color: C.dim, lineHeight: '1.5' }}>
              Keep me signed in on this device.
            </span>
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              marginBottom: '22px',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              style={{
                accentColor: C.accent,
                width: '16px',
                height: '16px',
                marginTop: '2px',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: '13px', color: C.dim, lineHeight: '1.5' }}>
              I agree to the{' '}
              <a
                href="/terms"
                style={{
                  color: C.accent,
                  fontWeight: 600,
                  fontSize: '13px',
                  textDecoration: 'none',
                }}
              >
                Terms of Service
              </a>{' '}
              and{' '}
              <a
                href="/privacy"
                style={{
                  color: C.accent,
                  fontWeight: 600,
                  fontSize: '13px',
                  textDecoration: 'none',
                }}
              >
                Privacy Policy
              </a>
            </span>
          </label>

          <button
            type="submit"
            disabled={
              loading || !agreedToTerms || !ageConfirmed || !passwordMeetsPolicy || mismatch
            }
            style={{
              width: '100%',
              padding: '13px',
              fontSize: '15px',
              fontWeight: 600,
              color: '#fff',
              backgroundColor:
                loading || !agreedToTerms || !ageConfirmed || !passwordMeetsPolicy || mismatch
                  ? '#cccccc'
                  : C.accent,
              border: 'none',
              borderRadius: '10px',
              cursor:
                loading || !agreedToTerms || !ageConfirmed || !passwordMeetsPolicy || mismatch
                  ? 'not-allowed'
                  : 'pointer',
              marginBottom: '20px',
              fontFamily: 'inherit',
            }}
          >
            {loading ? 'Creating account...' : 'Create free account'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: C.border }} />
          <span style={{ fontSize: '12px', color: C.dim, whiteSpace: 'nowrap' }}>
            or sign up with
          </span>
          <div style={{ flex: 1, height: '1px', backgroundColor: C.border }} />
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
          <button
            type="button"
            onClick={handleGoogleSignUp}
            style={{
              flex: 1,
              padding: '11px',
              fontSize: '14px',
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
            <svg width="16" height="16" viewBox="0 0 48 48" fill="none">
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
            Google
          </button>
          <button
            type="button"
            onClick={handleAppleSignUp}
            style={{
              flex: 1,
              padding: '11px',
              fontSize: '14px',
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
            <svg width="15" height="15" viewBox="0 0 24 24" fill={C.text}>
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            Apple
          </button>
        </div>

        <p style={{ textAlign: 'center', fontSize: '13px', color: C.dim, margin: 0 }}>
          Already have an account?{' '}
          <a
            href="/login"
            style={{ color: C.accent, fontWeight: 600, fontSize: '13px', textDecoration: 'none' }}
          >
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
