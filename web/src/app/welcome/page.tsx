// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
'use client';
import { useState, useEffect, CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { friendlyError, friendlyHttpError } from '@/lib/friendlyError';

// First-login onboarding carousel was retired — `WelcomeModal` (mounted in
// NavWrapper) handles the post-signin first-login username pick. This page
// now exists solely for the kids graduation-token deep link
// (/welcome?graduation_token=...). Anything else lands here, we bounce home.

const C = {
  bg: 'var(--bg)',
  card: 'var(--card)',
  border: 'var(--border)',
  text: 'var(--text)',
  dim: 'var(--dim)',
  accent: 'var(--accent)',
} as const;

export default function WelcomePage() {
  const router = useRouter();
  const [graduationToken, setGraduationToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = new URLSearchParams(window.location.search).get('graduation_token');
    if (t && t.length >= 16) {
      setGraduationToken(t);
    } else {
      router.replace('/');
    }
    setReady(true);
  }, [router]);
  if (!ready) {
    return <div>Loading…</div>;
  }
  if (graduationToken) {
    return <GraduationClaim token={graduationToken} />;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Phase 6 of AI + Plan Change Implementation — graduation claim flow
// ---------------------------------------------------------------------------

function GraduationClaim({ token }: { token: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ display_name: string | null; email: string } | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    if (password.length < 10) {
      setError('Password must be at least 10 characters.');
      setBusy(false);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      setBusy(false);
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError('Enter a valid email.');
      setBusy(false);
      return;
    }
    try {
      const res = await fetch('/api/auth/graduate-kid/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email: email.trim().toLowerCase(), password }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || friendlyHttpError(res, 'Could not complete setup. Try again.'));
        setBusy(false);
        return;
      }
      setDone({ display_name: j.display_name ?? null, email: email.trim().toLowerCase() });
    } catch (err) {
      setError(friendlyError(err, 'Could not complete setup. Try again.'));
      setBusy(false);
    }
  };

  const shell: CSSProperties = {
    minHeight: '100vh',
    background: C.bg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };
  const card: CSSProperties = {
    width: '100%',
    maxWidth: 460,
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    padding: 24,
    color: C.text,
  };

  if (done) {
    return (
      <div style={shell}>
        <div style={card}>
          <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>
            Welcome to Verity Post{done.display_name ? `, ${done.display_name}` : ''}.
          </h1>
          <p style={{ color: C.dim, fontSize: 14, lineHeight: 1.5, marginBottom: 16 }}>
            Your account is ready. Your kid-app reading history stays attached to your old profile
            (parent can review it). Your saved categories carried over.
          </p>
          <p style={{ color: C.dim, fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
            Check your email for a sign-in link, or enter your email below to request one.
          </p>
          <a
            href={`/login${done.email ? `?email=${encodeURIComponent(done.email)}` : ''}`}
            style={{
              display: 'inline-block',
              padding: '12px 18px',
              borderRadius: 10,
              background: C.accent,
              color: '#fff',
              textDecoration: 'none',
              fontWeight: 700,
            }}
          >
            Sign in to continue
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={shell}>
      <div style={card}>
        <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>You&apos;ve graduated.</h1>
        <p style={{ color: C.dim, fontSize: 14, lineHeight: 1.5, marginBottom: 16 }}>
          Your parent moved you to the main Verity Post app. Set your email and password to claim
          your new adult account. Your category preferences will carry over.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (the one your parent gave us)"
            autoComplete="email"
            style={{
              padding: 10,
              fontSize: 14,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
            }}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password (10+ characters)"
            autoComplete="new-password"
            style={{
              padding: 10,
              fontSize: 14,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
            }}
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm password"
            autoComplete="new-password"
            style={{
              padding: 10,
              fontSize: 14,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
            }}
          />
          {error && (
            <div
              style={{
                background: '#fee2e2',
                color: '#991b1b',
                padding: 10,
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}
          <button
            onClick={submit}
            disabled={busy}
            style={{
              padding: '12px 16px',
              fontSize: 15,
              fontWeight: 700,
              background: C.accent,
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.5 : 1,
              marginTop: 4,
            }}
          >
            {busy ? 'Claiming…' : 'Claim my account'}
          </button>
        </div>
      </div>
    </div>
  );
}
