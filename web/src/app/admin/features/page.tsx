// @admin-verified 2026-04-18
'use client';

// Feature flags admin. DB-driven flags with rollout %, kill switch,
// advanced targeting (JSON). Toggles write-through record_admin_action
// for the audit trail.

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import DestructiveActionConfirm from '@/components/admin/DestructiveActionConfirm';

import Page, { PageHeader } from '@/components/admin/Page';
import DataTable from '@/components/admin/DataTable';
import Toolbar from '@/components/admin/Toolbar';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Textarea from '@/components/admin/Textarea';
import NumberInput from '@/components/admin/NumberInput';
import DatePicker from '@/components/admin/DatePicker';
import Checkbox from '@/components/admin/Checkbox';
import Switch from '@/components/admin/Switch';
import Field from '@/components/admin/Field';
import Drawer from '@/components/admin/Drawer';
import Badge from '@/components/admin/Badge';
import Spinner from '@/components/admin/Spinner';
import EmptyState from '@/components/admin/EmptyState';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type FeatureFlag = Tables<'feature_flags'>;

const KEY_SLUG_RE = /^[a-z0-9_.-]+$/;

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
] as const;

type AdvancedField = typeof ADVANCED_TEXT_FIELDS[number];

interface FlagFormState {
  key: string;
  display_name: string;
  description: string;
  is_enabled: boolean;
  rollout_percentage: number;
  is_killswitch: boolean;
  expires_at: string;
  advanced_json: string;
}

function emptyForm(): FlagFormState {
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

function flagToForm(flag: FeatureFlag): FlagFormState {
  const advancedSlice: Record<string, unknown> = {};
  ADVANCED_TEXT_FIELDS.forEach((k) => {
    const v = (flag as unknown as Record<string, unknown>)[k];
    if (v !== null && v !== undefined) advancedSlice[k] = v;
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

function parseAdvancedJson(text: string):
  | { ok: true; fields: Partial<Record<AdvancedField, unknown>> }
  | { ok: false; error: string } {
  const trimmed = (text || '').trim();
  if (trimmed === '') return { ok: true, fields: {} };
  let parsed: unknown;
  try { parsed = JSON.parse(trimmed); }
  catch (err) { return { ok: false, error: `Invalid JSON: ${(err as Error).message}` }; }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Advanced targeting must be a JSON object.' };
  }
  const fields: Partial<Record<AdvancedField, unknown>> = {};
  for (const k of Object.keys(parsed as Record<string, unknown>)) {
    if (!(ADVANCED_TEXT_FIELDS as readonly string[]).includes(k)) {
      return { ok: false, error: `Unknown targeting field: ${k}` };
    }
    fields[k as AdvancedField] = (parsed as Record<string, unknown>)[k];
  }
  return { ok: true, fields };
}

interface DestructivePayload {
  title: string;
  message: string;
  confirmText: string;
  confirmLabel: string;
  reasonRequired: boolean;
  action: string;
  targetTable: string;
  targetId: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  run: (args: { reason?: string }) => Promise<void>;
}

export default function FeatureFlagsAdmin() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [planTiers, setPlanTiers] = useState<string[]>([]);
  const [cohorts, setCohorts] = useState<Array<{ id: string; name: string }>>([]);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FlagFormState>(emptyForm());
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [destructive, setDestructive] = useState<DestructivePayload | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id);
      const names = ((userRoles || []) as Array<{ roles: { name: string } | null }>)
        .map((r) => r.roles?.name).filter(Boolean) as string[];
      if (!names.some((n) => ['owner', 'admin'].includes(n))) { router.push('/'); return; }
      setAuthorized(true);
      await loadAll();
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    const [flagsRes, plansRes, cohortsRes] = await Promise.all([
      supabase.from('feature_flags').select('*').order('key'),
      supabase.from('plans').select('tier').order('sort_order', { ascending: true }),
      supabase.from('cohorts').select('id, name').order('name', { ascending: true }),
    ]);
    setFlags((flagsRes.data || []) as FeatureFlag[]);
    const tiers = Array.from(
      new Set(((plansRes.data || []) as Array<{ tier: string | null }>).map((p) => p.tier).filter(Boolean)),
    ) as string[];
    setPlanTiers(tiers);
    setCohorts((cohortsRes.data || []) as Array<{ id: string; name: string }>);
  }

  const filtered = search
    ? flags.filter((f) => {
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
  };

  const startEdit = (flag: FeatureFlag) => {
    setFormMode('edit');
    setEditingId(flag.id);
    setForm(flagToForm(flag));
    setShowAdvanced(false);
  };

  const cancelForm = () => {
    setFormMode(null);
    setEditingId(null);
    setForm(emptyForm());
  };

  const updateField = <K extends keyof FlagFormState>(field: K, value: FlagFormState[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const buildRowFromForm = (includeKey: boolean):
    | { ok: true; row: Record<string, unknown> }
    | { ok: false; error: string } => {
    const parsedAdvanced = parseAdvancedJson(form.advanced_json);
    if (parsedAdvanced.ok === false) return { ok: false, error: parsedAdvanced.error };
    const rollout = Number(form.rollout_percentage);
    if (Number.isNaN(rollout) || rollout < 0 || rollout > 100) {
      return { ok: false, error: 'rollout_percentage must be 0–100' };
    }
    const row: Record<string, unknown> = {
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
    const key = form.key.trim();
    if (!key) { toast.push({ message: 'key is required', variant: 'danger' }); return; }
    if (!KEY_SLUG_RE.test(key)) {
      toast.push({ message: 'key must match /^[a-z0-9_.-]+$/', variant: 'danger' });
      return;
    }
    if (!form.display_name.trim()) {
      toast.push({ message: 'display_name is required', variant: 'danger' });
      return;
    }
    const built = buildRowFromForm(true);
    if (built.ok === false) { toast.push({ message: built.error, variant: 'danger' }); return; }
    setSaving(true);
    const { data, error } = await supabase
      .from('feature_flags')
      .upsert(built.row as FeatureFlag, { onConflict: 'key' })
      .select()
      .single();
    setSaving(false);
    if (error) {
      toast.push({ message: `Create failed: ${error.message}`, variant: 'danger' });
      return;
    }
    const row = data as FeatureFlag;
    setFlags((prev) => {
      const existing = prev.findIndex((f) => f.key === row.key);
      if (existing >= 0) {
        const next = prev.slice();
        next[existing] = row;
        return next;
      }
      return [...prev, row].sort((a, b) => a.key.localeCompare(b.key));
    });
    toast.push({ message: `Saved flag "${row.key}"`, variant: 'success' });
    cancelForm();
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!form.display_name.trim()) {
      toast.push({ message: 'display_name is required', variant: 'danger' });
      return;
    }
    const built = buildRowFromForm(false);
    if (built.ok === false) { toast.push({ message: built.error, variant: 'danger' }); return; }
    setSaving(true);
    const { data, error } = await supabase
      .from('feature_flags')
      .update(built.row as FeatureFlag)
      .eq('id', editingId)
      .select()
      .single();
    setSaving(false);
    if (error) {
      toast.push({ message: `Save failed: ${error.message}`, variant: 'danger' });
      return;
    }
    const row = data as FeatureFlag;
    setFlags((prev) => prev.map((f) => f.id === editingId ? row : f));
    toast.push({ message: `Saved flag "${row.key}"`, variant: 'success' });
    cancelForm();
  };

  const toggleEnabled = async (flag: FeatureFlag) => {
    const next = !flag.is_enabled;
    setTogglingKey(flag.key);
    // Optimistic.
    setFlags((prev) => prev.map((f) => f.id === flag.id ? { ...f, is_enabled: next } : f));

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
      setFlags((prev) => prev.map((f) => f.id === flag.id ? { ...f, is_enabled: !next } : f));
      toast.push({ message: `Audit log write failed: ${auditErr.message}`, variant: 'danger' });
      return;
    }
    const { error } = await supabase.from('feature_flags').update({ is_enabled: next }).eq('id', flag.id);
    setTogglingKey(null);
    if (error) {
      setFlags((prev) => prev.map((f) => f.id === flag.id ? { ...f, is_enabled: !next } : f));
      toast.push({ message: `Toggle failed: ${error.message}`, variant: 'danger' });
      return;
    }
    toast.push({ message: next ? `Enabled ${flag.key}` : `Disabled ${flag.key}`, variant: 'success' });
  };

  const toggleKillswitch = async (flag: FeatureFlag) => {
    const next = !flag.is_killswitch;
    setTogglingKey(flag.key);
    setFlags((prev) => prev.map((f) => f.id === flag.id ? { ...f, is_killswitch: next } : f));
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
      setFlags((prev) => prev.map((f) => f.id === flag.id ? { ...f, is_killswitch: !next } : f));
      toast.push({ message: `Audit log write failed: ${auditErr.message}`, variant: 'danger' });
      return;
    }
    const { error } = await supabase.from('feature_flags').update({ is_killswitch: next }).eq('id', flag.id);
    setTogglingKey(null);
    if (error) {
      setFlags((prev) => prev.map((f) => f.id === flag.id ? { ...f, is_killswitch: !next } : f));
      toast.push({ message: `Killswitch toggle failed: ${error.message}`, variant: 'danger' });
      return;
    }
    toast.push({ message: next ? 'Killswitch armed' : 'Killswitch off', variant: 'success' });
  };

  const deleteFlag = (flag: FeatureFlag) => {
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
        const { error } = await supabase.from('feature_flags').delete().eq('id', flag.id);
        if (error) throw new Error(error.message);
        setFlags((prev) => prev.filter((f) => f.id !== flag.id));
        toast.push({ message: `Deleted ${flag.key}`, variant: 'success' });
      },
    });
  };

  if (loading) {
    return (
      <Page>
        <div style={{ padding: S[12], textAlign: 'center', color: ADMIN_C.dim }}>
          <Spinner /> Loading flags
        </div>
      </Page>
    );
  }
  if (!authorized) return null;

  const columns = [
    {
      key: 'key',
      header: 'Key',
      truncate: true,
      render: (f: FeatureFlag) => (
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: F.sm }}>{f.key}</span>
      ),
    },
    {
      key: 'display_name',
      header: 'Display name',
      truncate: true,
    },
    {
      key: 'rollout_percentage',
      header: 'Rollout',
      align: 'right' as const,
      render: (f: FeatureFlag) => `${f.rollout_percentage ?? 0}%`,
    },
    {
      key: 'is_enabled',
      header: 'Enabled',
      sortable: false,
      align: 'center' as const,
      render: (f: FeatureFlag) => (
        <Switch
          checked={!!f.is_enabled}
          disabled={togglingKey === f.key}
          onChange={() => toggleEnabled(f)}
        />
      ),
    },
    {
      key: 'is_killswitch',
      header: 'Kill',
      sortable: false,
      align: 'center' as const,
      render: (f: FeatureFlag) => (
        <button
          onClick={(e) => { e.stopPropagation(); toggleKillswitch(f); }}
          disabled={togglingKey === f.key}
          style={{
            padding: '3px 8px',
            borderRadius: 4,
            fontSize: F.xs,
            fontWeight: 600,
            border: `1px solid ${f.is_killswitch ? ADMIN_C.danger : ADMIN_C.divider}`,
            background: f.is_killswitch ? 'rgba(239,68,68,0.12)' : 'transparent',
            color: f.is_killswitch ? ADMIN_C.danger : ADMIN_C.dim,
            cursor: togglingKey === f.key ? 'default' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {f.is_killswitch ? 'KILL' : 'off'}
        </button>
      ),
    },
    {
      key: 'expires_at',
      header: 'Expires',
      render: (f: FeatureFlag) => {
        if (!f.expires_at) return <span style={{ color: ADMIN_C.muted }}>—</span>;
        const expired = new Date(f.expires_at) < new Date();
        return (
          <span style={{ color: expired ? ADMIN_C.danger : ADMIN_C.white, fontSize: F.sm }}>
            {new Date(f.expires_at).toLocaleDateString()}
          </span>
        );
      },
    },
    {
      key: '_actions',
      header: '',
      sortable: false,
      align: 'right' as const,
      render: (f: FeatureFlag) => (
        <div style={{ display: 'flex', gap: S[1], justifyContent: 'flex-end' }}>
          <Button size="sm" variant="secondary" onClick={(e: React.MouseEvent) => { e.stopPropagation(); startEdit(f); }}>
            Edit
          </Button>
          <Button size="sm" variant="danger" onClick={(e: React.MouseEvent) => { e.stopPropagation(); deleteFlag(f); }}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  const advancedHint = `JSON object. Allowed keys:
${ADVANCED_TEXT_FIELDS.map((k) => `  "${k}"`).join('\n')}

Known plan tiers: ${planTiers.join(', ') || '(none loaded)'}
Known cohorts: ${cohorts.map((c) => c.name).join(', ') || '(none loaded)'}`;

  return (
    <Page maxWidth={1200}>
      <PageHeader
        title="Feature Flags"
        subtitle="DB-driven flags, rollout percentages, and kill switches."
        actions={
          <Button variant="primary" onClick={startCreate}>+ New flag</Button>
        }
      />

      <Toolbar
        left={
          <TextInput
            type="search"
            placeholder="Search key or display name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: '1 1 240px', minWidth: 200 }}
          />
        }
        right={
          <span style={{ fontSize: F.sm, color: ADMIN_C.dim }}>
            {filtered.length} flag{filtered.length === 1 ? '' : 's'}
          </span>
        }
      />

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(f: FeatureFlag) => f.id}
        onRowClick={(f: FeatureFlag) => startEdit(f)}
        empty={
          <EmptyState
            title="No feature flags"
            description={flags.length === 0
              ? 'No feature flags yet. Create one to start gating features.'
              : 'No flags match the current search.'}
            cta={flags.length === 0 ? (
              <Button variant="primary" onClick={startCreate}>+ New flag</Button>
            ) : undefined}
          />
        }
      />

      <Drawer
        open={!!formMode}
        onClose={cancelForm}
        title={formMode === 'create' ? 'New feature flag' : `Edit ${form.key}`}
        width="md"
        footer={
          <>
            <Button variant="ghost" onClick={cancelForm}>Cancel</Button>
            <Button
              variant="primary"
              loading={saving}
              onClick={formMode === 'create' ? createFlag : saveEdit}
            >
              {formMode === 'create' ? 'Create flag' : 'Save changes'}
            </Button>
          </>
        }
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: S[3],
          }}
        >
          <Field label="Key" hint="lowercase, digits, _ . -" required>
            {formMode === 'create' ? (
              <TextInput
                value={form.key}
                onChange={(e) => updateField('key', e.target.value.toLowerCase())}
                placeholder="feature.name_here"
                style={{ fontFamily: 'ui-monospace, monospace' }}
              />
            ) : (
              <div
                style={{
                  padding: '6px 10px',
                  border: `1px solid ${ADMIN_C.divider}`,
                  borderRadius: 6,
                  background: ADMIN_C.card,
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: F.base,
                  color: ADMIN_C.dim,
                }}
              >
                {form.key} <Badge variant="ghost" size="xs" style={{ marginLeft: S[1] }}>immutable</Badge>
              </div>
            )}
          </Field>
          <Field label="Display name" required>
            <TextInput
              value={form.display_name}
              onChange={(e) => updateField('display_name', e.target.value)}
              placeholder="Human-readable label"
            />
          </Field>
        </div>

        <Field label="Description">
          <Textarea
            rows={2}
            value={form.description}
            onChange={(e) => updateField('description', e.target.value)}
          />
        </Field>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: S[3],
          }}
        >
          <Field label="Rollout %">
            <NumberInput
              min={0}
              max={100}
              value={form.rollout_percentage}
              onChange={(e) => updateField('rollout_percentage', parseInt(e.target.value, 10) || 0)}
            />
          </Field>
          <Field label="Expires at">
            <DatePicker
              includeTime
              value={form.expires_at}
              onChange={(e) => updateField('expires_at', e.target.value)}
            />
          </Field>
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2], paddingTop: 20 }}>
            <Checkbox
              label="is_enabled"
              checked={!!form.is_enabled}
              onChange={(e) => updateField('is_enabled', (e.target as HTMLInputElement).checked)}
            />
            <Checkbox
              label="is_killswitch"
              checked={!!form.is_killswitch}
              onChange={(e) => updateField('is_killswitch', (e.target as HTMLInputElement).checked)}
            />
          </div>
        </div>

        <div style={{ marginTop: S[2] }}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? 'Hide advanced targeting' : 'Advanced targeting (JSON)'}
          </Button>
          {showAdvanced && (
            <Field label="Advanced targeting (JSON)" hint={advancedHint} style={{ marginTop: S[2] }}>
              <Textarea
                rows={10}
                value={form.advanced_json}
                onChange={(e) => updateField('advanced_json', e.target.value)}
                style={{ fontFamily: 'ui-monospace, monospace', fontSize: F.sm, whiteSpace: 'pre' }}
              />
            </Field>
          )}
        </div>
      </Drawer>

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
        onConfirm={async ({ reason }: { reason?: string }) => {
          try { await destructive?.run?.({ reason }); setDestructive(null); }
          catch (err) {
            toast.push({ message: (err as Error)?.message || 'Action failed', variant: 'danger' });
            setDestructive(null);
          }
        }}
      />
    </Page>
  );
}
