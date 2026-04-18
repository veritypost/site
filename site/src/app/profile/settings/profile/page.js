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

const inputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: 8,
  border: `1px solid ${C.border}`, background: C.bg,
  fontSize: 15, color: C.text, boxSizing: 'border-box',
  fontFamily: 'inherit', outline: 'none',
};
const label = { display: 'block', fontSize: 13, fontWeight: 600, color: C.dim, marginBottom: 6 };
const checkboxRow = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text, marginBottom: 6, cursor: 'pointer' };

const AVATAR_COLORS = [
  '#111111', '#22c55e', '#ef4444', '#f59e0b', '#3b82f6',
  '#ec4899', '#444444', '#14b8a6', '#f97316', '#222222',
  '#0ea5e9', '#10b981', '#a855f7', '#64748b', '#111111',
];

export default function EditProfile() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [legalName, setLegalName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [website, setWebsite] = useState('');

  // Avatar state (two-tone + 3-char initials)
  const [avatarOuter, setAvatarOuter] = useState('#111111');
  const [avatarInner, setAvatarInner] = useState(null); // null = transparent
  const [avatarInitials, setAvatarInitials] = useState('');
  const [initialsError, setInitialsError] = useState('');

  // D32: paid-only banner + customization, privacy toggles free for all.
  const [bannerUrl, setBannerUrl] = useState('');
  const [profileVisibility, setProfileVisibility] = useState('public');
  const [showActivity, setShowActivity] = useState(true);
  const [showOnLeaderboard, setShowOnLeaderboard] = useState(true);
  const [allowMessages, setAllowMessages] = useState(true);
  const [userTier, setUserTier] = useState('free');

  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.replace('/login'); return; }
      setUserId(authUser.id);
      // Select explicit columns so a missing column or an RLS drift shows
      // up as a query error rather than silently leaving the form blank.
      const { data: userData, error: userErr } = await supabase
        .from('users')
        .select('username, display_name, bio, location, website, avatar, avatar_color, banner_url, profile_visibility, show_activity, show_on_leaderboard, allow_messages, plans(tier)')
        .eq('id', authUser.id)
        .maybeSingle();
      if (userErr) {
        setError(userErr.message || 'Failed to load profile.');
        setLoading(false);
        return;
      }
      if (userData) {
        setLegalName(userData.display_name || '');
        setUsername(userData.username || '');
        setBio(userData.bio || '');
        setLocation(userData.location || '');
        setWebsite(userData.website || '');
        const avatar = userData.avatar || {};
        setAvatarOuter(avatar.outer || userData.avatar_color || '#111111');
        setAvatarInner(avatar.inner || null);
        setAvatarInitials(
          avatar.initials
          || (userData.username ? userData.username.slice(0, 1).toUpperCase() : '')
        );
        setBannerUrl(userData.banner_url || '');
        setProfileVisibility(userData.profile_visibility || 'public');
        setShowActivity(userData.show_activity !== false);
        setShowOnLeaderboard(userData.show_on_leaderboard !== false);
        setAllowMessages(userData.allow_messages !== false);
        setUserTier(userData.plans?.tier || 'free');
      }
      setLoading(false);
    };
    load();
  }, [router]);

  const setInitials = (raw) => {
    const clean = raw.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
    setAvatarInitials(clean);
    if (raw.length > 0 && clean.length === 0) {
      setInitialsError('Only letters and numbers.');
    } else {
      setInitialsError('');
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    const supabase = createClient();
    const avatarPayload = {
      outer: avatarOuter,
      inner: avatarInner,
      initials: avatarInitials,
    };
    // Try full update with avatar jsonb. If the column doesn't exist on this
    // schema yet, fall back to just the legacy avatar_color + profile fields.
    const isPaid = ['verity', 'verity_pro', 'verity_family', 'verity_family_xl'].includes(userTier);
    const baseUpdate = {
      bio, display_name: legalName, location, website,
      avatar_color: avatarOuter,
      profile_visibility: profileVisibility,
      show_activity: showActivity,
      show_on_leaderboard: showOnLeaderboard,
      allow_messages: allowMessages,
      ...(isPaid ? { banner_url: bannerUrl || null } : {}),
    };
    const { error: fullError } = await supabase
      .from('users')
      .update({ ...baseUpdate, avatar: avatarPayload })
      .eq('id', userId);
    if (fullError) {
      const { error: fallbackError } = await supabase
        .from('users')
        .update(baseUpdate)
        .eq('id', userId);
      if (fallbackError) {
        setError(fallbackError.message);
        setSaving(false);
        return;
      }
    }
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleCancel = () => {
    router.back();
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, -apple-system, sans-serif', color: C.dim }}>
        Loading...
      </div>
    );
  }

  const previewInitials = avatarInitials || (username || '?').slice(0, 1).toUpperCase();
  const previewInner = avatarInner || 'transparent';
  const previewTextColor = avatarInner ? '#111111' : avatarOuter;

  return (
    <div className="vp-dark">
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 80px' }}>
        <SettingsNav active="Profile" />

        <main style={{  }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginTop: 0, marginBottom: 6 }}>Edit Profile</h2>
            <p style={{ color: C.dim, fontSize: 14, marginBottom: 28, marginTop: 0 }}>
              Your profile information is visible to other readers on Verity Post.
            </p>

            {/* Avatar editor */}
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.dim, marginBottom: 12 }}>Avatar</div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
                {/* Live preview */}
                <div style={{
                  width: 96, height: 96, borderRadius: '50%',
                  background: previewInner,
                  border: `3px solid ${avatarOuter}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 32, fontWeight: 700,
                  color: previewTextColor,
                  letterSpacing: previewInitials.length > 1 ? '-0.03em' : 0,
                  flexShrink: 0,
                }}>
                  {previewInitials}
                </div>

                <div style={{ flex: 1, minWidth: 260 }}>
                  <label style={{ ...label, marginBottom: 6 }}>Initials (up to 3 characters)</label>
                  <input
                    value={avatarInitials}
                    onChange={e => setInitials(e.target.value)}
                    placeholder="ABC"
                    maxLength={3}
                    style={{ ...inputStyle, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}
                  />
                  <div style={{ fontSize: 12, color: initialsError ? '#ef4444' : C.dim, marginTop: 4 }}>
                    {initialsError || 'Letters and numbers only.'}
                  </div>

                  <label style={{ ...label, marginTop: 14, marginBottom: 6 }}>Ring color</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {AVATAR_COLORS.map(c => (
                      <button
                        key={`outer-${c}`}
                        onClick={() => setAvatarOuter(c)}
                        aria-label={`Ring color ${c}`}
                        style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: c,
                          border: avatarOuter === c ? `3px solid ${C.text}` : `1px solid ${C.border}`,
                          cursor: 'pointer',
                        }}
                      />
                    ))}
                  </div>

                  <label style={{ ...label, marginTop: 14, marginBottom: 6 }}>Inner fill</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <button
                      onClick={() => setAvatarInner(null)}
                      aria-label="Transparent fill"
                      style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: `repeating-linear-gradient(45deg, #fff, #fff 3px, ${C.border} 3px, ${C.border} 6px)`,
                        border: avatarInner === null ? `3px solid ${C.text}` : `1px solid ${C.border}`,
                        cursor: 'pointer',
                      }}
                    />
                    {AVATAR_COLORS.map(c => (
                      <button
                        key={`inner-${c}`}
                        onClick={() => setAvatarInner(c)}
                        aria-label={`Inner color ${c}`}
                        style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: c,
                          border: avatarInner === c ? `3px solid ${C.text}` : `1px solid ${C.border}`,
                          cursor: 'pointer',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Form fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={label}>Display Name</label>
                <input value={legalName} onChange={e => setLegalName(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={label}>Username</label>
                <input value={username} disabled style={{ ...inputStyle, background: C.card, color: C.dim }} />
                <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>Usernames cannot be changed.</div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={label}>Bio</label>
              <textarea
                value={bio}
                onChange={e => { if (e.target.value.length <= 280) setBio(e.target.value); }}
                rows={4}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
              <div style={{ textAlign: 'right', fontSize: 12, color: bio.length > 250 ? '#ef4444' : C.dim, marginTop: 4 }}>
                {bio.length}/280
              </div>
            </div>


            {/* D32: privacy toggles — free for all verified users */}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Privacy</div>
              <label style={checkboxRow}>
                <input type="checkbox" checked={profileVisibility === 'public'}
                  onChange={e => setProfileVisibility(e.target.checked ? 'public' : 'private')} />
                <span>Public profile</span>
              </label>
              <label style={checkboxRow}>
                <input type="checkbox" checked={showOnLeaderboard}
                  onChange={e => setShowOnLeaderboard(e.target.checked)} />
                <span>Show me on leaderboards</span>
              </label>
              <label style={checkboxRow}>
                <input type="checkbox" checked={showActivity}
                  onChange={e => setShowActivity(e.target.checked)} />
                <span>Show my activity to other users</span>
              </label>
              <label style={checkboxRow}>
                <input type="checkbox" checked={allowMessages}
                  onChange={e => setAllowMessages(e.target.checked)} />
                <span>Allow direct messages from other users</span>
              </label>
            </div>

            {/* D32: paid customization — banner image + shareable card */}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
                Profile banner
                {!['verity', 'verity_pro', 'verity_family', 'verity_family_xl'].includes(userTier)
                  && <span style={{ fontSize: 11, color: C.dim, fontWeight: 500, marginLeft: 8 }}>Verity+ perk</span>}
              </div>
              {['verity', 'verity_pro', 'verity_family', 'verity_family_xl'].includes(userTier) ? (
                <input value={bannerUrl} onChange={e => setBannerUrl(e.target.value)}
                  placeholder="https://… (image URL)" style={inputStyle} />
              ) : (
                <div style={{ fontSize: 12, color: C.dim }}>
                  Upgrade to Verity to add a custom banner and share your profile card.{' '}
                  <a href="/profile/settings/billing" style={{ color: C.accent, fontWeight: 600 }}>Upgrade →</a>
                </div>
              )}
            </div>

            {error && (
              <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</div>
            )}

            {/* Save / Cancel */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '11px 28px', borderRadius: 9, border: 'none',
                  background: saved ? C.success : saving ? '#888' : C.accent,
                  color: '#fff', fontSize: 15, fontWeight: 600, cursor: saving ? 'default' : 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={handleCancel}
                style={{
                  padding: '11px 24px', borderRadius: 9, border: `1px solid ${C.border}`,
                  background: C.bg, color: C.text, fontSize: 15, fontWeight: 500, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>

          </main>
      </div>
    </div>
  );
}
