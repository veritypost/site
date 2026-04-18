'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import DestructiveActionConfirm from '@/components/DestructiveActionConfirm';

import { ADMIN_C_LIGHT as C } from '@/lib/adminPalette';

export default function AdminSponsors() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [sponsors, setSponsors] = useState([]);
  const [editing, setEditing] = useState(null);   // sponsor or 'new'
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [destructive, setDestructive] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: r } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      if (!((r || []).some(x => ['admin', 'superadmin', 'owner'].includes(x.roles?.name)))) {
        router.push('/'); return;
      }
      setAuthorized(true);
      await load();
      setLoading(false);
    })();
  }, []);

  async function load() {
    const res = await fetch('/api/admin/sponsors');
    const data = await res.json();
    if (res.ok) setSponsors(data.sponsors || []);
  }

  function startNew() {
    setForm({ name: '', slug: '', description: '', logo_url: '', website_url: '', contact_email: '', billing_email: '' });
    setEditing('new');
  }
  function startEdit(s) { setForm({ ...s }); setEditing(s); }

  async function save() {
    setError('');
    const isNew = editing === 'new';
    const url = isNew ? '/api/admin/sponsors' : `/api/admin/sponsors/${editing.id}`;
    const res = await fetch(url, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { setError(data?.error || 'Save failed'); return; }
    setEditing(null);
    load();
  }

  function remove(id) {
    const sponsor = sponsors.find(s => s.id === id);
    if (!sponsor) return;
    setDestructive({
      title: `Delete sponsor ${sponsor.name}?`,
      message: `This removes the sponsor record and its associations. Billing history in external systems is not affected.`,
      confirmText: sponsor.name,
      confirmLabel: 'Delete sponsor',
      reasonRequired: false,
      action: 'sponsor.delete',
      targetTable: 'sponsors',
      targetId: sponsor.id,
      oldValue: {
        name: sponsor.name,
        slug: sponsor.slug,
        contact_email: sponsor.contact_email,
        billing_email: sponsor.billing_email,
        is_active: sponsor.is_active,
        total_spend_cents: sponsor.total_spend_cents,
      },
      newValue: null,
      run: async () => {
        const res = await fetch(`/api/admin/sponsors/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d?.error || 'Delete failed');
        }
        load();
      },
    });
  }

  if (loading) return <div style={{ padding: 40, color: C.dim }}>Loading…</div>;
  if (!authorized) return null;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 80px' }}>
      <a href="/admin" style={{ fontSize: 12, color: C.dim, textDecoration: 'none' }}>← Admin hub</a>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Sponsors</h1>
        <button onClick={startNew} style={btnSolid}>+ New sponsor</button>
      </div>
      {error && <div style={{ color: C.danger, fontSize: 12, marginBottom: 10 }}>{error}</div>}

      {editing && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{editing === 'new' ? 'New sponsor' : `Edit ${editing.name}`}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Name"><input style={inp} value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Slug"><input style={inp} value={form.slug || ''} onChange={e => setForm({ ...form, slug: e.target.value })} /></Field>
            <Field label="Logo URL"><input style={inp} value={form.logo_url || ''} onChange={e => setForm({ ...form, logo_url: e.target.value })} /></Field>
            <Field label="Website"><input style={inp} value={form.website_url || ''} onChange={e => setForm({ ...form, website_url: e.target.value })} /></Field>
            <Field label="Contact email"><input style={inp} value={form.contact_email || ''} onChange={e => setForm({ ...form, contact_email: e.target.value })} /></Field>
            <Field label="Billing email"><input style={inp} value={form.billing_email || ''} onChange={e => setForm({ ...form, billing_email: e.target.value })} /></Field>
          </div>
          <Field label="Description"><textarea rows={2} style={inp} value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button onClick={save} style={btnSolid}>Save</button>
            <button onClick={() => setEditing(null)} style={btnGhost}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sponsors.length === 0 && <div style={{ color: C.dim, fontSize: 13, padding: 16 }}>No sponsors yet.</div>}
        {sponsors.map(s => (
          <div key={s.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{s.name}</div>
              <div style={{ fontSize: 11, color: C.dim }}>
                /{s.slug} · Spend ${(s.total_spend_cents / 100).toFixed(2)}
                {s.is_active ? '' : ' · inactive'}
              </div>
            </div>
            <button onClick={() => startEdit(s)} style={btnGhost}>Edit</button>
            <button onClick={() => remove(s.id)} style={{ ...btnGhost, color: C.danger }}>Delete</button>
          </div>
        ))}
      </div>

      <DestructiveActionConfirm
        open={!!destructive}
        title={destructive?.title || ''}
        message={destructive?.message || ''}
        confirmText={destructive?.confirmText || ''}
        confirmLabel={destructive?.confirmLabel || 'Confirm'}
        reasonRequired={!!destructive?.reasonRequired}
        action={destructive?.action || ''}
        targetTable={destructive?.targetTable || null}
        targetId={destructive?.targetId || null}
        oldValue={destructive?.oldValue || null}
        newValue={destructive?.newValue || null}
        onClose={() => setDestructive(null)}
        onConfirm={async ({ reason }) => {
          try { await destructive?.run?.({ reason }); setDestructive(null); }
          catch (err) { setError(err?.message || 'Action failed'); setDestructive(null); }
        }}
      />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#666', display: 'block', marginBottom: 3 }}>{label}</label>
      {children}
    </div>
  );
}
const inp = { width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e5e5e5', fontSize: 13, outline: 'none', fontFamily: 'inherit' };
const btnSolid = { padding: '7px 14px', borderRadius: 7, border: 'none', background: '#111', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const btnGhost = { padding: '7px 14px', borderRadius: 7, border: '1px solid #e5e5e5', background: 'transparent', color: '#111', fontSize: 12, fontWeight: 600, cursor: 'pointer' };
