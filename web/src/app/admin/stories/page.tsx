// @admin-verified 2026-04-18
'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_ROLES } from '@/lib/roles';
import { createClient } from '@/lib/supabase/client';
import DestructiveActionConfirm from '@/components/admin/DestructiveActionConfirm';
import type { Tables } from '@/types/database-helpers';

import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import DataTable from '@/components/admin/DataTable';
import Toolbar from '@/components/admin/Toolbar';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Select from '@/components/admin/Select';
import Badge from '@/components/admin/Badge';
import EmptyState from '@/components/admin/EmptyState';
import Spinner from '@/components/admin/Spinner';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';

type ArticleRow = Tables<'articles'> & {
  categories: { name: string | null } | null;
  users: { username: string | null } | null;
};

type StatusFilter = 'all' | 'published' | 'draft' | 'scheduled';

type DestructiveState = {
  title: string;
  message: React.ReactNode;
  confirmText: string;
  confirmLabel: string;
  reasonRequired: boolean;
  action: string;
  targetTable: string | null;
  targetId: string | null;
  oldValue: unknown;
  newValue: unknown;
  run: (args: { reason: string }) => Promise<void>;
} | null;

function timeAgo(ts: string | null | undefined) {
  if (!ts) return 'never';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 0) return 'scheduled';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const statusVariant = (s: string | null): 'success' | 'warn' | 'neutral' => {
  if (s === 'published') return 'success';
  if (s === 'scheduled') return 'warn';
  return 'neutral';
};

function StoriesAdminInner() {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const [stories, setStories] = useState<ArticleRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [audienceFilter, setAudienceFilter] = useState<'all' | 'adult' | 'kids'>('all');
  const [destructive, setDestructive] = useState<DestructiveState>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { router.push('/login'); return; }

      const { data: profile } = await supabase.from('users').select('id').eq('id', user.id).single();
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id);
      const roleNames = (userRoles || [])
        .map((r) => (r as { roles?: { name?: string | null } | null }).roles?.name?.toLowerCase())
        .filter((r): r is string => Boolean(r));
      if (!profile || !roleNames.some((r) => ADMIN_ROLES.has(r))) {
        router.push('/');
        return;
      }

      const [storiesRes, categoriesRes] = await Promise.all([
        supabase
          .from('articles')
          .select('*, categories!fk_articles_category_id(name), users!author_id(username)')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase.from('categories').select('name').order('name'),
      ]);

      if (storiesRes.error) {
        toast.push({ message: `Failed to load articles: ${storiesRes.error.message}`, variant: 'danger' });
      } else {
        setStories((storiesRes.data as unknown as ArticleRow[]) || []);
      }
      if (!categoriesRes.error && categoriesRes.data) {
        setCategories(categoriesRes.data.map((c) => c.name).filter((n): n is string => Boolean(n)));
      }
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    return stories.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      const catName = s.categories?.name;
      if (categoryFilter !== 'all' && catName !== categoryFilter) return false;
      if (audienceFilter === 'kids' && !s.is_kids_safe) return false;
      if (audienceFilter === 'adult' && s.is_kids_safe) return false;
      if (search.trim() && !(s.title || '').toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [stories, statusFilter, categoryFilter, audienceFilter, search]);

  const removeArticle = async (story: ArticleRow) => {
    let readerCount: number | string = '?';
    let commentCount: number | string = '?';
    try {
      const [readsRes, commentsRes] = await Promise.all([
        supabase.from('reading_log').select('id', { count: 'exact', head: true }).eq('article_id', story.id),
        supabase.from('comments').select('id', { count: 'exact', head: true }).eq('article_id', story.id),
      ]);
      readerCount = readsRes.count ?? '?';
      commentCount = commentsRes.count ?? '?';
    } catch (e) { console.error('[admin/stories] delete preview counts', e); }

    setDestructive({
      title: `Delete "${story.title}"?`,
      message: (
        <div>
          <div style={{ marginBottom: S[1] }}>Removes the article and every row keyed to it. Cannot be undone.</div>
          <div style={{ fontSize: F.xs, color: ADMIN_C.dim }}>
            Impact: <strong style={{ color: ADMIN_C.white }}>{readerCount}</strong> recorded reads · <strong style={{ color: ADMIN_C.white }}>{commentCount}</strong> comments.
          </div>
        </div>
      ),
      confirmText: 'delete',
      confirmLabel: 'Delete article',
      reasonRequired: true,
      action: 'article.delete',
      targetTable: 'articles',
      targetId: story.id,
      oldValue: { title: story.title, status: story.status, slug: story.slug },
      newValue: null,
      run: async () => {
        const res = await fetch(`/api/admin/articles/${story.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || 'Delete failed');
        }
        setStories((prev) => prev.filter((s) => s.id !== story.id));
        toast.push({ message: 'Article deleted', variant: 'success' });
      },
    });
  };

  const setStatus = async (story: ArticleRow, next: 'published' | 'draft') => {
    const res = await fetch(`/api/admin/articles/${story.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.push({ message: `Status change failed: ${j.error || 'unknown error'}`, variant: 'danger' });
      return;
    }
    const payload: { status: 'published' | 'draft'; published_at?: string | null } = { status: next };
    if (next === 'published') payload.published_at = new Date().toISOString();
    setStories((prev) =>
      prev.map((s) => (s.id === story.id ? { ...s, ...payload } : s)),
    );
    toast.push({ message: next === 'published' ? 'Article published' : 'Article unpublished', variant: 'success' });
  };

  const columns = [
    {
      key: 'title',
      header: 'Article',
      truncate: true,
      render: (row: ArticleRow) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: S[1], flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, color: ADMIN_C.white, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {row.title || 'Untitled'}
            </span>
            {row.is_breaking && <Badge variant="danger" size="xs">Breaking</Badge>}
            {row.is_kids_safe && <Badge variant="info" size="xs">Kids</Badge>}
          </div>
          <div style={{ fontSize: F.xs, color: ADMIN_C.dim, display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
            <span>@{row.users?.username || 'unknown'}</span>
            {row.categories?.name && <span>{row.categories.name}</span>}
            <span>{timeAgo(row.created_at)}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 120,
      render: (row: ArticleRow) => <Badge variant={statusVariant(row.status)} dot>{row.status || 'draft'}</Badge>,
    },
    {
      key: 'view_count',
      header: 'Views',
      align: 'right' as const,
      width: 90,
      render: (row: ArticleRow) => (row.view_count ?? 0).toLocaleString(),
    },
    {
      key: 'actions',
      header: 'Actions',
      sortable: false,
      width: 320,
      render: (row: ArticleRow) => (
        <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: S[1], flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* Y5-#7 — adult articles open the F7 review surface; kids
              articles still go to the kids-story-manager (no review page
              yet on the kids side). Quiz pool stays as a secondary
              action so editors can still hand-tune the question bank. */}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => router.push(
              row.is_kids_safe
                ? `/admin/kids-story-manager?article=${row.id}`
                : `/admin/articles/${row.id}/review`,
            )}
          >
            {row.is_kids_safe ? 'Edit' : 'Review'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => router.push(`/admin/story-manager?article=${row.id}`)}>Quiz pool</Button>
          {row.status === 'published' ? (
            <Button size="sm" variant="ghost" onClick={() => setStatus(row, 'draft')}>Unpublish</Button>
          ) : (
            <Button size="sm" variant="primary" onClick={() => setStatus(row, 'published')}>Publish</Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => removeArticle(row)} style={{ color: ADMIN_C.danger }}>Delete</Button>
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <Page>
        <div style={{ padding: S[12], display: 'flex', justifyContent: 'center' }}>
          <Spinner size={20} />
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Articles"
        subtitle="Every adult and kids article on the platform. Edit, publish, and manage quiz pools."
        actions={
          <>
            <Badge variant="neutral">{stories.length} total</Badge>
            <Button variant="primary" onClick={() => router.push('/admin/story-manager?new=1')}>New article</Button>
          </>
        }
      />

      <PageSection>
        <DataTable
          rowKey={(r: ArticleRow) => r.id}
          columns={columns}
          rows={filtered}
          // Y5-#7 — row click opens the F7 review surface for adult
          // articles (the canonical editorial landing for each story).
          // Kids stories still open kids-story-manager since the review
          // surface doesn't exist on that side yet. Quiz pool is a
          // per-row secondary button above for editors who need it.
          onRowClick={(r: ArticleRow) => router.push(
            r.is_kids_safe
              ? `/admin/kids-story-manager?article=${r.id}`
              : `/admin/articles/${r.id}/review`,
          )}
          toolbar={
            <Toolbar
              left={
                <>
                  <TextInput
                    type="search"
                    placeholder="Search by title"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ maxWidth: 280 }}
                  />
                  <Select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    block={false}
                    style={{ width: 150 }}
                    options={[
                      { value: 'all', label: 'All statuses' },
                      { value: 'published', label: 'Published' },
                      { value: 'draft', label: 'Draft' },
                      { value: 'scheduled', label: 'Scheduled' },
                    ]}
                  />
                  <Select
                    value={audienceFilter}
                    onChange={(e) => setAudienceFilter(e.target.value as typeof audienceFilter)}
                    block={false}
                    style={{ width: 130 }}
                    options={[
                      { value: 'all', label: 'All audiences' },
                      { value: 'adult', label: 'Adult' },
                      { value: 'kids', label: 'Kids' },
                    ]}
                  />
                  <Select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    block={false}
                    style={{ width: 180 }}
                    options={[
                      { value: 'all', label: 'All categories' },
                      ...categories.map((c) => ({ value: c, label: c })),
                    ]}
                  />
                </>
              }
              right={<span style={{ fontSize: F.sm, color: ADMIN_C.dim }}>{filtered.length} matched</span>}
            />
          }
          empty={
            <EmptyState
              title="No articles match"
              description={search.trim() ? `Nothing matches "${search}". Try another query.` : 'Draft your first article to see it here.'}
              cta={<Button variant="primary" onClick={() => router.push('/admin/story-manager?new=1')}>New article</Button>}
            />
          }
        />
      </PageSection>

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
        onConfirm={async ({ reason }: { reason: string }) => {
          try {
            await destructive?.run?.({ reason });
            setDestructive(null);
          } catch (err) {
            toast.push({ message: (err as Error)?.message || 'Action failed', variant: 'danger' });
          }
        }}
      />
    </Page>
  );
}

export default function StoriesAdmin() {
  return (
    <ToastProvider>
      <StoriesAdminInner />
    </ToastProvider>
  );
}
