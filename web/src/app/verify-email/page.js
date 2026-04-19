// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '../../lib/supabase/client';

const C = {
  bg: '#ffffff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111111',
  dim: '#666666',
  accent: '#111111',
  success: '#22c55e',
};

function maskEmail(e) {
  const [local, domain] = e.split('@');
  if (!domain) return e;
  return local.slice(0, 2) + '***@' + domain;
}

export default function VerifyEmailPage() {
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [changeEmail, setChangeEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [focused, setFocused] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [error, setError] = useState('');
  const [updateLoading, setUpdateLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    // Verification is tracked on public.users.email_verified — not on
    // auth.users.email_confirmed_at (which Supabase may auto-set at signup
    // when "Confirm email" is OFF). Ask the app layer instead.
    const checkVerified = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (!cancelled && user.email) setUserEmail(user.email);

      const { data: profile } = await supabase
        .from('users')
        .select('email_verified')
        .eq('id', user.id)
        .maybeSingle();

      if (!cancelled && profile?.email_verified) setVerified(true);
    };

    checkVerified();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'USER_UPDATED' || event === 'SIGNED_IN') checkVerified();
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
      // Pass 17 / UJ-719: server-side rate-limit enforcement (max 3/hour
      // per user). The client-side cooldown stays for UX polish but the
      // server is now authoritative.
      const res = await fetch('/api/auth/resend-verification', { method: 'POST' });
      if (res.status === 429) {
        setError('Too many verification resends. Try again in an hour.');
        setResending(false);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to resend email. Please try again.');
      }

      setCooldown(60);
      const interval = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) { clearInterval(interval); setResending(false); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err.message || 'Failed to resend email. Please try again.');
      setResending(false);
    }
  };

  const handleUpdateEmail = async () => {
    if (!newEmail) return;
    setUpdateLoading(true);
    setError('');
    try {
      const supabase = createClient();
      // Pass 17 / UJ-702 + UJ-722: flip the public.users.email_verified
      // flag back to false server-side and trigger the Supabase email-
      // change confirmation to the new address. The auth.updateUser call
      // below reissues the confirmation token through Supabase's own flow
      // for consistency.
      const preRes = await fetch('/api/auth/email-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail }),
      });
      if (preRes.status === 429) {
        setError('Too many email-change attempts. Try again later.');
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ email: newEmail });
      if (updateError) throw updateError;
      setUserEmail(newEmail);
      setChangeEmail(false);
      setNewEmail('');
    } catch (err) {
      setError(err.message || 'Failed to update email. Please try again.');
    } finally {
      setUpdateLoading(false);
    }
  };

  if (verified) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '18px', padding: '48px 36px', width: '100%', maxWidth: '420px', boxSizing: 'border-box', textAlign: 'center' }}>
          <h2 style={{ fontSize: '24px', fontWeight: '700', color: C.text, margin: '0 0 10px 0' }}>Email verified!</h2>
          <p style={{ fontSize: '14px', color: C.dim, margin: '0 0 28px 0', lineHeight: '1.6' }}>Welcome to Verity Post. Your account is ready.</p>
          <button type="button" onClick={() => window.location.href = '/welcome'}
            style={{ width: '100%', padding: '13px', fontSize: '15px', fontWeight: '600', color: '#fff', backgroundColor: C.success, border: 'none', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit' }}>
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', boxSizing: 'border-box',
    }}>
      <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '18px', padding: '40px 36px', width: '100%', maxWidth: '420px', boxSizing: 'border-box', textAlign: 'center' }}>
        <div style={{ fontSize: '20px', fontWeight: '800', color: C.accent, letterSpacing: '-0.5px', marginBottom: '28px', textAlign: 'left' }}>
          Verity Post
        </div>

        {error && (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px', textAlign: 'left' }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#dc2626' }}>{error}</p>
          </div>
        )}

        <h1 style={{ fontSize: '24px', fontWeight: '700', color: C.text, margin: '0 0 10px 0' }}>Verify your email</h1>
        <p style={{ fontSize: '14px', color: C.dim, margin: '0 0 4px 0', lineHeight: '1.6' }}>We sent a verification link to</p>
        <p style={{ fontSize: '15px', fontWeight: '600', color: C.text, margin: '0 0 24px 0' }}>{userEmail ? maskEmail(userEmail) : '...'}</p>

        <div style={{ backgroundColor: C.bg, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '14px 16px', marginBottom: '22px', textAlign: 'left' }}>
          <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: C.text, fontWeight: '600' }}>Didn&apos;t get it?</p>
          <p style={{ margin: 0, fontSize: '13px', color: C.dim, lineHeight: '1.5' }}>
            Check your spam folder, or wait a minute and try resending. The link expires after 24 hours.
          </p>
        </div>

        <button type="button" onClick={handleResend} disabled={cooldown > 0 || resending}
          style={{
            width: '100%', padding: '13px', fontSize: '15px', fontWeight: '600', fontFamily: 'inherit',
            color: cooldown > 0 ? C.dim : '#fff',
            backgroundColor: cooldown > 0 ? C.bg : C.accent,
            border: cooldown > 0 ? `1px solid ${C.border}` : 'none',
            borderRadius: '10px', cursor: cooldown > 0 ? 'not-allowed' : 'pointer', marginBottom: '14px', transition: 'all 0.15s',
          }}>
          {cooldown > 0 ? `Resend in ${cooldown}s` : resending ? 'Sending...' : 'Resend Email'}
        </button>

        {!changeEmail ? (
          <>
            <button type="button" onClick={() => setChangeEmail(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: C.accent, fontWeight: '500', fontFamily: 'inherit', textDecoration: 'underline' }}>
              Change email address
            </button>
            {/* Escape hatch: signed up with an inaccessible email + both other */}
            {/* actions failing = stuck. /logout handles server-side cleanup. */}
            <div style={{ marginTop: '14px' }}>
              <a href="/logout"
                style={{ fontSize: '12px', color: C.dim, fontFamily: 'inherit', textDecoration: 'underline' }}>
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
              style={{ width: '100%', padding: '11px 14px', fontSize: '14px', color: C.text, backgroundColor: C.bg, border: `1.5px solid ${focused ? C.accent : C.border}`, borderRadius: '10px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: '10px' }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={() => { setChangeEmail(false); setNewEmail(''); }}
                style={{ flex: 1, padding: '10px', fontSize: '13px', fontWeight: '500', color: C.text, backgroundColor: C.bg, border: `1px solid ${C.border}`, borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button type="button" onClick={handleUpdateEmail} disabled={updateLoading || !newEmail}
                style={{ flex: 1, padding: '10px', fontSize: '13px', fontWeight: '600', color: '#fff', backgroundColor: updateLoading || !newEmail ? '#cccccc' : C.accent, border: 'none', borderRadius: '8px', cursor: updateLoading || !newEmail ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {updateLoading ? 'Updating...' : 'Update Email'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
