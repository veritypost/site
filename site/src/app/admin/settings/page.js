'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

import { ADMIN_C_LIGHT as C } from '@/lib/adminPalette';

// Strips JSON quotes from a string value for a friendlier input.
function displayValue(value, type) {
  if (type !== 'string' || value == null) return value ?? '';
  if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

// Reverses displayValue — reassembles the serialized shape the table stores.
function serialize(raw, type) {
  if (type === 'string') return JSON.stringify(raw ?? '');
  return String(raw ?? '');
}

export default function SettingsAdminPage() {
  const router = useRouter();
  const supabase = createClient();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: roleRows } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const names = (roleRows || []).map(r => r.roles?.name).filter(Boolean);
      if (!names.some(n => ['admin', 'superadmin', 'owner'].includes(n))) {
        router.push('/'); return;
      }
      setAuthorized(true);
      await load();
      setLoading(false);
    })();
  }, []);

  async function load() {
    const res = await fetch('/api/admin/settings');
    const data = await res.json();
    if (res.ok) {
      setSettings(data.settings || []);
      const d = {};
      for (const s of data.settings || []) d[s.key] = displayValue(s.value, s.value_type);
      setDrafts(d);
    }
  }

  const byCategory = useMemo(() => {
    const groups = {};
    for (const s of settings) {
      const cat = s.category || 'general';
      (groups[cat] ||= []).push(s);
    }
    return groups;
  }, [settings]);

  async function save(s) {
    const raw = drafts[s.key];
    const payload = serialize(raw, s.value_type);
    setBusy(s.key);
    setStatus(null);
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: s.key, value: payload }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy('');
    if (!res.ok) {
      setStatus({ ok: false, msg: `${s.key}: ${data?.error || 'save failed'}` });
      return;
    }
    setStatus({ ok: true, msg: `Saved ${s.key}` });
    setSettings(prev => prev.map(x => x.key === s.key ? { ...x, value: payload } : x));
  }

  if (loading) return <div style={{ padding: 40, color: C.dim }}>Loading…</div>;
  if (!authorized) return null;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 80px' }}>
      <a href="/admin" style={{ fontSize: 12, color: C.dim, textDecoration: 'none' }}>Back to admin hub</a>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '6px 0' }}>Settings</h1>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 18 }}>
        Editable platform settings. Sensitive keys are hidden. Changes write to the audit log.
      </div>

      {status && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13,
          background: status.ok ? '#f0fdf4' : '#fef2f2',
          color: status.ok ? C.success : C.danger,
        }}>{status.msg}</div>
      )}

      {Object.keys(byCategory).sort().map(cat => (
        <div key={cat} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: C.dim, marginBottom: 8 }}>
            {cat}
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 4 }}>
            {byCategory[cat].map(s => {
              const current = drafts[s.key];
              const stored = displayValue(s.value, s.value_type);
              const dirty = String(current ?? '') !== String(stored ?? '');
              return (
                <div key={s.key} style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12,
                  padding: '10px 12px', borderBottom: `1px solid ${C.border}`, alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: 'ui-monospace, monospace' }}>
                      {s.key}
                    </div>
                    {s.description && (
                      <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{s.description}</div>
                    )}
                    <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>
                      type: {s.value_type}{s.is_public ? ' \u00b7 public' : ''}
                    </div>
                  </div>

                  <div>
                    {s.value_type === 'boolean' ? (
                      <select
                        value={String(current) === 'true' ? 'true' : 'false'}
                        onChange={e => setDrafts(d => ({ ...d, [s.key]: e.target.value }))}
                        style={{ padding: '6px 8px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, width: '100%' }}
                      >
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : s.value_type === 'number' ? (
                      <input
                        type="number"
                        value={current ?? ''}
                        onChange={e => setDrafts(d => ({ ...d, [s.key]: e.target.value }))}
                        style={{ padding: '6px 8px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, width: '100%', fontFamily: 'inherit' }}
                      />
                    ) : s.value_type === 'json' ? (
                      <textarea
                        rows={3}
                        value={typeof current === 'string' ? current : JSON.stringify(current || '', null, 2)}
                        onChange={e => setDrafts(d => ({ ...d, [s.key]: e.target.value }))}
                        style={{ padding: '6px 8px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, width: '100%', fontFamily: 'ui-monospace, monospace' }}
                      />
                    ) : (
                      <input
                        type="text"
                        value={current ?? ''}
                        onChange={e => setDrafts(d => ({ ...d, [s.key]: e.target.value }))}
                        style={{ padding: '6px 8px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, width: '100%', fontFamily: 'inherit' }}
                      />
                    )}
                  </div>

                  <button
                    onClick={() => save(s)}
                    disabled={!dirty || busy === s.key}
                    style={{
                      padding: '7px 14px', borderRadius: 6,
                      border: 'none',
                      background: dirty ? C.accent : '#ccc',
                      color: '#fff', fontSize: 12, fontWeight: 600,
                      cursor: dirty ? 'pointer' : 'default',
                    }}
                  >{busy === s.key ? 'Saving\u2026' : 'Save'}</button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {settings.length === 0 && (
        <div style={{ padding: 40, color: C.dim, textAlign: 'center' }}>No editable settings.</div>
      )}
    </div>
  );
}
