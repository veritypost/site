'use client';
import { useState, useEffect } from 'react';

// Per-type alert preferences. D25 narrowed which emails we send;
// this page still exposes channel toggles for the ones that exist.

const TYPES = [
  { key: 'breaking_news',           label: 'Breaking news',            desc: 'D14: 1/day for free, unlimited for paid.' },
  { key: 'mention',                 label: 'You were @mentioned',      desc: 'Someone tagged you in a comment.' },
  { key: 'dm',                      label: 'Direct messages',          desc: 'New DM received.' },
  { key: 'expert_answer',           label: 'Expert answered',          desc: 'An expert replied to your Ask.' },
  { key: 'weekly_reading_report',   label: 'Weekly reading report',    desc: 'D25: your week in review.' },
  { key: 'weekly_family_report',    label: 'Weekly family report',     desc: 'D24: household roll-up.' },
  { key: 'kid_trial',               label: 'Kid trial reminders',      desc: 'Day-6 + expiry notices.' },
  { key: 'appeal_outcome',          label: 'Appeal outcome',           desc: 'Moderator decisions on your appeals.' },
];

const C = { card: '#f7f7f7', border: '#e5e5e5', text: '#111', dim: '#666', accent: '#111' };

export default function AlertPreferences() {
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState({});   // alert_type -> row
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const res = await fetch('/api/notifications/preferences');
    const data = await res.json();
    const byType = Object.fromEntries((data.preferences || []).map(p => [p.alert_type, p]));
    setPrefs(byType);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function update(type, patch) {
    setSaving(type); setError('');
    const current = prefs[type] || { alert_type: type, channel_push: true, channel_email: true, channel_in_app: true, is_enabled: true };
    const body = { ...current, ...patch, alert_type: type };
    const res = await fetch('/api/notifications/preferences', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving('');
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d?.error || 'Save failed'); return; }
    setPrefs(prev => ({ ...prev, [type]: body }));
  }

  if (loading) return <div style={{ padding: 40, color: C.dim }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 80px' }}>
      <a href="/profile/settings" style={{ fontSize: 12, color: C.dim, textDecoration: 'none' }}>← Back to settings</a>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '8px 0 4px' }}>Notifications</h2>
      <p style={{ fontSize: 13, color: C.dim, marginTop: 0, marginBottom: 20 }}>
        Choose where each alert type shows up. In-app is always on by default.
      </p>
      {error && <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 10 }}>{error}</div>}

      {TYPES.map(t => {
        const p = prefs[t.key] || { channel_push: true, channel_email: true, channel_in_app: true, is_enabled: true };
        return (
          <div key={t.key} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{t.label}</div>
                <div style={{ fontSize: 11, color: C.dim }}>{t.desc}</div>
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <input type="checkbox" checked={p.is_enabled !== false}
                  onChange={e => update(t.key, { is_enabled: e.target.checked })}
                  disabled={saving === t.key} />
                Enabled
              </label>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: C.text }}>
              {['channel_in_app', 'channel_push', 'channel_email'].map(ch => (
                <label key={ch} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <input type="checkbox" checked={p[ch] !== false}
                    onChange={e => update(t.key, { [ch]: e.target.checked })}
                    disabled={saving === t.key || p.is_enabled === false} />
                  {ch.replace('channel_', '')}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
