// [S3-Q2-b][S3-Q2-d] /login — magic-link entry point.
//
// Single email-only form. Submits to /api/auth/send-magic-link;
// magic link arrives, user clicks it, /api/auth/callback sets the
// session, post-callback routing sends new users to
// /signup/pick-username and returning users to ?next= or home.
//
// Closed-beta invite-code flow lives alongside as a sibling tab. The
// invite-code path sets the vp_ref cookie via /api/access-redeem
// (already in place); after redemption the user submits their email
// in the same magic-link form and the closed-beta gate on the
// magic-link route reads vp_ref and allows.
//
// What was here before (~700 lines): multi-step password form,
// lockout state, attempt counter, login-precheck/login-failed
// bookkeeping, password show/hide, resolve-username branch. All
// gone — magic-link removes the entire class. See Q2-b for the
// full migration map.
//
// OAuth (Apple + Google) section is preserved in MagicLinkForm but
// gated by a feature flag (default false). To re-enable: flip
// OAUTH_ENABLED below and confirm the providers are wired
// server-side.

'use client';

import { CSSProperties, FormEvent, Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePageViewTrack } from '@/lib/useTrack';
import MagicLinkForm from './_MagicLinkForm';

// [S3-Q2-d] OAuth feature flag. Default false during closed beta /
// pre-launch hide. Code preserved in MagicLinkForm + the handler
// below — one-line flip re-enables both web buttons.
const OAUTH_ENABLED = false;

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

type Mode = 'signin' | 'invite';

const inviteReasonText: Record<string, string> = {
  invalid_format: "That doesn't look like a valid code.",
  code_not_found: "We couldn't find that invite.",
  code_disabled: 'That invite has been disabled.',
  code_expired: 'That invite has expired.',
  code_exhausted: 'That invite has already been used.',
  rate_limited: 'Too many attempts. Try again in a minute.',
  server_misconfig: 'Server is missing config. Contact the team.',
  internal_error: 'Something went wrong. Please try again.',
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const recovered = searchParams?.get('recovered') === '1';
  const initialMode: Mode = searchParams?.get('mode') === 'invite' ? 'invite' : 'signin';
  usePageViewTrack('login');

  const [mode, setMode] = useState<Mode>(initialMode);
  const [inviteCode, setInviteCode] = useState<string>('');
  const [inviteBusy, setInviteBusy] = useState<boolean>(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteRedeemed, setInviteRedeemed] = useState<boolean>(false);
  const [focused, setFocused] = useState<boolean>(false);

  // Inbound ?toast notices from other flows. Limited under magic-link
  // (no password-reset toasts left); ?recovered=1 has its own banner
  // inside MagicLinkForm.
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const toastParam = searchParams?.get('toast') ?? null;
    if (!toastParam) return;
    if (toastParam === 'session_expired') {
      setNotice('Your session expired. Enter your email to sign back in.');
    }
  }, [searchParams]);

  const submitInvite = async (e: FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    if (!inviteCode.trim()) return;
    setInviteBusy(true);
    try {
      const res = await fetch('/api/access-redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inviteCode.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
      if (!res.ok || !json.ok) {
        setInviteError(inviteReasonText[json.reason || ''] || 'Could not redeem that invite.');
        return;
      }
      setInviteCode('');
      setInviteRedeemed(true);
      // Flip back to the magic-link form; the vp_ref cookie now
      // unlocks the closed-beta gate when the user submits their
      // email below.
      setMode('signin');
    } catch {
      setInviteError('Network issue. Please try again.');
    } finally {
      setInviteBusy(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'apple') => {
    // OAuth is gated off; this stub stays in place for the unhide
    // path. When OAUTH_ENABLED=true the MagicLinkForm exposes the
    // buttons that call this.
    if (!OAUTH_ENABLED) return;
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const callback = new URL('/api/auth/callback', window.location.origin);
    const nextParam = searchParams?.get('next') ?? null;
    if (nextParam) callback.searchParams.set('next', nextParam);
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callback.toString() },
    });
  };

  const inviteFieldStyle: CSSProperties = {
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
              marginBottom: '24px',
            }}
          >
            Verity Post
          </div>
        </a>

        {/* Two-tab toggle: Sign in (magic-link) vs Use access code. */}
        <div
          role="tablist"
          aria-label="Login mode"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 0,
            padding: 4,
            background: '#f3f4f6',
            borderRadius: 10,
            marginBottom: 22,
          }}
        >
          {(['signin', 'invite'] as const).map((m) => {
            const active = m === mode;
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setMode(m);
                  setInviteError(null);
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: active ? '#ffffff' : 'transparent',
                  color: active ? C.text : C.dim,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  transition: 'background 120ms, color 120ms',
                }}
              >
                {m === 'signin' ? 'Sign in' : 'Use access code'}
              </button>
            );
          })}
        </div>

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

        {inviteRedeemed && mode === 'signin' && (
          <div
            role="status"
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              color: '#166534',
              fontSize: 13,
              marginBottom: 16,
              lineHeight: 1.5,
            }}
          >
            Invite accepted. Enter your email below to receive your sign-in link.
          </div>
        )}

        {mode === 'signin' && (
          <MagicLinkForm
            mode="signin"
            recovered={recovered}
            oauthEnabled={OAUTH_ENABLED}
            onOAuth={handleOAuth}
          />
        )}

        {mode === 'invite' && (
          <>
            <h1 style={{ fontSize: '26px', fontWeight: 700, color: C.text, margin: '0 0 8px 0' }}>
              Have an access code?
            </h1>
            <p style={{ fontSize: 14, color: C.dim, margin: '0 0 22px 0', lineHeight: 1.55 }}>
              Paste the code or the full /r/&lt;slug&gt; URL below.
            </p>

            {inviteError && (
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
                <p style={{ margin: 0, fontSize: '13px', color: C.danger }}>{inviteError}</p>
              </div>
            )}

            <form onSubmit={submitInvite}>
              <div style={{ marginBottom: 16 }}>
                <label
                  htmlFor="invite-code"
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: C.text,
                    marginBottom: '7px',
                  }}
                >
                  Access code
                </label>
                <input
                  id="invite-code"
                  name="code"
                  type="text"
                  placeholder="abc123 or https://veritypost.com/r/abc123"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  required
                  style={inviteFieldStyle}
                />
              </div>

              <button
                type="submit"
                disabled={inviteBusy || !inviteCode.trim()}
                style={{
                  width: '100%',
                  padding: '13px',
                  fontSize: '15px',
                  fontWeight: 600,
                  color: '#fff',
                  backgroundColor: inviteBusy || !inviteCode.trim() ? C.dim : C.accent,
                  border: 'none',
                  borderRadius: '10px',
                  cursor: inviteBusy || !inviteCode.trim() ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  minHeight: '44px',
                }}
              >
                {inviteBusy ? 'Redeeming…' : 'Redeem access code'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
