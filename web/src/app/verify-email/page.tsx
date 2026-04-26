// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
'use client';

import { useState, useEffect, CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { resolveNext } from '../../lib/authRedirect';

// Premium conversion moment. Three states:
//   - waiting  — user hasn't clicked the link yet. Masked email, resend,
//                change-email escape hatch.
//   - success  — users.email_verified flipped true. Animated checkmark,
//                "You're in.", Continue routes to pick-username if the
//                profile still has no handle, else /welcome.
//   - expired  — resend failed or link expired beyond the server limit.
//                "Link expired." + fresh-link button.
//
// Verification state of truth is `public.users.email_verified`, not
// `auth.users.email_confirmed_at` — Supabase can auto-set the latter at
// signup when "Confirm email" is OFF.

const C = {
  bg: '#ffffff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111111',
  dim: '#666666',
  accent: '#111111',
  success: '#22c55e',
  // DA-055 — canonical `--danger` (AA-contrast).
  danger: '#b91c1c',
} as const;

// H1 — `rate_limited` is distinct from `expired`. Pre-fix the 429
// response from /api/auth/resend-verification mapped to `expired`,
// which shared UI with actual link expiry: same "Send yourself a
// fresh one" button that re-fired the resend and hit 429 again —
// infinite retry loop. Separate state gets its own copy + disables
// the resend button until the cooldown window closes.
type Status = 'loading' | 'waiting' | 'success' | 'expired' | 'rate_limited';

function maskEmail(e: string): string {
  const [local, domain] = e.split('@');
  if (!domain) return e;
  return local.slice(0, 2) + '***@' + domain;
}

export default function VerifyEmailPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('loading');
  const [userEmail, setUserEmail] = useState<string>('');
  const [usernameMissing, setUsernameMissing] = useState<boolean>(false);
  const [cooldown, setCooldown] = useState<number>(0);
  const [resending, setResending] = useState<boolean>(false);
  const [changeEmail, setChangeEmail] = useState<boolean>(false);
  const [newEmail, setNewEmail] = useState<string>('');
  const [focused, setFocused] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [updateLoading, setUpdateLoading] = useState<boolean>(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const check = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setStatus('waiting');
        return;
      }
      if (!cancelled && user.email) setUserEmail(user.email);

      const { data: profile } = await supabase
        .from('users')
        .select('email_verified, username')
        .eq('id', user.id)
        .maybeSingle();

      if (cancelled) return;
      if (profile?.email_verified) {
        setUsernameMissing(!profile?.username);
        setStatus('success');
      } else {
        setStatus('waiting');
      }
    };

    check();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'USER_UPDATED' || event === 'SIGNED_IN') check();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleResend = async () => {
    if (cooldown > 0) return;
    setResending(true);
    setError('');
    try {
      // UJ-719 server-side rate-limit is authoritative (max 3/hour per
      // user). Client cooldown stays for UX polish.
      const res = await fetch('/api/auth/resend-verification', { method: 'POST' });
      if (res.status === 429) {
        // H1 — dedicated rate_limited state instead of reusing `expired`.
        setStatus('rate_limited');
        setError('Too many verification resends. Try again in an hour.');
        setResending(false);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Couldn't send the email. Try again in a moment.");
      }

      setCooldown(60);
      const interval = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setResending(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't send the email. Try again in a moment."
      );
      setResending(false);
    }
  };

  const handleUpdateEmail = async () => {
    if (!newEmail) return;
    setUpdateLoading(true);
    setError('');
    try {
      // /api/auth/email-change now owns the entire flow: validates the
      // email, calls auth.updateUser server-side (which queues the
      // pending change AND sends the confirmation email), then flips
      // our local email_verified flag. Client used to also call
      // auth.updateUser here, racing the server's flag flip and
      // splitting auth state across two surfaces. Removed.
      const res = await fetch('/api/auth/email-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail }),
      });
      if (res.status === 429) {
        setError('Too many email-change attempts. Try again later.');
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          typeof body?.error === 'string'
            ? body.error
            : "Couldn't update email. Try again in a moment."
        );
        return;
      }
      setUserEmail(newEmail);
      setChangeEmail(false);
      setNewEmail('');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't update email. Try again in a moment."
      );
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleContinue = () => {
    // H2 / L2-02-auth-002 — preserve ?next= through the verify-email
    // step. A user who arrived at signup with ?next= should land on
    // that target after verifying email, not on /welcome. The
    // pick-username page also forwards ?next= downstream, so the
    // chain stays intact regardless of which leg we take here.
    const raw =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('next') || ''
        : '';
    const safe = resolveNext(raw, null);
    const nextQs = safe ? `?next=${encodeURIComponent(safe)}` : '';
    router.replace((usernameMissing ? '/signup/pick-username' : '/welcome') + nextQs);
  };

  const shell: CSSProperties = {
    minHeight: '100vh',
    backgroundColor: C.bg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    boxSizing: 'border-box',
  };

  const card: CSSProperties = {
    backgroundColor: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: '18px',
    padding: '48px 36px',
    width: '100%',
    maxWidth: '440px',
    boxSizing: 'border-box',
    textAlign: 'center',
  };

  const wordmark: CSSProperties = {
    fontFamily: 'var(--font-source-serif), Georgia, "Times New Roman", serif',
    fontSize: '26px',
    fontWeight: 800,
    color: C.accent,
    letterSpacing: '-0.02em',
    marginBottom: '36px',
    userSelect: 'none',
  };

  if (status === 'loading') {
    return (
      <div style={shell}>
        <div style={{ ...card, padding: '56px 36px' }}>
          <div style={wordmark}>Verity Post</div>
          <div style={{ fontSize: 14, color: C.dim }}>Checking your account&hellip;</div>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div style={shell}>
        <style>{animationCss}</style>
        <div style={card}>
          <div style={wordmark}>Verity Post</div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            <SuccessCheck />
          </div>
          <h1
            style={{
              fontSize: '36px',
              fontWeight: 700,
              color: C.text,
              margin: '0 0 10px 0',
              letterSpacing: '-0.02em',
              fontFamily: 'var(--font-source-serif), Georgia, "Times New Roman", serif',
            }}
          >
            You&rsquo;re in.
          </h1>
          <p
            style={{
              fontSize: '15px',
              color: C.dim,
              margin: '0 0 32px 0',
              lineHeight: 1.55,
            }}
          >
            Welcome to Verity Post.
          </p>
          <button
            type="button"
            onClick={handleContinue}
            style={{
              width: '100%',
              padding: '14px',
              fontSize: '15px',
              fontWeight: 600,
              color: '#fff',
              backgroundColor: C.accent,
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              minHeight: 48,
            }}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (status === 'rate_limited') {
    // H1 — rate-limit lockout view. No resend button — the previous
    // "Send yourself a fresh one" button reused on `expired` just
    // looped back into another 429. Copy names the wait window
    // explicitly. Re-enter via a page refresh once the hour ticks.
    return (
      <div style={shell}>
        <div style={card}>
          <div style={wordmark}>Verity Post</div>
          <h1
            style={{
              fontSize: '26px',
              fontWeight: 700,
              color: C.text,
              margin: '0 0 10px 0',
              letterSpacing: '-0.01em',
            }}
          >
            Too many attempts
          </h1>
          <p
            style={{
              fontSize: '14px',
              color: C.dim,
              margin: '0 0 28px 0',
              lineHeight: 1.55,
            }}
          >
            {error || 'Too many verification resends. Try again in about an hour.'}
          </p>
        </div>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div style={shell}>
        <div style={card}>
          <div style={wordmark}>Verity Post</div>
          <h1
            style={{
              fontSize: '26px',
              fontWeight: 700,
              color: C.text,
              margin: '0 0 10px 0',
              letterSpacing: '-0.01em',
            }}
          >
            Link expired
          </h1>
          <p
            style={{
              fontSize: '14px',
              color: C.dim,
              margin: '0 0 28px 0',
              lineHeight: 1.55,
            }}
          >
            {error || 'That verification link is no longer valid. Send yourself a fresh one.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setStatus('waiting');
              setError('');
              handleResend();
            }}
            style={{
              width: '100%',
              padding: '14px',
              fontSize: '15px',
              fontWeight: 600,
              color: '#fff',
              backgroundColor: C.accent,
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              minHeight: 48,
            }}
          >
            Get a new link
          </button>
        </div>
      </div>
    );
  }

  // Anon URL-poke (or expired session) — getUser() returned null and
  // status flipped to 'waiting'. The "Check your email" + Resend flow
  // makes no sense without an email address. Render a Sign in / Create
  // account fork instead so the visitor isn't stranded with a dead
  // Resend button. Per user-journey audit 2026-04-23.
  if (status === 'waiting' && !userEmail) {
    return (
      <div style={shell}>
        <div style={{ ...card, padding: '44px 36px' }}>
          <div style={wordmark}>Verity Post</div>
          <h1
            style={{
              fontSize: '26px',
              fontWeight: 700,
              color: C.text,
              margin: '0 0 10px 0',
              letterSpacing: '-0.01em',
            }}
          >
            Verify your email
          </h1>
          <p
            style={{
              fontSize: '14px',
              color: C.dim,
              margin: '0 0 26px 0',
              lineHeight: 1.55,
            }}
          >
            Sign in to your account to resend the verification link, or create a new account to
            start.
          </p>
          <a
            href="/login"
            style={{
              display: 'block',
              width: '100%',
              padding: '13px',
              fontSize: '15px',
              fontWeight: 600,
              color: '#fff',
              backgroundColor: C.accent,
              border: 'none',
              borderRadius: '10px',
              textDecoration: 'none',
              marginBottom: '14px',
              minHeight: 48,
              boxSizing: 'border-box',
            }}
          >
            Sign in
          </a>
          <a
            href="/signup"
            style={{
              display: 'block',
              width: '100%',
              padding: '13px',
              fontSize: '14px',
              fontWeight: 500,
              color: C.accent,
              backgroundColor: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: '10px',
              textDecoration: 'none',
              minHeight: 48,
              boxSizing: 'border-box',
            }}
          >
            Create free account
          </a>
        </div>
      </div>
    );
  }

  // waiting
  return (
    <div style={shell}>
      <div style={{ ...card, padding: '44px 36px' }}>
        <div style={wordmark}>Verity Post</div>

        {error && (
          <div
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '10px',
              padding: '12px 14px',
              marginBottom: '18px',
              textAlign: 'left',
            }}
          >
            <p style={{ margin: 0, fontSize: '13px', color: C.danger }}>{error}</p>
          </div>
        )}

        <h1
          style={{
            fontSize: '26px',
            fontWeight: 700,
            color: C.text,
            margin: '0 0 10px 0',
            letterSpacing: '-0.01em',
          }}
        >
          Check your email
        </h1>
        <p style={{ fontSize: '14px', color: C.dim, margin: '0 0 4px 0', lineHeight: 1.55 }}>
          We sent a verification link to
        </p>
        <p style={{ fontSize: '15px', fontWeight: 600, color: C.text, margin: '0 0 26px 0' }}>
          {userEmail ? maskEmail(userEmail) : '…'}
        </p>

        <div
          style={{
            backgroundColor: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: '10px',
            padding: '14px 16px',
            marginBottom: '22px',
            textAlign: 'left',
          }}
        >
          <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: C.text, fontWeight: 600 }}>
            Didn&rsquo;t get it?
          </p>
          <p style={{ margin: 0, fontSize: '13px', color: C.dim, lineHeight: 1.5 }}>
            Check your spam folder, or wait a minute and resend. The link expires after 24 hours.
          </p>
        </div>

        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || resending}
          style={{
            width: '100%',
            padding: '13px',
            fontSize: '15px',
            fontWeight: 600,
            fontFamily: 'inherit',
            color: cooldown > 0 ? C.dim : '#fff',
            backgroundColor: cooldown > 0 ? C.bg : C.accent,
            border: cooldown > 0 ? `1px solid ${C.border}` : 'none',
            borderRadius: '10px',
            cursor: cooldown > 0 ? 'not-allowed' : 'pointer',
            marginBottom: '14px',
            transition: 'all 0.15s',
            minHeight: 48,
          }}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : resending ? 'Sending…' : 'Resend email'}
        </button>

        {!changeEmail ? (
          <>
            <button
              type="button"
              onClick={() => setChangeEmail(true)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                color: C.accent,
                fontWeight: 500,
                fontFamily: 'inherit',
                textDecoration: 'underline',
                minHeight: 44,
              }}
            >
              Change email address
            </button>
            <div style={{ marginTop: '6px' }}>
              <a
                href="/logout"
                style={{
                  display: 'inline-block',
                  fontSize: '12px',
                  color: C.dim,
                  fontFamily: 'inherit',
                  textDecoration: 'underline',
                  padding: '10px 8px',
                  minHeight: 44,
                }}
              >
                Use a different account
              </a>
            </div>
          </>
        ) : (
          <div style={{ marginTop: '4px', textAlign: 'left' }}>
            <input
              type="email"
              placeholder="Enter new email address"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={{
                width: '100%',
                padding: '12px 14px',
                fontSize: '14px',
                color: C.text,
                backgroundColor: C.bg,
                border: `1.5px solid ${focused ? C.accent : C.border}`,
                borderRadius: '10px',
                outline: 'none',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                marginBottom: '10px',
                minHeight: 44,
              }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setChangeEmail(false);
                  setNewEmail('');
                }}
                style={{
                  flex: 1,
                  padding: '11px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: C.text,
                  backgroundColor: C.bg,
                  border: `1px solid ${C.border}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  minHeight: 44,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdateEmail}
                disabled={updateLoading || !newEmail}
                style={{
                  flex: 1,
                  padding: '11px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#fff',
                  backgroundColor: updateLoading || !newEmail ? '#cccccc' : C.accent,
                  border: 'none',
                  borderRadius: '8px',
                  cursor: updateLoading || !newEmail ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  minHeight: 44,
                }}
              >
                {updateLoading ? 'Updating…' : 'Update email'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Premium animated check (pure SVG + CSS keyframes, ~600ms) ----

const animationCss = `
@keyframes vp-ring-in {
  0%   { stroke-dashoffset: 188; }
  100% { stroke-dashoffset: 0; }
}
@keyframes vp-check-in {
  0%   { stroke-dashoffset: 48; }
  100% { stroke-dashoffset: 0; }
}
@keyframes vp-pop {
  0%   { transform: scale(0.86); opacity: 0; }
  60%  { transform: scale(1.04); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
`;

function SuccessCheck() {
  return (
    <div
      style={{
        width: 72,
        height: 72,
        animation: 'vp-pop 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
      }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 72 72" width={72} height={72}>
        <circle
          cx="36"
          cy="36"
          r="30"
          fill="none"
          stroke={C.success}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray="188"
          strokeDashoffset="188"
          style={{
            transformOrigin: '36px 36px',
            transform: 'rotate(-90deg)',
            animation: 'vp-ring-in 480ms cubic-bezier(0.4, 0, 0.2, 1) 60ms forwards',
          }}
        />
        <path
          d="M22 37 L32 47 L50 28"
          fill="none"
          stroke={C.success}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="48"
          strokeDashoffset="48"
          style={{
            animation: 'vp-check-in 320ms cubic-bezier(0.4, 0, 0.2, 1) 360ms forwards',
          }}
        />
      </svg>
    </div>
  );
}
