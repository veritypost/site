'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import DestructiveActionConfirm from '@/components/DestructiveActionConfirm';

import { ADMIN_C_LIGHT as C } from '@/lib/adminPalette';

export default function AdminAdCampaigns() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
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
    const res = await fetch('/api/admin/ad-campaigns');
    const d = await res.json();
    if (res.ok) setRows(d.campaigns || []);
  }

  function startNew() {
    setForm({
      name: '', advertiser_name: '', campaign_type: 'display',
      start_date: new Date().toISOString().slice(0, 10),
      pricing_model: 'cpm', rate_cents: 0, status: 'draft',
      total_budget_cents: 0, daily_budget_cents: 0,
    });
    setEditing('new');
  }
  function startEdit(c) {
    setForm({
      ...c,
      start_date: c.start_date ? c.start_date.slice(0, 10) : '',
      end_date: c.end_date ? c.end_date.slice(0, 10) : '',
    });
    setEditing(c);
  }

  async function save() {
    setError('');
    const isNew = editing === 'new';
    const body = { ...form };
    ['total_budget_cents', 'daily_budget_cents', 'rate_cents'].forEach(k => { if (body[k] === '') body[k] = null; });
    const url = isNew ? '/api/admin/ad-campaigns' : `/api/admin/ad-campaigns/${editing.id}`;
    const res = await fetch(url, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (!res.ok) { setError(d?.error || 'Save failed'); return; }
    setEditing(null); load();
  }

  function remove(id) {
    const c = rows.find(r => r.id === id);
    if (!c) return;
    setDestructive({
      title: `Delete campaign "${c.name}"?`,
      message: 'This removes the campaign and its placement/unit associations. Spend + impression stats are lost from this table.',
      confirmText: c.name,
      confirmLabel: 'Delete campaign',
      reasonRequired: false,
      action: 'ad_campaign.delete',
      targetTable: 'ad_campaigns',
      targetId: c.id,
      oldValue: {
        name: c.name,
        advertiser_name: c.advertiser_name,
        status: c.status,
        campaign_type: c.campaign_type,
      },
      newValue: null,
      run: async () => {
        const res = await fetch(`/api/admin/ad-campaigns/${id}`, { method: 'DELETE' });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.error || 'Delete failed'); }
        load();
      },
    });
  }

  if (loading) return <div style={{ padding: 40, color: C.dim }}>Loading…</div>;
  if (!authorized) return null;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 80px' }}>
      <a href="/admin" style={{ fontSize: 12, color: C.dim, textDecoration: 'none' }}>← Admin hub</a>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Ad campaigns</h1>
        <button onClick={startNew} style={btnSolid}>+ New campaign</button>
      </div>
      {error && <div style={{ color: C.danger, fontSize: 12, marginBottom: 10 }}>{error}</div>}

      {editing && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Name"><input style={inp} value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Advertiser"><input style={inp} value={form.advertiser_name || ''} onChange={e => setForm({ ...form, advertiser_name: e.target.value })} /></Field>
            <Field label="Type">
              <select style={inp} value={form.campaign_type || ''} onChange={e => setForm({ ...form, campaign_type: e.target.value })}>
                {['display', 'video', 'native', 'sponsored_content', 'affiliate'].map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Pricing">
              <select style={inp} value={form.pricing_model || ''} onChange={e => setForm({ ...form, pricing_model: e.target.value })}>
                {['cpm', 'cpc', 'cpa', 'flat'].map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Start"><input type="date" style={inp} value={form.start_date || ''} onChange={e => setForm({ ...form, start_date: e.target.value })} /></Field>
            <Field label="End"><input type="date" style={inp} value={form.end_date || ''} onChange={e => setForm({ ...form, end_date: e.target.value })} /></Field>
            <Field label="Total budget (cents)"><input type="number" style={inp} value={form.total_budget_cents || ''} onChange={e => setForm({ ...form, total_budget_cents: Number(e.target.value) })} /></Field>
            <Field label="Daily budget (cents)"><input type="number" style={inp} value={form.daily_budget_cents || ''} onChange={e => setForm({ ...form, daily_budget_cents: Number(e.target.value) })} /></Field>
            <Field label="Rate (cents)"><input type="number" style={inp} value={form.rate_cents || ''} onChange={e => setForm({ ...form, rate_cents: Number(e.target.value) })} /></Field>
            <Field label="Status">
              <select style={inp} value={form.status || ''} onChange={e => setForm({ ...form, status: e.target.value })}>
                {['draft', 'active', 'paused', 'ended'].map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button onClick={save} style={btnSolid}>Save</button>
            <button onClick={() => setEditing(null)} style={btnGhost}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.length === 0 && <div style={{ color: C.dim, fontSize: 13, padding: 16 }}>No campaigns.</div>}
        {rows.map(c => (
          <div key={c.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</div>
              <div style={{ fontSize: 11, color: C.dim }}>
                {c.advertiser_name} · {c.campaign_type} · {c.status} · ${(c.spent_cents / 100).toFixed(2)} spent · {c.total_impressions} imp / {c.total_clicks} clk
              </div>
            </div>
            <button onClick={() => startEdit(c)} style={btnGhost}>Edit</button>
            <button onClick={() => remove(c.id)} style={{ ...btnGhost, color: C.danger }}>Delete</button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20, fontSize: 12 }}>
        <a href="/admin/ad-placements" style={{ color: C.accent, fontWeight: 700 }}>→ Manage placements + units</a>
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
