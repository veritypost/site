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
  danger: '#dc2626',
};

export default function BlockedUsersSettings() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login?next=/profile/settings/blocked'); return; }

    const { data, error: loadErr } = await supabase
      .from('blocked_users')
      .select('id, created_at, reason, blocked:users!blocked_users_blocked_id_fkey(id, username, avatar_color)')
      .eq('blocker_id', user.id)
      .order('created_at', { ascending: false });
    if (loadErr) { setError(loadErr.message); setLoading(false); return; }
    setRows(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function unblock(id) {
    if (busy) return;
    setBusy(id); setError('');
    const { error: delErr } = await supabase.from('blocked_users').delete().eq('id', id);
    if (delErr) { setError(delErr.message); setBusy(''); return; }
    setRows(prev => prev.filter(r => r.id !== id));
    setBusy('');
  }

  return (
    <div className="vp-dark">
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 80px' }}>
        <a href="/profile/settings" style={{ fontSize: 13, fontWeight: 600, color: C.dim, textDecoration: 'none', display: 'inline-block', marginBottom: 8 }}>← Back to settings</a>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 18px' }}>Blocked users</h1>
        <p style={{ fontSize: 13, color: C.dim, margin: '0 0 18px', lineHeight: 1.5 }}>
          Blocked users cannot see your profile, comment on your posts, or message you. Unblock from here.
        </p>

        {error && <div style={{ background: '#fef2f2', border: `1px solid ${C.danger}`, color: C.danger, borderRadius: 10, padding: 12, fontSize: 13, marginBottom: 12 }}>{error}</div>}

        {loading ? (
          <div style={{ color: C.dim, fontSize: 14, padding: 40, textAlign: 'center' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '28px 24px', textAlign: 'center', color: C.dim, fontSize: 13 }}>
            You have not blocked anyone.
          </div>
        ) : (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            {rows.map((row, i) => {
              const u = row.blocked;
              return (
                <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: u?.avatar_color || C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>
                    {(u?.username || '?').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>@{u?.username || 'unknown'}</div>
                    <div style={{ fontSize: 11, color: C.dim }}>Blocked {new Date(row.created_at).toLocaleDateString()}{row.reason ? ` · ${row.reason}` : ''}</div>
                  </div>
                  <button onClick={() => unblock(row.id)} disabled={busy === row.id} style={{ padding: '7px 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontSize: 12, fontWeight: 600, cursor: busy === row.id ? 'default' : 'pointer', opacity: busy === row.id ? 0.5 : 1 }}>
                    {busy === row.id ? 'Unblocking…' : 'Unblock'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
