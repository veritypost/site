'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import DestructiveActionConfirm from '@/components/DestructiveActionConfirm';

// D23: placements define WHERE ads can show up; ad_units are the creatives
// assigned to placements. This page manages both sides.

import { ADMIN_C_LIGHT as C } from '@/lib/adminPalette';
const ALL_TIERS = ['free', 'verity', 'verity_pro', 'verity_family', 'verity_family_xl'];

export default function AdminAdPlacements() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [placements, setPlacements] = useState([]);
  const [units, setUnits] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [unitForm, setUnitForm] = useState(null);
  const [error, setError] = useState('');
  const [destructive, setDestructive] = useState(null);
  const [destructiveUnit, setDestructiveUnit] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: r } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      if (!((r || []).some(x => ['admin', 'superadmin', 'owner'].includes(x.roles?.name)))) {
        router.push('/'); return;
      }
      setAuthorized(true);
      await loadPlacements();
      setLoading(false);
    })();
  }, []);

  async function loadPlacements() {
    const res = await fetch('/api/admin/ad-placements');
    const d = await res.json();
    if (res.ok) setPlacements(d.placements || []);
  }
  async function loadUnits(placementId) {
    const res = await fetch(`/api/admin/ad-units?placement_id=${placementId}`);
    const d = await res.json();
    if (res.ok) setUnits(d.units || []);
  }

  function selectPlacement(p) { setSelected(p); loadUnits(p.id); setEditing(null); setUnitForm(null); }
  function startNewPlacement() {
    setForm({
      name: '', display_name: '', placement_type: 'banner', platform: 'web',
      page: 'article', position: 'bottom',
      hidden_for_tiers: ['verity_pro', 'verity_family', 'verity_family_xl'],
      reduced_for_tiers: ['verity'],
      max_ads_per_page: 1, is_kids_safe: false,
    });
    setEditing('new-placement');
  }
  function startEditPlacement(p) {
    setForm({ ...p });
    setEditing('edit-placement');
  }

  async function savePlacement() {
    setError('');
    const isNew = editing === 'new-placement';
    const url = isNew ? '/api/admin/ad-placements' : `/api/admin/ad-placements/${form.id}`;
    const res = await fetch(url, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const d = await res.json();
    if (!res.ok) { setError(d?.error || 'Save failed'); return; }
    setEditing(null);
    loadPlacements();
  }

  function deletePlacement(id) {
    const p = placements.find(x => x.id === id);
    if (!p) return;
    setDestructive({
      title: `Delete placement "${p.display_name || p.name}"?`,
      message: 'All ad units associated with this placement are removed as well. This is irreversible.',
      confirmText: p.name,
      confirmLabel: 'Delete placement',
      reasonRequired: false,
      action: 'ad_placement.delete',
      targetTable: 'ad_placements',
      targetId: p.id,
      oldValue: {
        name: p.name,
        display_name: p.display_name,
        placement_type: p.placement_type,
        platform: p.platform,
        page: p.page,
        position: p.position,
      },
      newValue: null,
      run: async () => {
        const res = await fetch(`/api/admin/ad-placements/${id}`, { method: 'DELETE' });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.error || 'Delete failed'); }
        setSelected(null);
        loadPlacements();
      },
    });
  }

  function startNewUnit() {
    setUnitForm({
      name: '', ad_network: 'direct', ad_format: 'banner',
      placement_id: selected.id, weight: 100,
      approval_status: 'approved', is_active: true,
    });
  }

  async function saveUnit() {
    setError('');
    const isNew = !unitForm.id;
    const url = isNew ? '/api/admin/ad-units' : `/api/admin/ad-units/${unitForm.id}`;
    const res = await fetch(url, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(unitForm),
    });
    const d = await res.json();
    if (!res.ok) { setError(d?.error || 'Save failed'); return; }
    setUnitForm(null);
    loadUnits(selected.id);
  }

  function deleteUnit(id) {
    const u = units.find(x => x.id === id);
    if (!u) return;
    setDestructiveUnit({
      title: `Delete ad unit "${u.name}"?`,
      message: 'This removes the ad unit creative and its placement association. Served-impression history is not affected.',
      confirmText: u.name,
      confirmLabel: 'Delete ad unit',
      reasonRequired: false,
      action: 'ad_unit.delete',
      targetTable: 'ad_units',
      targetId: u.id,
      oldValue: { id: u.id, name: u.name, placement_id: u.placement_id },
      newValue: null,
      run: async () => {
        const res = await fetch(`/api/admin/ad-units/${id}`, { method: 'DELETE' });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.error || 'Delete failed'); }
        loadUnits(selected.id);
      },
    });
  }

  function toggleTier(field, tier) {
    const cur = new Set(form[field] || []);
    if (cur.has(tier)) cur.delete(tier); else cur.add(tier);
    setForm({ ...form, [field]: Array.from(cur) });
  }

  if (loading) return <div style={{ padding: 40, color: C.dim }}>Loading…</div>;
  if (!authorized) return null;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 80px' }}>
      <a href="/admin" style={{ fontSize: 12, color: C.dim, textDecoration: 'none' }}>← Admin hub</a>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Ad placements &amp; units</h1>
        <button onClick={startNewPlacement} style={btnSolid}>+ New placement</button>
      </div>
      {error && <div style={{ color: C.danger, fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
        {/* Placements list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {placements.length === 0 && <div style={{ color: C.dim, fontSize: 13, padding: 12 }}>No placements.</div>}
          {placements.map(p => (
            <button key={p.id} onClick={() => selectPlacement(p)} style={{
              textAlign: 'left', padding: '10px 12px', borderRadius: 10,
              border: `1px solid ${selected?.id === p.id ? C.accent : C.border}`,
              background: selected?.id === p.id ? '#ede9fe' : C.card,
              cursor: 'pointer',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{p.display_name || p.name}</div>
              <div style={{ fontSize: 11, color: C.dim }}>{p.page} · {p.position} · {p.placement_type}</div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div>
          {editing && (editing.startsWith('new-placement') || editing === 'edit-placement') ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{editing === 'new-placement' ? 'New placement' : 'Edit placement'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Field label="Key name"><input style={inp} value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
                <Field label="Display name"><input style={inp} value={form.display_name || ''} onChange={e => setForm({ ...form, display_name: e.target.value })} /></Field>
                <Field label="Page"><input style={inp} value={form.page || ''} onChange={e => setForm({ ...form, page: e.target.value })} /></Field>
                <Field label="Position"><input style={inp} value={form.position || ''} onChange={e => setForm({ ...form, position: e.target.value })} /></Field>
                <Field label="Type">
                  <select style={inp} value={form.placement_type || ''} onChange={e => setForm({ ...form, placement_type: e.target.value })}>
                    {['banner', 'interstitial', 'in_feed', 'sidebar', 'video'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Platform">
                  <select style={inp} value={form.platform || ''} onChange={e => setForm({ ...form, platform: e.target.value })}>
                    {['all', 'web', 'ios', 'android'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Hidden for tiers (these tiers never see this placement)">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {ALL_TIERS.map(t => <TierChip key={t} label={t} active={(form.hidden_for_tiers || []).includes(t)} onClick={() => toggleTier('hidden_for_tiers', t)} />)}
                </div>
              </Field>
              <Field label="Reduced frequency tiers (freq caps halved)">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {ALL_TIERS.map(t => <TierChip key={t} label={t} active={(form.reduced_for_tiers || []).includes(t)} onClick={() => toggleTier('reduced_for_tiers', t)} />)}
                </div>
              </Field>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button onClick={savePlacement} style={btnSolid}>Save</button>
                <button onClick={() => setEditing(null)} style={btnGhost}>Cancel</button>
              </div>
            </div>
          ) : selected ? (
            <div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{selected.display_name || selected.name}</div>
                    <div style={{ fontSize: 11, color: C.dim }}>
                      /{selected.name} · {selected.page}:{selected.position} · {selected.placement_type}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => startEditPlacement(selected)} style={btnGhost}>Edit</button>
                    <button onClick={() => deletePlacement(selected.id)} style={{ ...btnGhost, color: C.danger }}>Delete</button>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: C.dim }}>
                  Hidden for: {(selected.hidden_for_tiers || []).join(', ') || 'none'}
                </div>
                <div style={{ fontSize: 11, color: C.dim }}>
                  Reduced for: {(selected.reduced_for_tiers || []).join(', ') || 'none'}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Ad units ({units.length})</div>
                <button onClick={startNewUnit} style={btnGhost}>+ New unit</button>
              </div>

              {unitForm && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <Field label="Name"><input style={inp} value={unitForm.name || ''} onChange={e => setUnitForm({ ...unitForm, name: e.target.value })} /></Field>
                    <Field label="Advertiser"><input style={inp} value={unitForm.advertiser_name || ''} onChange={e => setUnitForm({ ...unitForm, advertiser_name: e.target.value })} /></Field>
                    <Field label="Network">
                      <select style={inp} value={unitForm.ad_network || ''} onChange={e => setUnitForm({ ...unitForm, ad_network: e.target.value })}>
                        {['direct', 'house', 'google_ads', 'amazon', 'other'].map(t => <option key={t}>{t}</option>)}
                      </select>
                    </Field>
                    <Field label="Format">
                      <select style={inp} value={unitForm.ad_format || ''} onChange={e => setUnitForm({ ...unitForm, ad_format: e.target.value })}>
                        {['banner', 'interstitial', 'video', 'native'].map(t => <option key={t}>{t}</option>)}
                      </select>
                    </Field>
                    <Field label="Creative URL (image)"><input style={inp} value={unitForm.creative_url || ''} onChange={e => setUnitForm({ ...unitForm, creative_url: e.target.value })} /></Field>
                    <Field label="Click URL"><input style={inp} value={unitForm.click_url || ''} onChange={e => setUnitForm({ ...unitForm, click_url: e.target.value })} /></Field>
                    <Field label="Alt text"><input style={inp} value={unitForm.alt_text || ''} onChange={e => setUnitForm({ ...unitForm, alt_text: e.target.value })} /></Field>
                    <Field label="CTA text"><input style={inp} value={unitForm.cta_text || ''} onChange={e => setUnitForm({ ...unitForm, cta_text: e.target.value })} /></Field>
                    <Field label="Freq cap / user"><input type="number" style={inp} value={unitForm.frequency_cap_per_user || ''} onChange={e => setUnitForm({ ...unitForm, frequency_cap_per_user: Number(e.target.value) })} /></Field>
                    <Field label="Freq cap / session"><input type="number" style={inp} value={unitForm.frequency_cap_per_session || ''} onChange={e => setUnitForm({ ...unitForm, frequency_cap_per_session: Number(e.target.value) })} /></Field>
                    <Field label="Weight"><input type="number" style={inp} value={unitForm.weight || 100} onChange={e => setUnitForm({ ...unitForm, weight: Number(e.target.value) })} /></Field>
                    <Field label="Approval">
                      <select style={inp} value={unitForm.approval_status || 'pending'} onChange={e => setUnitForm({ ...unitForm, approval_status: e.target.value })}>
                        {['pending', 'approved', 'rejected'].map(t => <option key={t}>{t}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Creative HTML (for network-served)"><textarea rows={2} style={inp} value={unitForm.creative_html || ''} onChange={e => setUnitForm({ ...unitForm, creative_html: e.target.value })} /></Field>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button onClick={saveUnit} style={btnSolid}>Save unit</button>
                    <button onClick={() => setUnitForm(null)} style={btnGhost}>Cancel</button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {units.map(u => (
                  <div key={u.id} style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: C.dim }}>{u.ad_network} · {u.ad_format} · {u.approval_status} · weight {u.weight}</div>
                    </div>
                    <button onClick={() => setUnitForm({ ...u })} style={btnGhost}>Edit</button>
                    <button onClick={() => deleteUnit(u.id)} style={{ ...btnGhost, color: C.danger }}>Del</button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ padding: 40, color: C.dim, textAlign: 'center' }}>Pick a placement or add one.</div>
          )}
        </div>
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

      <DestructiveActionConfirm
        open={!!destructiveUnit}
        title={destructiveUnit?.title || ''}
        message={destructiveUnit?.message || ''}
        confirmText={destructiveUnit?.confirmText || ''}
        confirmLabel={destructiveUnit?.confirmLabel || 'Confirm'}
        reasonRequired={!!destructiveUnit?.reasonRequired}
        action={destructiveUnit?.action || ''}
        targetTable={destructiveUnit?.targetTable || null}
        targetId={destructiveUnit?.targetId || null}
        oldValue={destructiveUnit?.oldValue || null}
        newValue={destructiveUnit?.newValue || null}
        onClose={() => setDestructiveUnit(null)}
        onConfirm={async ({ reason }) => {
          try { await destructiveUnit?.run?.({ reason }); setDestructiveUnit(null); }
          catch (err) { setError(err?.message || 'Action failed'); setDestructiveUnit(null); }
        }}
      />
    </div>
  );
}

function TierChip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 10px', borderRadius: 999,
      border: `1px solid ${active ? '#111' : '#e5e5e5'}`,
      background: active ? '#111' : 'transparent',
      color: active ? '#fff' : '#111',
      fontSize: 11, fontWeight: 600, cursor: 'pointer',
    }}>{label}</button>
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
