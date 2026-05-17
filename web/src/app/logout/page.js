// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { COPY } from '@/lib/copy';

// T82 — values point at globals.css CSS vars so brand-color edits cascade.
const C = {
  bg: 'var(--vp-bg)',
  card: 'var(--vp-surface)',
  border: 'var(--vp-border)',
  text: 'var(--vp-ink)',
  dim: 'var(--vp-text-muted)',
  accent: 'var(--vp-accent)',
  success: 'var(--success)',
};

export default function LogoutPage() {
  const router = useRouter();
  const [hovered, setHovered] = useState(null);
  const [status, setStatus] = useState('signing_out'); // signing_out | done | error
  const [recentReads, setRecentReads] = useState([]);
  const [retrying, setRetrying] = useState(false);
  const [errorCountdown, setErrorCountdown] = useState(null); // null when inactive
  const hasLoggedOut = useRef(false);
  const redirectTimerRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  // Centralized timer cleanup — used by StrictMode cleanup, retry, and
  // manual link clicks. Always safe to call; clears whichever ref is set.
  const cancelAutoRedirect = () => {
    if (redirectTimerRef.current) {
      clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setErrorCountdown(null);
  };

  // T101 — once the signout succeeds, fire a delayed redirect to home
  // so the user doesn't end up sitting on a dead-end page. The manual
  // "Sign back in" / "Go to homepage" links remain — clicking either
  // before the timer fires opts out of the auto-redirect.
  useEffect(() => {
    if (status !== 'done') return;
    const t = setTimeout(() => {
      router.push('/');
    }, 1500);
    redirectTimerRef.current = t;
    return () => {
      clearTimeout(t);
      if (redirectTimerRef.current === t) redirectTimerRef.current = null;
    };
  }, [status, router]);

  // On `error`, also auto-redirect (4s) so the user isn't stranded if
  // the signout endpoint is unreachable. StrictMode-safe: refs track
  // both the timeout and the per-second countdown interval; cleanup
  // clears both. Manual buttons/links call cancelAutoRedirect().
  useEffect(() => {
    if (status !== 'error') return;
    setErrorCountdown(4);
    const interval = setInterval(() => {
      setErrorCountdown((n) => (typeof n === 'number' && n > 1 ? n - 1 : n));
    }, 1000);
    const timeout = setTimeout(() => {
      router.push('/');
    }, 4000);
    countdownIntervalRef.current = interval;
    redirectTimerRef.current = timeout;
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
      if (redirectTimerRef.current === timeout) redirectTimerRef.current = null;
      if (countdownIntervalRef.current === interval) countdownIntervalRef.current = null;
    };
  }, [status, router]);

  const doLogout = async () => {
    setStatus('signing_out');
    let serverOk = false;
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      serverOk = res.ok;
    } catch {
      serverOk = false;
    }
    // Belt-and-suspenders: clear the client session too so the user is
    // functionally logged out even if the server call failed.
    try {
      const supabase = createClient();
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // ignore — the server call is the source of truth
    }
    setStatus(serverOk ? 'done' : 'error');
  };

  useEffect(() => {
    if (hasLoggedOut.current) return;
    hasLoggedOut.current = true;
    doLogout();
  }, []);

  // Best-effort: pull the user's last-read stories from localStorage so the
  // logout page doesn't show fake hardcoded "recent reads". If nothing is
  // cached, the section hides itself entirely.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('vp_recent_reads');
      if (!raw) return;
      const list = JSON.parse(raw);
      if (Array.isArray(list)) setRecentReads(list.slice(0, 3));
    } catch {
      // ignore
    }
  }, []);

  // If the user backgrounds the tab while the error countdown is running,
  // Chromium throttles `setInterval` so the visible "Redirecting in Ns…"
  // counter freezes — but `setTimeout(redirect, 4000)` still fires when its
  // wall-clock budget elapses. Returning to a frozen page that then suddenly
  // navigates is disorienting. On hide, cancel both timers and leave the
  // static error state in place; the user comes back to "what's the state?"
  // and chooses Retry / a manual link rather than getting auto-bounced.
  // Lifecycle is intentionally independent of the countdown effect so the
  // listener stays attached across status transitions.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        cancelAutoRedirect();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const handleRetry = async () => {
    if (retrying) return;
    // Cancel both the redirect timeout and countdown interval before
    // attempting another signout — otherwise the page can navigate away
    // mid-retry.
    cancelAutoRedirect();
    setRetrying(true);
    await doLogout();
    setRetrying(false);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: C.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          backgroundColor: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: '18px',
          padding: '48px 36px',
          width: '100%',
          maxWidth: '400px',
          boxSizing: 'border-box',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: '20px',
            fontWeight: '800',
            color: C.accent,
            letterSpacing: '-0.5px',
            marginBottom: '28px',
          }}
        >
          Verity Post
        </div>

        <h1 style={{ fontSize: '24px', fontWeight: '700', color: C.text, margin: '0 0 8px 0' }}>
          {status === 'signing_out'
            ? COPY.auth.signingOut
            : status === 'error'
              ? COPY.auth.signedOutLocal
              : COPY.auth.signedOut}
        </h1>
        <p style={{ fontSize: '14px', color: C.dim, margin: '0 0 28px 0', lineHeight: '1.6' }}>
          {status === 'signing_out' && 'One moment while we end your session.'}
          {status === 'done' &&
            'Thanks for using Verity Post. Your session has been securely ended.'}
          {status === 'error' &&
            "We couldn't reach our server, but this device has been signed out. Try again if you want to make sure everywhere else is signed out too."}
        </p>

        {status === 'error' && errorCountdown !== null && (
          <div
            role="status"
            aria-live="polite"
            style={{
              backgroundColor: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: '10px 12px',
              marginBottom: 12,
              fontSize: 13,
              color: C.dim,
              textAlign: 'center',
            }}
          >
            Redirecting to home in {errorCountdown}s&hellip;
          </div>
        )}

        {status === 'error' && (
          <button
            onClick={handleRetry}
            disabled={retrying}
            style={{
              display: 'block',
              width: '100%',
              padding: '12px',
              fontSize: '14px',
              fontWeight: '600',
              color: C.accent,
              background: '#f7f7f7',
              border: `1px solid ${C.accent}40`,
              borderRadius: 10,
              cursor: retrying ? 'default' : 'pointer',
              marginBottom: 16,
              fontFamily: 'inherit',
            }}
          >
            {retrying ? 'Retrying\u2026' : 'Try again'}
          </button>
        )}

        {recentReads.length > 0 && (
          <div
            style={{
              backgroundColor: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '24px',
              textAlign: 'left',
            }}
          >
            <p
              style={{
                margin: '0 0 10px 0',
                fontSize: '11px',
                fontWeight: '700',
                color: C.dim,
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
              }}
            >
              Your recent reads
            </p>
            {recentReads.map((title, i) => (
              <div
                key={i}
                style={{
                  padding: '8px 0',
                  borderBottom: i < recentReads.length - 1 ? `1px solid ${C.border}` : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: C.accent,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: '13px', color: C.text, lineHeight: '1.4' }}>{title}</span>
              </div>
            ))}
          </div>
        )}

        <a
          href="/login"
          onClick={cancelAutoRedirect}
          onMouseEnter={() => setHovered('signin')}
          onMouseLeave={() => setHovered(null)}
          style={{
            display: 'block',
            width: '100%',
            padding: '13px',
            fontSize: '15px',
            fontWeight: '600',
            color: '#fff',
            backgroundColor: hovered === 'signin' ? '#333333' : C.accent,
            border: 'none',
            borderRadius: '10px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            marginBottom: '10px',
            transition: 'background-color 0.15s',
            textDecoration: 'none',
            textAlign: 'center',
            boxSizing: 'border-box',
          }}
        >
          Sign back in
        </a>

        <a
          href="/"
          onClick={cancelAutoRedirect}
          onMouseEnter={() => setHovered('home')}
          onMouseLeave={() => setHovered(null)}
          style={{
            display: 'block',
            width: '100%',
            padding: '13px',
            fontSize: '15px',
            fontWeight: '500',
            color: hovered === 'home' ? C.text : C.dim,
            backgroundColor: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: '10px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'color 0.15s',
            textDecoration: 'none',
            textAlign: 'center',
            boxSizing: 'border-box',
          }}
        >
          Go to homepage
        </a>
      </div>
    </div>
  );
}
