'use client';

import { CSSProperties, FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { resolveNext } from '@/lib/authRedirect';

// [S3-Q2-d] OAuth feature flag. Default false during closed beta /
// pre-launch hide. Code preserved — one-line flip re-enables.
export const OAUTH_ENABLED = false;

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

type Stage = 'email' | 'code';

interface Props {
  notice?: string | null;
}

export default function SingleDoorForm({ notice }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawNext = searchParams?.get('next') ?? null;

  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [sentEmail, setSentEmail] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [codeFocused, setCodeFocused] = useState(false);
  // Resend cooldown (30 s)
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stage === 'code') {
      setTimeout(() => codeInputRef.current?.focus(), 50);
    }
  }, [stage]);

  useEffect(() => {
    return () => {
      if (resendTimer.current) clearInterval(resendTimer.current);
    };
  }, []);

  function startResendCooldown() {
    setResendCooldown(30);
    resendTimer.current = setInterval(() => {
      setResendCooldown((n) => {
        if (n <= 1) {
          clearInterval(resendTimer.current!);
          return 0;
        }
        return n - 1;
      });
    }, 1000);
  }

  const submitEmail = async (e: FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    const trimmed = email.trim();
    if (!trimmed) return;
    setEmailBusy(true);
    try {
      const res = await fetch('/api/auth/send-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; reason?: string };
      if (!res.ok) {
        setEmailError(json.error || 'Could not send code. Please try again.');
        return;
      }
      if (json.reason === 'invite_required') {
        setEmailError('invite_required');
        return;
      }
      setSentEmail(trimmed);
      setStage('code');
      startResendCooldown();
    } catch {
      setEmailError('Network issue. Please try again.');
    } finally {
      setEmailBusy(false);
    }
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    setCodeError(null);
    const trimmed = code.trim();
    if (!trimmed) return;
    setCodeBusy(true);
    try {
      const res = await fetch('/api/auth/verify-magic-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: sentEmail, token: trimmed }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setCodeError(json.error || 'Invalid code. Please try again.');
        return;
      }
      if (!json.ok) {
        // The route returns 200 { ok:true } even for wrong codes (privacy
        // posture). If somehow ok is false, show a generic retry message.
        setCodeError('Could not sign in. Please try again or request a new code.');
        return;
      }
      // Success — session cookie is set. Navigate to next or home.
      const safe = resolveNext(rawNext, null);
      router.replace(safe || '/');
    } catch {
      setCodeError('Network issue. Please try again.');
    } finally {
      setCodeBusy(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || emailBusy) return;
    setCodeError(null);
    setEmailBusy(true);
    try {
      await fetch('/api/auth/send-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: sentEmail }),
      });
      startResendCooldown();
    } catch {
      // silently ignore — user can try again after cooldown
    } finally {
      setEmailBusy(false);
    }
  };

  const fieldStyle = (focused: boolean): CSSProperties => ({
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

  if (stage === 'email') {
    return (
      <>
        <h1
          style={{ fontSize: '26px', fontWeight: 700, color: C.text, margin: '0 0 8px 0' }}
        >
          Sign in
        </h1>
        <p style={{ fontSize: 14, color: C.dim, margin: '0 0 22px 0', lineHeight: 1.55 }}>
          Enter your email to sign in.
        </p>

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

        {emailError && emailError !== 'invite_required' && (
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
            <p style={{ margin: 0, fontSize: '13px', color: C.danger }}>{emailError}</p>
          </div>
        )}
        {emailError === 'invite_required' && (
          <div
            role="alert"
            style={{
              backgroundColor: 'var(--card)',
              border: `1px solid ${C.border}`,
              borderRadius: '10px',
              padding: '12px 14px',
              marginBottom: '16px',
            }}
          >
            <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: C.text, fontWeight: 600 }}>
              Verity Post is invite-only right now.
            </p>
            <p style={{ margin: 0, fontSize: '13px', color: C.dim }}>
              Have an invite? Use your link to get in.{' '}
              <a href="/login?mode=waitlist" style={{ color: C.accent, fontWeight: 600 }}>
                Join the waitlist →
              </a>
            </p>
          </div>
        )}

        <form onSubmit={submitEmail}>
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="email"
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
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              style={fieldStyle(emailFocused)}
            />
          </div>

          <button
            type="submit"
            disabled={emailBusy || !email.trim()}
            style={btnPrimary(!emailBusy && !!email.trim())}
          >
            {emailBusy ? 'Sending…' : 'Send code'}
          </button>
        </form>

        <p style={{ fontSize: 13, color: C.dim, textAlign: 'center', marginTop: 20, marginBottom: 0 }}>
          having trouble?{' '}
          <a href="/contact" style={{ color: C.accent, fontWeight: 600 }}>
            get help →
          </a>
        </p>

        {OAUTH_ENABLED && (
          <div style={{ marginTop: 20, borderTop: `1px solid ${C.border}`, paddingTop: 20 }}>
            <p style={{ fontSize: 12, color: C.dim, textAlign: 'center', marginBottom: 12 }}>
              Or continue with
            </p>
            <button
              type="button"
              disabled
              style={{
                ...btnPrimary(false),
                background: C.border,
                color: C.dim,
                marginBottom: 8,
              }}
            >
              Continue with Apple
            </button>
            <button
              type="button"
              disabled
              style={{ ...btnPrimary(false), background: C.border, color: C.dim }}
            >
              Continue with Google
            </button>
          </div>
        )}
      </>
    );
  }

  // Stage: code
  return (
    <>
      <h1
        style={{ fontSize: '26px', fontWeight: 700, color: C.text, margin: '0 0 8px 0' }}
      >
        Check your email
      </h1>
      <p style={{ fontSize: 14, color: C.dim, margin: '0 0 22px 0', lineHeight: 1.55 }}>
        We sent a 6-digit code to{' '}
        <strong style={{ color: C.text, wordBreak: 'break-all' }}>{sentEmail}</strong>. Enter
        it below.
      </p>

      {codeError && (
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
          <p style={{ margin: 0, fontSize: '13px', color: C.danger }}>{codeError}</p>
        </div>
      )}

      <form onSubmit={submitCode}>
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="code"
            style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 600,
              color: C.text,
              marginBottom: '7px',
            }}
          >
            Sign-in code
          </label>
          <input
            ref={codeInputRef}
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            pattern="\d{8}"
            maxLength={8}
            placeholder="12345678"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
            onFocus={() => setCodeFocused(true)}
            onBlur={() => setCodeFocused(false)}
            autoComplete="one-time-code"
            autoCapitalize="none"
            spellCheck={false}
            required
            style={fieldStyle(codeFocused)}
          />
        </div>

        <button
          type="submit"
          disabled={codeBusy || code.length < 8}
          style={btnPrimary(!codeBusy && code.length === 8)}
        >
          {codeBusy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div
        style={{
          marginTop: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={() => {
            setStage('email');
            setCode('');
            setCodeError(null);
          }}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            color: C.dim,
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'inherit',
            minHeight: 44,
            paddingRight: 8,
          }}
        >
          ← Use a different email
        </button>

        <button
          type="button"
          onClick={handleResend}
          disabled={resendCooldown > 0 || emailBusy}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            color: resendCooldown > 0 ? C.dim : C.accent,
            fontSize: 13,
            fontWeight: 600,
            cursor: resendCooldown > 0 || emailBusy ? 'default' : 'pointer',
            fontFamily: 'inherit',
            minHeight: 44,
          }}
        >
          {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
        </button>
      </div>
    </>
  );
}
