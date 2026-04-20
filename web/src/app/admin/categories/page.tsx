// @admin-verified 2026-04-18
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import DataTable from '@/components/admin/DataTable';
import Toolbar from '@/components/admin/Toolbar';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import NumberInput from '@/components/admin/NumberInput';
import Switch from '@/components/admin/Switch';
import StatCard from '@/components/admin/StatCard';
import EmptyState from '@/components/admin/EmptyState';
import Drawer from '@/components/admin/Drawer';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import Badge from '@/components/admin/Badge';
import { useToast } from '@/components/admin/Toast';

type CategoryRow = Tables<'categories'>;

type CategoryWithSubs = CategoryRow & {
  subs: CategoryRow[];
};

type Tab = 'adult' | 'kids';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function CategoriesAdmin() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { push } = useToast();

  const [tab, setTab] = useState<Tab>('adult');
  const [adultCats, setAdultCats] = useState<CategoryWithSubs[]>([]);
  const [kidsCats, setKidsCats] = useState<CategoryWithSubs[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [newCat, setNewCat] = useState<string>('');
  const [drawerRow, setDrawerRow] = useState<CategoryWithSubs | null>(null);
  const [newSub, setNewSub] = useState<string>('');
  const [confirm, setConfirmState] = useState<{
    kind: 'delete-category' | 'delete-sub';
    catId: string;
    subId?: string;
    label: string;
  } | null>(null);

  const fetchCategories = useCallback(async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false });

    if (error || !data) return;

    const parents = data.filter((c) => !c.parent_id);
    const subs = data.filter((c) => !!c.parent_id);

    const withSubs: CategoryWithSubs[] = parents.map((p) => ({
      ...p,
      subs: subs.filter((s) => s.parent_id === p.id),
    }));

    setAdultCats(withSubs.filter((c) => !c.is_kids_safe));
    setKidsCats(withSubs.filter((c) => c.is_kids_safe));
  }, [supabase]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }

      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id);
      const roleNames = (userRoles || [])
        .map((r) => {
          const rel = (r as { roles: { name: string } | { name: string }[] | null }).roles;
          if (Array.isArray(rel)) return rel[0]?.name;
          return rel?.name;
        })
        .filter(Boolean) as string[];
      const allowed = ['owner', 'superadmin', 'admin', 'editor'];
      if (!allowed.some((r) => roleNames.includes(r))) {
        router.push('/');
        return;
      }

      await fetchCategories();
      setLoading(false);
    };
    init();
  }, [supabase, router, fetchCategories]);

  const cats = tab === 'adult' ? adultCats : kidsCats;
  const setCats = tab === 'adult' ? setAdultCats : setKidsCats;

  const toggleVisibility = async (id: string, next: boolean) => {
    // Optimistic local update; rollback on failure.
    setCats((prev) => prev.map((c) => (c.id === id ? { ...c, is_active: next } : c)));
    const res = await fetch(`/api/admin/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: next }),
    });
    if (!res.ok) {
      setCats((prev) => prev.map((c) => (c.id === id ? { ...c, is_active: !next } : c)));
      const body = await res.json().catch(() => ({ error: 'Update failed' }));
      push({ message: `Could not update: ${body.error || 'unknown error'}`, variant: 'danger' });
    } else {
      push({ message: next ? 'Category enabled' : 'Category hidden', variant: 'success' });
    }
  };

  const updateSortOrder = async (id: string, next: number) => {
    setCats((prev) => prev.map((c) => (c.id === id ? { ...c, sort_order: next } : c)));
    const res = await fetch(`/api/admin/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sort_order: next }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'save failed' }));
      push({ message: `Sort-order save failed: ${body.error || 'unknown error'}`, variant: 'danger' });
    }
  };

  const addCategory = async () => {
    if (!newCat.trim()) return;
    const name = newCat.trim();
    const slug = slugify(name);
    const isKids = tab === 'kids';
    const sort_order = cats.length;

    const res = await fetch('/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug, is_active: true, is_kids_safe: isKids, sort_order }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.row) {
      push({ message: `Could not add category: ${json.error || 'unknown error'}`, variant: 'danger' });
      return;
    }
    setCats((prev) => [...prev, { ...json.row, subs: [] }]);
    setNewCat('');
    push({ message: `Added "${name}"`, variant: 'success' });
  };

  const addSub = async (catId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const slug = slugify(trimmed);
    const res = await fetch('/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: trimmed,
        slug,
        parent_id: catId,
        is_active: true,
        is_kids_safe: tab === 'kids',
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.row) {
      push({ message: `Could not add subcategory: ${json.error || 'unknown error'}`, variant: 'danger' });
      return;
    }
    setCats((prev) => prev.map((c) => (c.id === catId ? { ...c, subs: [...c.subs, json.row] } : c)));
    setDrawerRow((prev) => (prev && prev.id === catId ? { ...prev, subs: [...prev.subs, json.row] } : prev));
    setNewSub('');
    push({ message: `Added "${trimmed}"`, variant: 'success' });
  };

  const removeSub = async (catId: string, subId: string) => {
    const res = await fetch(`/api/admin/categories/${subId}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'delete failed' }));
      push({ message: `Could not delete: ${body.error || 'unknown error'}`, variant: 'danger' });
      return;
    }
    setCats((prev) =>
      prev.map((c) => (c.id === catId ? { ...c, subs: c.subs.filter((s) => s.id !== subId) } : c)),
    );
    setDrawerRow((prev) =>
      prev && prev.id === catId ? { ...prev, subs: prev.subs.filter((s) => s.id !== subId) } : prev,
    );
    push({ message: 'Subcategory removed', variant: 'success' });
  };

  const visibleCount = cats.filter((c) => c.is_active !== false).length;
  const totalSubs = cats.reduce((a, c) => a + c.subs.length, 0);

  const columns = [
    {
      key: 'name' as const,
      header: 'Name',
      render: (row: CategoryWithSubs) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontWeight: 600, color: row.is_active === false ? C.muted : C.white }}>
            {row.name}
          </span>
          <span style={{ fontSize: F.xs, color: C.muted }}>/{row.slug}</span>
        </div>
      ),
    },
    {
      key: 'subs' as const,
      header: 'Subs',
      align: 'right' as const,
      width: 80,
      sortable: false,
      render: (row: CategoryWithSubs) => (
        <span style={{ color: row.subs.length > 0 ? C.white : C.muted }}>{row.subs.length}</span>
      ),
    },
    {
      key: 'sort_order' as const,
      header: 'Sort',
      align: 'right' as const,
      width: 110,
      render: (row: CategoryWithSubs) => (
        <div onClick={(e) => e.stopPropagation()}>
          <NumberInput
            size="sm"
            block={false}
            min={0}
            value={row.sort_order ?? 0}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const v = Math.max(0, parseInt(e.target.value, 10) || 0);
              setCats((prev) => prev.map((c) => (c.id === row.id ? { ...c, sort_order: v } : c)));
            }}
            onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
              updateSortOrder(row.id, Math.max(0, parseInt(e.target.value, 10) || 0));
            }}
            style={{ width: 76, textAlign: 'right' }}
          />
        </div>
      ),
    },
    {
      key: 'is_active' as const,
      header: 'Visible',
      align: 'right' as const,
      width: 90,
      render: (row: CategoryWithSubs) => (
        <div onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
          <Switch
            checked={row.is_active !== false}
            onChange={(next: boolean) => toggleVisibility(row.id, next)}
          />
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <Page maxWidth={880}>
        <PageHeader title="Categories" subtitle="Loading…" />
      </Page>
    );
  }

  return (
    <Page maxWidth={880}>
      <PageHeader
        title="Categories"
        subtitle="News categories and subcategories for adult and kids content"
      />

      {/* Tab switch — adult / kids */}
      <Toolbar
        left={(
          <div style={{ display: 'inline-flex', border: `1px solid ${C.divider}`, borderRadius: 6, overflow: 'hidden' }}>
            {(['adult', 'kids'] as Tab[]).map((t) => {
              const active = tab === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
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
                  {t === 'adult' ? 'Adult' : 'Kids'}{' '}
                  <span style={{ opacity: 0.7 }}>
                    ({(t === 'adult' ? adultCats : kidsCats).length})
                  </span>
                </button>
              );
            })}
          </div>
        )}
      />

      {/* Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
          gap: S[3],
          marginBottom: S[6],
        }}
      >
        <StatCard label="Categories" value={cats.length} />
        <StatCard label="Visible" value={visibleCount} />
        <StatCard label="Subcategories" value={totalSubs} />
      </div>

      <PageSection
        title={tab === 'adult' ? 'Adult categories' : 'Kids categories'}
        description="Click a row to manage its subcategories"
      >
        <DataTable
          columns={columns}
          rows={cats}
          rowKey={(r) => (r as CategoryWithSubs).id}
          onRowClick={(r) => setDrawerRow(r as CategoryWithSubs)}
          paginate={false}
          empty={(
            <EmptyState
              title={`No ${tab} categories yet`}
              description="Add one below to get started."
            />
          )}
        />

        {/* Add new — one input, one button */}
        <div style={{ display: 'flex', gap: S[2], marginTop: S[3], flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <TextInput
              value={newCat}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewCat(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') addCategory(); }}
              placeholder={`New ${tab} category name`}
            />
          </div>
          <Button variant="primary" onClick={addCategory} disabled={!newCat.trim()}>
            Add category
          </Button>
        </div>
      </PageSection>

      {/* Drawer — subcategory management */}
      <Drawer
        open={!!drawerRow}
        onClose={() => { setDrawerRow(null); setNewSub(''); }}
        title={drawerRow ? drawerRow.name : ''}
        description={drawerRow ? `Slug /${drawerRow.slug} · sort ${drawerRow.sort_order ?? 0}` : ''}
        width="md"
      >
        {drawerRow && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[4] }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[3] }}>
              <div>
                <div style={{ fontSize: F.base, fontWeight: 600, color: C.white }}>Visibility</div>
                <div style={{ fontSize: F.xs, color: C.dim }}>Toggle whether readers see this category</div>
              </div>
              <Switch
                checked={drawerRow.is_active !== false}
                onChange={(next: boolean) => {
                  setDrawerRow({ ...drawerRow, is_active: next });
                  toggleVisibility(drawerRow.id, next);
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: F.base, fontWeight: 600, color: C.white, marginBottom: S[2] }}>
                Subcategories
              </div>
              {drawerRow.subs.length === 0 ? (
                <div style={{ fontSize: F.sm, color: C.dim }}>No subcategories yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
                  {drawerRow.subs.map((sub) => (
                    <div
                      key={sub.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: S[2],
                        padding: `${S[2]}px ${S[3]}px`,
                        border: `1px solid ${C.divider}`,
                        borderRadius: 6,
                        background: C.bg,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: F.base, color: C.white, fontWeight: 500 }}>{sub.name}</div>
                        <div style={{ fontSize: F.xs, color: C.muted }}>/{sub.slug}</div>
                      </div>
                      {sub.is_active === false && <Badge variant="warn" size="xs">Hidden</Badge>}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmState({ kind: 'delete-sub', catId: drawerRow.id, subId: sub.id, label: sub.name })}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: S[2], marginTop: S[3], flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                  <TextInput
                    value={newSub}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewSub(e.target.value)}
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === 'Enter') addSub(drawerRow.id, newSub);
                    }}
                    placeholder="New subcategory name"
                  />
                </div>
                <Button
                  variant="primary"
                  onClick={() => addSub(drawerRow.id, newSub)}
                  disabled={!newSub.trim()}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Destructive-action confirm — only used for subcategory removal */}
      <ConfirmDialog
        open={confirm?.kind === 'delete-sub'}
        title="Remove subcategory?"
        message={confirm ? `"${confirm.label}" will be deleted. This cannot be undone.` : ''}
        confirmLabel="Remove"
        variant="danger"
        onCancel={() => setConfirmState(null)}
        onConfirm={async () => {
          if (confirm?.kind === 'delete-sub' && confirm.subId) {
            await removeSub(confirm.catId, confirm.subId);
          }
          setConfirmState(null);
        }}
      />
    </Page>
  );
}
