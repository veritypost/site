// @admin-verified 2026-04-18
'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Tables } from '@/types/database-helpers';

import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import DataTable from '@/components/admin/DataTable';
import Toolbar from '@/components/admin/Toolbar';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Select from '@/components/admin/Select';
import Checkbox from '@/components/admin/Checkbox';
import Badge from '@/components/admin/Badge';
import StatCard from '@/components/admin/StatCard';
import Drawer from '@/components/admin/Drawer';
import EmptyState from '@/components/admin/EmptyState';
import Spinner from '@/components/admin/Spinner';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';

// Blueprint v2: `story_clusters` was renamed to `feed_clusters`. This page
// reads `feed_clusters` + `feed_cluster_articles` and maps the real fields
// to the display model.

type FeedClusterRow = Tables<'feed_clusters'>;
type ClusterWithJoins = FeedClusterRow & {
  categories: { name: string | null } | null;
  feed_cluster_articles: Array<{ count: number }>;
};
type Confidence = 'high' | 'medium' | 'low';
type DisplayCluster = ClusterWithJoins & {
  topic: string;
  sources: string[];
  articleCount: number;
  confidence: Confidence;
  category: string;
  freshness: string;
  drafted: boolean;
};

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function IngestAdminInner() {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const [clusters, setClusters] = useState<ClusterWithJoins[]>([]);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<string[]>([]);
  const [filter, setFilter] = useState<'all' | 'ready' | 'drafted' | 'low'>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<DisplayCluster | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: profile } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles!fk_user_roles_role_id(name)')
        .eq('user_id', user.id);
      const roleNames = (userRoles || [])
        .map((r) => (r as { roles?: { name?: string | null } | null }).roles?.name?.toLowerCase())
        .filter((r): r is string => Boolean(r));
      if (!profile || !roleNames.some((r) => r === 'owner' || r === 'admin')) {
        router.push('/');
        return;
      }

      const { data, error } = await supabase
        .from('feed_clusters')
        .select(
          'id, title, summary, primary_article_id, category_id, keywords, similarity_threshold, is_active, is_breaking, created_at, categories(name), feed_cluster_articles(count)',
        )
        .order('created_at', { ascending: false });

      if (error) {
        toast.push({ message: `Failed to load clusters: ${error.message}`, variant: 'danger' });
        setClusters([]);
      } else {
        setClusters((data as unknown as ClusterWithJoins[]) || []);
      }
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const normCluster = (c: ClusterWithJoins): DisplayCluster => {
    const thresh = c.similarity_threshold ?? 0.5;
    const confidence: Confidence = thresh >= 0.8 ? 'high' : thresh >= 0.6 ? 'medium' : 'low';
    const keywords = Array.isArray(c.keywords) ? (c.keywords as unknown as string[]) : [];
    const articleCount =
      Array.isArray(c.feed_cluster_articles) && c.feed_cluster_articles[0]?.count != null
        ? c.feed_cluster_articles[0].count
        : 0;
    return {
      ...c,
      topic: c.title || '',
      sources: keywords,
      articleCount,
      confidence,
      category: c.categories?.name || '',
      freshness: c.created_at ? relativeTime(c.created_at) : '',
      drafted: !!c.primary_article_id,
    };
  };

  const displayClusters = useMemo(() => clusters.map(normCluster), [clusters]);

  const filtered = useMemo(() => {
    let list = displayClusters;
    if (filter === 'ready') list = list.filter((c) => !c.drafted && c.confidence !== 'low');
    if (filter === 'drafted') list = list.filter((c) => c.drafted);
    if (filter === 'low') list = list.filter((c) => c.confidence === 'low');
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) => c.topic.toLowerCase().includes(q) || (c.summary || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [displayClusters, filter, search]);

  const toggleCheck = (id: string) =>
    setChecked((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));

  const selectAllUndrafted = () => {
    const ids = filtered.filter((c) => !c.drafted).map((c) => c.id);
    setChecked(ids);
  };

  const draftChecked = async () => {
    // Drafting a cluster = running the AI pipeline to produce an article
    // row and setting feed_clusters.primary_article_id. That endpoint is
    // not yet wired — surfaced here so the admin knows why nothing
    // persists.
    toast.push({
      message: 'Drafting pipeline not wired yet. A backend job needs to create an article from each cluster.',
      variant: 'warn',
      duration: 6000,
    });
    setChecked([]);
  };

  const confidenceVariant = (c: Confidence): 'success' | 'warn' | 'danger' => {
    if (c === 'high') return 'success';
    if (c === 'medium') return 'warn';
    return 'danger';
  };

  const columns = [
    {
      key: 'select',
      header: '',
      sortable: false,
      width: 42,
      render: (row: DisplayCluster) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={checked.includes(row.id)}
            disabled={row.drafted}
            onChange={() => !row.drafted && toggleCheck(row.id)}
          />
        </div>
      ),
    },
    {
      key: 'topic',
      header: 'Topic',
      render: (row: DisplayCluster) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: ADMIN_C.white }}>{row.topic || 'Untitled cluster'}</div>
          {row.summary && (
            <div style={{ fontSize: F.xs, color: ADMIN_C.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{row.summary}</div>
          )}
        </div>
      ),
    },
    {
      key: 'confidence',
      header: 'Confidence',
      width: 130,
      render: (row: DisplayCluster) => (
        <Badge variant={confidenceVariant(row.confidence)} dot>{row.confidence}</Badge>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      width: 140,
      render: (row: DisplayCluster) => row.category || <span style={{ color: ADMIN_C.muted }}>—</span>,
    },
    {
      key: 'articleCount',
      header: 'Articles',
      align: 'right' as const,
      width: 100,
    },
    {
      key: 'freshness',
      header: 'Age',
      width: 110,
      render: (row: DisplayCluster) => <span style={{ color: ADMIN_C.dim, fontSize: F.sm }}>{row.freshness}</span>,
    },
    {
      key: 'drafted',
      header: 'State',
      width: 100,
      render: (row: DisplayCluster) =>
        row.drafted ? <Badge variant="success" dot>Drafted</Badge> : <Badge variant="neutral">Pending</Badge>,
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

  const stats = {
    total: displayClusters.length,
    ready: displayClusters.filter((c) => !c.drafted && c.confidence !== 'low').length,
    drafted: displayClusters.filter((c) => c.drafted).length,
    low: displayClusters.filter((c) => c.confidence === 'low').length,
  };

  return (
    <Page>
      <PageHeader
        title="Source ingest"
        subtitle="Incoming article clusters from RSS feeds. Draft the high-confidence ones into articles."
        actions={
          checked.length > 0 ? (
            <Button variant="primary" onClick={draftChecked}>Draft {checked.length} cluster{checked.length > 1 ? 's' : ''}</Button>
          ) : null
        }
      />

      <PageSection>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: S[3] }}>
          <StatCard label="Clusters" value={stats.total} />
          <StatCard label="Ready to draft" value={stats.ready} />
          <StatCard label="Already drafted" value={stats.drafted} />
          <StatCard label="Low confidence" value={stats.low} />
        </div>
      </PageSection>

      <PageSection title="Clusters">
        <DataTable
          rowKey={(r: DisplayCluster) => r.id}
          columns={columns}
          rows={filtered}
          onRowClick={(r: DisplayCluster) => setSelected(r)}
          toolbar={
            <Toolbar
              left={
                <>
                  <TextInput type="search" placeholder="Search topic" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 280 }} />
                  <Select
                    value={filter}
                    onChange={(e) => { setFilter(e.target.value as typeof filter); setChecked([]); }}
                    block={false}
                    style={{ width: 180 }}
                    options={[
                      { value: 'all', label: 'All clusters' },
                      { value: 'ready', label: 'Ready to draft' },
                      { value: 'drafted', label: 'Already drafted' },
                      { value: 'low', label: 'Low confidence' },
                    ]}
                  />
                </>
              }
              right={
                <Button variant="ghost" size="sm" onClick={selectAllUndrafted}>Select undrafted</Button>
              }
            />
          }
          empty={
            <EmptyState
              title="No clusters"
              description="Clusters arrive from the feed poller. Add feeds or wait for the next cycle."
              cta={<Button variant="secondary" onClick={() => router.push('/admin/feeds')}>Open feeds</Button>}
            />
          }
        />
      </PageSection>

      <PageSection title="How it works" divider={false}>
        <div
          style={{
            padding: S[4],
            border: `1px solid ${ADMIN_C.divider}`,
            borderRadius: 8,
            background: ADMIN_C.bg,
            fontSize: F.sm,
            color: ADMIN_C.dim,
            lineHeight: 1.6,
          }}
        >
          Clusters are grouped by topic from incoming RSS articles. High confidence = three or more sources agree.
          Low confidence = single source or conflicting claims. Drafting sends the cluster through the full AI pipeline.
        </div>
      </PageSection>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.topic || 'Cluster detail'}
        description={selected?.summary || undefined}
        width="md"
      >
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
            <KV label="Confidence" value={<Badge variant={confidenceVariant(selected.confidence)} dot>{selected.confidence}</Badge>} />
            <KV label="Category" value={selected.category || '—'} />
            <KV label="Articles clustered" value={String(selected.articleCount)} />
            <KV label="Similarity threshold" value={String(selected.similarity_threshold ?? '—')} />
            <KV label="Created" value={selected.freshness} />
            <KV label="Breaking" value={selected.is_breaking ? 'Yes' : 'No'} />
            <KV label="Drafted" value={selected.drafted ? 'Yes' : 'No'} />
            {selected.sources.length > 0 && (
              <div>
                <div style={labelStyle}>Keywords</div>
                <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap' }}>
                  {selected.sources.map((s) => (
                    <Badge key={s} variant="ghost" size="xs">{s}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </Page>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: F.xs,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: ADMIN_C.dim,
  marginBottom: S[1],
};

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: S[3], padding: `${S[1]}px 0`, borderBottom: `1px solid ${ADMIN_C.divider}` }}>
      <span style={{ fontSize: F.sm, color: ADMIN_C.dim }}>{label}</span>
      <span style={{ fontSize: F.sm, color: ADMIN_C.white, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

export default function IngestAdmin() {
  return (
    <ToastProvider>
      <IngestAdminInner />
    </ToastProvider>
  );
}
