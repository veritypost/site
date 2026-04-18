'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

import { ADMIN_C as C } from '@/lib/adminPalette';

const TYPE_OPTIONS = ['invite', 'press', 'beta', 'partner'];

const EMPTY_FORM = {
  code: '',
  description: '',
  type: 'invite',
  grants_plan_id: '',
  grants_role_id: '',
  max_uses: '10',
  expires_at: '',
  is_active: true,
};

function generateCode() {
  return 'VP' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default function AccessAdmin() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [tab, setTab] = useState('codes');
  const [codes, setCodes] = useState([]);
  const [requests, setRequests] = useState([]);
  const [plans, setPlans] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showCreate, setShowCreate] = useState(false);
  const [editExpiryId, setEditExpiryId] = useState(null);
  const [editExpiryValue, setEditExpiryValue] = useState('');
  const [expirySaving, setExpirySaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id);
      const names = (userRoles || []).map(r => r.roles?.name?.toLowerCase()).filter(Boolean);
      if (!names.some(n => n === 'owner' || n === 'admin')) { router.push('/'); return; }
      setAuthorized(true);
      await loadAll();
      setLoading(false);
    })();
  }, []);

  async function loadAll() {
    const [codesRes, requestsRes, plansRes, rolesRes] = await Promise.all([
      supabase
        .from('access_codes')
        .select('id, code, description, type, grants_plan_id, grants_role_id, max_uses, current_uses, is_active, expires_at, created_at, metadata')
        .order('created_at', { ascending: false }),
      supabase
        .from('access_requests')
        .select('id, email, name, type, reason, status, access_code_id, invite_sent_at, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('plans')
        .select('id, name, display_name, tier')
        .order('sort_order', { ascending: true }),
      supabase
        .from('roles')
        .select('id, name, display_name')
        .order('name', { ascending: true }),
    ]);
    setCodes(codesRes.data || []);
    setRequests(requestsRes.data || []);
    setPlans(plansRes.data || []);
    setRoles(rolesRes.data || []);
  }

  const planLabel = (id) => {
    if (!id) return null;
    const p = plans.find(x => x.id === id);
    return p ? (p.display_name || p.name) : id;
  };
  const roleLabel = (id) => {
    if (!id) return null;
    const r = roles.find(x => x.id === id);
    return r ? (r.display_name || r.name) : id;
  };
  const codeLabel = (id) => {
    if (!id) return null;
    const c = codes.find(x => x.id === id);
    return c ? c.code : id.slice(0, 8);
  };

  const toggleCode = async (id) => {
    const code = codes.find(c => c.id === id);
    if (!code) return;
    const next = !code.is_active;
    const { error: auditErr } = await supabase.rpc('record_admin_action', {
      p_action: 'access_code.toggle',
      p_target_table: 'access_codes',
      p_target_id: id,
      p_reason: null,
      p_old_value: { is_active: !!code.is_active, code: code.code },
      p_new_value: { is_active: next, code: code.code },
    });
    if (auditErr) { setError(`Audit log write failed: ${auditErr.message}`); return; }
    const { error: err } = await supabase
      .from('access_codes')
      .update({ is_active: next })
      .eq('id', id);
    if (err) { setError(`Toggle failed: ${err.message}`); return; }
    setCodes(prev => prev.map(c => c.id === id ? { ...c, is_active: next } : c));
  };

  const openEditExpiry = (id) => {
    const c = codes.find(x => x.id === id);
    setEditExpiryId(id);
    setEditExpiryValue(c?.expires_at ? (c.expires_at).slice(0, 10) : '');
    setError('');
  };
  const saveExpiry = async () => {
    if (!editExpiryId) return;
    setExpirySaving(true);
    const iso = editExpiryValue ? new Date(editExpiryValue + 'T23:59:59Z').toISOString() : null;
    const existing = codes.find(c => c.id === editExpiryId);
    const prevExpiry = existing?.expires_at || null;
    const { error: auditErr } = await supabase.rpc('record_admin_action', {
      p_action: 'access_code.update_expiry',
      p_target_table: 'access_codes',
      p_target_id: editExpiryId,
      p_reason: null,
      p_old_value: { expires_at: prevExpiry },
      p_new_value: { expires_at: iso },
    });
    if (auditErr) {
      setExpirySaving(false);
      setError(`Audit log write failed: ${auditErr.message}`);
      return;
    }
    const { error: err } = await supabase
      .from('access_codes')
      .update({ expires_at: iso })
      .eq('id', editExpiryId);
    setExpirySaving(false);
    if (err) { setError(`Expiry save failed: ${err.message}`); return; }
    setCodes(prev => prev.map(c => c.id === editExpiryId ? { ...c, expires_at: iso } : c));
    setEditExpiryId(null);
    setEditExpiryValue('');
  };

  const createCode = async () => {
    setError('');
    const code = (form.code.trim() || generateCode()).toUpperCase();
    if (!form.type) { setError('Type is required'); return; }
    const maxUses = form.max_uses === '' ? null : parseInt(form.max_uses, 10);
    if (maxUses !== null && (Number.isNaN(maxUses) || maxUses < 0)) {
      setError('max_uses must be a non-negative integer or blank'); return;
    }
    setSaving(true);
    const row = {
      code,
      description: form.description.trim() || null,
      type: form.type,
      grants_plan_id: form.grants_plan_id || null,
      grants_role_id: form.grants_role_id || null,
      max_uses: maxUses,
      expires_at: form.expires_at ? new Date(form.expires_at + 'T23:59:59Z').toISOString() : null,
      is_active: !!form.is_active,
    };
    const { data, error: err } = await supabase
      .from('access_codes')
      .insert(row)
      .select()
      .single();
    setSaving(false);
    if (err) { setError(`Create failed: ${err.message}`); return; }
    setCodes(prev => [data, ...prev]);
    setForm(EMPTY_FORM);
    setShowCreate(false);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 13, color: C.dim }}>Loading...</div>
      </div>
    );
  }
  if (!authorized) return null;

  const today = new Date().toISOString().slice(0, 10);

  const activeCodes = codes.filter(c => c.is_active).length;
  const totalUses = codes.reduce((a, c) => a + (c.current_uses || 0), 0);
  const requestsToday = requests.filter(r => (r.created_at || '').startsWith(today)).length;
  const approvedRequests = requests.filter(r => r.status === 'approved').length;

  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.white, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
  const labelStyle = { fontSize: 10, color: C.dim, fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase' };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '24px 28px 80px', maxWidth: 900, margin: '0 auto' }}>
      <a href="/admin" style={{ fontSize: 11, color: C.dim, textDecoration: 'none' }}>Back to hub</a>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, marginTop: 8 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Access Codes</h1>
          <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>Manage signup codes and access requests (v2 schema)</p>
        </div>
      </div>

      {error && (
        <div style={{ padding: 10, marginBottom: 12, background: '#fee', border: '1px solid #fbb', borderRadius: 8, color: '#900', fontSize: 12 }}>{error}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Active Codes', value: activeCodes },
          { label: 'Total Uses', value: totalUses },
          { label: 'Requests Today', value: requestsToday },
          { label: 'Approved', value: approvedRequests },
        ].map(s => (
          <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.white }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {[{ k: 'codes', l: 'Access Codes' }, { k: 'requests', l: 'Requests' }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: tab === t.k ? 700 : 500,
            background: tab === t.k ? C.white : C.card, color: tab === t.k ? C.bg : C.dim, cursor: 'pointer',
          }}>{t.l}</button>
        ))}
      </div>

      {tab === 'codes' && (
        <>
          <button
            onClick={() => { if (showCreate) setForm(EMPTY_FORM); setShowCreate(!showCreate); setError(''); }}
            style={{
              padding: '8px 16px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600,
              background: showCreate ? C.danger : C.white, color: showCreate ? '#fff' : C.bg, cursor: 'pointer', marginBottom: 14,
            }}
          >{showCreate ? 'Cancel' : '+ New Code'}</button>

          {showCreate && (
            <div style={{ background: C.card, border: `1px solid ${C.accent}44`, borderRadius: 10, padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>New access code</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>Code (blank = auto-generate)</label>
                  <input
                    value={form.code}
                    onChange={e => setForm({ ...form, code: e.target.value })}
                    placeholder="e.g. VP123ABC"
                    style={{ ...inputStyle, textTransform: 'uppercase', fontFamily: 'monospace', fontWeight: 700 }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Type</label>
                  <select
                    value={form.type}
                    onChange={e => setForm({ ...form, type: e.target.value })}
                    style={inputStyle}
                  >
                    {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Description (public / internal note)</label>
                <input
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="e.g. Press batch Q2"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>Grants plan (optional)</label>
                  <select
                    value={form.grants_plan_id}
                    onChange={e => setForm({ ...form, grants_plan_id: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">— none —</option>
                    {plans.map(p => <option key={p.id} value={p.id}>{p.display_name || p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Grants role (optional)</label>
                  <select
                    value={form.grants_role_id}
                    onChange={e => setForm({ ...form, grants_role_id: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">— none —</option>
                    {roles.map(r => <option key={r.id} value={r.id}>{r.display_name || r.name}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: 12, alignItems: 'end' }}>
                <div>
                  <label style={labelStyle}>Max uses (blank = unlimited)</label>
                  <input
                    type="number"
                    value={form.max_uses}
                    onChange={e => setForm({ ...form, max_uses: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Expires at (optional)</label>
                  <input
                    type="date"
                    value={form.expires_at}
                    onChange={e => setForm({ ...form, expires_at: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.soft, paddingBottom: 6 }}>
                  <input
                    type="checkbox"
                    checked={!!form.is_active}
                    onChange={e => setForm({ ...form, is_active: e.target.checked })}
                  />
                  is_active
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                <button
                  onClick={createCode}
                  disabled={saving}
                  style={{
                    padding: '8px 18px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 700,
                    background: C.accent, color: '#fff', cursor: saving ? 'default' : 'pointer',
                  }}
                >{saving ? 'Creating\u2026' : 'Create'}</button>
              </div>
            </div>
          )}

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            {codes.length === 0 && (
              <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: C.muted }}>No access codes yet.</div>
            )}
            {codes.map((code, i) => {
              const maxUses = code.max_uses;
              const used = code.current_uses || 0;
              const grantTarget = code.grants_plan_id
                ? `plan: ${planLabel(code.grants_plan_id)}`
                : code.grants_role_id
                  ? `role: ${roleLabel(code.grants_role_id)}`
                  : 'no auto-grant';
              const expired = code.expires_at && new Date(code.expires_at) < new Date();
              return (
                <div key={code.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < codes.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <code style={{ fontSize: 13, fontWeight: 700, color: code.is_active && !expired ? C.white : C.muted, fontFamily: 'monospace', minWidth: 100 }}>{code.code}</code>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: C.soft }}>
                      {code.description || <span style={{ color: C.muted, fontStyle: 'italic' }}>no description</span>}
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                      type: {code.type} &middot; {grantTarget} &middot; {used}{maxUses ? `/${maxUses}` : ''} used
                      {code.expires_at && (
                        <> &middot; {expired ? 'expired ' : 'expires '}{new Date(code.expires_at).toLocaleDateString()}</>
                      )}
                    </div>
                  </div>
                  <div style={{ width: 60 }}>
                    {maxUses ? (
                      <div style={{ height: 4, borderRadius: 2, background: C.bg }}>
                        <div style={{
                          height: 4, borderRadius: 2,
                          background: used >= maxUses ? C.danger : C.accent,
                          width: `${Math.min(100, (used / maxUses) * 100)}%`,
                        }} />
                      </div>
                    ) : (
                      <div style={{ fontSize: 9, color: C.muted, textAlign: 'center' }}>unlimited</div>
                    )}
                  </div>
                  <button
                    onClick={() => openEditExpiry(code.id)}
                    style={{ padding: '4px 8px', borderRadius: 4, border: `1px solid ${C.border}`, background: 'transparent', color: C.dim, fontSize: 10, cursor: 'pointer' }}
                  >Edit expiry</button>
                  <button
                    onClick={() => toggleCode(code.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    aria-label={code.is_active ? 'Deactivate' : 'Activate'}
                  >
                    <div style={{ width: 32, height: 18, borderRadius: 9, background: code.is_active ? C.success : '#333', position: 'relative', transition: 'background 0.15s' }}>
                      <div style={{ width: 14, height: 14, borderRadius: '50%', background: code.is_active ? '#fff' : '#666', position: 'absolute', top: 2, left: code.is_active ? 16 : 2, transition: 'left 0.15s' }} />
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {editExpiryId && (
        <div role="dialog" aria-modal="true" onClick={() => !expirySaving && setEditExpiryId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(17,17,17,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, width: '90%', maxWidth: 360, color: C.white }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Edit expiry</div>
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 8 }}>Clear the date to remove the expiry entirely.</div>
            <input
              type="date"
              value={editExpiryValue}
              onChange={e => setEditExpiryValue(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.white, fontSize: 13, outline: 'none', marginBottom: 10, fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <button onClick={() => setEditExpiryId(null)} disabled={expirySaving} style={{ padding: '7px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.dim, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveExpiry} disabled={expirySaving} style={{ padding: '7px 12px', borderRadius: 6, border: 'none', background: C.accent, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{expirySaving ? 'Saving\u2026' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'requests' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {requests.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: C.muted }}>No requests found.</div>
          )}
          {requests.map(req => {
            const statusColor = req.status === 'approved' ? C.success : req.status === 'rejected' ? C.danger : C.warn;
            return (
              <div key={req.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {req.name || req.email}
                    {req.name && <span style={{ fontWeight: 400, color: C.dim, marginLeft: 6 }}>({req.email})</span>}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                    type: {req.type} &middot; requested {req.created_at ? new Date(req.created_at).toLocaleString() : '\u2014'}
                    {req.access_code_id && <> &middot; code: <code style={{ fontFamily: 'monospace' }}>{codeLabel(req.access_code_id)}</code></>}
                  </div>
                  {req.reason && (
                    <div style={{ fontSize: 11, color: C.soft, marginTop: 4, whiteSpace: 'pre-wrap' }}>{req.reason}</div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: statusColor, fontWeight: 700, textTransform: 'uppercase' }}>{req.status}</div>
                  {req.invite_sent_at && (
                    <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>invited {new Date(req.invite_sent_at).toLocaleDateString()}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
