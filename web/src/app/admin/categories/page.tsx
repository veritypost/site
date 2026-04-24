/**
 * Newsroom redesign Stream 2 — /admin/categories tree editor.
 *
 * Replaces the prior adult/kids-tabs + Drawer page with a single tree
 * view. Both adult and kids categories live in one taxonomy now; the
 * `is_kids_safe` flag is just a column. UI:
 *
 *   - Top-level rows in `sort_order` order
 *   - Subcategories indented under their parent, also `sort_order`
 *   - Per row: name, slug, badges (Active/Inactive, Kids-safe, Premium),
 *     article_count, buttons (Edit, Add child only on top-level, Move,
 *     Archive)
 *   - "Add top-level category" inline at the bottom
 *   - "Show archived" toggle in the header — flips the deleted_at filter
 *   - Edit modal: name, slug, description, color_hex, icon_name, sort_order,
 *     is_active, is_kids_safe, is_premium
 *   - Move modal: dropdown to set parent_id (null = top-level). Self,
 *     descendants, and second-level rows are filtered out client-side
 *     (server enforces too).
 *   - Archive: soft-delete via DELETE; restore button on archived rows
 *     issues a PATCH that sets deleted_at = null + is_active = true.
 *
 * Page-level access: client gate reads `admin.pipeline.categories.manage`
 * from the resolver — same key the API enforces on every mutation — so denial
 * is a redirect instead of a shell that 403s on every action.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/client';
import { hasPermission, refreshAllPermissions } from '@/lib/permissions';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import Badge from '@/components/admin/Badge';
import EmptyState from '@/components/admin/EmptyState';
import Spinner from '@/components/admin/Spinner';
import Modal from '@/components/admin/Modal';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import Field from '@/components/admin/Field';
import TextInput from '@/components/admin/TextInput';
import Textarea from '@/components/admin/Textarea';
import NumberInput from '@/components/admin/NumberInput';
import Switch from '@/components/admin/Switch';
import Select from '@/components/admin/Select';
import { ToastProvider, useToast } from '@/components/admin/Toast';

type CategoryRow = Tables<'categories'>;

type FormState = {
  name: string;
  slug: string;
  description: string;
  color_hex: string;
  icon_name: string;
  sort_order: number;
  is_active: boolean;
  is_kids_safe: boolean;
  is_premium: boolean;
};

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function emptyForm(seed?: Partial<FormState>): FormState {
  return {
    name: '',
    slug: '',
    description: '',
    color_hex: '',
    icon_name: '',
    sort_order: 0,
    is_active: true,
    is_kids_safe: false,
    is_premium: false,
    ...seed,
  };
}

function rowToForm(row: CategoryRow): FormState {
  return {
    name: row.name ?? '',
    slug: row.slug ?? '',
    description: row.description ?? '',
    color_hex: row.color_hex ?? '',
    icon_name: row.icon_name ?? '',
    sort_order: row.sort_order ?? 0,
    is_active: row.is_active !== false,
    is_kids_safe: row.is_kids_safe === true,
    is_premium: row.is_premium === true,
  };
}

export default function CategoriesAdminPage() {
  return (
    <ToastProvider>
      <CategoriesAdminInner />
    </ToastProvider>
  );
}

function CategoriesAdminInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string>('');

  // Modal state.
  const [editing, setEditing] = useState<{ row: CategoryRow | null; form: FormState } | null>(
    null
  );
  const [editError, setEditError] = useState<string>('');
  const [editSaving, setEditSaving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

  const [creating, setCreating] = useState<{ parentId: string | null; form: FormState } | null>(
    null
  );
  const [createError, setCreateError] = useState<string>('');
  const [createSaving, setCreateSaving] = useState(false);
  const [createSlugTouched, setCreateSlugTouched] = useState(false);

  const [moving, setMoving] = useState<{ row: CategoryRow; nextParentId: string | null } | null>(
    null
  );
  const [moveError, setMoveError] = useState<string>('');
  const [moveSaving, setMoveSaving] = useState(false);

  const [archiveConfirm, setArchiveConfirm] = useState<CategoryRow | null>(null);

  // ---- load ---------------------------------------------------------------

  const fetchAll = useCallback(async () => {
    // Load all rows (visible + archived) in one shot. Filtering is client-side
    // so the "Show archived" toggle is instant and the same row references
    // survive across toggles.
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error || !data) {
      toast.push({ message: 'Could not load categories.', variant: 'danger' });
      return;
    }
    setRows(data as CategoryRow[]);
  }, [supabase, toast]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        router.push('/');
        return;
      }
      await refreshAllPermissions();
      if (cancelled) return;
      if (!hasPermission('admin.pipeline.categories.manage')) {
        router.push('/');
        return;
      }
      setAuthorized(true);
      await fetchAll();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- derived tree -------------------------------------------------------

  const tree = useMemo(() => {
    const visibleRows = showArchived ? rows : rows.filter((r) => !r.deleted_at);
    const byParent = new Map<string | null, CategoryRow[]>();
    for (const r of visibleRows) {
      const p = r.parent_id ?? null;
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p)!.push(r);
    }
    const sortFn = (a: CategoryRow, b: CategoryRow) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name);
    for (const arr of byParent.values()) arr.sort(sortFn);
    return byParent;
  }, [rows, showArchived]);

  const topLevel = tree.get(null) ?? [];

  // Pre-compute id → row + descendants map (for move target filter). Uses
  // the full row set so descendants of an archived row are still excluded.
  const allRowsById = useMemo(() => {
    const m = new Map<string, CategoryRow>();
    for (const r of rows) m.set(r.id, r);
    return m;
  }, [rows]);

  function descendantIds(id: string): Set<string> {
    const out = new Set<string>();
    const stack: string[] = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const r of rows) {
        if (r.parent_id === cur && !out.has(r.id)) {
          out.add(r.id);
          stack.push(r.id);
        }
      }
    }
    return out;
  }

  // ---- mutations ----------------------------------------------------------

  async function handleEditSave() {
    if (!editing || !editing.row) return;
    setEditError('');
    const f = editing.form;

    if (!f.name.trim()) {
      setEditError('Name is required.');
      return;
    }
    if (!SLUG_RE.test(f.slug)) {
      setEditError('Slug must be lowercase letters, numbers, and hyphens.');
      return;
    }
    if (f.color_hex && !HEX_RE.test(f.color_hex)) {
      setEditError('Color must be a #RRGGBB hex value.');
      return;
    }

    const payload = {
      name: f.name.trim(),
      slug: f.slug.trim(),
      description: f.description.trim() || null,
      color_hex: f.color_hex.trim() || null,
      icon_name: f.icon_name.trim() || null,
      sort_order: Math.max(0, Math.floor(f.sort_order || 0)),
      is_active: f.is_active,
      is_kids_safe: f.is_kids_safe,
      is_premium: f.is_premium,
    };

    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/categories/${editing.row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 429) {
        setEditError('Too many requests. Try again in a moment.');
        return;
      }
      if (!res.ok) {
        setEditError(json.error || 'Could not save changes.');
        return;
      }
      toast.push({ message: 'Category saved.', variant: 'success' });
      setEditing(null);
      setSlugTouched(false);
      await fetchAll();
    } finally {
      setEditSaving(false);
    }
  }

  async function handleCreateSave() {
    if (!creating) return;
    setCreateError('');
    const f = creating.form;

    if (!f.name.trim()) {
      setCreateError('Name is required.');
      return;
    }
    if (!SLUG_RE.test(f.slug)) {
      setCreateError('Slug must be lowercase letters, numbers, and hyphens.');
      return;
    }
    if (f.color_hex && !HEX_RE.test(f.color_hex)) {
      setCreateError('Color must be a #RRGGBB hex value.');
      return;
    }

    const payload = {
      name: f.name.trim(),
      slug: f.slug.trim(),
      description: f.description.trim() || null,
      parent_id: creating.parentId,
      color_hex: f.color_hex.trim() || null,
      icon_name: f.icon_name.trim() || null,
      sort_order: Math.max(0, Math.floor(f.sort_order || 0)),
      is_active: f.is_active,
      is_kids_safe: f.is_kids_safe,
      is_premium: f.is_premium,
    };

    setCreateSaving(true);
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; row?: CategoryRow };
      if (res.status === 429) {
        setCreateError('Too many requests. Try again in a moment.');
        return;
      }
      if (!res.ok || !json.row) {
        setCreateError(json.error || 'Could not create category.');
        return;
      }
      toast.push({ message: 'Category added.', variant: 'success' });
      setCreating(null);
      setCreateSlugTouched(false);
      await fetchAll();
    } finally {
      setCreateSaving(false);
    }
  }

  async function handleMoveSave() {
    if (!moving) return;
    setMoveError('');
    setMoveSaving(true);
    try {
      const res = await fetch(`/api/admin/categories/${moving.row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: moving.nextParentId }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 429) {
        setMoveError('Too many requests. Try again in a moment.');
        return;
      }
      if (!res.ok) {
        setMoveError(json.error || 'Could not move category.');
        return;
      }
      toast.push({ message: 'Category moved.', variant: 'success' });
      setMoving(null);
      await fetchAll();
    } finally {
      setMoveSaving(false);
    }
  }

  async function handleArchive(row: CategoryRow) {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/admin/categories/${row.id}`, { method: 'DELETE' });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 429) {
        toast.push({
          message: 'Too many requests. Try again in a moment.',
          variant: 'warn',
        });
        return;
      }
      if (!res.ok) {
        toast.push({ message: json.error || 'Could not archive.', variant: 'danger' });
        return;
      }
      toast.push({ message: 'Category archived.', variant: 'success' });
      await fetchAll();
    } finally {
      setBusyId('');
      setArchiveConfirm(null);
    }
  }

  async function handleRestore(row: CategoryRow) {
    // Restore = PATCH with deleted_at: null. The route whitelists this
    // single legal value as a soft-delete reversal; everything else
    // routes to a 400 to keep the API surface tight.
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/admin/categories/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleted_at: null, is_active: true }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 429) {
        toast.push({
          message: 'Too many requests. Try again in a moment.',
          variant: 'warn',
        });
        return;
      }
      if (!res.ok) {
        toast.push({ message: json.error || 'Could not restore.', variant: 'danger' });
        return;
      }
      toast.push({ message: 'Category restored.', variant: 'success' });
      await fetchAll();
    } finally {
      setBusyId('');
    }
  }

  // ---- render -------------------------------------------------------------

  if (loading) {
    return (
      <Page>
        <div style={{ padding: S[12], textAlign: 'center', color: C.dim }}>
          <Spinner /> Loading categories
        </div>
      </Page>
    );
  }
  if (!authorized) return null;

  const totalActive = rows.filter((r) => !r.deleted_at && r.is_active).length;
  const totalArchived = rows.filter((r) => !!r.deleted_at).length;

  const headerActions = (
    <>
      <Button
        variant={showArchived ? 'primary' : 'secondary'}
        size="md"
        onClick={() => setShowArchived((v) => !v)}
      >
        {showArchived ? 'Hide archived' : `Show archived (${totalArchived})`}
      </Button>
      <Link href="/admin/newsroom" style={{ textDecoration: 'none' }}>
        <Button variant="ghost" size="md">
          Newsroom
        </Button>
      </Link>
    </>
  );

  return (
    <Page>
      <PageHeader
        title="Categories"
        subtitle={`${totalActive} active categories. Two-level taxonomy: parent → subcategory.`}
        actions={headerActions}
      />

      <PageSection>
        {topLevel.length === 0 ? (
          <EmptyState
            title="No categories yet"
            description="Add a top-level category below to start the taxonomy."
          />
        ) : (
          <div
            style={{
              border: `1px solid ${C.divider}`,
              borderRadius: 8,
              background: C.bg,
              overflow: 'hidden',
            }}
          >
            {topLevel.map((parent, idx) => {
              const children = tree.get(parent.id) ?? [];
              return (
                <div key={parent.id}>
                  {idx > 0 && (
                    <div role="presentation" style={{ height: 1, background: C.divider }} />
                  )}
                  <CategoryRowView
                    row={parent}
                    depth={0}
                    busy={busyId === parent.id}
                    onEdit={() => {
                      setEditError('');
                      setSlugTouched(true);
                      setEditing({ row: parent, form: rowToForm(parent) });
                    }}
                    onAddChild={() => {
                      setCreateError('');
                      setCreateSlugTouched(false);
                      setCreating({
                        parentId: parent.id,
                        form: emptyForm({ is_kids_safe: parent.is_kids_safe }),
                      });
                    }}
                    onMove={() => {
                      setMoveError('');
                      setMoving({ row: parent, nextParentId: parent.parent_id ?? null });
                    }}
                    onArchive={() => setArchiveConfirm(parent)}
                    onRestore={() => handleRestore(parent)}
                  />
                  {children.map((child) => (
                    <div
                      key={child.id}
                      style={{ borderTop: `1px solid ${C.divider}`, background: C.card }}
                    >
                      <CategoryRowView
                        row={child}
                        depth={1}
                        busy={busyId === child.id}
                        onEdit={() => {
                          setEditError('');
                          setSlugTouched(true);
                          setEditing({ row: child, form: rowToForm(child) });
                        }}
                        // No add-child for second-level rows (depth cap).
                        onAddChild={null}
                        onMove={() => {
                          setMoveError('');
                          setMoving({ row: child, nextParentId: child.parent_id ?? null });
                        }}
                        onArchive={() => setArchiveConfirm(child)}
                        onRestore={() => handleRestore(child)}
                      />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: S[4] }}>
          <Button
            variant="primary"
            onClick={() => {
              setCreateError('');
              setCreateSlugTouched(false);
              setCreating({ parentId: null, form: emptyForm() });
            }}
          >
            Add top-level category
          </Button>
        </div>
      </PageSection>

      {/* Edit modal */}
      <Modal
        open={!!editing}
        onClose={() => {
          setEditing(null);
          setSlugTouched(false);
          setEditError('');
        }}
        title={editing?.row ? `Edit "${editing.row.name}"` : 'Edit category'}
        width="md"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(null);
                setSlugTouched(false);
                setEditError('');
              }}
              disabled={editSaving}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={handleEditSave} loading={editSaving}>
              Save changes
            </Button>
          </>
        }
      >
        {editing && (
          <CategoryForm
            form={editing.form}
            error={editError}
            onChange={(next) =>
              setEditing(editing ? { ...editing, form: { ...editing.form, ...next } } : null)
            }
            slugTouched={slugTouched}
            setSlugTouched={setSlugTouched}
          />
        )}
      </Modal>

      {/* Create modal */}
      <Modal
        open={!!creating}
        onClose={() => {
          setCreating(null);
          setCreateSlugTouched(false);
          setCreateError('');
        }}
        title={
          creating?.parentId
            ? `Add subcategory under "${allRowsById.get(creating.parentId)?.name ?? '…'}"`
            : 'Add top-level category'
        }
        width="md"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setCreating(null);
                setCreateSlugTouched(false);
                setCreateError('');
              }}
              disabled={createSaving}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateSave} loading={createSaving}>
              Create
            </Button>
          </>
        }
      >
        {creating && (
          <CategoryForm
            form={creating.form}
            error={createError}
            onChange={(next) =>
              setCreating(
                creating ? { ...creating, form: { ...creating.form, ...next } } : null
              )
            }
            slugTouched={createSlugTouched}
            setSlugTouched={setCreateSlugTouched}
          />
        )}
      </Modal>

      {/* Move modal */}
      <Modal
        open={!!moving}
        onClose={() => {
          setMoving(null);
          setMoveError('');
        }}
        title={moving ? `Move "${moving.row.name}"` : 'Move category'}
        width="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setMoving(null);
                setMoveError('');
              }}
              disabled={moveSaving}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={handleMoveSave} loading={moveSaving}>
              Move
            </Button>
          </>
        }
      >
        {moving && (
          <div>
            <Field id="move-parent" label="New parent" hint="Pick a top-level row, or “(none)” to make this a top-level category.">
              <Select
                id="move-parent"
                value={moving.nextParentId ?? ''}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                  const v = e.target.value || null;
                  setMoving(moving ? { ...moving, nextParentId: v } : null);
                }}
              >
                <option value="">(none — make top-level)</option>
                {(() => {
                  // Eligible parents = top-level rows, not self, not a descendant
                  // of self, not the current parent (no-op move).
                  const desc = descendantIds(moving.row.id);
                  return topLevel
                    .filter((p) => p.id !== moving.row.id && !desc.has(p.id) && !p.deleted_at)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ));
                })()}
              </Select>
            </Field>
            {moveError && (
              <div
                role="alert"
                style={{
                  marginTop: S[2],
                  padding: `${S[2]}px ${S[3]}px`,
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.35)',
                  borderRadius: 6,
                  color: C.danger,
                  fontSize: F.sm,
                }}
              >
                {moveError}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Archive confirm */}
      <ConfirmDialog
        open={!!archiveConfirm}
        title="Archive category?"
        message={
          archiveConfirm
            ? `"${archiveConfirm.name}" will be hidden from readers and the editor. Existing articles keep their reference. You can restore it from "Show archived".`
            : ''
        }
        confirmLabel="Archive"
        variant="danger"
        onCancel={() => setArchiveConfirm(null)}
        onConfirm={async () => {
          if (archiveConfirm) await handleArchive(archiveConfirm);
        }}
      />
    </Page>
  );
}

// ----- row view -----------------------------------------------------------

function CategoryRowView({
  row,
  depth,
  busy,
  onEdit,
  onAddChild,
  onMove,
  onArchive,
  onRestore,
}: {
  row: CategoryRow;
  depth: 0 | 1;
  busy: boolean;
  onEdit: () => void;
  onAddChild: (() => void) | null;
  onMove: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const archived = !!row.deleted_at;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: S[3],
        padding: `${S[3]}px ${S[4]}px`,
        paddingLeft: S[4] + (depth === 1 ? S[6] : 0),
        opacity: archived ? 0.65 : 1,
      }}
    >
      {/* Color swatch — small visual cue, falls back to a transparent box */}
      <div
        aria-hidden="true"
        style={{
          width: 10,
          height: 10,
          borderRadius: 2,
          background: row.color_hex || 'transparent',
          border: row.color_hex ? `1px solid ${C.divider}` : `1px dashed ${C.divider}`,
          flexShrink: 0,
        }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            gap: S[2],
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: F.md,
              fontWeight: depth === 0 ? 600 : 500,
              color: C.white,
              textDecoration: archived ? 'line-through' : 'none',
            }}
          >
            {row.name}
          </span>
          <span style={{ fontSize: F.xs, color: C.muted }}>/{row.slug}</span>

          {!row.is_active && (
            <Badge variant="warn" size="xs">
              Hidden
            </Badge>
          )}
          {row.is_active && (
            <Badge variant="success" size="xs">
              Active
            </Badge>
          )}
          {row.is_kids_safe && (
            <Badge variant="info" size="xs">
              Kids-safe
            </Badge>
          )}
          {row.is_premium && (
            <Badge variant="neutral" size="xs">
              Premium
            </Badge>
          )}
          {archived && (
            <Badge variant="danger" size="xs">
              Archived
            </Badge>
          )}
        </div>
        <div
          style={{
            marginTop: 2,
            display: 'flex',
            gap: S[3],
            alignItems: 'center',
            flexWrap: 'wrap',
            fontSize: F.xs,
            color: C.dim,
          }}
        >
          <span>{row.article_count ?? 0} articles</span>
          <span>sort {row.sort_order ?? 0}</span>
          {row.icon_name && <span>icon: {row.icon_name}</span>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: S[1], flexShrink: 0 }}>
        {!archived && (
          <>
            <Button variant="ghost" size="sm" onClick={onEdit} disabled={busy}>
              Edit
            </Button>
            {onAddChild && (
              <Button variant="ghost" size="sm" onClick={onAddChild} disabled={busy}>
                Add child
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onMove} disabled={busy}>
              Move
            </Button>
            <Button variant="ghost" size="sm" onClick={onArchive} disabled={busy}>
              Archive
            </Button>
          </>
        )}
        {archived && (
          <Button variant="secondary" size="sm" onClick={onRestore} loading={busy}>
            Restore
          </Button>
        )}
      </div>
    </div>
  );
}

// ----- shared form -------------------------------------------------------

function CategoryForm({
  form,
  error,
  onChange,
  slugTouched,
  setSlugTouched,
}: {
  form: FormState;
  error: string;
  onChange: (next: Partial<FormState>) => void;
  slugTouched: boolean;
  setSlugTouched: (b: boolean) => void;
}) {
  return (
    <div>
      {error && (
        <div
          role="alert"
          style={{
            marginBottom: S[3],
            padding: `${S[2]}px ${S[3]}px`,
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.35)',
            borderRadius: 6,
            color: C.danger,
            fontSize: F.sm,
          }}
        >
          {error}
        </div>
      )}

      <Field id="cat-name" label="Name" required>
        <TextInput
          id="cat-name"
          value={form.name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const next = e.target.value;
            const patch: Partial<FormState> = { name: next };
            if (!slugTouched) patch.slug = slugify(next);
            onChange(patch);
          }}
          placeholder="Politics"
        />
      </Field>

      <Field id="cat-slug" label="Slug" required hint="Lowercase letters, numbers, and hyphens.">
        <TextInput
          id="cat-slug"
          value={form.slug}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setSlugTouched(true);
            onChange({ slug: e.target.value });
          }}
          placeholder="politics"
        />
      </Field>

      <Field id="cat-desc" label="Description">
        <Textarea
          id="cat-desc"
          rows={3}
          value={form.description}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            onChange({ description: e.target.value })
          }
          placeholder="One-line summary (optional)."
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S[3] }}>
        <Field id="cat-color" label="Color (hex)" hint="#1f2937">
          <TextInput
            id="cat-color"
            value={form.color_hex}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onChange({ color_hex: e.target.value })
            }
            placeholder="#1f2937"
          />
        </Field>
        <Field id="cat-icon" label="Icon name" hint="Matches the icon set in code.">
          <TextInput
            id="cat-icon"
            value={form.icon_name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onChange({ icon_name: e.target.value })
            }
            placeholder="building-columns"
          />
        </Field>
      </div>

      <Field id="cat-sort" label="Sort order" hint="Lower numbers appear first.">
        <NumberInput
          id="cat-sort"
          min={0}
          value={form.sort_order}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onChange({ sort_order: Math.max(0, parseInt(e.target.value, 10) || 0) })
          }
        />
      </Field>

      <div style={{ display: 'flex', flexDirection: 'column', gap: S[2], marginTop: S[2] }}>
        <Switch
          checked={form.is_active}
          onChange={(next: boolean) => onChange({ is_active: next })}
          label="Active"
          hint="Visible to readers when on."
        />
        <Switch
          checked={form.is_kids_safe}
          onChange={(next: boolean) => onChange({ is_kids_safe: next })}
          label="Kids-safe"
          hint="Available to the kids surface."
        />
        <Switch
          checked={form.is_premium}
          onChange={(next: boolean) => onChange({ is_premium: next })}
          label="Premium"
          hint="Reserved for paid tiers."
        />
      </div>
    </div>
  );
}
