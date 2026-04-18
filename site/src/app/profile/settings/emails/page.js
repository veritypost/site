'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/client';

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

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 48, height: 28, borderRadius: 14, border: 'none',
        background: value ? C.accent : C.border,
        position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: value ? 23 : 3,
        width: 22, height: 22, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
      }} />
    </button>
  );
}

const NOTIF_PREFS = [
  { key: 'newsletter', label: 'Newsletter', desc: 'Monthly product updates and editorial highlights from the Verity Post team.' },
  { key: 'commentReplies', label: 'Comment Replies', desc: 'Notifications when someone replies to your comments.' },
  { key: 'securityAlerts', label: 'Security Alerts', desc: 'Critical alerts about your account security — logins, password changes, 2FA.' },
];

export default function EmailSettings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [primaryEmail, setPrimaryEmail] = useState('');
  const [emailCreatedAt, setEmailCreatedAt] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [prefs, setPrefs] = useState({
    newsletter: true,
    commentReplies: false,
    securityAlerts: true,
  });

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.replace('/login');
        return;
      }
      setPrimaryEmail(authUser.email || '');
      if (authUser.created_at) {
        const d = new Date(authUser.created_at);
        setEmailCreatedAt(d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
      }

      // Optionally load notification prefs from users table if stored there
      const { data: userData } = await supabase
        .from('users')
        .select('notification_prefs')
        .eq('id', authUser.id)
        .single();
      if (userData?.notification_prefs) {
        setPrefs(p => ({ ...p, ...userData.notification_prefs }));
      }

      setLoading(false);
    };
    load();
  }, [router]);

  const togglePref = key => setPrefs(p => ({ ...p, [key]: !p[key] }));

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
        <SettingsNav active="Email" />

        <main style={{  }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginTop: 0, marginBottom: 24 }}>Email Settings</h2>

            {/* Primary email */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 22px', marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Primary Email</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', background: '#ede9fe',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{primaryEmail}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <span style={{ background: '#dcfce7', color: C.success, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>Verified</span>
                    {emailCreatedAt && (
                      <span style={{ fontSize: 12, color: C.dim }}>Added {emailCreatedAt}</span>
                    )}
                  </div>
                </div>
                <button style={{
                  padding: '7px 16px', borderRadius: 8, border: `1px solid ${C.border}`,
                  background: C.bg, color: C.text, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                }}>Change</button>
              </div>
            </div>

            {/* Add secondary email */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 22px', marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: adding ? 14 : 0 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>Add secondary email</div>
                  <div style={{ fontSize: 13, color: C.dim, marginTop: 2 }}>Use as a backup or for specific notifications.</div>
                </div>
                <button
                  onClick={() => setAdding(a => !a)}
                  style={{
                    padding: '7px 16px', borderRadius: 8, border: `1px solid ${C.border}`,
                    background: adding ? C.card : C.accent, color: adding ? C.text : '#fff',
                    fontSize: 13, fontWeight: 500, cursor: 'pointer', flexShrink: 0,
                  }}
                >{adding ? 'Cancel' : '+ Add email'}</button>
              </div>
              {adding && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <input
                    type="email"
                    value={addEmail}
                    onChange={e => setAddEmail(e.target.value)}
                    placeholder="you@example.com"
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: 8,
                      border: `1px solid ${C.border}`, background: C.bg,
                      fontSize: 14, color: C.text, outline: 'none',
                    }}
                  />
                  <button style={{
                    padding: '10px 18px', borderRadius: 8, border: 'none',
                    background: C.accent, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}>Send verification</button>
                </div>
              )}
            </div>

            {/* Notification preferences */}
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, marginTop: 0 }}>Email Notifications</h3>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
              {NOTIF_PREFS.map((pref, i) => (
                <div
                  key={pref.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 16, padding: '18px 22px',
                    borderBottom: i < NOTIF_PREFS.length - 1 ? `1px solid ${C.border}` : 'none',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{pref.label}</div>
                    <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.5 }}>{pref.desc}</div>
                  </div>
                  <Toggle value={prefs[pref.key]} onChange={() => togglePref(pref.key)} />
                </div>
              ))}
            </div>

          </main>
      </div>
    </div>
  );
}
