'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

import { ADMIN_C_LIGHT as C } from '@/lib/adminPalette';

// D9: editor-managed scheduling of kid expert sessions.

export default function AdminExpertSessions() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [experts, setExperts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ expert_id: '', category_id: '', title: '', description: '', scheduled_at: '', duration_minutes: 30, max_questions: 20 });
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const names = (userRoles || []).map(r => r.roles?.name).filter(Boolean);
      if (!names.some(n => ['editor', 'admin', 'superadmin', 'owner'].includes(n))) {
        router.push('/'); return;
      }
      setAuthorized(true);
      await load();
      setLoading(false);
    })();
  }, []);

  async function load() {
    const [{ data: sess }, { data: expertRoleRows }, { data: cats }] = await Promise.all([
      supabase.from('kid_expert_sessions').select('*, users!fk_kid_expert_sessions_expert_id(username), categories(name)').order('scheduled_at', { ascending: false }).limit(50),
      supabase.from('user_roles').select('user_id, users!fk_user_roles_user_id(id, username), roles!inner(name)').in('roles.name', ['expert', 'educator', 'journalist']),
      supabase.from('categories').select('id, name').order('name'),
    ]);
    setSessions(sess || []);
    const uniq = {};
    (expertRoleRows || []).forEach(r => { if (r.users) uniq[r.user_id] = r.users; });
    setExperts(Object.values(uniq));
    setCategories(cats || []);
  }

  async function schedule() {
    setError(''); setFlash('');
    if (!form.expert_id || !form.title || !form.scheduled_at) {
      setError('expert, title, time required'); return;
    }
    const res = await fetch('/api/expert-sessions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expert_id: form.expert_id,
        category_id: form.category_id || null,
        title: form.title,
        description: form.description || null,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        duration_minutes: Number(form.duration_minutes) || 30,
        max_questions: Number(form.max_questions) || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data?.error || 'Schedule failed'); return; }
    setFlash('Scheduled.');
    setForm({ expert_id: '', category_id: '', title: '', description: '', scheduled_at: '', duration_minutes: 30, max_questions: 20 });
    load();
  }

  if (loading) return <div style={{ padding: 40, color: C.dim }}>Loading…</div>;
  if (!authorized) return null;

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px 80px' }}>
      <a href="/admin" style={{ fontSize: 12, color: C.dim, textDecoration: 'none' }}>← Admin hub</a>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '6px 0' }}>Kid expert sessions</h1>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 16 }}>Scheduled live Q&amp;A windows for kid profiles (D9). Kids submit questions; experts answer inside the moderated session.</div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Schedule a session</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Expert">
            <select value={form.expert_id} onChange={e => setForm({ ...form, expert_id: e.target.value })} style={input}>
              <option value="">— pick expert —</option>
              {experts.map(e => <option key={e.id} value={e.id}>@{e.username}</option>)}
            </select>
          </Field>
          <Field label="Category (optional)">
            <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} style={input}>
              <option value="">Any</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Title">
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={input} />
          </Field>
          <Field label="Starts">
            <input type="datetime-local" value={form.scheduled_at} onChange={e => setForm({ ...form, scheduled_at: e.target.value })} style={input} />
          </Field>
          <Field label="Duration (min)">
            <input type="number" value={form.duration_minutes} onChange={e => setForm({ ...form, duration_minutes: e.target.value })} style={input} />
          </Field>
          <Field label="Max questions">
            <input type="number" value={form.max_questions} onChange={e => setForm({ ...form, max_questions: e.target.value })} style={input} />
          </Field>
        </div>
        <Field label="Description">
          <textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={input} />
        </Field>
        {error && <div style={{ color: C.danger, fontSize: 12, marginBottom: 8 }}>{error}</div>}
        {flash && <div style={{ color: C.success, fontSize: 12, marginBottom: 8 }}>{flash}</div>}
        <button onClick={schedule} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: C.accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Schedule</button>
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>Sessions</h2>
      {sessions.length === 0 ? (
        <div style={{ color: C.dim, fontSize: 13, padding: 12 }}>No sessions.</div>
      ) : sessions.map(s => (
        <div key={s.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{s.title}</div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
            @{s.users?.username} · {s.categories?.name || 'Any'} · {new Date(s.scheduled_at).toLocaleString()} · {s.duration_minutes}min · {s.status}
          </div>
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#666', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}
const input = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 13, outline: 'none', fontFamily: 'inherit' };
