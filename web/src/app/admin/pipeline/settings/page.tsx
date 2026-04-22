'use client';

// Pipeline settings admin page (F7 Phase 4 Task 29). Four sections:
// kill switches, cost caps, cluster/story-match/plagiarism thresholds,
// default category dropdown. Round-trips through the existing
// /api/admin/settings PATCH endpoint — no new backend. Keys are the
// 12 tracked pipeline.* + ai.* rows in the settings table; category
// list reads live from the categories table so new additions show up
// without a code change.

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_ROLES } from '@/lib/roles';

import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import NumberInput from '@/components/admin/NumberInput';
import Select from '@/components/admin/Select';
import Spinner from '@/components/admin/Spinner';
import EmptyState from '@/components/admin/EmptyState';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type Setting = Tables<'settings'>;
type Category = Pick<Tables<'categories'>, 'id' | 'name' | 'slug'>;
type DraftMap = Record<string, string>;

const KILL_SWITCH_KEYS = [
  'ai.ingest_enabled',
  'ai.adult_generation_enabled',
  'ai.kid_generation_enabled',
] as const;

const COST_CAP_KEYS = [
  'pipeline.daily_cost_usd_cap',
  'pipeline.per_run_cost_usd_cap',
  'pipeline.daily_cost_soft_alert_pct',
] as const;

const THRESHOLD_KEYS = [
  'pipeline.cluster_overlap_pct',
  'pipeline.story_match_overlap_pct',
  'pipeline.plagiarism_ngram_size',
  'pipeline.plagiarism_flag_pct',
  'pipeline.plagiarism_rewrite_pct',
] as const;

const DEFAULT_CATEGORY_KEY = 'pipeline.default_category_id';

// Keys whose numeric values must be within 0-100 (percentages).
const PERCENT_KEYS = new Set<string>([
  'pipeline.daily_cost_soft_alert_pct',
  'pipeline.cluster_overlap_pct',
  'pipeline.story_match_overlap_pct',
  'pipeline.plagiarism_flag_pct',
  'pipeline.plagiarism_rewrite_pct',
]);

const ALL_KEYS = [
  ...KILL_SWITCH_KEYS,
  ...COST_CAP_KEYS,
  ...THRESHOLD_KEYS,
  DEFAULT_CATEGORY_KEY,
] as const;

// Strings in the settings table *may* be JSON-quoted (admin/settings
// page uses JSON.stringify) or raw (pipeline.default_category_id is
// stored as a bare UUID). Unwrap once if it looks wrapped; otherwise
// return as-is.
function unwrapString(value: string | null | undefined): string {
  if (value == null) return '';
  if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function draftFromSetting(s: Setting): string {
  if (s.value_type === 'boolean') {
    return String(s.value) === 'true' ? 'true' : 'false';
  }
  if (s.value_type === 'number') {
    return String(s.value ?? '');
  }
  // string (e.g. default_category_id)
  return unwrapString(s.value);
}

// Build the PATCH payload string. The API route validates: number must
// match /^-?\d+(\.\d+)?$/, boolean must be 'true'|'false', string is
// accepted as-is. We write strings raw (not JSON-wrapped) to preserve
// the stored shape for pipeline.default_category_id.
function serializeForPatch(raw: string, s: Setting): string {
  if (s.value_type === 'boolean') return raw === 'true' ? 'true' : 'false';
  if (s.value_type === 'number') return raw.trim();
  return raw;
}

function validateDraft(
  raw: string,
  s: Setting,
  categoryIds: Set<string>
): string | null {
  if (s.value_type === 'number') {
    const trimmed = raw.trim();
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return 'Must be a number';
    const n = Number(trimmed);
    if (n < 0) return 'Must be >= 0';
    if (PERCENT_KEYS.has(s.key) && n > 100) return 'Must be <= 100';
    if (s.key === 'pipeline.plagiarism_ngram_size' && (!Number.isInteger(n) || n < 1)) {
      return 'Must be a positive integer';
    }
    return null;
  }
  if (s.value_type === 'boolean') {
    if (raw !== 'true' && raw !== 'false') return 'Must be true or false';
    return null;
  }
  if (s.key === DEFAULT_CATEGORY_KEY) {
    if (!raw) return 'Required';
    if (!categoryIds.has(raw)) return 'Unknown category';
  }
  return null;
}

export default function PipelineSettingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Record<string, Setting>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [busyKey, setBusyKey] = useState<string>('');
  const [loadError, setLoadError] = useState<string>('');

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/');
        return;
      }
      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id);
      const names = ((roleRows || []) as Array<{ roles: { name: string } | null }>)
        .map((r) => r.roles?.name)
        .filter(Boolean) as string[];
      if (!names.some((n) => ADMIN_ROLES.has(n))) {
        router.push('/');
        return;
      }
      setAuthorized(true);
      await Promise.all([loadSettings(), loadCategories()]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSettings() {
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(data?.error || 'Load failed');
        toast.push({ message: data?.error || 'Load failed', variant: 'danger' });
        return;
      }
      const rows = (data.settings || []) as Setting[];
      const byKey: Record<string, Setting> = {};
      for (const r of rows) {
        if ((ALL_KEYS as readonly string[]).includes(r.key)) byKey[r.key] = r;
      }
      setSettings(byKey);
      const d: DraftMap = {};
      for (const key of ALL_KEYS) {
        const row = byKey[key];
        if (row) d[key] = draftFromSetting(row);
      }
      setDrafts(d);
    } catch (err) {
      console.error('[admin.pipeline.settings.load]', err);
      setLoadError('Network error');
    }
  }

  async function loadCategories() {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, slug')
      .order('name');
    if (error) {
      console.error('[admin.pipeline.settings.categories]', error);
      toast.push({ message: 'Failed to load categories', variant: 'danger' });
      return;
    }
    setCategories((data || []) as Category[]);
  }

  const categoryIds = useMemo(
    () => new Set(categories.map((c) => c.id)),
    [categories]
  );

  async function save(key: string) {
    const s = settings[key];
    if (!s) return;
    const raw = drafts[key] ?? '';
    const err = validateDraft(raw, s, categoryIds);
    if (err) {
      toast.push({ message: `${key}: ${err}`, variant: 'danger' });
      return;
    }
    const payload = serializeForPatch(raw, s);
    setBusyKey(key);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.push({
          message: `${key}: ${data?.error || 'Save failed'}`,
          variant: 'danger',
        });
        return;
      }
      toast.push({ message: `Saved ${key}`, variant: 'success' });
      setSettings((prev) => ({
        ...prev,
        [key]: { ...prev[key], value: payload },
      }));
    } catch (e) {
      console.error('[admin.pipeline.settings.save]', e);
      toast.push({ message: `${key}: Network error`, variant: 'danger' });
    } finally {
      setBusyKey('');
    }
  }

  if (loading) {
    return (
      <Page>
        <div style={{ padding: S[12], textAlign: 'center', color: ADMIN_C.dim }}>
          <Spinner /> Loading pipeline settings
        </div>
      </Page>
    );
  }
  if (!authorized) return null;

  const missingKeys = ALL_KEYS.filter((k) => !settings[k]);

  return (
    <Page maxWidth={960}>
      <PageHeader
        title="Pipeline Settings"
        subtitle="Kill switches, cost caps, clustering thresholds, and default category. Changes are audited."
      />

      <div
        style={{
          display: 'flex',
          gap: S[3],
          marginBottom: S[4],
          fontSize: F.sm,
          color: ADMIN_C.dim,
        }}
      >
        <Link href="/admin/pipeline/costs" style={{ color: ADMIN_C.accent }}>
          Cost dashboard
        </Link>
        <span>·</span>
        <Link href="/admin/pipeline/observability" style={{ color: ADMIN_C.accent }}>
          Observability
        </Link>
        <span>·</span>
        <Link href="/admin/settings" style={{ color: ADMIN_C.accent }}>
          All settings
        </Link>
      </div>

      {loadError ? (
        <EmptyState
          title="Could not load settings"
          description={loadError}
        />
      ) : (
        <>
          {missingKeys.length > 0 && (
            <div
              style={{
                padding: S[3],
                marginBottom: S[4],
                border: `1px solid ${ADMIN_C.warn}`,
                borderRadius: 8,
                fontSize: F.sm,
                color: ADMIN_C.dim,
              }}
            >
              Missing from the settings table:{' '}
              <span style={{ fontFamily: 'ui-monospace, monospace' }}>
                {missingKeys.join(', ')}
              </span>
              . Edit via{' '}
              <Link href="/admin/settings" style={{ color: ADMIN_C.accent }}>
                /admin/settings
              </Link>{' '}
              once rows exist.
            </div>
          )}

          <SettingsGroup
            title="Kill switches"
            description="Flip to disable entire pipeline branches. Changes take effect on the next run."
            keys={KILL_SWITCH_KEYS}
            settings={settings}
            drafts={drafts}
            setDrafts={setDrafts}
            busyKey={busyKey}
            onSave={save}
            categories={categories}
          />

          <SettingsGroup
            title="Cost caps"
            description="Daily and per-run ceilings in USD. Soft alert percent drives the dashboard banner."
            keys={COST_CAP_KEYS}
            settings={settings}
            drafts={drafts}
            setDrafts={setDrafts}
            busyKey={busyKey}
            onSave={save}
            categories={categories}
          />

          <SettingsGroup
            title="Cluster, story-match and plagiarism thresholds"
            description="Overlap percentages used by the clustering, dedupe, and plagiarism steps."
            keys={THRESHOLD_KEYS}
            settings={settings}
            drafts={drafts}
            setDrafts={setDrafts}
            busyKey={busyKey}
            onSave={save}
            categories={categories}
          />

          <SettingsGroup
            title="Default category"
            description="Fallback category applied when the writer + cluster step yield none."
            keys={[DEFAULT_CATEGORY_KEY]}
            settings={settings}
            drafts={drafts}
            setDrafts={setDrafts}
            busyKey={busyKey}
            onSave={save}
            categories={categories}
          />
        </>
      )}
    </Page>
  );
}

type GroupProps = {
  title: string;
  description?: string;
  keys: readonly string[];
  settings: Record<string, Setting>;
  drafts: DraftMap;
  setDrafts: React.Dispatch<React.SetStateAction<DraftMap>>;
  busyKey: string;
  onSave: (key: string) => void;
  categories: Category[];
};

function SettingsGroup({
  title,
  description,
  keys,
  settings,
  drafts,
  setDrafts,
  busyKey,
  onSave,
  categories,
}: GroupProps) {
  const rows = keys.map((k) => settings[k]).filter(Boolean) as Setting[];
  if (rows.length === 0) return null;
  return (
    <PageSection title={title} description={description}>
      <div
        style={{
          border: `1px solid ${ADMIN_C.divider}`,
          borderRadius: 8,
          overflow: 'hidden',
          background: ADMIN_C.bg,
        }}
      >
        {rows.map((s, i) => {
          const current = drafts[s.key] ?? '';
          const stored = draftFromSetting(s);
          const dirty = current !== stored;
          return (
            <div
              key={s.key}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto',
                gap: S[3],
                padding: `${S[3]}px ${S[4]}px`,
                borderBottom:
                  i < rows.length - 1 ? `1px solid ${ADMIN_C.divider}` : 'none',
                alignItems: 'center',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: F.base,
                    fontWeight: 600,
                    color: ADMIN_C.white,
                    fontFamily: 'ui-monospace, monospace',
                    wordBreak: 'break-all',
                  }}
                >
                  {s.key}
                </div>
                {s.description && (
                  <div style={{ fontSize: F.xs, color: ADMIN_C.dim, marginTop: 2 }}>
                    {s.description}
                  </div>
                )}
                <div style={{ fontSize: F.xs, color: ADMIN_C.muted, marginTop: 2 }}>
                  type: {s.value_type}
                </div>
              </div>

              <div>
                <FieldFor
                  setting={s}
                  value={current}
                  onChange={(v) =>
                    setDrafts((d) => ({ ...d, [s.key]: v }))
                  }
                  categories={categories}
                />
              </div>

              <Button
                size="sm"
                variant={dirty ? 'primary' : 'secondary'}
                loading={busyKey === s.key}
                disabled={!dirty || (busyKey !== '' && busyKey !== s.key)}
                onClick={() => onSave(s.key)}
              >
                Save
              </Button>
            </div>
          );
        })}
      </div>
    </PageSection>
  );
}

type FieldProps = {
  setting: Setting;
  value: string;
  onChange: (v: string) => void;
  categories: Category[];
};

function FieldFor({ setting, value, onChange, categories }: FieldProps) {
  if (setting.key === 'pipeline.default_category_id') {
    const options = categories.map((c) => ({ value: c.id, label: c.name }));
    return (
      <Select
        size="sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        options={options}
      />
    );
  }
  if (setting.value_type === 'boolean') {
    return (
      <Select
        size="sm"
        value={value === 'true' ? 'true' : 'false'}
        onChange={(e) => onChange(e.target.value)}
        options={[
          { value: 'true', label: 'true' },
          { value: 'false', label: 'false' },
        ]}
      />
    );
  }
  if (setting.value_type === 'number') {
    return (
      <NumberInput
        size="sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  // Fallback to a simple text input for any unexpected string types.
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        padding: `${S[2]}px ${S[3]}px`,
        border: `1px solid ${ADMIN_C.divider}`,
        borderRadius: 6,
        background: ADMIN_C.bg,
        color: ADMIN_C.white,
        fontSize: F.sm,
        fontFamily: 'ui-monospace, monospace',
      }}
    />
  );
}
