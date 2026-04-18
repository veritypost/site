'use client';

import { useState, useEffect } from 'react';
import { createClient } from '../../lib/supabase/client';
import { PASSWORD_REQS as REQS } from '../../lib/password';

const C = {
  bg: '#ffffff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111111',
  dim: '#666666',
  accent: '#111111',
  success: '#22c55e',
};

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [tokenReady, setTokenReady] = useState(null);

  const allMet = REQS.every((r) => r.test(password));
  const match = password && confirmPassword && password === confirmPassword;
  const mismatch = password && confirmPassword && password !== confirmPassword;

  // After password is updated successfully, redirect to login
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        window.location.href = '/login';
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Pass 17 / UJ-514 (bundled into Task 142): the page must only render
  // when Supabase has handed us a recovery token. If the hash is missing
  // (user navigated here directly or the link expired) bounce to /login
  // with a toast-style query param for the login page to surface. The
  // Supabase JS client populates auth.getSession() after parsing the URL
  // hash, so we also accept a live session as evidence that the token
  // round-tripped successfully.
  useEffect(() => {
    let cancelled = false;
    async function verify() {
      try {
        const supabase = createClient();
        const hash = typeof window !== 'undefined' ? window.location.hash : '';
        const hasRecoveryHash = hash.includes('type=recovery') || hash.includes('access_token=');
        const { data: { session } } = await supabase.auth.getSession();
        if (!cancelled) {
          if (hasRecoveryHash || session) setTokenReady(true);
          else {
            setTokenReady(false);
            window.location.href = '/login?toast=reset_invalid';
          }
        }
      } catch {
        if (!cancelled) {
          setTokenReady(false);
          window.location.href = '/login?toast=reset_invalid';
        }
      }
    }
    verify();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!allMet || !match) return;
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      // Pass 17 / UJ-704: after the password is changed via recovery
      // token, invalidate every other active session for the same user.
      try { await supabase.auth.signOut({ scope: 'others' }); } catch {}
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (tokenReady === null) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
        <div style={{ color: C.dim, fontSize: 14 }}>Verifying reset link…</div>
      </div>
    );
  }
  if (tokenReady === false) return null;

  if (success) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <style>{`@keyframes vpPulse{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1)}}`}</style>
        <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '18px', padding: '48px 36px', width: '100%', maxWidth: '420px', boxSizing: 'border-box', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#f0fdf4', border: `2px solid ${C.success}`, margin: '0 auto 20px auto' }} />
          <h2 style={{ fontSize: '22px', fontWeight: '700', color: C.text, margin: '0 0 10px 0' }}>Password updated!</h2>
          <p style={{ fontSize: '14px', color: C.dim, margin: '0 0 28px 0', lineHeight: '1.6' }}>Your password has been changed. Redirecting you to login...</p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: C.accent, animation: `vpPulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', boxSizing: 'border-box',
    }}>
      <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '18px', padding: '40px 36px', width: '100%', maxWidth: '420px', boxSizing: 'border-box' }}>
        <div style={{ fontSize: '20px', fontWeight: '800', color: C.accent, letterSpacing: '-0.5px', marginBottom: '28px' }}>Verity Post</div>

        <h1 style={{ fontSize: '26px', fontWeight: '700', color: C.text, margin: '0 0 8px 0' }}>Create new password</h1>
        <p style={{ fontSize: '14px', color: C.dim, margin: '0 0 28px 0' }}>Make it strong — you won&apos;t need the old one anymore.</p>

        {error && (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px' }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#dc2626' }}>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: C.text, marginBottom: '7px' }}>New password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Create a strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocused('pw')}
                onBlur={() => setFocused(null)}
                autoComplete="new-password"
                style={{ width: '100%', padding: '11px 56px 11px 14px', fontSize: '15px', color: C.text, backgroundColor: C.bg, border: `1.5px solid ${focused === 'pw' ? C.accent : C.border}`, borderRadius: '10px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color 0.15s' }}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: C.dim, fontFamily: 'inherit' }}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* Requirements checklist */}
          <div style={{ backgroundColor: C.bg, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '12px 14px', marginBottom: '14px' }}>
            <p style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: '600', color: C.dim }}>Password requirements</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {REQS.map((r) => {
                const met = r.test(password);
                return (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', color: met ? C.text : C.dim, fontWeight: met ? 600 : 400, transition: 'color 0.15s' }}>{r.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: C.text, marginBottom: '7px' }}>Confirm new password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Repeat your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onFocus={() => setFocused('cpw')}
              onBlur={() => setFocused(null)}
              autoComplete="new-password"
              style={{ width: '100%', padding: '11px 14px', fontSize: '15px', color: C.text, backgroundColor: C.bg, border: `1.5px solid ${mismatch ? '#ef4444' : match ? C.success : focused === 'cpw' ? C.accent : C.border}`, borderRadius: '10px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color 0.15s' }}
            />
            {mismatch && <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#ef4444' }}>Passwords don&apos;t match</p>}
            {match && <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: C.success }}>Passwords match</p>}
          </div>

          <button type="submit" disabled={loading || !allMet || !match}
            style={{ width: '100%', padding: '13px', fontSize: '15px', fontWeight: '600', color: '#fff', backgroundColor: loading || !allMet || !match ? '#cccccc' : C.accent, border: 'none', borderRadius: '10px', cursor: loading || !allMet || !match ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {loading ? 'Updating...' : 'Reset Password'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '18px' }}>
          {/* Pass 17 / UJ-711: button-like affordance with proper contrast. */}
          <a href="/login" style={{
            display: 'inline-block', padding: '10px 20px', borderRadius: 10,
            border: `1px solid ${C.border}`, background: C.bg,
            fontSize: 13, fontWeight: 600, color: C.text,
            fontFamily: 'inherit', textDecoration: 'none',
          }}>
            Back to login
          </a>
        </div>
      </div>
    </div>
  );
}
