'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { assertNotKidMode } from '@/lib/guards';

const C = { card: '#f7f7f7', border: '#e5e5e5', text: '#111', dim: '#666', accent: '#111' };

export default function NotificationsInbox() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState(null);

  async function load() {
    setError(null);
    try {
      const url = filter === 'unread' ? '/api/notifications?unread=1&limit=100' : '/api/notifications?limit=100';
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || `Couldn\u2019t load notifications (${res.status}).`);
        setItems([]);
      } else {
        const data = await res.json();
        setItems(data.notifications || []);
      }
    } catch {
      setError('Network error. Check your connection and try again.');
      setItems([]);
    }
    setLoading(false);
  }
  useEffect(() => {
    if (assertNotKidMode(router)) return;
    load();
  }, [filter, router]);

  async function markAllRead() {
    await fetch('/api/notifications', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true, mark: 'read' }),
    });
    load();
  }
  async function markOne(id) {
    await fetch('/api/notifications', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id], mark: 'read' }),
    });
    setItems(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 80px' }}>
        <div style={{ height: 28, width: 160, background: C.card, borderRadius: 6, marginBottom: 16 }} />
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ height: 68, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 8 }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Notifications</h1>
        <button onClick={markAllRead} style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Mark all read</button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {['all', 'unread'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '5px 12px', borderRadius: 999, border: 'none',
            background: filter === f ? C.accent : C.card,
            color: filter === f ? '#fff' : C.text, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>{f[0].toUpperCase() + f.slice(1)}</button>
        ))}
      </div>

      {error ? (
        <div style={{ padding: 20, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#991b1b', fontSize: 13, marginBottom: 12 }}>
          {error}
          <button onClick={load} style={{ marginLeft: 10, padding: '4px 10px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fff', color: '#991b1b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Retry</button>
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: C.dim, fontSize: 14, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
          {filter === 'unread' ? 'You\u2019re all caught up.' : 'No notifications yet. When someone replies, mentions you, or an article breaks, it lands here.'}
        </div>
      ) : items.map(n => (
        <a key={n.id} href={n.action_url || '#'} onClick={() => markOne(n.id)} style={{
          display: 'block', background: n.is_read ? C.card : '#fff',
          border: `1px solid ${n.is_read ? C.border : C.accent}`,
          borderRadius: 10, padding: 12, marginBottom: 8,
          textDecoration: 'none', color: C.text,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: C.card, color: C.dim, fontWeight: 700, textTransform: 'uppercase' }}>{n.type}</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{n.title}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: C.dim }}>{new Date(n.created_at).toLocaleString()}</span>
          </div>
          {n.body && <div style={{ fontSize: 13, color: C.text, marginTop: 4 }}>{n.body}</div>}
        </a>
      ))}
    </div>
  );
}
