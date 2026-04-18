'use client';
import { useEffect, useState, useRef } from 'react';

// Drop into the header. Polls for unread count every minute; opens
// a dropdown of the latest 10.
const C = { card: '#f7f7f7', border: '#e5e5e5', text: '#111', dim: '#666', accent: '#111' };

export default function NotificationBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const rootRef = useRef(null);

  async function refresh() {
    const res = await fetch('/api/notifications?limit=10');
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.notifications || []);
    setCount(data.unread_count || 0);
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handler(e) { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  async function onClickItem(n) {
    await fetch('/api/notifications', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [n.id], mark: 'read' }),
    });
    if (n.action_url) window.location.href = n.action_url;
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        position: 'relative', background: 'none', border: 'none',
        cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: '4px 8px', color: C.text,
      }} aria-label="Notifications">
        Notifications
        {count > 0 && (
          <span style={{
            position: 'absolute', top: 0, right: 0,
            background: '#dc2626', color: '#fff',
            fontSize: 9, fontWeight: 700,
            borderRadius: 10, padding: '1px 5px', minWidth: 14, textAlign: 'center',
          }}>{count > 99 ? '99+' : count}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6,
          width: 320, background: '#fff',
          border: `1px solid ${C.border}`, borderRadius: 10,
          boxShadow: '0 6px 20px rgba(0,0,0,0.1)', zIndex: 100,
        }}>
          <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Notifications</span>
            <a href="/notifications" style={{ fontSize: 11, color: C.accent, fontWeight: 600, textDecoration: 'none' }}>See all</a>
          </div>
          {items.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: C.dim, fontSize: 12 }}>Nothing yet.</div>
          ) : items.map(n => (
            <button key={n.id} onClick={() => onClickItem(n)} style={{
              display: 'block', width: '100%', textAlign: 'left',
              background: n.is_read ? 'transparent' : '#f0f0f8',
              border: 'none', borderBottom: `1px solid ${C.border}`,
              padding: '10px 12px', cursor: 'pointer',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{n.title}</div>
              {n.body && <div style={{ fontSize: 11, color: C.dim }}>{n.body}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
