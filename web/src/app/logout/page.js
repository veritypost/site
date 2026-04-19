// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '../../lib/supabase/client';
import { clearKidMode } from '../../lib/kidMode';

const C = {
  bg: '#ffffff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111111',
  dim: '#666666',
  accent: '#111111',
  success: '#22c55e',
};

export default function LogoutPage() {
  const [hovered, setHovered] = useState(null);
  const [status, setStatus] = useState('signing_out'); // signing_out | done | error
  const [recentReads, setRecentReads] = useState([]);
  const [retrying, setRetrying] = useState(false);

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
    // Pass 17 / UJ-501: active kid-mode must end when the parent logs
    // out — NavWrapper listens for the dispatched event to re-sync.
    clearKidMode();
    setStatus(serverOk ? 'done' : 'error');
  };

  useEffect(() => {
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

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    await doLogout();
    setRetrying(false);
  };

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', boxSizing: 'border-box',
    }}>
      <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '18px', padding: '48px 36px', width: '100%', maxWidth: '400px', boxSizing: 'border-box', textAlign: 'center' }}>
        <div style={{ fontSize: '20px', fontWeight: '800', color: C.accent, letterSpacing: '-0.5px', marginBottom: '28px' }}>Verity Post</div>

        <h1 style={{ fontSize: '24px', fontWeight: '700', color: C.text, margin: '0 0 8px 0' }}>
          {status === 'signing_out' ? 'Signing you out\u2026' : status === 'error' ? 'Signed out locally' : "You've been signed out"}
        </h1>
        <p style={{ fontSize: '14px', color: C.dim, margin: '0 0 28px 0', lineHeight: '1.6' }}>
          {status === 'signing_out' && 'One moment while we end your session.'}
          {status === 'done' && 'Thanks for using Verity Post. Your session has been securely ended.'}
          {status === 'error' && "We couldn't reach our server, but this device has been signed out. Try again if you want to make sure everywhere else is signed out too."}
        </p>

        {status === 'error' && (
          <button onClick={handleRetry} disabled={retrying} style={{
            display: 'block', width: '100%', padding: '12px', fontSize: '14px', fontWeight: '600',
            color: C.accent, background: '#f7f7f7', border: `1px solid ${C.accent}40`, borderRadius: 10,
            cursor: retrying ? 'default' : 'pointer', marginBottom: 16, fontFamily: 'inherit',
          }}>
            {retrying ? 'Retrying\u2026' : 'Try again'}
          </button>
        )}

        {recentReads.length > 0 && (
          <div style={{ backgroundColor: C.bg, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px', marginBottom: '24px', textAlign: 'left' }}>
            <p style={{ margin: '0 0 10px 0', fontSize: '11px', fontWeight: '700', color: C.dim, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Your recent reads
            </p>
            {recentReads.map((title, i) => (
              <div key={i} style={{ padding: '8px 0', borderBottom: i < recentReads.length - 1 ? `1px solid ${C.border}` : 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: C.accent, flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: C.text, lineHeight: '1.4' }}>{title}</span>
              </div>
            ))}
          </div>
        )}

        <a href="/login"
          onMouseEnter={() => setHovered('signin')}
          onMouseLeave={() => setHovered(null)}
          style={{ display: 'block', width: '100%', padding: '13px', fontSize: '15px', fontWeight: '600', color: '#fff', backgroundColor: hovered === 'signin' ? '#333333' : C.accent, border: 'none', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit', marginBottom: '10px', transition: 'background-color 0.15s', textDecoration: 'none', textAlign: 'center', boxSizing: 'border-box' }}>
          Sign back in
        </a>

        <a href="/"
          onMouseEnter={() => setHovered('home')}
          onMouseLeave={() => setHovered(null)}
          style={{ display: 'block', width: '100%', padding: '13px', fontSize: '15px', fontWeight: '500', color: hovered === 'home' ? C.text : C.dim, backgroundColor: C.bg, border: `1px solid ${C.border}`, borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit', transition: 'color 0.15s', textDecoration: 'none', textAlign: 'center', boxSizing: 'border-box' }}>
          Go to homepage
        </a>
      </div>
    </div>
  );
}
