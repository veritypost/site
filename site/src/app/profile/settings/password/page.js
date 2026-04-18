'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/client';
import { PASSWORD_REQS } from '../../../../lib/password';

const C = {
  bg: '#ffffff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111111',
  dim: '#666666',
  accent: '#111111',
  success: '#22c55e',
};

const NAV = [
  { label: 'Profile', href: '/profile/settings/profile' },
  { label: 'Password', href: '/profile/settings/password' },
  { label: 'Email', href: '/profile/settings/emails' },
  { label: 'Feed Preferences', href: '/profile/settings/feed' },
  { label: 'Login Activity', href: '/profile/settings/login-activity' },
  { label: 'Billing', href: '/profile/settings/billing' },
  { label: 'Data & Privacy', href: '/profile/settings/data' },
];

function SettingsNav({ active }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <a href="/profile/settings" style={{ fontSize: 13, fontWeight: 600, color: '#666666', textDecoration: 'none', display: 'inline-block', marginBottom: 8 }}>← Back to settings</a>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#111111' }}>{active}</h2>
    </div>
  );
}

export default function ChangePassword() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.replace('/login');
        return;
      }
      setLoading(false);
    };
    checkAuth();
  }, [router]);

  const reqs = PASSWORD_REQS.map(r => ({ met: r.test(newPw), label: r.label }));
  const metCount = reqs.filter(r => r.met).length;
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][Math.min(metCount, 4)];
  const strengthColor = ['#e5e5e5', '#ef4444', '#f59e0b', '#111111', C.success][Math.min(metCount, 4)];
  const canSubmit = current && reqs.every(r => r.met) && newPw === confirm && !saving;

  const handleSave = async () => {
    if (!canSubmit) return;
    setError('');
    setSaving(true);
    const supabase = createClient();

    // Re-authenticate with current password first
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      router.replace('/login');
      return;
    }

    // Sign in again to verify current password
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: authUser.email,
      password: current,
    });
    if (signInError) {
      setError('Current password is incorrect.');
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPw });
    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    // Pass 17 / UJ-703: sign out every other session so a stolen cookie
    // elsewhere stops working the moment the owner rotates their password.
    // Best-effort — a failure here is not fatal to the password change.
    try { await supabase.auth.signOut({ scope: 'others' }); } catch {}

    setSaving(false);
    setSaved(true);
    setCurrent('');
    setNewPw('');
    setConfirm('');
    setTimeout(() => setSaved(false), 2500);
  };

  const inputBase = {
    flex: 1, padding: '11px 14px', borderRadius: 8,
    border: `1px solid ${C.border}`, background: C.bg,
    fontSize: 15, color: C.text, boxSizing: 'border-box',
    fontFamily: 'inherit', outline: 'none',
  };
  const lbl = { display: 'block', fontSize: 13, fontWeight: 600, color: C.dim, marginBottom: 6 };

  const PasswordField = ({ label: lbTxt, value, onChange, show, onToggle, placeholder }) => (
    <div style={{ marginBottom: 16 }}>
      <label style={lbl}>{lbTxt}</label>
      <div style={{ display: 'flex', gap: 0, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', background: C.bg }}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...inputBase, border: 'none', flex: 1 }}
        />
        <button
          onClick={onToggle}
          style={{
            padding: '0 14px', background: 'transparent', border: 'none',
            cursor: 'pointer', color: C.dim, fontSize: 13, fontWeight: 500,
            borderLeft: `1px solid ${C.border}`,
          }}
        >{show ? 'Hide' : 'Show'}</button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, -apple-system, sans-serif', color: C.dim }}>
        Loading...
      </div>
    );
  }

  return (
    <div className="vp-dark">
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 80px' }}>
        <SettingsNav active="Password" />

        <main style={{  }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginTop: 0, marginBottom: 4 }}>Change Password</h2>
            <p style={{ color: C.dim, fontSize: 14, marginBottom: 8, marginTop: 0 }}>
              Choose a strong password to keep your account secure.
            </p>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 22px', marginBottom: 24 }}>
              <div style={{ fontSize: 13, color: C.dim, marginBottom: 2 }}>Password strength</div>
              <div style={{ display: 'flex', gap: 5, marginTop: 8, marginBottom: 6 }}>
                {[1, 2, 3, 4].map(lvl => (
                  <div key={lvl} style={{
                    flex: 1, height: 5, borderRadius: 3,
                    background: metCount >= lvl ? strengthColor : C.border,
                    transition: 'background 0.2s',
                  }} />
                ))}
              </div>
              {strengthLabel && <span style={{ fontSize: 12, fontWeight: 600, color: strengthColor }}>{strengthLabel}</span>}
            </div>

            <PasswordField label="Current Password" value={current} onChange={setCurrent} show={showCurrent} onToggle={() => setShowCurrent(s => !s)} placeholder="Enter your current password" />
            <PasswordField label="New Password" value={newPw} onChange={setNewPw} show={showNew} onToggle={() => setShowNew(s => !s)} placeholder="Enter new password" />
            <PasswordField label="Confirm New Password" value={confirm} onChange={setConfirm} show={showConfirm} onToggle={() => setShowConfirm(s => !s)} placeholder="Re-enter new password" />

            {confirm.length > 0 && confirm !== newPw && (
              <div style={{ color: '#ef4444', fontSize: 13, marginTop: -8, marginBottom: 12 }}>Passwords do not match.</div>
            )}

            {error && (
              <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</div>
            )}

            {/* Requirements */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 28, marginTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Password requirements</div>
              {reqs.map(r => (
                <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: r.met ? C.success : C.border,
                    flexShrink: 0, transition: 'background 0.2s',
                  }} />

                  <span style={{ fontSize: 13, color: r.met ? C.text : C.dim }}>{r.label}</span>
                </div>
              ))}
            </div>

            <button
              onClick={handleSave}
              disabled={!canSubmit}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 9, border: 'none',
                background: saved ? C.success : canSubmit ? C.accent : C.border,
                color: canSubmit || saved ? '#fff' : C.dim,
                fontSize: 15, fontWeight: 600, cursor: canSubmit ? 'pointer' : 'default',
                transition: 'background 0.2s',
              }}
            >
              {saved ? 'Password updated. Other sessions have been signed out.' : saving ? 'Updating...' : 'Update Password'}
            </button>
          </main>
      </div>
    </div>
  );
}
