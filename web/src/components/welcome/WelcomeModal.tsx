'use client';

import { CSSProperties, FormEvent, useCallback, useEffect, useRef, useState } from 'react';

const C = {
  bg: 'var(--bg)',
  card: 'var(--card)',
  border: 'var(--border)',
  text: 'var(--text)',
  dim: 'var(--dim)',
  accent: 'var(--accent)',
  danger: 'var(--danger)',
  success: 'var(--success)',
} as const;

const USERNAME_RE = /^[a-z0-9_]+$/;

type AvailState = 'idle' | 'checking' | 'available' | 'taken' | 'error';

interface Props {
  /** Path to redirect after username is saved. */
  nextPath?: string | null;
}

export default function WelcomeModal({ nextPath }: Props) {
  const [username, setUsername] = useState('');
  const [avail, setAvail] = useState<AvailState>('idle');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const checkAvailability = useCallback(async (raw: string) => {
    const val = raw.toLowerCase().trim();
    if (!val || val.length < 3 || !USERNAME_RE.test(val)) {
      setAvail('idle');
      return;
    }
    setAvail('checking');
    try {
      const res = await fetch('/api/auth/check-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: val }),
      });
      if (!res.ok) {
        setAvail('error');
        return;
      }
      const json = (await res.json()) as { available: boolean };
      setAvail(json.available ? 'available' : 'taken');
    } catch {
      setAvail('error');
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
    setUsername(raw);
    setSaveError(null);
    setAvail('idle');
    if (checkTimer.current) clearTimeout(checkTimer.current);
    if (raw.length >= 3 && USERNAME_RE.test(raw)) {
      checkTimer.current = setTimeout(() => checkAvailability(raw), 350);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    const val = username.trim();
    if (!val || val.length < 3 || val.length > 20 || !USERNAME_RE.test(val)) return;
    if (avail === 'taken') return;

    setSaving(true);
    try {
      const res = await fetch('/api/auth/save-username', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: val }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.status === 409) {
        setAvail('taken');
        setSaveError('That username was taken — pick another.');
        return;
      }
      if (!res.ok || !json.ok) {
        setSaveError(json.error || 'Could not save username. Please try again.');
        return;
      }
      // Success — navigate to destination.
      window.location.href = nextPath || '/';
    } catch {
      setSaveError('Network issue. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const canSubmit =
    username.length >= 3 &&
    username.length <= 20 &&
    USERNAME_RE.test(username) &&
    avail !== 'taken' &&
    avail !== 'checking' &&
    !saving;

  const availColor = {
    idle: C.dim,
    checking: C.dim,
    available: C.success,
    taken: C.danger,
    error: C.dim,
  }[avail];

  const availText = {
    idle: '',
    checking: 'Checking…',
    available: '✓ Available',
    taken: 'Already taken',
    error: '',
  }[avail];

  const overlayStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
  };

  const cardStyle: CSSProperties = {
    backgroundColor: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: '18px',
    padding: '40px 36px',
    width: '100%',
    maxWidth: '440px',
    boxSizing: 'border-box',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="Pick a username">
      <div style={cardStyle}>
        <div
          style={{
            fontSize: '20px',
            fontWeight: 800,
            color: C.accent,
            letterSpacing: '-0.5px',
            marginBottom: '24px',
          }}
        >
          verity post
        </div>

        <h1 style={{ fontSize: '24px', fontWeight: 700, color: C.text, margin: '0 0 8px 0' }}>
          you&rsquo;re in.
        </h1>
        <p style={{ fontSize: 14, color: C.dim, margin: '0 0 22px 0', lineHeight: 1.55 }}>
          welcome to verity post. pick a handle &mdash; this is what shows up next to your
          comments and on leaderboards. lowercase letters, numbers, and underscores, 3&ndash;20
          characters.
        </p>

        {saveError && (
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
            <p style={{ margin: 0, fontSize: '13px', color: C.danger }}>{saveError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label
              htmlFor="username"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: C.text,
                marginBottom: '7px',
              }}
            >
              Username
            </label>
            <input
              ref={inputRef}
              id="username"
              name="username"
              type="text"
              placeholder="your_handle"
              value={username}
              onChange={handleChange}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={20}
              style={{
                width: '100%',
                padding: '12px 14px',
                fontSize: '15px',
                color: C.text,
                backgroundColor: C.bg,
                border: `1.5px solid ${avail === 'taken' || saveError ? C.danger : avail === 'available' ? C.success : C.border}`,
                borderRadius: '10px',
                outline: 'none',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                minHeight: '44px',
              }}
            />
            {availText && (
              <p
                style={{
                  margin: '5px 0 0 0',
                  fontSize: '12px',
                  color: availColor,
                  fontWeight: 500,
                }}
                aria-live="polite"
              >
                {availText}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              width: '100%',
              padding: '13px',
              fontSize: '15px',
              fontWeight: 600,
              color: '#fff',
              backgroundColor: canSubmit ? C.accent : C.dim,
              border: 'none',
              borderRadius: '10px',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              minHeight: '44px',
            }}
          >
            {saving ? 'Saving…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
