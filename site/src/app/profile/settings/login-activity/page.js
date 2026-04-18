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

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 2) return 'Now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function LoginActivity() {
  const router = useRouter();
  const supabase = createClient();

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loggedOut, setLoggedOut] = useState(false);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .eq('actor_id', user.id)
        .eq('action', 'login')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        setSessions(data);
      }
      setLoading(false);
    }
    load();
  }, []);

  const handleLogoutAll = async () => {
    await supabase.auth.signOut({ scope: 'others' });
    setLoggedOut(true);
    setTimeout(() => setLoggedOut(false), 3000);
  };

  const statusBadge = (status) => {
    const styles = {
      current: { bg: '#dcfce7', color: C.success, label: 'Current Session' },
      active: { bg: '#ede9fe', color: C.accent, label: 'Active' },
      expired: { bg: C.card, color: C.dim, label: 'Expired' },
    };
    const s = styles[status] || styles.expired;
    return (
      <span style={{ padding: '3px 10px', background: s.bg, color: s.color, borderRadius: 20, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
        {s.label}
      </span>
    );
  };

  return (
    <div className="vp-dark">
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 80px' }}>
        <SettingsNav active="Login Activity" />

        <main style={{  }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, marginTop: 0, marginBottom: 4 }}>Login Activity</h2>
                <p style={{ color: C.dim, fontSize: 14, margin: 0 }}>Devices and sessions currently signed into your account.</p>
              </div>
              <button
                onClick={handleLogoutAll}
                style={{
                  padding: '10px 20px', borderRadius: 9, border: `1px solid ${C.border}`,
                  background: loggedOut ? C.success : C.bg,
                  color: loggedOut ? '#fff' : C.text,
                  fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                }}
              >
                {loggedOut ? 'Done — all others signed out' : 'Log Out All Other Sessions'}
              </button>
            </div>

            {loading ? (
              <div style={{ color: C.dim, fontSize: 14, padding: '40px 0', textAlign: 'center' }}>Loading login activity...</div>
            ) : sessions.length === 0 ? (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '40px 20px', textAlign: 'center', color: C.dim, fontSize: 14 }}>
                No login activity found.
              </div>
            ) : (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'auto' }}>
                {/* Header */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.2fr 1fr 1.2fr',
                  padding: '10px 20px', borderBottom: `1px solid ${C.border}`,
                  fontSize: 12, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em',
                  minWidth: 680,
                }}>
                  <span>Device</span>
                  <span>Location</span>
                  <span>IP Address</span>
                  <span>Date</span>
                  <span>Status</span>
                </div>

                {sessions.map((s, i) => {
                  const meta = s.metadata || {};
                  const status = s.status || 'expired';
                  return (
                    <div
                      key={s.id || i}
                      onMouseEnter={() => setHovered(i)}
                      onMouseLeave={() => setHovered(null)}
                      style={{
                        display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.2fr 1fr 1.2fr',
                        padding: '16px 20px',
                        borderBottom: i < sessions.length - 1 ? `1px solid ${C.border}` : 'none',
                        background: hovered === i ? '#f0f0f8' : 'transparent',
                        transition: 'background 0.15s', alignItems: 'center',
                        minWidth: 680,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{meta.device || s.user_agent || 'Unknown device'}</div>
                          <div style={{ fontSize: 12, color: C.dim, marginTop: 1 }}>{meta.browser || '—'}</div>
                        </div>
                      </div>
                      <span style={{ fontSize: 13, color: C.text }}>{meta.location || s.location || '—'}</span>
                      <span style={{ fontSize: 13, color: C.dim, fontFamily: 'monospace' }}>{s.ip_address || meta.ip || '—'}</span>
                      <span style={{ fontSize: 13, color: C.dim }}>{formatDate(s.created_at)}</span>
                      <span>{statusBadge(status)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <p style={{ fontSize: 13, color: C.dim, marginTop: 16 }}>
              If you see a session you don't recognise, log out of all other sessions and change your password immediately.
            </p>
          </main>
      </div>
    </div>
  );
}
