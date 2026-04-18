'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

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

const SECTIONS = [
  { icon: '', label: 'Profile', href: '/profile/settings/profile', desc: 'Update your display name, username, bio, location, website, and avatar.' },
  { icon: '', label: 'Password', href: '/profile/settings/password', desc: 'Change your password and review password security requirements.' },
  { icon: '', label: 'Email', href: '/profile/settings/emails', desc: 'Manage email addresses and notification preferences.' },
  { icon: '', label: 'Feed Preferences', href: '/profile/settings/feed', desc: 'Customise categories, content filters, and reading display.' },
  { icon: '', label: 'Login Activity', href: '/profile/settings/login-activity', desc: 'Review recent logins and manage active sessions.' },
  { icon: '', label: 'Billing', href: '/profile/settings/billing', desc: 'Plan, payment method, and invoice history.' },
  { icon: '', label: 'Data & Privacy', href: '/profile/settings/data', desc: 'Download data, delete account, and privacy controls.' },
  { icon: '', label: 'Blocked users', href: '/profile/settings/blocked', desc: 'Review and unblock anyone you have blocked.' },
  { icon: '', label: 'Appeals', href: '/appeal', desc: 'Review warnings or appeal a moderation action on your account.' },
];

function SettingsNav({ active }) {
  return (
    <>
      {/* Mobile: horizontal scroll tabs */}
      <div className="settings-nav-mobile" style={{
        display: 'none', overflowX: 'auto', scrollbarWidth: 'none',
        gap: 6, padding: '0 16px 12px', borderBottom: `1px solid ${C.border}`,
      }}>
        {NAV.map(link => (
          <a key={link.label} href={link.href} style={{
            whiteSpace: 'nowrap', padding: '7px 14px', borderRadius: 99,
            textDecoration: 'none', fontSize: 13, fontWeight: link.label === active ? 600 : 400,
            color: link.label === active ? '#fff' : C.dim,
            background: link.label === active ? C.accent : C.card,
            border: `1px solid ${link.label === active ? C.accent : C.border}`,
          }}>{link.label}</a>
        ))}
      </div>
      {/* Desktop: vertical sidebar */}
      <nav className="settings-nav-desktop" style={{ width: 200, flexShrink: 0 }}>
        {NAV.map(link => (
          <a key={link.label} href={link.href} style={{
            display: 'block', padding: '9px 14px', borderRadius: 8, marginBottom: 2,
            textDecoration: 'none', fontSize: 14,
            fontWeight: link.label === active ? 600 : 400,
            color: link.label === active ? C.accent : C.text,
            background: link.label === active ? '#ede9fe' : 'transparent',
          }}>{link.label}</a>
        ))}
      </nav>
      <style>{`
        @media (max-width: 768px) {
          .settings-nav-mobile { display: flex !important; }
          .settings-nav-desktop { display: none !important; }
        }
      `}</style>
    </>
  );
}

export default function SettingsHub() {
  const router = useRouter();
  const [hovered, setHovered] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.replace('/login');
        return;
      }
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();
      setUser({ ...userData, email: authUser.email });
      setLoading(false);
    };
    load();
  }, [router]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, -apple-system, sans-serif', color: C.dim }}>
        Loading...
      </div>
    );
  }

  const displayName = user?.display_name || user?.username || user?.email || '';
  const avatarLetter = displayName.charAt(0).toUpperCase() || '?';
  const avatarBg = user?.avatar_color
    ? user.avatar_color
    : 'linear-gradient(135deg, #111111 0%, #333333 100%)';

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, -apple-system, sans-serif', color: C.text }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 80px' }}>

        <a href="/profile" style={{ fontSize: 13, fontWeight: 600, color: C.dim, textDecoration: 'none', display: 'inline-block', marginTop: 20, marginBottom: 16 }}>← Back to profile</a>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 20px', letterSpacing: '-0.02em' }}>Settings</h1>

        {SECTIONS.map(s => (
          <a
            key={s.label}
            href={s.href}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', borderRadius: 10, marginBottom: 6,
              border: `1px solid ${C.border}`, background: C.card,
              textDecoration: 'none', color: C.text,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{s.desc}</div>
            </div>
            <span style={{ color: C.dim, fontSize: 16 }}>›</span>
          </a>
        ))}
      </div>
    </div>
  );
}
