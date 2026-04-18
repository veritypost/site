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
    <button onClick={() => onChange(!value)} style={{
      width: 48, height: 28, borderRadius: 14, border: 'none',
      background: value ? C.accent : C.border,
      position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s',
    }}>
      <span style={{
        position: 'absolute', top: 3, left: value ? 23 : 3,
        width: 22, height: 22, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
      }} />
    </button>
  );
}

const CATEGORIES = ['Politics', 'Technology', 'Science', 'Health', 'World', 'Business', 'Climate', 'Education', 'Media', 'Culture', 'Sports', 'Finance'];
const MIN_SCORES = ['Any', '60+', '70+', '80+', '90+'];

const DEFAULT_PREFS = {
  showBreaking: true,
  showTrending: true,
  showRecommended: false,
  hideLowCred: true,
  minScore: '70+',
  display: 'Standard',
  cats: ['Technology', 'Science', 'World', 'Climate', 'Media'],
};

export default function FeedPreferences() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [showBreaking, setShowBreaking] = useState(DEFAULT_PREFS.showBreaking);
  const [showTrending, setShowTrending] = useState(DEFAULT_PREFS.showTrending);
  const [showRecommended, setShowRecommended] = useState(DEFAULT_PREFS.showRecommended);
  const [hideLowCred, setHideLowCred] = useState(DEFAULT_PREFS.hideLowCred);
  const [minScore, setMinScore] = useState(DEFAULT_PREFS.minScore);
  const [display, setDisplay] = useState(DEFAULT_PREFS.display);
  const [cats, setCats] = useState(DEFAULT_PREFS.cats);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.replace('/login');
        return;
      }
      setUserId(authUser.id);

      // Feed prefs live under users.metadata.feed (jsonb).
      const { data: userData } = await supabase
        .from('users')
        .select('metadata')
        .eq('id', authUser.id)
        .single();

      const fp = userData?.metadata?.feed;
      if (fp) {
        if (fp.showBreaking != null) setShowBreaking(fp.showBreaking);
        if (fp.showTrending != null) setShowTrending(fp.showTrending);
        if (fp.showRecommended != null) setShowRecommended(fp.showRecommended);
        if (fp.hideLowCred != null) setHideLowCred(fp.hideLowCred);
        if (fp.minScore) setMinScore(fp.minScore);
        if (fp.display) setDisplay(fp.display);
        if (fp.cats) setCats(fp.cats);
      }

      setLoading(false);
    };
    load();
  }, [router]);

  const handleSave = async () => {
    setError('');
    const supabase = createClient();
    const feedPrefs = { showBreaking, showTrending, showRecommended, hideLowCred, minScore, display, cats };

    // Merge into users.metadata jsonb without clobbering other keys.
    const { data: existing } = await supabase
      .from('users')
      .select('metadata')
      .eq('id', userId)
      .single();

    const merged = { ...(existing?.metadata || {}), feed: feedPrefs };
    const { error: updateError } = await supabase
      .from('users')
      .update({ metadata: merged })
      .eq('id', userId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const toggleCat = cat => setCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);

  const SectionCard = ({ title, children }) => (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ padding: '14px 22px', borderBottom: `1px solid ${C.border}`, fontWeight: 700, fontSize: 14 }}>{title}</div>
      {children}
    </div>
  );

  const ToggleRow = ({ label, desc, value, onChange, last }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 22px', borderBottom: last ? 'none' : `1px solid ${C.border}` }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, fontSize: 14 }}>{label}</div>
        {desc && <div style={{ fontSize: 13, color: C.dim, marginTop: 2 }}>{desc}</div>}
      </div>
      <Toggle value={value} onChange={onChange} />
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
        <SettingsNav active="Feed Preferences" />

        <main style={{  }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginTop: 0, marginBottom: 24 }}>Feed Preferences</h2>

            {/* Content preferences */}
            <SectionCard title="Content Preferences">
              <ToggleRow label="Show Breaking News" desc="Pin breaking articles at the top of your feed." value={showBreaking} onChange={setShowBreaking} />
              <ToggleRow label="Show Trending" desc="Surface articles gaining rapid engagement." value={showTrending} onChange={setShowTrending} />
              <ToggleRow label="Show Recommended" desc="Mix in articles based on your interests." value={showRecommended} onChange={setShowRecommended} last />
            </SectionCard>

            {/* Category interests */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Category Interests</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {CATEGORIES.map(cat => {
                  const active = cats.includes(cat);
                  return (
                    <button
                      key={cat}
                      onClick={() => toggleCat(cat)}
                      style={{
                        padding: '7px 16px', borderRadius: 20, border: `1px solid ${active ? C.accent : C.border}`,
                        background: active ? C.accent : C.bg, color: active ? '#fff' : C.text,
                        fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >{cat}</button>
                  );
                })}
              </div>
              <div style={{ fontSize: 12, color: C.dim, marginTop: 8 }}>{cats.length} categories selected</div>
            </div>

            {error && (
              <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</div>
            )}

            <button
              onClick={handleSave}
              style={{
                padding: '11px 28px', borderRadius: 9, border: 'none',
                background: saved ? C.success : C.accent,
                color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                transition: 'background 0.2s',
              }}
            >
              {saved ? 'Saved!' : 'Save Preferences'}
            </button>

          </main>
      </div>
    </div>
  );
}
