'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import DestructiveActionConfirm from '@/components/DestructiveActionConfirm';

import { ADMIN_C as C } from '@/lib/adminPalette';

const KEY_SLUG_RE = /^[a-z0-9_.-]+$/;

const SIMPLE_FIELDS = [
  'description',
  'is_enabled',
  'rollout_percentage',
  'is_killswitch',
  'expires_at',
];

const ADVANCED_TEXT_FIELDS = [
  'target_platforms',
  'target_min_app_version',
  'target_max_app_version',
  'target_min_os_version',
  'target_user_ids',
  'target_plan_tiers',
  'target_countries',
  'target_cohort_ids',
  'conditions',
  'variant',
];

function emptyForm() {
  return {
    key: '',
    display_name: '',
    description: '',
    is_enabled: false,
    rollout_percentage: 0,
    is_killswitch: false,
    expires_at: '',
    advanced_json: '',
  };
}

function flagToForm(flag) {
  const advancedSlice = {};
  ADVANCED_TEXT_FIELDS.forEach(k => {
    if (flag[k] !== null && flag[k] !== undefined) advancedSlice[k] = flag[k];
  });
  return {
    key: flag.key || '',
    display_name: flag.display_name || '',
    description: flag.description || '',
    is_enabled: !!flag.is_enabled,
    rollout_percentage: Number(flag.rollout_percentage) || 0,
    is_killswitch: !!flag.is_killswitch,
    expires_at: flag.expires_at ? flag.expires_at.slice(0, 16) : '',
    advanced_json: Object.keys(advancedSlice).length > 0
      ? JSON.stringify(advancedSlice, null, 2)
      : '',
  };
}

function parseAdvancedJson(text) {
  const trimmed = (text || '').trim();
  if (trimmed === '') return { ok: true, fields: {} };
  let parsed;
  try { parsed = JSON.parse(trimmed); }
  catch (err) { return { ok: false, error: `Invalid JSON: ${err.message}` }; }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Advanced targeting must be a JSON object.' };
  }
  const fields = {};
  for (const k of Object.keys(parsed)) {
    if (!ADVANCED_TEXT_FIELDS.includes(k)) {
      return { ok: false, error: `Unknown targeting field: ${k}` };
    }
    fields[k] = parsed[k];
  }
  return { ok: true, fields };
}

export default function FeatureFlagsAdmin() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [flags, setFlags] = useState([]);
  const [planTiers, setPlanTiers] = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [formMode, setFormMode] = useState(null); // 'create' | 'edit'
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingKey, setTogglingKey] = useState(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
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
    const [flagsRes, plansRes, cohortsRes] = await Promise.all([
      supabase
        .from('feature_flags')
        .select('id, key, display_name, description, is_enabled, rollout_percentage, target_platforms, target_min_app_version, target_max_app_version, target_min_os_version, target_user_ids, target_plan_tiers, target_countries, target_cohort_ids, conditions, variant, is_killswitch, expires_at, metadata, created_at, updated_at')
        .order('key'),
      supabase
        .from('plans')
        .select('tier')
        .order('sort_order', { ascending: true }),
      supabase
        .from('cohorts')
        .select('id, name')
        .order('name', { ascending: true }),
    ]);
    setFlags(flagsRes.data || []);
    const tiers = Array.from(new Set((plansRes.data || []).map(p => p.tier).filter(Boolean)));
    setPlanTiers(tiers);
    setCohorts(cohortsRes.data || []);
  }

  const filtered = search
    ? flags.filter(f => {
        const q = search.toLowerCase();
        return (f.key || '').toLowerCase().includes(q)
          || (f.display_name || '').toLowerCase().includes(q);
      })
    : flags;

  const startCreate = () => {
    setFormMode('create');
    setEditingId(null);
    setForm(emptyForm());
    setShowAdvanced(false);
    setError(''); setFlash('');
  };

  const startEdit = (flag) => {
    setFormMode('edit');
    setEditingId(flag.id);
    setForm(flagToForm(flag));
    setShowAdvanced(false);
    setError(''); setFlash('');
  };

  const cancelForm = () => {
    setFormMode(null);
    setEditingId(null);
    setForm(emptyForm());
    setError(''); setFlash('');
  };

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const buildRowFromForm = (includeKey) => {
    const parsedAdvanced = parseAdvancedJson(form.advanced_json);
    if (!parsedAdvanced.ok) { return { ok: false, error: parsedAdvanced.error }; }
    const rollout = Number(form.rollout_percentage);
    if (Number.isNaN(rollout) || rollout < 0 || rollout > 100) {
      return { ok: false, error: 'rollout_percentage must be 0\u2013100' };
    }
    const row = {
      display_name: form.display_name.trim(),
      description: form.description.trim() || null,
      is_enabled: !!form.is_enabled,
      rollout_percentage: rollout,
      is_killswitch: !!form.is_killswitch,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      ...parsedAdvanced.fields,
    };
    if (includeKey) row.key = form.key.trim();
    return { ok: true, row };
  };

  const createFlag = async () => {
    setError(''); setFlash('');
    const key = form.key.trim();
    if (!key) { setError('key is required'); return; }
    if (!KEY_SLUG_RE.test(key)) { setError('key must match /^[a-z0-9_.-]+$/'); return; }
    if (!form.display_name.trim()) { setError('display_name is required'); return; }
    const built = buildRowFromForm(true);
    if (!built.ok) { setError(built.error); return; }
    setSaving(true);
    const { data, error: err } = await supabase
      .from('feature_flags')
      .upsert(built.row, { onConflict: 'key' })
      .select()
      .single();
    setSaving(false);
    if (err) { setError(`Create failed: ${err.message}`); return; }
    setFlags(prev => {
      const existing = prev.findIndex(f => f.key === data.key);
      if (existing >= 0) {
        const next = prev.slice();
        next[existing] = data;
        return next;
      }
      return [...prev, data].sort((a, b) => a.key.localeCompare(b.key));
    });
    setFlash(`Saved flag "${data.key}".`);
    cancelForm();
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setError(''); setFlash('');
    if (!form.display_name.trim()) { setError('display_name is required'); return; }
    const built = buildRowFromForm(false);
    if (!built.ok) { setError(built.error); return; }
    setSaving(true);
    const { data, error: err } = await supabase
      .from('feature_flags')
      .update(built.row)
      .eq('id', editingId)
      .select()
      .single();
    setSaving(false);
    if (err) { setError(`Save failed: ${err.message}`); return; }
    setFlags(prev => prev.map(f => f.id === editingId ? data : f));
    setFlash(`Saved flag "${data.key}".`);
    cancelForm();
  };

  const toggleEnabled = async (flag) => {
    const next = !flag.is_enabled;
    setTogglingKey(flag.key);
    const { error: auditErr } = await supabase.rpc('record_admin_action', {
      p_action: 'feature.toggle',
      p_target_table: 'feature_flags',
      p_target_id: flag.id,
      p_reason: null,
      p_old_value: { is_enabled: !!flag.is_enabled, key: flag.key },
      p_new_value: { is_enabled: next, key: flag.key },
    });
    if (auditErr) {
      setTogglingKey(null);
      setError(`Audit log write failed: ${auditErr.message}`);
      return;
    }
    const { error: err } = await supabase
      .from('feature_flags')
      .update({ is_enabled: next })
      .eq('id', flag.id);
    setTogglingKey(null);
    if (err) { setError(`Toggle failed: ${err.message}`); return; }
    setFlags(prev => prev.map(f => f.id === flag.id ? { ...f, is_enabled: next } : f));
  };

  const toggleKillswitch = async (flag) => {
    const next = !flag.is_killswitch;
    setTogglingKey(flag.key);
    const { error: auditErr } = await supabase.rpc('record_admin_action', {
      p_action: 'feature.killswitch',
      p_target_table: 'feature_flags',
      p_target_id: flag.id,
      p_reason: null,
      p_old_value: { is_killswitch: !!flag.is_killswitch, key: flag.key },
      p_new_value: { is_killswitch: next, key: flag.key },
    });
    if (auditErr) {
      setTogglingKey(null);
      setError(`Audit log write failed: ${auditErr.message}`);
      return;
    }
    const { error: err } = await supabase
      .from('feature_flags')
      .update({ is_killswitch: next })
      .eq('id', flag.id);
    setTogglingKey(null);
    if (err) { setError(`Killswitch toggle failed: ${err.message}`); return; }
    setFlags(prev => prev.map(f => f.id === flag.id ? { ...f, is_killswitch: next } : f));
  };

  const deleteFlag = (flag) => {
    setDestructive({
      title: `Delete feature flag "${flag.key}"?`,
      message: 'This permanently removes the flag. Any client code checking this key will fall back to the default (off).',
      confirmText: flag.key,
      confirmLabel: 'Delete flag',
      reasonRequired: false,
      action: 'feature.delete',
      targetTable: 'feature_flags',
      targetId: flag.id,
      oldValue: {
        key: flag.key,
        display_name: flag.display_name,
        is_enabled: flag.is_enabled,
        rollout_percentage: flag.rollout_percentage,
        is_killswitch: flag.is_killswitch,
        target_plan_tiers: flag.target_plan_tiers,
        target_platforms: flag.target_platforms,
      },
      newValue: null,
      run: async () => {
        const { error: err } = await supabase.from('feature_flags').delete().eq('id', flag.id);
        if (err) throw new Error(err.message);
        setFlags(prev => prev.filter(f => f.id !== flag.id));
      },
    });
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

  const advancedHint = `JSON object. Allowed keys:
${ADVANCED_TEXT_FIELDS.map(k => `  "${k}"`).join('\n')}

Known plan tiers: ${planTiers.join(', ') || '(none loaded)'}
Known cohorts: ${cohorts.map(c => c.name).join(', ') || '(none loaded)'}`;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '24px 28px 80px', maxWidth: 980, margin: '0 auto' }}>
      <a href="/admin" style={{ fontSize: 11, color: C.dim, textDecoration: 'none' }}>Back to hub</a>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 8, marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Feature Flags</h1>
          <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>DB-driven flags, rollout percentages, and kill switches (v2 schema)</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={startCreate}
            style={{
              padding: '10px 20px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: C.white, color: C.bg, cursor: 'pointer',
            }}
          >+ New flag</button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 10, marginBottom: 12, background: '#fee', border: '1px solid #fbb', borderRadius: 8, color: '#900', fontSize: 12 }}>{error}</div>
      )}
      {flash && (
        <div style={{ padding: 10, marginBottom: 12, background: C.success + '22', border: `1px solid ${C.success}55`, borderRadius: 8, color: C.success, fontSize: 12 }}>{flash}</div>
      )}

      {formMode && (
        <div style={{ background: C.card, border: `1px solid ${C.accent}44`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
            {formMode === 'create' ? 'New feature flag' : `Editing flag: ${form.key}`}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Key</label>
              {formMode === 'create' ? (
                <input
                  value={form.key}
                  onChange={e => updateField('key', e.target.value.toLowerCase())}
                  placeholder="feature.name_here"
                  style={{ ...inputStyle, fontFamily: 'monospace' }}
                />
              ) : (
                <div style={{ ...inputStyle, fontFamily: 'monospace', color: C.dim, background: C.card }}>
                  {form.key} <span style={{ fontSize: 10, color: C.muted, marginLeft: 6 }}>(immutable)</span>
                </div>
              )}
              <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>
                lowercase, digits, underscore, dot, hyphen only
              </div>
            </div>
            <div>
              <label style={labelStyle}>Display name</label>
              <input
                value={form.display_name}
                onChange={e => updateField('display_name', e.target.value)}
                placeholder="Human-readable label"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={e => updateField('description', e.target.value)}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Rollout percentage</label>
              <input
                type="number"
                min={0}
                max={100}
                value={form.rollout_percentage}
                onChange={e => updateField('rollout_percentage', parseInt(e.target.value, 10) || 0)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Expires at (optional)</label>
              <input
                type="datetime-local"
                value={form.expires_at}
                onChange={e => updateField('expires_at', e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.soft }}>
                <input
                  type="checkbox"
                  checked={!!form.is_enabled}
                  onChange={e => updateField('is_enabled', e.target.checked)}
                />
                is_enabled
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.soft }}>
                <input
                  type="checkbox"
                  checked={!!form.is_killswitch}
                  onChange={e => updateField('is_killswitch', e.target.checked)}
                />
                is_killswitch
              </label>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setShowAdvanced(v => !v)}
              style={{
                padding: '6px 12px', border: `1px solid ${C.border}`, borderRadius: 6,
                background: 'none', color: C.dim, fontSize: 11, cursor: 'pointer',
              }}
            >{showAdvanced ? 'Hide advanced targeting' : 'Advanced targeting (JSON)'}</button>
            {showAdvanced && (
              <div style={{ marginTop: 10 }}>
                <label style={labelStyle}>Advanced targeting (JSON)</label>
                <textarea
                  rows={10}
                  value={form.advanced_json}
                  onChange={e => updateField('advanced_json', e.target.value)}
                  placeholder={advancedHint}
                  style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12, resize: 'vertical', whiteSpace: 'pre' }}
                />
                <div style={{ fontSize: 10, color: C.muted, marginTop: 3, whiteSpace: 'pre-wrap' }}>{advancedHint}</div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              onClick={cancelForm}
              style={{
                padding: '8px 16px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12,
                background: 'none', color: C.dim, cursor: 'pointer',
              }}
            >Cancel</button>
            <button
              onClick={formMode === 'create' ? createFlag : saveEdit}
              disabled={saving}
              style={{
                padding: '8px 18px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
                background: C.accent, color: '#fff', cursor: saving ? 'default' : 'pointer',
              }}
            >{saving ? 'Saving\u2026' : (formMode === 'create' ? 'Create flag' : 'Save changes')}</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <input
          placeholder="Search key or display name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.white, fontSize: 12, outline: 'none' }}
        />
        <span style={{ fontSize: 11, color: C.dim, whiteSpace: 'nowrap' }}>{filtered.length} flag{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.6fr 90px 90px 80px 140px 150px', gap: 8, padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: C.bg }}>
          {['Key', 'Display name', 'Rollout', 'Enabled', 'Kill', 'Expires', ''].map(h => (
            <div key={h} style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
          ))}
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: C.muted, fontSize: 12 }}>
            {flags.length === 0 ? 'No feature flags yet. Create one with + New flag.' : 'No flags match the search.'}
          </div>
        )}
        {filtered.map((flag, i) => {
          const expired = flag.expires_at && new Date(flag.expires_at) < new Date();
          return (
            <div key={flag.id} style={{
              display: 'grid', gridTemplateColumns: '2fr 1.6fr 90px 90px 80px 140px 150px', gap: 8,
              padding: '10px 16px', borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none',
              alignItems: 'center',
            }}>
              <div style={{ fontFamily: 'monospace', fontSize: 12, color: C.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {flag.key}
              </div>
              <div style={{ fontSize: 12, color: C.soft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {flag.display_name}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.white }}>{flag.rollout_percentage ?? 0}%</div>
              <div>
                <button
                  onClick={() => toggleEnabled(flag)}
                  disabled={togglingKey === flag.key}
                  style={{ background: 'none', border: 'none', cursor: togglingKey === flag.key ? 'default' : 'pointer', padding: 0 }}
                  aria-label={flag.is_enabled ? 'Disable' : 'Enable'}
                >
                  <div style={{ width: 32, height: 18, borderRadius: 9, background: flag.is_enabled ? C.success : '#333', position: 'relative', transition: 'background 0.15s' }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: flag.is_enabled ? '#fff' : '#666', position: 'absolute', top: 2, left: flag.is_enabled ? 16 : 2, transition: 'left 0.15s' }} />
                  </div>
                </button>
              </div>
              <div>
                <button
                  onClick={() => toggleKillswitch(flag)}
                  disabled={togglingKey === flag.key}
                  style={{
                    padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                    border: `1px solid ${flag.is_killswitch ? C.danger : C.border}`,
                    background: flag.is_killswitch ? C.danger + '22' : 'none',
                    color: flag.is_killswitch ? C.danger : C.dim,
                    cursor: togglingKey === flag.key ? 'default' : 'pointer',
                  }}
                  title="Toggle killswitch"
                >{flag.is_killswitch ? 'KILL' : 'off'}</button>
              </div>
              <div style={{ fontSize: 10, color: expired ? C.danger : C.dim }}>
                {flag.expires_at ? new Date(flag.expires_at).toLocaleDateString() : '\u2014'}
              </div>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => startEdit(flag)}
                  style={{ padding: '4px 10px', borderRadius: 4, border: `1px solid ${C.border}`, background: 'none', color: C.dim, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                >Edit</button>
                <button
                  onClick={() => deleteFlag(flag)}
                  style={{ padding: '4px 10px', borderRadius: 4, border: `1px solid ${C.danger}33`, background: 'none', color: C.danger, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                >Delete</button>
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
          catch (err) { setError(err?.message || 'Action failed'); setDestructive(null); }
        }}
      />
    </div>
  );
}
