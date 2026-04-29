'use client';

// Conversational request-access form.
// Three fields: email, name, reason. Posts to /api/access-request.
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
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
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

  const textareaStyle: CSSProperties = {
    ...fieldStyle('reason'),
    minHeight: '88px',
    resize: 'vertical',
  };

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
      await fetch('/api/access-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
          name: name.trim() || undefined,
          reason: reason.trim() || undefined,
        }),
      });
      // Always show the confirmation — we never reveal whether the email exists.
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
        <h1 style={{ fontSize: '26px', fontWeight: 700, color: C.text, margin: '0 0 8px 0' }}>
          got it.
        </h1>
        <p style={{ fontSize: 14, color: C.dim, margin: '0 0 24px 0', lineHeight: 1.55 }}>
          we&rsquo;ll take a look and email you when you&rsquo;re in. usually within a day or two.
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
        request access
      </h1>
      <p style={{ fontSize: 14, color: C.dim, margin: '0 0 22px 0', lineHeight: 1.55 }}>
        we&rsquo;re invite-only right now. tell us a bit and we&rsquo;ll get back to you.
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
            htmlFor="ra-email"
            style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: C.text, marginBottom: '7px' }}
          >
            what&rsquo;s your email?
          </label>
          <input
            id="ra-email"
            name="email"
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

        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="ra-name"
            style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: C.text, marginBottom: '7px' }}
          >
            what should we call you?
          </label>
          <input
            id="ra-name"
            name="name"
            type="text"
            placeholder="your name or handle"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={() => setFocused('name')}
            onBlur={() => setFocused(null)}
            autoComplete="name"
            style={fieldStyle('name')}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label
            htmlFor="ra-reason"
            style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: C.text, marginBottom: '7px' }}
          >
            what brought you here?
          </label>
          <textarea
            id="ra-reason"
            name="reason"
            placeholder="saw it on twitter, friend sent it, curious about the citations thing…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onFocus={() => setFocused('reason')}
            onBlur={() => setFocused(null)}
            rows={3}
            style={textareaStyle}
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

      <p style={{ fontSize: 13, color: C.dim, textAlign: 'center', marginTop: 20, marginBottom: 0 }}>
        already have an account?{' '}
        <a href="/login" style={{ color: C.accent, fontWeight: 600 }}>sign in</a>
      </p>
    </>
  );
}
