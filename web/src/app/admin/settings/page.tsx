'use client';

// Admin settings page. Light-themed (ADMIN_C_LIGHT parity retained via
// admin design system tokens). Values round-trip through /api/admin/settings
// PATCH endpoint, which enforces is_sensitive gating + writes to
// admin_audit_log. String values are serialized as JSON strings in the
// DB; displayValue/serialize bridges that for the input layer.

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_ROLES } from '@/lib/roles';

import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Textarea from '@/components/admin/Textarea';
import NumberInput from '@/components/admin/NumberInput';
import Select from '@/components/admin/Select';
import Spinner from '@/components/admin/Spinner';
import EmptyState from '@/components/admin/EmptyState';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type Setting = Tables<'settings'>;
type DraftMap = Record<string, string>;

function displayValue(value: string | null | undefined, type: string): string {
  if (type !== 'string' || value == null) return value ?? '';
  if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

function serialize(raw: string | null | undefined, type: string): string {
  if (type === 'string') return JSON.stringify(raw ?? '');
  return String(raw ?? '');
}

export default function SettingsAdminPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [busyKey, setBusyKey] = useState<string>('');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id);
      const names = ((roleRows || []) as Array<{ roles: { name: string } | null }>)
        .map((r) => r.roles?.name).filter(Boolean) as string[];
      if (!names.some((n) => ADMIN_ROLES.has(n))) {
        router.push('/'); return;
      }
      setAuthorized(true);
      await load();
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    const res = await fetch('/api/admin/settings');
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const rows = (data.settings || []) as Setting[];
      setSettings(rows);
      const d: DraftMap = {};
      for (const s of rows) d[s.key] = displayValue(s.value, s.value_type);
      setDrafts(d);
    } else {
      toast.push({ message: data?.error || 'Load failed', variant: 'danger' });
    }
  }

  const byCategory = useMemo(() => {
    const groups: Record<string, Setting[]> = {};
    for (const s of settings) {
      const cat = s.category || 'general';
      (groups[cat] ||= []).push(s);
    }
    return groups;
  }, [settings]);

  async function save(s: Setting) {
    const raw = drafts[s.key];
    const payload = serialize(raw, s.value_type);
    setBusyKey(s.key);
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: s.key, value: payload }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyKey('');
    if (!res.ok) {
      toast.push({ message: `${s.key}: ${data?.error || 'save failed'}`, variant: 'danger' });
      return;
    }
    toast.push({ message: `Saved ${s.key}`, variant: 'success' });
    setSettings((prev) => prev.map((x) => x.key === s.key ? { ...x, value: payload } : x));
  }

  if (loading) {
    return (
      <Page>
        <div style={{ padding: S[12], textAlign: 'center', color: ADMIN_C.dim }}>
          <Spinner /> Loading settings
        </div>
      </Page>
    );
  }
  if (!authorized) return null;

  const categoryKeys = Object.keys(byCategory).sort();

  return (
    <Page maxWidth={960}>
      <PageHeader
        title="Settings"
        subtitle="Editable platform settings. Sensitive keys are hidden. Changes write to the audit log."
      />

      {settings.length === 0 ? (
        <EmptyState
          title="No editable settings"
          description="Nothing is exposed by the /api/admin/settings endpoint yet. Add rows to `settings` or unhide sensitive keys to manage them here."
        />
      ) : (
        categoryKeys.map((cat) => (
          <PageSection key={cat} title={cat}>
            <div
              style={{
                border: `1px solid ${ADMIN_C.divider}`,
                borderRadius: 8,
                overflow: 'hidden',
                background: ADMIN_C.bg,
              }}
            >
              {byCategory[cat].map((s, i) => {
                const current = drafts[s.key];
                const stored = displayValue(s.value, s.value_type);
                const dirty = String(current ?? '') !== String(stored ?? '');
                return (
                  <div
                    key={s.key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto',
                      gap: S[3],
                      padding: `${S[3]}px ${S[4]}px`,
                      borderBottom: i < byCategory[cat].length - 1 ? `1px solid ${ADMIN_C.divider}` : 'none',
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
                        type: {s.value_type}{s.is_public ? ' · public' : ''}
                      </div>
                    </div>

                    <div>
                      {s.value_type === 'boolean' ? (
                        <Select
                          size="sm"
                          value={String(current) === 'true' ? 'true' : 'false'}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [s.key]: e.target.value }))
                          }
                          options={[{ value: 'true', label: 'true' }, { value: 'false', label: 'false' }]}
                        />
                      ) : s.value_type === 'number' ? (
                        <NumberInput
                          size="sm"
                          value={current ?? ''}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [s.key]: e.target.value }))
                          }
                        />
                      ) : s.value_type === 'json' ? (
                        <Textarea
                          rows={3}
                          value={typeof current === 'string' ? current : JSON.stringify(current || '', null, 2)}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [s.key]: e.target.value }))
                          }
                          style={{ fontFamily: 'ui-monospace, monospace', fontSize: F.sm }}
                        />
                      ) : (
                        <TextInput
                          size="sm"
                          value={current ?? ''}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [s.key]: e.target.value }))
                          }
                        />
                      )}
                    </div>

                    <Button
                      size="sm"
                      variant={dirty ? 'primary' : 'secondary'}
                      loading={busyKey === s.key}
                      disabled={!dirty}
                      onClick={() => save(s)}
                    >
                      Save
                    </Button>
                  </div>
                );
              })}
            </div>
          </PageSection>
        ))
      )}
    </Page>
  );
}
