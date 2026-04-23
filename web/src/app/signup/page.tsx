// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
'use client';

import { useEffect, useRef, useState, FormEvent, CSSProperties } from 'react';
import { passwordStrength as strengthScore, PASSWORD_REQS } from '../../lib/password';
import { usePageViewTrack, useTrack } from '@/lib/useTrack';

// Pre-auth account creation. No role/plan/tier gates; permission markers are
// informational for the sweep grep. UX hierarchy follows Apple HIG §4.8 and
// the "SIWA at least equal prominence" rule — native provider buttons live
// at the top, the email form is an on-demand expander below.

const C = {
  bg: '#ffffff',
  card: '#ffffff',
  shell: '#fafafa',
  border: '#e5e5e5',
  borderStrong: '#111111',
  text: '#111111',
  dim: '#666666',
  muted: '#999999',
  accent: '#111111',
  success: '#22c55e',
  // DA-055 — canonical `--danger` (AA-contrast).
  danger: '#b91c1c',
  fieldBg: '#f7f7f7',
} as const;

type FocusField = 'email' | 'pw' | 'name' | null;

type EmailCheck =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'taken' };

interface PasswordRule {
  id: string;
  label: string;
  test: (p: string) => boolean;
}

export default function SignupPage() {
  usePageViewTrack('signup');
  const trackEvent = useTrack();

  const [mode, setMode] = useState<'providers' | 'email'>('providers');
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [agreed, setAgreed] = useState<boolean>(false);
  const [focused, setFocused] = useState<FocusField>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [providerLoading, setProviderLoading] = useState<'apple' | 'google' | null>(null);
  const [error, setError] = useState<string>('');
  const [duplicateEmail, setDuplicateEmail] = useState<string>('');
  const [emailCheck, setEmailCheck] = useState<EmailCheck>({ status: 'idle' });

  const strength = strengthScore(password);
  const passwordMeetsPolicy = (PASSWORD_REQS as PasswordRule[]).every((r) => r.test(password));
  const failedRules = (PASSWORD_REQS as PasswordRule[]).filter((r) => !r.test(password));

  // Debounced availability probe — 400ms after the last keystroke. The
  // /api/auth/check-email endpoint is rate-limited per IP + per address, so
  // we only fire when the input parses as a plausible email.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const v = email.trim().toLowerCase();
    if (!v || !v.includes('@') || v.length < 5) {
      setEmailCheck({ status: 'idle' });
      return;
    }
    setEmailCheck({ status: 'checking' });
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-email?email=${encodeURIComponent(v)}`);
        if (!res.ok) {
          setEmailCheck({ status: 'idle' });
          return;
        }
        const body = (await res.json()) as { checked?: boolean; available?: boolean };
        if (!body.checked) {
          setEmailCheck({ status: 'idle' });
          return;
        }
        setEmailCheck({ status: body.available ? 'available' : 'taken' });
      } catch {
        setEmailCheck({ status: 'idle' });
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [email]);

  // Listen for OAuth completion so that the post-callback reload lands on
  // the right post-signup route rather than bouncing through /.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { createClient } = await import('../../lib/supabase/client');
      const supabase = createClient();
      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        if (!mounted) return;
        if (event === 'SIGNED_IN' && session) {
          window.location.href = '/signup/pick-username';
        }
      });
      return () => sub.subscription.unsubscribe();
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const field = (name: Exclude<FocusField, null>): CSSProperties => ({
    width: '100%',
    padding: '13px 14px',
    fontSize: '15px',
    color: C.text,
    backgroundColor: C.fieldBg,
    border: `1.5px solid ${focused === name ? C.borderStrong : C.border}`,
    borderRadius: '10px',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s',
  });

  const canSubmit = !loading && agreed && passwordMeetsPolicy && email.trim().length > 0;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    // Capture the email-probe state BEFORE the POST so post-response code
    // can read the pre-submit availability verdict without triggering TS
    // control-flow narrowing inside the response handler below.
    const probeTaken = emailCheck.status === 'taken';
    if (probeTaken) {
      setDuplicateEmail(email.trim().toLowerCase());
      setError('An account with this email already exists.');
      return;
    }
    setLoading(true);
    setError('');
    setDuplicateEmail('');
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          // Single combined "I'm 13+ and agree to Terms + Privacy" checkbox
          // satisfies both server gates in one tap.
          ageConfirmed: true,
          agreedToTerms: true,
          fullName: fullName.trim() || null,
          // UJ-713: default-on, no UI affordance. A user who wants a
          // short-lived session can sign out after their task.
          keepSignedIn: true,
        }),
      });

      const data = (await res.json()) as { error?: string; needsEmailConfirmation?: boolean };

      if (!res.ok) {
        // Duplicate-email detection: the signup route flattens GoTrue's
        // "User already registered" into a generic 400. Cross-check with
        // /api/auth/check-email so we only set the duplicate copy when we
        // can prove it — not on every 400.
        const trimmedEmail = email.trim().toLowerCase();
        let isDuplicate = false;
        if (res.status === 400 && trimmedEmail.includes('@')) {
          try {
            const probe = await fetch(
              `/api/auth/check-email?email=${encodeURIComponent(trimmedEmail)}`
            );
            if (probe.ok) {
              const probeBody = (await probe.json()) as { checked?: boolean; available?: boolean };
              if (probeBody.checked && probeBody.available === false) isDuplicate = true;
            }
          } catch {}
        }
        if (isDuplicate) {
          setDuplicateEmail(trimmedEmail);
          setError('An account with this email already exists.');
          return;
        }
        throw new Error(data.error || 'We couldn’t create your account. Try again.');
      }

      trackEvent('signup_complete', 'product', {
        content_type: 'signup',
        payload: {
          needs_email_confirmation: !!data.needsEmailConfirmation,
          method: 'email',
        },
      });
      window.location.href = data.needsEmailConfirmation
        ? '/verify-email'
        : '/signup/pick-username';
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'We couldn’t create your account. Try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const startOAuth = async (provider: 'apple' | 'google') => {
    setProviderLoading(provider);
    setError('');
    try {
      const { createClient } = await import('../../lib/supabase/client');
      const supabase = createClient();
      await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin + '/api/auth/callback' },
      });
    } catch {
      setProviderLoading(null);
      setError('Sign up failed. Try again.');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: C.shell,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 16px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          backgroundColor: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: '20px',
          padding: '44px 40px',
          width: '100%',
          maxWidth: '480px',
          boxSizing: 'border-box',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04)',
        }}
      >
        <div
          style={{
            fontSize: '20px',
            fontWeight: 800,
            color: C.accent,
            letterSpacing: '-0.5px',
            marginBottom: '32px',
          }}
        >
          Verity Post
        </div>

        <h1
          style={{
            fontSize: '28px',
            fontWeight: 700,
            color: C.text,
            margin: '0 0 8px 0',
            letterSpacing: '-0.4px',
            lineHeight: 1.15,
          }}
        >
          Join the discussion that&rsquo;s earned.
        </h1>
        <p
          style={{
            fontSize: '14px',
            color: C.dim,
            margin: '0 0 28px 0',
            lineHeight: 1.5,
          }}
        >
          Read an article, pass the comprehension check, then join the conversation.
        </p>

        {error && (
          <div
            id="signup-form-error"
            role="alert"
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '10px',
              padding: '12px 14px',
              marginBottom: '18px',
            }}
          >
            <p style={{ margin: 0, fontSize: '13px', color: C.danger, lineHeight: 1.5 }}>
              {error}
              {duplicateEmail && (
                <>
                  {' '}
                  <a
                    href={`/login?email=${encodeURIComponent(duplicateEmail)}`}
                    style={{ color: C.danger, fontWeight: 600, textDecoration: 'underline' }}
                  >
                    Sign in instead
                  </a>
                </>
              )}
            </p>
          </div>
        )}

        {/* SIWA first — Apple HIG §4.8 requires at least equal prominence. */}
        <button
          type="button"
          onClick={() => startOAuth('apple')}
          disabled={providerLoading !== null || loading}
          style={{
            width: '100%',
            padding: '13px',
            fontSize: '15px',
            fontWeight: 600,
            color: '#ffffff',
            backgroundColor: '#000000',
            border: 'none',
            borderRadius: '10px',
            cursor: providerLoading || loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            fontFamily: 'inherit',
            marginBottom: '10px',
            opacity: providerLoading === 'google' ? 0.6 : 1,
          }}
        >
          {providerLoading === 'apple' ? (
            <Spinner color="#ffffff" />
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              Continue with Apple
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => startOAuth('google')}
          disabled={providerLoading !== null || loading}
          style={{
            width: '100%',
            padding: '13px',
            fontSize: '15px',
            fontWeight: 600,
            color: C.text,
            backgroundColor: C.bg,
            border: `1.5px solid ${C.border}`,
            borderRadius: '10px',
            cursor: providerLoading || loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            fontFamily: 'inherit',
            marginBottom: '18px',
            opacity: providerLoading === 'apple' ? 0.6 : 1,
          }}
        >
          {providerLoading === 'google' ? (
            <Spinner color={C.text} />
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                <path
                  d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.3-.2-2.7-.5-4z"
                  fill="#FFC107"
                />
                <path
                  d="M6.3 14.7l7 5.1C15.1 16 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3c-7.6 0-14.2 4.3-17.7 11.7z"
                  fill="#FF3D00"
                />
                <path
                  d="M24 45c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 35.9 26.9 37 24 37c-6.1 0-10.7-3.1-11.8-8.5l-7 5.4C8.9 41.1 15.9 45 24 45z"
                  fill="#4CAF50"
                />
                <path
                  d="M44.5 20H24v8.5h11.8c-.5 2.7-2 5-4.2 6.5l6.6 5.6C41.8 37.3 45 31 45 24c0-1.3-.2-2.7-.5-4z"
                  fill="#1976D2"
                />
              </svg>
              Continue with Google
            </>
          )}
        </button>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '18px',
          }}
        >
          <div style={{ flex: 1, height: '1px', backgroundColor: C.border }} />
          <span style={{ fontSize: '12px', color: C.muted, whiteSpace: 'nowrap' }}>or</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: C.border }} />
        </div>

        {mode === 'providers' && (
          <button
            type="button"
            onClick={() => setMode('email')}
            style={{
              width: '100%',
              padding: '13px',
              fontSize: '15px',
              fontWeight: 500,
              color: C.text,
              backgroundColor: C.bg,
              border: `1.5px solid ${C.border}`,
              borderRadius: '10px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              marginBottom: '24px',
            }}
          >
            Continue with email
          </button>
        )}

        {mode === 'email' && (
          <form
            onSubmit={handleSubmit}
            aria-describedby={error ? 'signup-form-error' : undefined}
            style={{ marginBottom: '24px' }}
          >
            <div style={{ marginBottom: '14px' }}>
              <label
                htmlFor="signup-name"
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: C.text,
                  marginBottom: '7px',
                }}
              >
                Full name <span style={{ color: C.muted, fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                id="signup-name"
                type="text"
                placeholder="Jane Reader"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                onFocus={() => setFocused('name')}
                onBlur={() => setFocused(null)}
                style={field('name')}
                autoComplete="name"
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label
                htmlFor="signup-email"
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
                id="signup-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused(null)}
                style={{
                  ...field('email'),
                  borderColor:
                    emailCheck.status === 'taken'
                      ? C.danger
                      : emailCheck.status === 'available'
                        ? C.success
                        : focused === 'email'
                          ? C.borderStrong
                          : C.border,
                }}
                autoComplete="email"
                inputMode="email"
                autoCapitalize="off"
                autoCorrect="off"
                required
              />
              <div style={{ minHeight: '18px', marginTop: '6px' }}>
                {emailCheck.status === 'checking' && (
                  <span style={{ fontSize: 12, color: C.muted }}>
                    Checking availability&hellip;
                  </span>
                )}
                {emailCheck.status === 'available' && (
                  <span style={{ fontSize: 12, color: C.success, fontWeight: 600 }}>
                    Email is available
                  </span>
                )}
                {emailCheck.status === 'taken' && (
                  <span style={{ fontSize: 12, color: C.danger }}>
                    An account already exists for that email.{' '}
                    <a
                      href={`/login?email=${encodeURIComponent(email)}`}
                      style={{ color: C.danger, fontWeight: 600, textDecoration: 'underline' }}
                    >
                      Sign in
                    </a>
                  </span>
                )}
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label
                htmlFor="signup-password"
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: C.text,
                  marginBottom: '7px',
                }}
              >
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocused('pw')}
                  onBlur={() => setFocused(null)}
                  style={{ ...field('pw'), paddingRight: '62px' }}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  style={{
                    position: 'absolute',
                    right: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: C.dim,
                    fontFamily: 'inherit',
                    padding: 0,
                  }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {password.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        style={{
                          flex: 1,
                          height: '3px',
                          borderRadius: '99px',
                          backgroundColor: i <= strength.bars ? strength.color : C.border,
                          transition: 'background-color 0.2s',
                        }}
                      />
                    ))}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 11,
                    }}
                  >
                    <span style={{ color: strength.color, fontWeight: 600 }}>{strength.label}</span>
                    {!passwordMeetsPolicy && failedRules.length > 0 && (
                      <span style={{ color: C.muted }}>
                        Needs: {failedRules[0].label.toLowerCase()}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                marginBottom: '22px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                style={{
                  accentColor: C.accent,
                  width: '18px',
                  height: '18px',
                  marginTop: '1px',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: '13px', color: C.dim, lineHeight: '1.55' }}>
                I&rsquo;m 13 or older and agree to the{' '}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: C.accent, fontWeight: 600, textDecoration: 'underline' }}
                >
                  Terms
                </a>{' '}
                and{' '}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: C.accent, fontWeight: 600, textDecoration: 'underline' }}
                >
                  Privacy Policy
                </a>
                .
              </span>
            </label>

            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                width: '100%',
                padding: '14px',
                fontSize: '15px',
                fontWeight: 600,
                color: '#ffffff',
                backgroundColor: canSubmit ? C.accent : '#cccccc',
                border: 'none',
                borderRadius: '10px',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                minHeight: '48px',
              }}
            >
              {loading ? <Spinner color="#ffffff" /> : 'Create account'}
            </button>
          </form>
        )}

        <p
          style={{
            textAlign: 'center',
            fontSize: '13px',
            color: C.dim,
            margin: 0,
          }}
        >
          Already have an account?{' '}
          <a
            href="/login"
            style={{ color: C.accent, fontWeight: 600, fontSize: '13px', textDecoration: 'none' }}
          >
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}

function Spinner({ color }: { color: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      style={{
        display: 'inline-block',
        width: '18px',
        height: '18px',
        border: `2px solid ${color}`,
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'vp-spin 0.7s linear infinite',
      }}
    >
      <style>{`@keyframes vp-spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}
