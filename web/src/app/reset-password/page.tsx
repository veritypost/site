// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
'use client';

import { useState, useEffect, FormEvent } from 'react';
import { createClient } from '../../lib/supabase/client';
import { PASSWORD_REQS as REQS, passwordStrength as strengthScore } from '../../lib/password';

// This page has no role/plan/tier/verify gates — it's a token-gated
// password reset completion form. The "gate" here is the Supabase recovery
// token itself, not a permission key. Permission migration adds types only.

const C = {
  bg: '#ffffff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111111',
  dim: '#666666',
  accent: '#111111',
  success: '#22c55e',
  // DA-055 — canonical `--danger`. Raised from #ef4444 for AA contrast
  // against #fef2f2 background; matches web globals.css.
  danger: '#b91c1c',
} as const;

type FocusedField = 'pw' | 'cpw' | null;

export default function ResetPasswordPage() {
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [focused, setFocused] = useState<FocusedField>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [tokenExpired, setTokenExpired] = useState<boolean>(false);
  const [tokenReady, setTokenReady] = useState<boolean | null>(null);

  const allMet = REQS.every((r) => r.test(password));
  const match = password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;
  const mismatch =
    password.length > 0 && confirmPassword.length > 0 && password !== confirmPassword;
  const strength = password ? strengthScore(password) : null;

  // After password is updated successfully the recovery session persists
  // as a normal signed-in session. Redirect to home rather than /login.
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        window.location.href = '/';
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // The page must only render when Supabase has handed us a recovery
  // token. If the hash is missing (user navigated here directly or the
  // link expired) surface an in-page "link expired" screen with a CTA to
  // request a fresh one — previously this was a silent bounce to /login
  // which confused users. We still accept a live session as evidence that
  // the token round-tripped successfully (Supabase JS parses the URL hash
  // into `auth.getSession()`).
  useEffect(() => {
    let cancelled = false;
    async function verify() {
      try {
        const supabase = createClient();
        const hash = typeof window !== 'undefined' ? window.location.hash : '';
        const hasRecoveryHash = hash.includes('type=recovery') || hash.includes('access_token=');
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!cancelled) {
          if (hasRecoveryHash || session) {
            setTokenReady(true);
          } else {
            setTokenReady(false);
            setTokenExpired(true);
          }
        }
      } catch {
        if (!cancelled) {
          setTokenReady(false);
          setTokenExpired(true);
        }
      }
    }
    verify();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!allMet || !match) return;
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      // Pass 17 / UJ-704: after the password is changed via recovery
      // token, invalidate every other active session for the same user.
      // Current session is preserved so the user lands signed-in.
      try {
        await supabase.auth.signOut({ scope: 'others' });
      } catch {}
      setSuccess(true);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to update password. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const cardShell = (children: React.ReactNode) => (
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
        {children}
      </div>
    </div>
  );

  if (tokenReady === null) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: C.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 16px',
        }}
      >
        <div style={{ color: C.dim, fontSize: 14 }}>Verifying reset link…</div>
      </div>
    );
  }

  if (tokenExpired) {
    return cardShell(
      <>
        <h1 style={{ fontSize: '26px', fontWeight: 700, color: C.text, margin: '0 0 6px 0' }}>
          Link expired.
        </h1>
        <p style={{ fontSize: '14px', color: C.dim, margin: '0 0 22px 0', lineHeight: 1.6 }}>
          This password reset link has expired or already been used. Request a fresh one and
          we&apos;ll send it right over.
        </p>
        <a
          href="/forgot-password"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            minHeight: '48px',
            padding: '13px',
            fontSize: '15px',
            fontWeight: 600,
            color: '#fff',
            backgroundColor: C.accent,
            border: 'none',
            borderRadius: '10px',
            cursor: 'pointer',
            textDecoration: 'none',
            fontFamily: 'inherit',
            marginBottom: '14px',
          }}
        >
          Get a new reset link
        </a>
        <div style={{ textAlign: 'center' }}>
          <a
            href="/login"
            style={{
              fontSize: '13px',
              color: C.dim,
              textDecoration: 'none',
              fontFamily: 'inherit',
            }}
          >
            Back to sign in
          </a>
        </div>
      </>
    );
  }

  if (success) {
    return cardShell(
      <>
        <style>{`@keyframes vpPulse{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1)}}`}</style>
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#f0fdf4',
              border: `2px solid ${C.success}`,
              margin: '0 auto 18px auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 12l5 5L20 7"
                stroke={C.success}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: C.text, margin: '0 0 8px 0' }}>
            Password updated.
          </h2>
          <p style={{ fontSize: '14px', color: C.dim, margin: '0 0 22px 0', lineHeight: 1.6 }}>
            You&apos;re signed in. Taking you home…
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: C.accent,
                  animation: `vpPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
        </div>
      </>
    );
  }

  return cardShell(
    <>
      <h1 style={{ fontSize: '26px', fontWeight: 700, color: C.text, margin: '0 0 6px 0' }}>
        Set a new password.
      </h1>
      <p style={{ fontSize: '14px', color: C.dim, margin: '0 0 24px 0' }}>
        Pick something strong — you won&apos;t need the old one anymore.
      </p>

      {error && (
        <div
          id="reset-password-form-error"
          role="alert"
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '16px',
          }}
        >
          <p style={{ margin: 0, fontSize: '13px', color: C.danger }}>{error}</p>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        aria-describedby={error ? 'reset-password-form-error' : undefined}
      >
        <div style={{ marginBottom: '6px' }}>
          <label
            htmlFor="reset-password-new"
            style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 600,
              color: C.text,
              marginBottom: '7px',
            }}
          >
            New password
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="reset-password-new"
              type={showPassword ? 'text' : 'password'}
              placeholder="Create a strong password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocused('pw')}
              onBlur={() => setFocused(null)}
              autoComplete="new-password"
              style={{
                width: '100%',
                padding: '12px 60px 12px 14px',
                fontSize: '15px',
                color: C.text,
                backgroundColor: C.bg,
                border: `1.5px solid ${focused === 'pw' ? C.accent : C.border}`,
                borderRadius: '10px',
                outline: 'none',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                transition: 'border-color 0.15s',
                minHeight: '44px',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
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

        {strength && (
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

        {/* Requirements checklist */}
        <div
          style={{
            backgroundColor: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '14px',
          }}
        >
          <p style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: 600, color: C.dim }}>
            Password requirements
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {REQS.map((r) => {
              const met = r.test(password);
              return (
                <div
                  key={r.id}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: met ? C.success : 'transparent',
                      border: `1.5px solid ${met ? C.success : C.border}`,
                      color: '#fff',
                      fontSize: 9,
                      fontWeight: 700,
                      lineHeight: 1,
                      flexShrink: 0,
                    }}
                  >
                    {met ? '✓' : ''}
                  </span>
                  <span
                    style={{
                      color: met ? C.text : C.dim,
                      fontWeight: met ? 600 : 400,
                      transition: 'color 0.15s',
                    }}
                  >
                    {r.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label
            htmlFor="reset-password-confirm"
            style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 600,
              color: C.text,
              marginBottom: '7px',
            }}
          >
            Confirm new password
          </label>
          <input
            id="reset-password-confirm"
            type={showPassword ? 'text' : 'password'}
            placeholder="Repeat your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onFocus={() => setFocused('cpw')}
            onBlur={() => setFocused(null)}
            autoComplete="new-password"
            style={{
              width: '100%',
              padding: '12px 14px',
              fontSize: '15px',
              color: C.text,
              backgroundColor: C.bg,
              border: `1.5px solid ${mismatch ? C.danger : match ? C.success : focused === 'cpw' ? C.accent : C.border}`,
              borderRadius: '10px',
              outline: 'none',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
              transition: 'border-color 0.15s',
              minHeight: '44px',
            }}
          />
          {mismatch && (
            <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: C.danger }}>
              Passwords don&apos;t match
            </p>
          )}
          {match && (
            <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: C.success }}>
              Passwords match
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !allMet || !match}
          style={{
            width: '100%',
            minHeight: '48px',
            padding: '13px',
            fontSize: '15px',
            fontWeight: 600,
            color: '#fff',
            backgroundColor: loading || !allMet || !match ? '#cccccc' : C.accent,
            border: 'none',
            borderRadius: '10px',
            cursor: loading || !allMet || !match ? 'not-allowed' : 'pointer',
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
          {loading ? 'Updating…' : 'Update password'}
        </button>
        <style>{`@keyframes vpSpin{to{transform:rotate(360deg)}}`}</style>
      </form>

      <div style={{ textAlign: 'center', marginTop: '18px' }}>
        <a
          href="/login"
          style={{
            fontSize: 13,
            color: C.dim,
            fontFamily: 'inherit',
            textDecoration: 'none',
          }}
        >
          Back to sign in
        </a>
      </div>
    </>
  );
}
