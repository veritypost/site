// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
'use client';

import { useState, FormEvent } from 'react';

// This page has no role/plan/tier/verify gates — it's a pre-auth
// reset-password request form. Permission migration adds types only.

const C = {
  bg: '#ffffff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111111',
  dim: '#666666',
  accent: '#111111',
  success: '#22c55e',
} as const;

function maskEmail(e: string): string {
  const [local, domain] = e.split('@');
  if (!domain) return e;
  return local[0] + '***@' + domain;
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState<string>('');
  const [focused, setFocused] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [sent, setSent] = useState<boolean>(false);
  const [sentTo, setSentTo] = useState<string>('');
  const [error, setError] = useState<string>('');

  const sendReset = async (targetEmail: string) => {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: targetEmail,
        redirectTo: window.location.origin + '/reset-password',
      }),
    });
    const data = await res.json();
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
    try { await sendReset(email); } catch {}
    setSentTo(email);
    setSent(true);
    setLoading(false);
  };

  const handleResend = async () => {
    setLoading(true);
    setError('');
    try { await sendReset(sentTo); } catch {}
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', boxSizing: 'border-box',
    }}>
      <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '18px', padding: '40px 36px', width: '100%', maxWidth: '420px', boxSizing: 'border-box' }}>
        <div style={{ fontSize: '20px', fontWeight: '800', color: C.accent, letterSpacing: '-0.5px', marginBottom: '28px' }}>Verity Post</div>

        {error && (
          <div id="forgot-password-form-error" role="alert" style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px' }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#dc2626' }}>{error}</p>
          </div>
        )}

        {!sent ? (
          <>
            <h1 style={{ fontSize: '26px', fontWeight: '700', color: C.text, margin: '0 0 8px 0' }}>Reset your password</h1>
            <p style={{ fontSize: '14px', color: C.dim, margin: '0 0 28px 0', lineHeight: '1.6' }}>
              Enter your email and we&apos;ll send you a link to reset your password.
            </p>

            <form onSubmit={handleSubmit} aria-describedby={error ? 'forgot-password-form-error' : undefined}>
              <div style={{ marginBottom: '20px' }}>
                <label htmlFor="forgot-password-email" style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: C.text, marginBottom: '7px' }}>Email address</label>
                <input
                  id="forgot-password-email"
                  type="email"
                  placeholder="jane@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  required
                  autoComplete="email"
                  style={{ width: '100%', padding: '11px 14px', fontSize: '15px', color: C.text, backgroundColor: C.bg, border: `1.5px solid ${focused ? C.accent : C.border}`, borderRadius: '10px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color 0.15s' }}
                />
              </div>
              <button type="submit" disabled={loading}
                style={{ width: '100%', padding: '13px', fontSize: '15px', fontWeight: '600', color: '#fff', backgroundColor: loading ? '#cccccc' : C.accent, border: 'none', borderRadius: '10px', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: '26px', fontWeight: '700', color: C.text, margin: '0 0 8px 0' }}>Check your email</h1>
            <p style={{ fontSize: '14px', color: C.dim, margin: '0 0 20px 0', lineHeight: '1.6' }}>
              If an account exists for {' '}
              <strong style={{ color: C.text }}>{maskEmail(sentTo)}</strong>
              {' '}we have sent a password reset link.
            </p>
            <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#166534', lineHeight: '1.5' }}>
                The link expires in <strong>1 hour</strong>. Check your spam folder if you don&apos;t see it within a minute.
              </p>
            </div>
            <button type="button" onClick={handleResend} disabled={loading}
              style={{ width: '100%', padding: '13px', fontSize: '15px', fontWeight: '500', color: C.text, backgroundColor: C.bg, border: `1px solid ${C.border}`, borderRadius: '10px', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', marginBottom: '0' }}>
              {loading ? 'Sending...' : 'Resend email'}
            </button>
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <a href="/login"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: C.dim, fontFamily: 'inherit', textDecoration: 'none' }}>
            ← Back to login
          </a>
        </div>
      </div>
    </div>
  );
}
