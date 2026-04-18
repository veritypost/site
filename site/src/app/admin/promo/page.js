'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import DestructiveActionConfirm from '@/components/DestructiveActionConfirm';

import { ADMIN_C as C } from '@/lib/adminPalette';

const DISCOUNT_TYPES = ['percent', 'amount'];
const DURATIONS = ['once', 'repeating', 'forever'];

const EMPTY_FORM = {
  code: '',
  description: '',
  discount_type: 'percent',
  discount_value_display: '',
  applies_to_plans: [],
  duration: 'once',
  duration_months: '',
  max_uses: '',
  max_uses_per_user: 1,
  starts_at: '',
  expires_at: '',
  is_active: true,
};

function formatDiscount(row) {
  if (row.discount_type === 'percent') return `${row.discount_value}%`;
  if (row.discount_type === 'amount')  return `$${(Number(row.discount_value) / 100).toFixed(2)}`;
  return `${row.discount_value} (${row.discount_type || '?'})`;
}

function StatusDot({ active }) {
  return <div style={{ width: 7, height: 7, borderRadius: '50%', background: active ? C.success : C.danger, flexShrink: 0 }} />;
}

export default function PromoAdmin() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [promos, setPromos] = useState([]);
  const [plans, setPlans] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [destructive, setDestructive] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id);
      const names = (userRoles || []).map(r => r.roles?.name).filter(Boolean);
      if (!names.some(n => ['owner', 'admin'].includes(n))) { router.push('/'); return; }
      setAuthorized(true);
      await loadAll();
      setLoading(false);
    })();
  }, []);

  async function loadAll() {
    const [promoRes, planRes] = await Promise.all([
      supabase
        .from('promo_codes')
        .select('id, code, description, discount_type, discount_value, applies_to_plans, duration, duration_months, max_uses, max_uses_per_user, current_uses, is_active, starts_at, expires_at, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('plans')
        .select('id, name, display_name, tier')
        .order('sort_order', { ascending: true }),
    ]);
    setPromos(promoRes.data || []);
    setPlans(planRes.data || []);
  }

  const planLabel = (id) => {
    const p = plans.find(x => x.id === id);
    return p ? (p.display_name || p.name) : id;
  };

  const filtered = promos.filter(p => {
    const expired = p.expires_at && new Date(p.expires_at) < new Date();
    if (filter === 'active'  && (!p.is_active || expired)) return false;
    if (filter === 'expired' && !(expired || !p.is_active)) return false;
    if (search && !(p.code || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const activeCount = promos.filter(p => p.is_active && !(p.expires_at && new Date(p.expires_at) < new Date())).length;
  const totalRedemptions = promos.reduce((sum, p) => sum + (p.current_uses || 0), 0);

  const resetForm = () => { setForm(EMPTY_FORM); setError(''); };

  const togglePlanInForm = (planId) => {
    setForm(prev => {
      const has = prev.applies_to_plans.includes(planId);
      return {
        ...prev,
        applies_to_plans: has
          ? prev.applies_to_plans.filter(id => id !== planId)
          : [...prev.applies_to_plans, planId],
      };
    });
  };

  const createPromo = async () => {
    setError('');
    const code = form.code.trim().toUpperCase().replace(/\s+/g, '');
    if (!code) { setError('Code is required'); return; }
    if (!DISCOUNT_TYPES.includes(form.discount_type)) { setError('Invalid discount_type'); return; }
    const rawValue = String(form.discount_value_display).trim();
    if (rawValue === '') { setError('discount_value is required'); return; }
    let discount_value;
    if (form.discount_type === 'percent') {
      const n = parseInt(rawValue, 10);
      if (Number.isNaN(n) || n < 0 || n > 100) { setError('percent must be 0\u2013100'); return; }
      discount_value = n;
    } else {
      const dollars = parseFloat(rawValue);
      if (Number.isNaN(dollars) || dollars < 0) { setError('amount must be a positive dollar value'); return; }
      discount_value = Math.round(dollars * 100);
    }

    if (!DURATIONS.includes(form.duration)) { setError('Invalid duration'); return; }
    let duration_months = null;
    if (form.duration === 'repeating') {
      const n = parseInt(form.duration_months, 10);
      if (Number.isNaN(n) || n < 1) { setError('duration_months required when duration = repeating'); return; }
      duration_months = n;
    }

    const max_uses = form.max_uses === '' ? null : parseInt(form.max_uses, 10);
    if (max_uses !== null && (Number.isNaN(max_uses) || max_uses < 0)) { setError('max_uses must be a non-negative integer or blank'); return; }

    const max_uses_per_user = parseInt(form.max_uses_per_user, 10);
    if (Number.isNaN(max_uses_per_user) || max_uses_per_user < 1) { setError('max_uses_per_user must be >= 1'); return; }

    const row = {
      code,
      description: form.description.trim() || null,
      discount_type: form.discount_type,
      discount_value,
      applies_to_plans: form.applies_to_plans.length > 0 ? form.applies_to_plans : null,
      duration: form.duration,
      duration_months,
      max_uses,
      max_uses_per_user,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      is_active: !!form.is_active,
    };

    setSaving(true);
    const { data, error: err } = await supabase
      .from('promo_codes')
      .insert(row)
      .select()
      .single();
    setSaving(false);
    if (err) { setError(`Create failed: ${err.message}`); return; }
    setPromos(prev => [data, ...prev]);
    resetForm();
    setShowCreate(false);
  };

  const toggleActive = async (id, current) => {
    const { error: auditErr } = await supabase.rpc('record_admin_action', {
      p_action: 'promo.toggle',
      p_target_table: 'promo_codes',
      p_target_id: id,
      p_reason: null,
      p_old_value: { is_active: !!current },
      p_new_value: { is_active: !current },
    });
    if (auditErr) { setError(`Audit log write failed: ${auditErr.message}`); return; }
    const { error: err } = await supabase
      .from('promo_codes')
      .update({ is_active: !current })
      .eq('id', id);
    if (err) { setError(`Toggle failed: ${err.message}`); return; }
    setPromos(prev => prev.map(p => p.id === id ? { ...p, is_active: !current } : p));
  };

  const deletePromo = (promo) => {
    setDestructive({
      title: `Delete promo code ${promo.code}?`,
      message: 'This permanently removes the promo. Existing redemption counts stay as-is in the DB; the code can no longer be applied.',
      confirmText: promo.code,
      confirmLabel: 'Delete promo',
      reasonRequired: false,
      action: 'promo.delete',
      targetTable: 'promo_codes',
      targetId: promo.id,
      oldValue: {
        code: promo.code,
        discount_type: promo.discount_type,
        discount_value: promo.discount_value,
      },
      newValue: null,
      run: async () => {
        const { error: err } = await supabase.from('promo_codes').delete().eq('id', promo.id);
        if (err) throw new Error(err.message);
        setPromos(prev => prev.filter(p => p.id !== promo.id));
      },
    });
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.dim, fontSize: 13 }}>
        Loading...
      </div>
    );
  }
  if (!authorized) return null;

  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.white, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
  const labelStyle = { fontSize: 10, color: C.dim, fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase' };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '24px 28px 80px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <a href="/admin" style={{ fontSize: 11, color: C.dim, textDecoration: 'none' }}>Back to hub</a>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Promo Codes</h1>
          <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>Create, manage, and track promotional codes (v2 schema)</p>
        </div>
        <button
          onClick={() => { if (showCreate) resetForm(); setShowCreate(v => !v); }}
          style={{
            padding: '10px 20px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: showCreate ? C.danger : C.white, color: showCreate ? '#fff' : C.bg, cursor: 'pointer',
          }}
        >{showCreate ? 'Cancel' : '+ New Promo'}</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total Codes', value: promos.length },
          { label: 'Active', value: activeCount, color: C.success },
          { label: 'Total Redemptions', value: totalRedemptions },
          { label: 'Expired / Disabled', value: promos.length - activeCount, color: C.danger },
        ].map(s => (
          <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color || C.white, letterSpacing: '-0.03em' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ padding: 10, marginBottom: 12, background: '#fee', border: '1px solid #fbb', borderRadius: 8, color: '#900', fontSize: 12 }}>{error}</div>
      )}

      {showCreate && (
        <div style={{ background: C.card, border: `1px solid ${C.accent}44`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>New Promo Code</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Code</label>
              <input
                value={form.code}
                onChange={e => setForm({ ...form, code: e.target.value })}
                placeholder="SAVE20"
                style={{ ...inputStyle, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Description (optional)</label>
              <input
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Internal note"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Discount type</label>
              <select
                value={form.discount_type}
                onChange={e => setForm({ ...form, discount_type: e.target.value })}
                style={inputStyle}
              >
                <option value="percent">percent</option>
                <option value="amount">amount (USD)</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>
                {form.discount_type === 'percent' ? 'Discount value (%)' : 'Discount value ($)'}
              </label>
              <input
                type="number"
                step={form.discount_type === 'percent' ? '1' : '0.01'}
                value={form.discount_value_display}
                onChange={e => setForm({ ...form, discount_value_display: e.target.value })}
                placeholder={form.discount_type === 'percent' ? '25' : '5.00'}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Duration</label>
              <select
                value={form.duration}
                onChange={e => setForm({ ...form, duration: e.target.value })}
                style={inputStyle}
              >
                {DURATIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          {form.duration === 'repeating' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Duration months</label>
                <input
                  type="number"
                  value={form.duration_months}
                  onChange={e => setForm({ ...form, duration_months: e.target.value })}
                  placeholder="3"
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Max uses total (blank = unlimited)</label>
              <input
                type="number"
                value={form.max_uses}
                onChange={e => setForm({ ...form, max_uses: e.target.value })}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Max uses per user</label>
              <input
                type="number"
                value={form.max_uses_per_user}
                onChange={e => setForm({ ...form, max_uses_per_user: e.target.value })}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Starts at (optional)</label>
              <input
                type="datetime-local"
                value={form.starts_at}
                onChange={e => setForm({ ...form, starts_at: e.target.value })}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Expires at (optional)</label>
              <input
                type="datetime-local"
                value={form.expires_at}
                onChange={e => setForm({ ...form, expires_at: e.target.value })}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Applies to plans (blank = all)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {plans.length === 0 && (
                <div style={{ fontSize: 11, color: C.muted }}>No plans loaded.</div>
              )}
              {plans.map(plan => {
                const on = form.applies_to_plans.includes(plan.id);
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => togglePlanInForm(plan.id)}
                    style={{
                      padding: '5px 10px', borderRadius: 16, fontSize: 11, fontWeight: 600,
                      border: `1px solid ${on ? C.accent : C.border}`,
                      background: on ? C.accent + '22' : 'transparent',
                      color: on ? C.accent : C.dim,
                      cursor: 'pointer',
                    }}
                  >{plan.display_name || plan.name}</button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.soft }}>
              <input
                type="checkbox"
                checked={!!form.is_active}
                onChange={e => setForm({ ...form, is_active: e.target.checked })}
              />
              is_active
            </label>
            <button
              onClick={createPromo}
              disabled={saving || !form.code.trim()}
              style={{
                padding: '10px 22px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
                background: form.code.trim() ? C.accent : C.muted,
                color: '#fff',
                cursor: form.code.trim() && !saving ? 'pointer' : 'default',
              }}
            >{saving ? 'Creating\u2026' : 'Create Code'}</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {['all', 'active', 'expired'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: filter === f ? 700 : 500,
              background: filter === f ? C.white : C.card, color: filter === f ? C.bg : C.dim, cursor: 'pointer',
            }}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
          ))}
        </div>
        <input
          placeholder="Search codes..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.white, fontSize: 11, outline: 'none', width: 200 }}
        />
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr 1fr 1fr 1fr 120px', gap: 8, padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
          {['Code', 'Discount', 'Plans', 'Usage', 'Expires', 'Status', ''].map(h => (
            <div key={h} style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div style={{ padding: '30px 16px', textAlign: 'center', color: C.dim, fontSize: 12 }}>No promo codes found</div>
        )}
        {filtered.map(p => {
          const expired = p.expires_at && new Date(p.expires_at) < new Date();
          const maxUses = p.max_uses;
          const used = p.current_uses || 0;
          const pctUsed = maxUses ? Math.round((used / maxUses) * 100) : null;
          const planIds = Array.isArray(p.applies_to_plans) ? p.applies_to_plans : [];
          return (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr 1fr 1fr 1fr 120px', gap: 8, padding: '12px 16px', borderBottom: `1px solid ${C.border}`, alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 800, color: C.white, letterSpacing: '0.04em', fontFamily: 'monospace' }}>{p.code}</span>
                <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>
                  Created {p.created_at ? p.created_at.split('T')[0] : '\u2014'} &middot; {p.duration}{p.duration === 'repeating' && p.duration_months ? ` (${p.duration_months}mo)` : ''}
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>
                {formatDiscount(p)}
              </div>
              <div style={{ fontSize: 10, color: C.dim }}>
                {planIds.length === 0
                  ? <span style={{ color: C.muted }}>All plans</span>
                  : planIds.map(id => planLabel(id)).join(', ')}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.white }}>{used}{maxUses ? ` / ${maxUses}` : ''}</div>
                {pctUsed !== null && (
                  <div style={{ marginTop: 4, height: 3, background: C.border, borderRadius: 2, overflow: 'hidden', width: 60 }}>
                    <div style={{ width: `${Math.min(pctUsed, 100)}%`, height: '100%', background: pctUsed >= 90 ? C.danger : pctUsed >= 70 ? C.warn : C.accent, borderRadius: 2 }} />
                  </div>
                )}
                {!maxUses && <div style={{ fontSize: 9, color: C.muted }}>Unlimited</div>}
              </div>
              <div style={{ fontSize: 11, color: expired ? C.danger : C.dim }}>
                {p.expires_at ? new Date(p.expires_at).toLocaleDateString() : 'Never'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <StatusDot active={p.is_active && !expired} />
                <span style={{ fontSize: 11, color: (p.is_active && !expired) ? C.success : C.danger }}>
                  {expired ? 'Expired' : p.is_active ? 'Active' : 'Disabled'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => toggleActive(p.id, p.is_active)}
                  style={{
                    fontSize: 10, padding: '5px 10px', borderRadius: 4, border: `1px solid ${C.border}`,
                    background: 'none', color: C.dim, cursor: 'pointer', fontWeight: 600,
                  }}
                >{p.is_active ? 'Off' : 'On'}</button>
                <button
                  onClick={() => deletePromo(p)}
                  style={{
                    fontSize: 10, padding: '5px 10px', borderRadius: 4, border: `1px solid ${C.danger}33`,
                    background: 'none', color: C.danger, cursor: 'pointer', fontWeight: 600,
                  }}
                >Del</button>
              </div>
            </div>
          );
        })}
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
          catch (err) { alert(err?.message || 'Action failed'); }
        }}
      />
    </div>
  );
}
