'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

import { ADMIN_C as C } from '@/lib/adminPalette';

const INITIAL_PLAN_FORM = {
  price_cents: 0,
  billing_period: '',
  trial_days: 0,
  is_visible: true,
  sort_order: 0,
  description: '',
};

const BILLING_PERIODS = ['', 'monthly', 'annual', 'lifetime'];

function centsToDollars(c) { return (Number(c) || 0) / 100; }

function planToForm(p) {
  return {
    price_cents: p?.price_cents ?? 0,
    billing_period: p?.billing_period || '',
    trial_days: p?.trial_days ?? 0,
    is_visible: !!p?.is_visible,
    sort_order: p?.sort_order ?? 0,
    description: p?.description || '',
  };
}

export default function PlansAdmin() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [plans, setPlans] = useState([]);
  const [features, setFeatures] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [planForm, setPlanForm] = useState(INITIAL_PLAN_FORM);
  const [planDirty, setPlanDirty] = useState(false);
  const [priceDirty, setPriceDirty] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingFeatureKey, setSavingFeatureKey] = useState(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  const [newFeatureKey, setNewFeatureKey] = useState('');
  const [newFeatureName, setNewFeatureName] = useState('');
  const [newFeatureLimit, setNewFeatureLimit] = useState('');
  const [addingFeature, setAddingFeature] = useState(false);

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
    const [plansRes, featuresRes] = await Promise.all([
      supabase
        .from('plans')
        .select('id, name, display_name, tier, billing_period, price_cents, currency, trial_days, is_active, is_visible, sort_order, description')
        .order('sort_order', { ascending: true })
        .order('tier', { ascending: true }),
      supabase
        .from('plan_features')
        .select('plan_id, feature_key, feature_name, is_enabled, limit_value, limit_type'),
    ]);
    const nextPlans = plansRes.data || [];
    setPlans(nextPlans);
    setFeatures(featuresRes.data || []);
    setSelectedPlanId(prev => {
      if (prev && nextPlans.some(p => p.id === prev)) return prev;
      const first = nextPlans[0]?.id || null;
      if (first) setPlanForm(planToForm(nextPlans[0]));
      return first;
    });
  }

  const selected = plans.find(p => p.id === selectedPlanId) || null;
  const planFeatures = features
    .filter(f => f.plan_id === selectedPlanId)
    .sort((a, b) => a.feature_key.localeCompare(b.feature_key));

  const selectPlan = (id) => {
    if (planDirty && !confirm('Discard unsaved pricing changes?')) return;
    const p = plans.find(x => x.id === id);
    setSelectedPlanId(id);
    setPlanForm(p ? planToForm(p) : INITIAL_PLAN_FORM);
    setPlanDirty(false);
    setPriceDirty(false);
    setError('');
    setFlash('');
  };

  const updatePlanField = (field, value) => {
    setPlanForm(prev => ({ ...prev, [field]: value }));
    setPlanDirty(true);
    if (field === 'price_cents') setPriceDirty(true);
    setFlash('');
  };

  const savePlan = async () => {
    if (!selected) return;
    setError(''); setFlash(''); setSavingPlan(true);
    const patch = {
      price_cents: Number(planForm.price_cents) || 0,
      billing_period: planForm.billing_period || null,
      trial_days: Number(planForm.trial_days) || 0,
      is_visible: !!planForm.is_visible,
      sort_order: Number(planForm.sort_order) || 0,
      description: planForm.description || null,
    };
    const { error: err } = await supabase
      .from('plans')
      .update(patch)
      .eq('id', selected.id);
    setSavingPlan(false);
    if (err) { setError(`Save failed: ${err.message}`); return; }
    setPlans(prev => prev.map(p => p.id === selected.id ? { ...p, ...patch } : p));
    setPlanDirty(false);
    setPriceDirty(false);
    setFlash('Saved.');
  };

  const upsertFeature = async (feature, patch) => {
    setSavingFeatureKey(feature.feature_key);
    const row = {
      plan_id: feature.plan_id,
      feature_key: feature.feature_key,
      feature_name: feature.feature_name,
      is_enabled: feature.is_enabled,
      limit_value: feature.limit_value,
      limit_type: feature.limit_type,
      ...patch,
    };
    const { error: err } = await supabase
      .from('plan_features')
      .upsert(row, { onConflict: 'plan_id,feature_key' });
    setSavingFeatureKey(null);
    if (err) { setError(`Save failed: ${err.message}`); return false; }
    setFeatures(prev => prev.map(f =>
      f.plan_id === feature.plan_id && f.feature_key === feature.feature_key
        ? { ...f, ...patch }
        : f,
    ));
    return true;
  };

  const toggleFeatureEnabled = (feature, next) => upsertFeature(feature, { is_enabled: next });

  const updateLimit = (feature, rawValue) => {
    const trimmed = String(rawValue).trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    if (parsed !== null && Number.isNaN(parsed)) { setError('Limit must be a number or empty'); return; }
    if ((feature.limit_value ?? null) === parsed) return;
    upsertFeature(feature, { limit_value: parsed });
  };

  const addFeature = async () => {
    if (!selected) return;
    const key = newFeatureKey.trim();
    const name = newFeatureName.trim();
    if (!key || !name) { setError('feature_key AND feature_name are required'); return; }
    if (planFeatures.some(f => f.feature_key === key)) { setError('feature_key already exists on this plan'); return; }
    const trimmedLimit = newFeatureLimit.trim();
    if (trimmedLimit !== '' && Number.isNaN(Number(trimmedLimit))) { setError('Limit must be a number or empty'); return; }
    setAddingFeature(true); setError('');
    const row = {
      plan_id: selected.id,
      feature_key: key,
      feature_name: name,
      is_enabled: true,
      limit_value: trimmedLimit === '' ? null : Number(trimmedLimit),
    };
    const { data, error: err } = await supabase
      .from('plan_features')
      .insert(row)
      .select()
      .single();
    setAddingFeature(false);
    if (err) { setError(`Add feature failed: ${err.message}`); return; }
    setFeatures(prev => [...prev, data]);
    setNewFeatureKey(''); setNewFeatureName(''); setNewFeatureLimit('');
  };

  const removeFeature = async (feature) => {
    if (!confirm(`Remove feature "${feature.feature_key}" from ${selected?.display_name}?`)) return;
    const { error: err } = await supabase
      .from('plan_features')
      .delete()
      .eq('plan_id', feature.plan_id)
      .eq('feature_key', feature.feature_key);
    if (err) { setError(`Remove failed: ${err.message}`); return; }
    setFeatures(prev => prev.filter(f => !(f.plan_id === feature.plan_id && f.feature_key === feature.feature_key)));
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <div style={{ fontSize: 13, color: C.dim }}>Loading...</div>
      </div>
    );
  }
  if (!authorized) return null;

  const inputStyle = {
    width: '100%', padding: '8px 10px', fontSize: 13, color: C.white,
    backgroundColor: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  };
  const labelStyle = {
    display: 'block', fontSize: 10, fontWeight: 600, color: C.muted,
    marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em',
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', display: 'flex' }}>
      <nav style={{ width: 240, flexShrink: 0, position: 'sticky', top: 0, height: '100vh', overflowY: 'auto', borderRight: `1px solid ${C.border}`, background: C.bg }}>
        <div style={{ padding: '16px 12px 10px' }}>
          <a href="/admin" style={{ fontSize: 11, color: C.dim, textDecoration: 'none' }}>Back to hub</a>
          <h1 style={{ fontSize: 16, fontWeight: 700, margin: '8px 0 4px', letterSpacing: '-0.02em' }}>Plan Management</h1>
          <div style={{ fontSize: 10, color: C.muted }}>{plans.length} plans</div>
        </div>
        <div style={{ padding: '0 8px 12px' }}>
          {plans.map(p => {
            const active = p.id === selectedPlanId;
            return (
              <button key={p.id} onClick={() => selectPlan(p.id)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%',
                padding: '8px 10px', marginBottom: 4,
                borderRadius: 8, border: `1px solid ${active ? C.accent : C.border}`,
                background: active ? C.accent + '10' : C.card, cursor: 'pointer',
                textAlign: 'left',
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.white }}>{p.display_name || p.name}</div>
                <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>
                  {p.tier} &middot; {p.billing_period || '—'} &middot; ${centsToDollars(p.price_cents).toFixed(2)} {p.currency || 'USD'}
                </div>
                {!p.is_visible && (
                  <div style={{ fontSize: 9, color: C.warn, marginTop: 2 }}>hidden</div>
                )}
              </button>
            );
          })}
          {plans.length === 0 && (
            <div style={{ fontSize: 11, color: C.muted, padding: 12 }}>No plans in DB.</div>
          )}
        </div>
      </nav>

      <div style={{ flex: 1, minWidth: 0, padding: '24px 28px 100px', maxWidth: 900, overflowY: 'auto' }}>
        {!selected ? (
          <div style={{ padding: 40, color: C.dim, textAlign: 'center' }}>Pick a plan from the sidebar.</div>
        ) : (
          <>
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>{selected.display_name}</h2>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>
                name: <span style={{ fontFamily: 'monospace' }}>{selected.name}</span> &middot; tier: {selected.tier}
              </div>
            </div>

            {error && (
              <div style={{ padding: 10, marginBottom: 12, background: '#fee', border: '1px solid #fbb', borderRadius: 8, color: '#900', fontSize: 12 }}>{error}</div>
            )}
            {flash && (
              <div style={{ padding: 10, marginBottom: 12, background: C.success + '22', border: `1px solid ${C.success}55`, borderRadius: 8, color: C.success, fontSize: 12 }}>{flash}</div>
            )}

            {/* Pricing & display */}
            <section style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Pricing &amp; display</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>Price (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={centsToDollars(planForm.price_cents)}
                    onChange={e => updatePlanField('price_cents', Math.round((parseFloat(e.target.value) || 0) * 100))}
                    style={inputStyle}
                  />
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>Stored as {planForm.price_cents} cents</div>
                </div>
                <div>
                  <label style={labelStyle}>Billing period</label>
                  <select
                    value={planForm.billing_period || ''}
                    onChange={e => updatePlanField('billing_period', e.target.value)}
                    style={inputStyle}
                  >
                    {BILLING_PERIODS.map(bp => (
                      <option key={bp || 'none'} value={bp}>{bp || '— none —'}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Trial days</label>
                  <input
                    type="number"
                    value={planForm.trial_days}
                    onChange={e => updatePlanField('trial_days', parseInt(e.target.value, 10) || 0)}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.soft }}>
                  <input
                    type="checkbox"
                    checked={!!planForm.is_visible}
                    onChange={e => updatePlanField('is_visible', e.target.checked)}
                  />
                  is_visible (shown on marketing page)
                </label>
                <div>
                  <label style={labelStyle}>Sort order</label>
                  <input
                    type="number"
                    value={planForm.sort_order}
                    onChange={e => updatePlanField('sort_order', parseInt(e.target.value, 10) || 0)}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Description</label>
                <textarea
                  rows={2}
                  value={planForm.description || ''}
                  onChange={e => updatePlanField('description', e.target.value)}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              {priceDirty && (
                <div style={{ padding: 10, marginBottom: 10, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, color: '#92400e', fontSize: 12 }}>
                  Changing price does not update Stripe. Update <span style={{ fontFamily: 'monospace' }}>stripe_price_id</span> manually after creating a new Stripe price.
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  onClick={savePlan}
                  disabled={!planDirty || savingPlan}
                  style={{
                    padding: '8px 18px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
                    background: planDirty ? C.white : C.card, color: planDirty ? C.bg : C.muted,
                    cursor: planDirty && !savingPlan ? 'pointer' : 'default',
                  }}
                >{savingPlan ? 'Saving\u2026' : planDirty ? 'Save pricing' : 'No changes'}</button>
              </div>
            </section>

            {/* Features */}
            <section style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Features ({planFeatures.length})</div>
                <div style={{ fontSize: 11, color: C.muted }}>Toggles persist immediately.</div>
              </div>

              {planFeatures.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: C.muted, fontSize: 12 }}>
                  No features assigned to this plan.
                </div>
              ) : (
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px 90px 90px', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${C.border}`, background: C.bg, fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase' }}>
                    <div>feature_key</div>
                    <div>feature_name</div>
                    <div>limit_value</div>
                    <div style={{ textAlign: 'center' }}>is_enabled</div>
                    <div></div>
                  </div>
                  {planFeatures.map((f, i) => (
                    <div key={f.feature_key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px 90px 90px', gap: 8, padding: '8px 12px', borderBottom: i < planFeatures.length - 1 ? `1px solid ${C.border}` : 'none', alignItems: 'center' }}>
                      <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{f.feature_key}</div>
                      <div style={{ fontSize: 12 }}>{f.feature_name}</div>
                      <div>
                        <input
                          key={`${f.feature_key}:${f.limit_value ?? ''}`}
                          type="number"
                          defaultValue={f.limit_value ?? ''}
                          onBlur={e => updateLimit(f, e.target.value)}
                          placeholder="—"
                          style={{ ...inputStyle, padding: '4px 6px', fontSize: 12, width: '100%' }}
                        />
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={!!f.is_enabled}
                          disabled={savingFeatureKey === f.feature_key}
                          onChange={e => toggleFeatureEnabled(f, e.target.checked)}
                        />
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => removeFeature(f)}
                          style={{ padding: '4px 10px', borderRadius: 5, border: 'none', background: '#dc2626', color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                        >Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ padding: 12, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.dim, marginBottom: 8, textTransform: 'uppercase' }}>Add feature to this plan</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 90px', gap: 8 }}>
                  <input
                    value={newFeatureKey}
                    onChange={e => setNewFeatureKey(e.target.value)}
                    placeholder="feature_key (required)"
                    style={inputStyle}
                  />
                  <input
                    value={newFeatureName}
                    onChange={e => setNewFeatureName(e.target.value)}
                    placeholder="feature_name (required)"
                    style={inputStyle}
                  />
                  <input
                    value={newFeatureLimit}
                    onChange={e => setNewFeatureLimit(e.target.value)}
                    placeholder="limit (opt)"
                    type="number"
                    style={inputStyle}
                  />
                  <button
                    onClick={addFeature}
                    disabled={addingFeature || !newFeatureKey.trim() || !newFeatureName.trim()}
                    style={{
                      padding: '8px 12px', borderRadius: 8, border: 'none',
                      background: (newFeatureKey.trim() && newFeatureName.trim()) ? C.accent : C.card,
                      color: (newFeatureKey.trim() && newFeatureName.trim()) ? '#fff' : C.muted,
                      fontSize: 12, fontWeight: 700,
                      cursor: (newFeatureKey.trim() && newFeatureName.trim() && !addingFeature) ? 'pointer' : 'default',
                    }}
                  >{addingFeature ? 'Adding\u2026' : 'Add'}</button>
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>
                  Both <span style={{ fontFamily: 'monospace' }}>feature_key</span> and <span style={{ fontFamily: 'monospace' }}>feature_name</span> are NOT NULL on plan_features.
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
