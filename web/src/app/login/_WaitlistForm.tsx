'use client';

import { CSSProperties, FormEvent, useState } from 'react';

const C = {
  bg: 'var(--bg)',
  border: 'var(--border)',
  text: 'var(--text)',
  dim: 'var(--dim)',
  accent: 'var(--accent)',
  danger: 'var(--danger)',
} as const;

type Stage = 'form' | 'sent';

export default function WaitlistForm() {
  const [stage, setStage] = useState<Stage>('form');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) { setError('Email is required.'); return; }
    setBusy(true);
    try {
      await fetch('/api/access-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
          name: name.trim() || undefined,
        }),
      });
      setStage('sent');
    } catch {
      setError('Network issue. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (stage === 'sent') {
    return (
      <>
        <h1 style={{ fontSize: '26px', fontWeight: 700, color: C.text, margin: '0 0 12px 0' }}>
          you&rsquo;re on the list.
        </h1>
        <p style={{ fontSize: 15, color: C.dim, margin: '0 0 8px 0', lineHeight: 1.55 }}>
          we&rsquo;ll email you when your spot opens up.
        </p>
        <p style={{ fontSize: 13, color: C.dim, margin: '0 0 28px 0', lineHeight: 1.55 }}>
          if someone you know is already on verity post, their invite link skips the line.
        </p>
        <a
          href="/login"
          style={{ fontSize: 13, color: C.accent, fontWeight: 600, textDecoration: 'none' }}
        >
          ← back to sign in
        </a>
      </>
    );
  }

  return (
    <>
      <h1 style={{ fontSize: '26px', fontWeight: 700, color: C.text, margin: '0 0 8px 0' }}>
        join the waitlist.
      </h1>
      <p style={{ fontSize: 14, color: C.dim, margin: '0 0 24px 0', lineHeight: 1.55 }}>
        we&rsquo;re invite-only right now. drop your email and we&rsquo;ll reach out when your spot opens up.
      </p>

      {error && (
        <div
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

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="wl-email"
            style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: C.text, marginBottom: '7px' }}
          >
            your email
          </label>
          <input
            id="wl-email"
            type="email"
            placeholder="you@example.com"
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

        <div style={{ marginBottom: 24 }}>
          <label
            htmlFor="wl-name"
            style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: C.text, marginBottom: '7px' }}
          >
            your name <span style={{ fontWeight: 400, color: C.dim }}>(optional)</span>
          </label>
          <input
            id="wl-name"
            type="text"
            placeholder="first name or handle"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={() => setFocused('name')}
            onBlur={() => setFocused(null)}
            autoComplete="name"
            style={fieldStyle('name')}
          />
        </div>

        <button
          type="submit"
          disabled={busy || !email.trim()}
          style={{
            width: '100%',
            padding: '13px',
            fontSize: '15px',
            fontWeight: 600,
            color: '#fff',
            backgroundColor: !busy && email.trim() ? C.accent : C.dim,
            border: 'none',
            borderRadius: '10px',
            cursor: !busy && email.trim() ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            minHeight: '44px',
            transition: 'background-color 0.15s',
          }}
        >
          {busy ? 'saving your spot…' : 'get in line →'}
        </button>
      </form>

      <p style={{ fontSize: 13, color: C.dim, textAlign: 'center', marginTop: 20, marginBottom: 0 }}>
        already have an account?{' '}
        <a href="/login" style={{ color: C.accent, fontWeight: 600 }}>sign in →</a>
      </p>
    </>
  );
}
