// /kids-app — marketing landing for anon traffic redirected from /kids/*.
// Inline email capture for the Verity Post Kids iOS notification list.
// No modal; the form sits in the page flow. Parent-directed copy (COPPA-safe).
// POSTs to /api/kids-waitlist with honeypot + min-time anti-bot guards.
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

type Status = 'idle' | 'submitting' | 'success' | 'error';

export default function KidsAppLanding() {
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState(''); // honeypot — hidden; real users leave empty
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const openedAtRef = useRef<number>(0);
  const sourceRef = useRef<string>('kids-app-landing');

  useEffect(() => {
    openedAtRef.current = Date.now();
    // Capture utm_source / ?src= for attribution. Sanitized server-side.
    try {
      const sp = new URLSearchParams(window.location.search);
      const raw = sp.get('utm_source') || sp.get('src') || '';
      if (raw && /^[a-zA-Z0-9_\-:.]{1,80}$/.test(raw)) {
        sourceRef.current = raw;
      }
    } catch {
      // window unavailable in SSR — default stays
    }
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'submitting') return;
    setStatus('submitting');
    setErrorMsg('');

    try {
      const elapsed_ms = openedAtRef.current ? Date.now() - openedAtRef.current : 0;
      const res = await fetch('/api/kids-waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          source: sourceRef.current,
          website, // honeypot — should always be ''
          elapsed_ms,
        }),
      });

      if (res.ok) {
        setStatus('success');
        setEmail('');
        return;
      }

      // Generic message only — internal API error strings stay server-side.
      setErrorMsg("Couldn't save. Try again in a moment.");
      setStatus('error');
    } catch {
      setErrorMsg('Network issue. Try again.');
      setStatus('error');
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: '560px', width: '100%' }}>
        <h1 style={{ fontSize: '40px', fontWeight: 700, color: '#111111', margin: '0 0 12px' }}>
          Verity Post Kids
        </h1>
        <p style={{ fontSize: '16px', color: '#666666', lineHeight: 1.6, margin: '0 0 32px' }}>
          A separate iOS app for kid readers. Parents create profiles from their Verity Post
          account; kids read, quiz, and earn streaks on their own device.
        </p>

        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: '0 0 32px',
            textAlign: 'left',
            display: 'inline-block',
          }}
        >
          <li style={{ fontSize: '15px', color: '#111111', lineHeight: 1.8, padding: '4px 0' }}>
            &middot; Safe kid-only content
          </li>
          <li style={{ fontSize: '15px', color: '#111111', lineHeight: 1.8, padding: '4px 0' }}>
            &middot; Per-kid category permissions + reading time limits
          </li>
          <li style={{ fontSize: '15px', color: '#111111', lineHeight: 1.8, padding: '4px 0' }}>
            &middot; Verified experts answer kid questions
          </li>
        </ul>

        {/* Inline email capture — no modal. Per rule 3.1 (no
            user-facing timeline copy), the previous "Coming to the
            App Store soon" line was stripped. The waitlist itself is
            the present-state surface; we email when the app is live. */}
        {status === 'success' ? (
          <div
            role="status"
            aria-live="polite"
            style={{
              margin: '0 0 28px',
              padding: '14px 18px',
              background: '#f5f5f5',
              border: '1px solid #e5e5e5',
              borderRadius: '8px',
              fontSize: '15px',
              color: '#111111',
              fontWeight: 500,
            }}
          >
            Thanks. We&apos;ll email you when Verity Post Kids is live in the App Store.
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            noValidate
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: '8px',
              margin: '0 0 28px',
              maxWidth: '420px',
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            <label
              htmlFor="kids-waitlist-email"
              style={{
                fontSize: '14px',
                color: '#111111',
                fontWeight: 500,
                textAlign: 'left',
              }}
            >
              Email me when Verity Post Kids is in the App Store.
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                id="kids-waitlist-email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === 'submitting'}
                aria-invalid={status === 'error'}
                aria-describedby="kids-waitlist-status"
                style={{
                  flex: '1 1 220px',
                  padding: '10px 12px',
                  minHeight: '44px',
                  border: '1px solid #d4d4d4',
                  borderRadius: '8px',
                  fontSize: '15px',
                  background: '#ffffff',
                  color: '#111111',
                }}
              />
              <button
                type="submit"
                disabled={status === 'submitting' || email.length < 5}
                style={{
                  padding: '10px 18px',
                  minHeight: '44px',
                  background: '#111111',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: status === 'submitting' ? 'default' : 'pointer',
                  opacity: status === 'submitting' || email.length < 5 ? 0.6 : 1,
                }}
              >
                {status === 'submitting' ? 'Sending…' : 'Notify me'}
              </button>
            </div>
            {/* Honeypot — hidden from real users, bots fill it */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: '-9999px',
                width: '1px',
                height: '1px',
                opacity: 0,
              }}
            />
            <div
              id="kids-waitlist-status"
              role="status"
              aria-live="polite"
              style={{
                fontSize: '13px',
                color: status === 'error' ? '#b91c1c' : '#666666',
                textAlign: 'left',
                minHeight: '18px',
              }}
            >
              {status === 'error' ? errorMsg : 'You can unsubscribe anytime.'}
            </div>
          </form>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/"
            style={{
              padding: '12px 24px',
              background: '#111111',
              color: '#ffffff',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Back to home
          </Link>
          <Link
            href="/login"
            style={{
              padding: '12px 24px',
              background: '#ffffff',
              color: '#111111',
              border: '1px solid #111111',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Parent account sign-in
          </Link>
        </div>
      </div>
    </div>
  );
}
