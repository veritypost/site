/**
 * Newsroom rewrite Stream 3 — /admin/prompt-presets
 *
 * Operator-curated reusable prompt blurbs surfaced in the Newsroom
 * prompt picker dropdown (e.g., "Skeptical fact-check", "Long-form
 * explainer", "Breaking news brief"). Distinct from `ai_prompt_overrides`,
 * which is the auto-applied per-category Layer 1 system; presets are
 * USER-SELECTED.
 *
 * Auth: client-side gate reads `admin.pipeline.presets.manage` from the
 * resolver — same key the API enforces, so denial is a redirect instead of
 * a rendered shell that 403s on every write.
 *
 * Behavior:
 *   - Tabs filter by audience: All / Adult / Kid / Both.
 *   - "Show archived" toggle reveals soft-deleted (is_active=false) rows.
 *   - Each row: name, audience badge, optional category badge, 80-char
 *     preview of body, Edit + Archive (or Restore) buttons.
 *   - Add/Edit modal: name (req), description, body (textarea, req),
 *     audience (radio adult/kid/both), category (optional dropdown of
 *     active categories), sort_order (numeric, default 0).
 *   - Archive is soft via PATCH is_active=false. Restore reverses it.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { hasPermission, refreshAllPermissions } from '@/lib/permissions';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Toolbar from '@/components/admin/Toolbar';
import Button from '@/components/admin/Button';
import Badge from '@/components/admin/Badge';
import EmptyState from '@/components/admin/EmptyState';
import StatCard from '@/components/admin/StatCard';
import Switch from '@/components/admin/Switch';
import Modal from '@/components/admin/Modal';
import Form, { FormActions } from '@/components/admin/Form';
import Field from '@/components/admin/Field';
import TextInput from '@/components/admin/TextInput';
import Textarea from '@/components/admin/Textarea';
import NumberInput from '@/components/admin/NumberInput';
import Select from '@/components/admin/Select';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import Spinner from '@/components/admin/Spinner';
import { ToastProvider, useToast } from '@/components/admin/Toast';

type Audience = 'adult' | 'kid' | 'both';
type Tab = 'all' | Audience;

// Local type — `database.ts` won't carry `ai_prompt_presets` until the
// owner pastes migration 126 + PM regenerates types. Mirrors the schema.
type PresetRow = {
  id: string;
  name: string;
  description: string | null;
  body: string;
  audience: Audience;
  category_id: string | null;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type CategoryRow = Tables<'categories'>;

const AUDIENCE_LABEL: Record<Audience, string> = {
  adult: 'Adult',
  kid: 'Kid',
  both: 'Both',
};

const AUDIENCE_VARIANT: Record<Audience, 'info' | 'success' | 'neutral'> = {
  adult: 'info',
  kid: 'success',
  both: 'neutral',
};

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

type EditorState = {
  name: string;
  description: string;
  body: string;
  audience: Audience;
  category_id: string;
  sort_order: number;
};

const EMPTY_EDITOR: EditorState = {
  name: '',
  description: '',
  body: '',
  audience: 'both',
  category_id: '',
  sort_order: 0,
};

export default function PromptPresetsAdminPage() {
  return (
    <ToastProvider>
      <PromptPresetsAdminInner />
    </ToastProvider>
  );
}

function PromptPresetsAdminInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { push } = useToast();

  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PresetRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [tab, setTab] = useState<Tab>('all');
  const [showArchived, setShowArchived] = useState(false);

  // Modal state — single editor used for both create and edit. `editingId`
  // null = new, otherwise updating that row.
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);
  const [editorErrors, setEditorErrors] = useState<Partial<Record<keyof EditorState, string>>>({});
  const [saving, setSaving] = useState(false);

  // Confirm dialog for archive (only for is_active=true rows).
  const [confirmArchive, setConfirmArchive] = useState<{ id: string; name: string } | null>(null);

  const fetchPresets = useCallback(async () => {
    const res = await fetch('/api/admin/prompt-presets', { method: 'GET' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      push({
        message: `Could not load presets: ${json.error || 'unknown error'}`,
        variant: 'danger',
      });
      return;
    }
    setRows((json.rows || []) as PresetRow[]);
  }, [push]);

  const fetchCategories = useCallback(async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (error) {
      // Non-fatal: dropdown just shows blank. Page still works.
      console.error('[admin.prompt-presets] categories load failed:', error.message);
      return;
    }
    setCategories((data || []) as CategoryRow[]);
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/');
        return;
      }
      await refreshAllPermissions();
      if (!hasPermission('admin.pipeline.presets.manage')) {
        router.push('/');
        return;
      }
      setAuthorized(true);
      await Promise.all([fetchPresets(), fetchCategories()]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Index categories by id for fast badge lookup.
  const categoryById = useMemo(() => {
    const m = new Map<string, CategoryRow>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  // Visible rows after tab + archived filter. Server already sorted by
  // sort_order ASC then name ASC; the audience filter keeps that order.
  const visibleRows = useMemo(() => {
    return rows.filter((r) => {
      if (!showArchived && r.is_active === false) return false;
      if (tab !== 'all' && r.audience !== tab) return false;
      return true;
    });
  }, [rows, tab, showArchived]);

  const tabCounts = useMemo(() => {
    const counts = { all: 0, adult: 0, kid: 0, both: 0 } as Record<Tab, number>;
    for (const r of rows) {
      if (!showArchived && r.is_active === false) continue;
      counts.all += 1;
      counts[r.audience] += 1;
    }
    return counts;
  }, [rows, showArchived]);

  function openCreate() {
    setEditingId(null);
    setEditor(EMPTY_EDITOR);
    setEditorErrors({});
    setEditorOpen(true);
  }

  function openEdit(row: PresetRow) {
    setEditingId(row.id);
    setEditor({
      name: row.name,
      description: row.description ?? '',
      body: row.body,
      audience: row.audience,
      category_id: row.category_id ?? '',
      sort_order: row.sort_order,
    });
    setEditorErrors({});
    setEditorOpen(true);
  }

  function closeEditor() {
    if (saving) return;
    setEditorOpen(false);
    setEditingId(null);
    setEditor(EMPTY_EDITOR);
    setEditorErrors({});
  }

  function validateEditor(): boolean {
    const next: Partial<Record<keyof EditorState, string>> = {};
    if (!editor.name.trim()) next.name = 'Name is required';
    if (!editor.body.trim()) next.body = 'Body is required';
    if (!Number.isFinite(editor.sort_order) || editor.sort_order < 0) {
      next.sort_order = 'Sort order must be 0 or greater';
    }
    setEditorErrors(next);
    return Object.keys(next).length === 0;
  }

  async function saveEditor() {
    if (!validateEditor()) return;
    setSaving(true);
    try {
      const payload = {
        name: editor.name.trim(),
        description: editor.description.trim() || null,
        body: editor.body.trim(),
        audience: editor.audience,
        category_id: editor.category_id || null,
        sort_order: editor.sort_order,
      };

      const url = editingId
        ? `/api/admin/prompt-presets/${editingId}`
        : '/api/admin/prompt-presets';
      const method = editingId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));

      if (res.status === 429) {
        push({ message: 'Saving too fast. Try again shortly.', variant: 'warn' });
        return;
      }
      if (!res.ok) {
        push({
          message: `Could not save preset: ${json.error || 'unknown error'}`,
          variant: 'danger',
        });
        return;
      }

      // Reload to pick up server-side ordering + updated_at + any
      // category-rename side effects without re-fetching individually.
      await fetchPresets();
      push({
        message: editingId ? 'Preset updated' : 'Preset created',
        variant: 'success',
      });
      setEditorOpen(false);
      setEditingId(null);
      setEditor(EMPTY_EDITOR);
      setEditorErrors({});
    } finally {
      setSaving(false);
    }
  }

  async function archivePreset(id: string) {
    const res = await fetch(`/api/admin/prompt-presets/${id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    if (res.status === 429) {
      push({ message: 'Archiving too fast. Try again shortly.', variant: 'warn' });
      return;
    }
    if (!res.ok) {
      push({
        message: `Could not archive: ${json.error || 'unknown error'}`,
        variant: 'danger',
      });
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: false } : r)));
    push({ message: 'Preset archived', variant: 'success' });
  }

  async function restorePreset(id: string) {
    const res = await fetch(`/api/admin/prompt-presets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: true }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 429) {
      push({ message: 'Restoring too fast. Try again shortly.', variant: 'warn' });
      return;
    }
    if (!res.ok) {
      push({
        message: `Could not restore: ${json.error || 'unknown error'}`,
        variant: 'danger',
      });
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: true } : r)));
    push({ message: 'Preset restored', variant: 'success' });
  }

  if (loading) {
    return (
      <Page maxWidth={1000}>
        <PageHeader title="Prompt presets" subtitle="Loading…" />
        <div style={{ padding: S[12], textAlign: 'center', color: C.dim }}>
          <Spinner /> Loading presets
        </div>
      </Page>
    );
  }
  if (!authorized) return null;

  const totalActive = rows.filter((r) => r.is_active).length;
  const totalArchived = rows.length - totalActive;

  const tabs: { value: Tab; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'adult', label: 'Adult' },
    { value: 'kid', label: 'Kid' },
    { value: 'both', label: 'Both' },
  ];

  const editorDirty =
    editingId === null
      ? editor.name.trim() !== '' ||
        editor.body.trim() !== '' ||
        editor.description.trim() !== ''
      : true;

  return (
    <Page maxWidth={1000}>
      <PageHeader
        title="Prompt presets"
        subtitle="Reusable prompt blurbs the operator picks from the Newsroom prompt dropdown. Different from per-category overrides — these are user-selected."
        actions={(
          <Button variant="primary" onClick={openCreate}>
            New preset
          </Button>
        )}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
          gap: S[3],
          marginBottom: S[6],
        }}
      >
        <StatCard label="Active" value={totalActive} />
        <StatCard label="Archived" value={totalArchived} />
        <StatCard label="Total" value={rows.length} />
      </div>

      <Toolbar
        left={(
          <div
            style={{
              display: 'inline-flex',
              border: `1px solid ${C.divider}`,
              borderRadius: 6,
              overflow: 'hidden',
            }}
          >
            {tabs.map((t) => {
              const active = tab === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTab(t.value)}
                  style={{
                    border: 'none',
                    padding: `${S[1] + 2}px ${S[3]}px`,
                    fontSize: F.sm,
                    fontWeight: active ? 600 : 500,
                    background: active ? C.accent : C.bg,
                    color: active ? '#ffffff' : C.soft,
                    cursor: 'pointer',
                  }}
                >
                  {t.label}{' '}
                  <span style={{ opacity: 0.7 }}>({tabCounts[t.value]})</span>
                </button>
              );
            })}
          </div>
        )}
        right={(
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: S[2] }}>
            <span style={{ fontSize: F.sm, color: C.dim }}>Show archived</span>
            <Switch checked={showArchived} onChange={(v: boolean) => setShowArchived(v)} />
          </div>
        )}
      />

      <PageSection>
        {visibleRows.length === 0 ? (
          <EmptyState
            title="No presets to show"
            description={
              rows.length === 0
                ? 'Click "New preset" above to seed the prompt dropdown.'
                : 'No presets match the current tab + archived filter.'
            }
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {visibleRows.map((row) => {
              const cat = row.category_id ? categoryById.get(row.category_id) : null;
              const archived = row.is_active === false;
              return (
                <div
                  key={row.id}
                  style={{
                    border: `1px solid ${C.divider}`,
                    borderRadius: 8,
                    background: archived ? C.card : C.bg,
                    padding: S[4],
                    display: 'flex',
                    flexDirection: 'column',
                    gap: S[2],
                    opacity: archived ? 0.7 : 1,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: S[2],
                      flexWrap: 'wrap',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        color: archived ? C.dim : C.white,
                        fontSize: F.md,
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      {row.name}
                    </div>
                    <Badge variant={AUDIENCE_VARIANT[row.audience]} size="xs">
                      {AUDIENCE_LABEL[row.audience]}
                    </Badge>
                    {cat && (
                      <Badge variant="ghost" size="xs">
                        {cat.name}
                      </Badge>
                    )}
                    {archived && (
                      <Badge variant="warn" size="xs">
                        Archived
                      </Badge>
                    )}
                    <span style={{ fontSize: F.xs, color: C.muted }}>
                      sort {row.sort_order}
                    </span>
                  </div>

                  {row.description && (
                    <div style={{ fontSize: F.sm, color: C.dim, lineHeight: 1.4 }}>
                      {row.description}
                    </div>
                  )}

                  <div
                    style={{
                      fontSize: F.sm,
                      color: C.soft,
                      lineHeight: 1.5,
                      fontFamily:
                        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    }}
                  >
                    {truncate(row.body, 80)}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: S[2],
                      marginTop: S[1],
                      flexWrap: 'wrap',
                    }}
                  >
                    <Button variant="secondary" size="sm" onClick={() => openEdit(row)}>
                      Edit
                    </Button>
                    {archived ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => restorePreset(row.id)}
                      >
                        Restore
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmArchive({ id: row.id, name: row.name })}
                      >
                        Archive
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PageSection>

      <Modal
        open={editorOpen}
        onClose={closeEditor}
        title={editingId ? 'Edit preset' : 'New preset'}
        description="Reusable prompt body the operator can pick from the Newsroom dropdown."
        width="lg"
        dirty={editorDirty && !saving}
        footer={(
          <>
            <Button variant="ghost" onClick={closeEditor} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveEditor} loading={saving}>
              {editingId ? 'Save changes' : 'Create preset'}
            </Button>
          </>
        )}
      >
        <Form onSubmit={saveEditor}>
          <Field
            id="preset-name"
            label="Name"
            required
            error={editorErrors.name}
            hint="Short label shown in the prompt dropdown."
          >
            <TextInput
              id="preset-name"
              value={editor.name}
              maxLength={120}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEditor((s) => ({ ...s, name: e.target.value }))
              }
              placeholder='e.g. "Skeptical fact-check"'
              error={!!editorErrors.name}
            />
          </Field>

          <Field
            id="preset-description"
            label="Description"
            hint="Optional one-liner shown beneath the name."
          >
            <TextInput
              id="preset-description"
              value={editor.description}
              maxLength={240}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEditor((s) => ({ ...s, description: e.target.value }))
              }
              placeholder="What this preset is for"
            />
          </Field>

          <Field
            id="preset-body"
            label="Body"
            required
            error={editorErrors.body}
            hint="The full prompt blurb that gets composed into the run."
          >
            <Textarea
              id="preset-body"
              value={editor.body}
              rows={8}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setEditor((s) => ({ ...s, body: e.target.value }))
              }
              placeholder="Be skeptical. Cite primary sources. Note dissent..."
              error={!!editorErrors.body}
            />
          </Field>

          <Field id="preset-audience" label="Audience" required>
            <div style={{ display: 'flex', gap: S[3], flexWrap: 'wrap' }}>
              {(['adult', 'kid', 'both'] as Audience[]).map((a) => (
                <label
                  key={a}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: S[1] + 2,
                    fontSize: F.sm,
                    color: C.white,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="preset-audience"
                    value={a}
                    checked={editor.audience === a}
                    onChange={() => setEditor((s) => ({ ...s, audience: a }))}
                  />
                  {AUDIENCE_LABEL[a]}
                </label>
              ))}
            </div>
          </Field>

          <Field
            id="preset-category"
            label="Category"
            hint="Optional. Restricts the preset to one category in the dropdown."
          >
            <Select
              id="preset-category"
              value={editor.category_id}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setEditor((s) => ({ ...s, category_id: e.target.value }))
              }
            >
              <option value="">— Any category —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            id="preset-sort"
            label="Sort order"
            error={editorErrors.sort_order}
            hint="Lower numbers appear first in the dropdown."
          >
            <NumberInput
              id="preset-sort"
              min={0}
              value={editor.sort_order}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const v = parseInt(e.target.value, 10);
                setEditor((s) => ({
                  ...s,
                  sort_order: Number.isFinite(v) ? Math.max(0, v) : 0,
                }));
              }}
              style={{ width: 120 }}
              error={!!editorErrors.sort_order}
            />
          </Field>

          {/* Hidden submit so Enter in TextInput triggers save. */}
          <FormActions style={{ display: 'none' }}>
            <button type="submit" />
          </FormActions>
        </Form>
      </Modal>

      <ConfirmDialog
        open={confirmArchive !== null}
        title="Archive preset?"
        message={
          confirmArchive
            ? `"${confirmArchive.name}" will be hidden from the prompt dropdown. You can restore it from "Show archived".`
            : ''
        }
        confirmLabel="Archive"
        variant="danger"
        onCancel={() => setConfirmArchive(null)}
        onConfirm={async () => {
          if (confirmArchive) {
            await archivePreset(confirmArchive.id);
          }
          setConfirmArchive(null);
        }}
      />
    </Page>
  );
}
