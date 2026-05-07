'use client';

// Conversational request-access form.
// Email-only field. Posts to /api/access-request.
// Privacy posture: same success response regardless of account state.

import { CSSProperties, FormEvent, useState } from 'react';

const C = {
  bg: 'var(--bg)',
  card: 'var(--card)',
  border: 'var(--border)',
  text: 'var(--text)',
  dim: 'var(--dim)',
  accent: 'var(--accent)',
  danger: 'var(--danger)',
} as const;

type Stage = 'form' | 'sent';

export default function RequestAccessForm() {
  const [stage, setStage] = useState<Stage>('form');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  const fieldStyle = (field: string): CSSProperties => ({
    width: '100%',
    padding: '12px 14px',
    fontSize: '15px',
    color: C.text,
    backgroundColor: C.bg,
    border: `1.5px solid ${focused === field ? C.accent : C.border}`,
    borderRadius: '10px',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s',
    minHeight: '44px',
  });

  const btnPrimary = (active: boolean): CSSProperties => ({
    width: '100%',
    padding: '13px',
    fontSize: '15px',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: active ? C.accent : C.dim,
    border: 'none',
    borderRadius: '10px',
    cursor: active ? 'pointer' : 'not-allowed',
    fontFamily: 'inherit',
    minHeight: '44px',
    transition: 'background-color 0.15s',
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) { setError('Email is required.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/access-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? 'Something went wrong. Try again.');
        return;
      }
      setStage('sent');
    } catch {
      setError('Network issue. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (stage === 'sent') {
    return (
      <>
        <h1 style={{ fontSize: '26px', fontWeight: 700, color: C.text, margin: '0 0 8px 0' }}>
          got it.
        </h1>
        <p style={{ fontSize: 14, color: C.dim, margin: '0 0 24px 0', lineHeight: 1.55 }}>
          we&rsquo;ll take a look and email you when you&rsquo;re in.
        </p>
        <a
          href="/login"
          style={{
            display: 'block',
            textAlign: 'center',
            fontSize: 13,
            color: C.accent,
            fontWeight: 600,
            textDecoration: 'none',
            marginTop: 8,
          }}
        >
          ← back to sign in
        </a>
      </>
    );
  }

  return (
    <>
      <h1 style={{ fontSize: '26px', fontWeight: 700, color: C.text, margin: '0 0 8px 0' }}>
        request early access
      </h1>

      {error && (
        <div
          role="alert"
          style={{
            backgroundColor: 'var(--danger-bg)',
            border: '1px solid var(--danger-border)',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '16px',
          }}
        >
          <p style={{ margin: 0, fontSize: '13px', color: C.danger }}>{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <input
            id="ra-email"
            name="email"
            type="email"
            aria-label="Email address"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={() => setFocused('email')}
            onBlur={() => setFocused(null)}
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            style={fieldStyle('email')}
          />
        </div>

        <button
          type="submit"
          disabled={busy || !email.trim()}
          style={btnPrimary(!busy && !!email.trim())}
        >
          {busy ? 'sending…' : 'send it →'}
        </button>
      </form>

      <p style={{ fontSize: 12, color: C.dim, textAlign: 'center', marginTop: 14, marginBottom: 0, lineHeight: 1.5 }}>
        By continuing, you agree to our{' '}
        <a href="/terms" style={{ color: C.accent, fontWeight: 600 }}>Terms</a>
        {' '}and{' '}
        <a href="/privacy" style={{ color: C.accent, fontWeight: 600 }}>Privacy Policy</a>.
      </p>

      <p style={{ fontSize: 13, color: C.dim, textAlign: 'center', marginTop: 20, marginBottom: 0 }}>
        already have an account?{' '}
        <a href="/login" style={{ color: C.accent, fontWeight: 600 }}>sign in</a>
      </p>
    </>
  );
}
