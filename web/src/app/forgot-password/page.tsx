// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
'use client';

import { useEffect, useRef, useState, FormEvent } from 'react';

// This page has no role/plan/tier/verify gates — it's a pre-auth
// reset-password request form. Permission migration adds types only.

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

const RESEND_COOLDOWN_SECS = 30;

function maskEmail(e: string): string {
  const [local, domain] = e.split('@');
  if (!domain) return e;
  const firstChar = local[0] ?? '';
  return firstChar + '***@' + domain;
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState<string>('');
  const [focused, setFocused] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [sent, setSent] = useState<boolean>(false);
  const [sentTo, setSentTo] = useState<string>('');
  const [error, setError] = useState<string>('');
  // Resend debounce. Countdown ticks down once a second while > 0.
  const [cooldown, setCooldown] = useState<number>(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (cooldown <= 0) {
      if (cooldownTimer.current) {
        clearInterval(cooldownTimer.current);
        cooldownTimer.current = null;
      }
      return;
    }
    if (!cooldownTimer.current) {
      cooldownTimer.current = setInterval(() => {
        setCooldown((c) => (c > 0 ? c - 1 : 0));
      }, 1000);
    }
    return () => {
      if (cooldownTimer.current && cooldown <= 1) {
        clearInterval(cooldownTimer.current);
        cooldownTimer.current = null;
      }
    };
  }, [cooldown]);

  const startCooldown = () => setCooldown(RESEND_COOLDOWN_SECS);

  const sendReset = async (targetEmail: string) => {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: targetEmail,
        redirectTo: window.location.origin + '/reset-password',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to send reset email');
    return data;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    // Pass 17 / UJ-515: present the same success message whether the
    // account exists or not so the page can't be used to enumerate
    // registered emails. Network/transport errors are swallowed client-side
    // — the backend rate-limits + logs them.
    try {
      await sendReset(email);
    } catch {}
    setSentTo(email);
    setSent(true);
    setLoading(false);
    startCooldown();
  };

  const handleResend = async () => {
    if (cooldown > 0 || loading) return;
    setLoading(true);
    setError('');
    try {
      await sendReset(sentTo);
    } catch {}
    setLoading(false);
    startCooldown();
  };

  const handleUseDifferentEmail = () => {
    setSent(false);
    setSentTo('');
    setEmail('');
    setCooldown(0);
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
              marginBottom: '28px',
            }}
          >
            Verity Post
          </div>
        </a>

        {error && (
          <div
            id="forgot-password-form-error"
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

        {!sent ? (
          <>
            <h1
              style={{
                fontSize: '26px',
                fontWeight: 700,
                color: C.text,
                margin: '0 0 24px 0',
              }}
            >
              Reset your password.
            </h1>

            <form
              onSubmit={handleSubmit}
              aria-describedby={error ? 'forgot-password-form-error' : undefined}
            >
              <div style={{ marginBottom: '20px' }}>
                <label
                  htmlFor="forgot-password-email"
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
                  id="forgot-password-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  required
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  inputMode="email"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    fontSize: '15px',
                    color: C.text,
                    backgroundColor: C.bg,
                    border: `1.5px solid ${focused ? C.accent : C.border}`,
                    borderRadius: '10px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                    transition: 'border-color 0.15s',
                    minHeight: '44px',
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={loading || !email.trim()}
                style={{
                  width: '100%',
                  minHeight: '48px',
                  padding: '13px',
                  fontSize: '15px',
                  fontWeight: 600,
                  color: '#fff',
                  backgroundColor: loading || !email.trim() ? '#cccccc' : C.accent,
                  border: 'none',
                  borderRadius: '10px',
                  cursor: loading || !email.trim() ? 'not-allowed' : 'pointer',
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
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: '26px', fontWeight: 700, color: C.text, margin: '0 0 6px 0' }}>
              Check your email.
            </h1>
            <p
              style={{
                fontSize: '14px',
                color: C.dim,
                margin: '0 0 18px 0',
                lineHeight: 1.6,
              }}
            >
              If an account exists for{' '}
              <strong style={{ color: C.text }}>{maskEmail(sentTo)}</strong>, a reset link is on the
              way.
            </p>
            <div
              style={{
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '10px',
                padding: '14px 16px',
                marginBottom: '18px',
              }}
            >
              <p style={{ margin: 0, fontSize: '13px', color: '#166534', lineHeight: 1.5 }}>
                The link expires in <strong>1 hour</strong>. Check your spam folder if it
                doesn&apos;t arrive within a minute.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResend}
              disabled={loading || cooldown > 0}
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '12px',
                fontSize: '14px',
                fontWeight: 500,
                color: cooldown > 0 ? C.dim : C.text,
                backgroundColor: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: '10px',
                cursor: loading || cooldown > 0 ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                marginBottom: '12px',
              }}
            >
              {loading ? 'Sending…' : cooldown > 0 ? `Resend email (${cooldown}s)` : 'Resend email'}
            </button>
            <button
              type="button"
              onClick={handleUseDifferentEmail}
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '10px',
                fontSize: '13px',
                fontWeight: 500,
                color: C.dim,
                background: 'none',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textDecoration: 'underline',
              }}
            >
              Use a different email
            </button>
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <a
            href="/login"
            style={{
              fontSize: '13px',
              color: C.dim,
              fontFamily: 'inherit',
              textDecoration: 'none',
            }}
          >
            Back to sign in
          </a>
          <span style={{ color: C.border, margin: '0 8px' }}>·</span>
          <a
            href="/signup"
            style={{
              fontSize: '13px',
              color: C.dim,
              fontFamily: 'inherit',
              textDecoration: 'none',
            }}
          >
            Create an account
          </a>
        </div>
      </div>
    </div>
  );
}
