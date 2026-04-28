// [S3-Q2-b][S3-Q2-c][S3-Q2-d] Shared magic-link auth form.
//
// Used by /login (mode="signin") and /signup (mode="signup"). The
// route handler is the same — /api/auth/send-magic-link — and the
// success copy is identical across signin / signup / rate-limited /
// any-other-error path so the response carries no oracle. The only
// per-mode difference is the headline + button label.
//
// OAuth section (Apple + Google) is rendered behind a hardcoded
// OAUTH_ENABLED flag (default false) per memory feedback_launch_hides.
// To re-enable: flip the constant + restore the AppleSignInButton +
// GoogleSignInButton imports in the consuming page.
//
// 30-second resend cooldown matches the iOS contract.

'use client';

import { CSSProperties, FormEvent, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Mode = 'signin' | 'signup';

type Props = {
  mode: Mode;
  /** When true, surface a small recovery banner above the form
   *  (used when /forgot-password redirected here with ?recovered=1). */
  recovered?: boolean;
  /** Show the OAuth section. Default false; re-enable by flipping the
   *  OAUTH_ENABLED constant in the consuming page and passing true. */
  oauthEnabled?: boolean;
  /** Optional handler for OAuth button clicks. Required when oauthEnabled. */
  onOAuth?: (provider: 'google' | 'apple') => Promise<void> | void;
};

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

const RESEND_COOLDOWN_SEC = 30;

const COPY: Record<Mode, { headline: string; submitLabel: string; below: string }> = {
  signin: {
    headline: 'Sign in.',
    submitLabel: 'Send sign-in link',
    below: "We'll email you a one-time sign-in link. No password required.",
  },
  signup: {
    headline: 'Create an account.',
    submitLabel: 'Send signup link',
    below: "We'll email you a one-time link to finish creating your account. No password required.",
  },
};

export default function MagicLinkForm({
  mode,
  recovered = false,
  oauthEnabled = false,
  onOAuth,
}: Props) {
  const [email, setEmail] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [sent, setSent] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState<number>(0);
  const [focused, setFocused] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Resend countdown. Ticks down once per second after a send.
  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const t = setTimeout(() => setCooldownLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldownLeft]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy || cooldownLeft > 0) return;
    setError(null);
    const trimmed = email.trim();
    if (!trimmed || trimmed.length > 254 || !trimmed.includes('@')) {
      setError('Please enter a valid email.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/send-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      if (res.status === 400) {
        // Server-side validation failed (only oracle leaked: input format).
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error || 'Please enter a valid email.');
        return;
      }
      // Every non-malformed path returns 200 with the generic body, so
      // we don't need to inspect the body — show the success card.
      setSent(true);
      setCooldownLeft(RESEND_COOLDOWN_SEC);
    } catch {
      // Network failure. Don't surface the real error — keep UX uniform
      // with success so the form doesn't differentiate live vs offline
      // recipients.
      setSent(true);
      setCooldownLeft(RESEND_COOLDOWN_SEC);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy || cooldownLeft > 0) return;
    // Re-fire the same submit using current email value. No state reset.
    setBusy(true);
    try {
      await fetch('/api/auth/send-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
    } catch {
      // Same UX as success — no oracle.
    } finally {
      setBusy(false);
      setCooldownLeft(RESEND_COOLDOWN_SEC);
    }
  };

  const fieldStyle: CSSProperties = {
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
  };

  if (sent) {
    return (
      <div role="status" aria-live="polite">
        <div
          style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 10,
            padding: '16px 18px',
            marginBottom: 18,
          }}
        >
          <p style={{ margin: 0, fontSize: 14, color: '#166534', lineHeight: 1.55 }}>
            If that email is registered we sent you a sign-in link; otherwise we sent you a signup
            link. Check your inbox.
          </p>
        </div>
        <button
          type="button"
          onClick={resend}
          disabled={cooldownLeft > 0 || busy}
          style={{
            width: '100%',
            padding: '13px',
            fontSize: '15px',
            fontWeight: 600,
            color: cooldownLeft > 0 ? C.dim : '#fff',
            backgroundColor: cooldownLeft > 0 ? C.bg : C.accent,
            border: cooldownLeft > 0 ? `1px solid ${C.border}` : 'none',
            borderRadius: '10px',
            cursor: cooldownLeft > 0 || busy ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            minHeight: '44px',
          }}
        >
          {cooldownLeft > 0 ? `Resend in ${cooldownLeft}s` : 'Resend'}
        </button>
      </div>
    );
  }

  return (
    <>
      <h1 style={{ fontSize: '26px', fontWeight: 700, color: C.text, margin: '0 0 8px 0' }}>
        {COPY[mode].headline}
      </h1>
      <p style={{ fontSize: 14, color: C.dim, margin: '0 0 22px 0', lineHeight: 1.55 }}>
        {COPY[mode].below}
      </p>

      {recovered && (
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
          We use one-time sign-in links. Enter your email below and we&apos;ll send a fresh one.
        </div>
      )}

      {error && (
        <div
          role="alert"
          id="magic-link-form-error"
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

      <form onSubmit={submit} aria-describedby={error ? 'magic-link-form-error' : undefined}>
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="magic-link-email"
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
            ref={inputRef}
            id="magic-link-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoFocus
            required
            style={fieldStyle}
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
            backgroundColor: busy || !email.trim() ? C.dim : C.accent,
            border: 'none',
            borderRadius: '10px',
            cursor: busy || !email.trim() ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            minHeight: '44px',
          }}
        >
          {busy ? 'Sending…' : COPY[mode].submitLabel}
        </button>
      </form>

      {/* OAuth section. Hidden behind oauthEnabled flag (default false)
          per memory feedback_launch_hides. Code preserved; one-line flip
          re-enables. */}
      {oauthEnabled && onOAuth && (
        <div style={{ marginTop: 22 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              margin: '14px 0',
              color: C.dim,
              fontSize: 12,
              gap: 10,
            }}
          >
            <div style={{ flex: 1, height: 1, background: C.border }} />
            <span>or</span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <button
              type="button"
              onClick={() => onOAuth('apple')}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '15px',
                fontWeight: 600,
                color: C.text,
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '10px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                minHeight: '44px',
              }}
            >
              Continue with Apple
            </button>
            <button
              type="button"
              onClick={() => onOAuth('google')}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '15px',
                fontWeight: 600,
                color: C.text,
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '10px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                minHeight: '44px',
              }}
            >
              Continue with Google
            </button>
          </div>
        </div>
      )}
    </>
  );
}
