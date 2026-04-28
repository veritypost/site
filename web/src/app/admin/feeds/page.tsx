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
import NumberInput from '@/components/admin/NumberInput';
import Switch from '@/components/admin/Switch';
import Drawer from '@/components/admin/Drawer';
import Modal from '@/components/admin/Modal';
import Badge from '@/components/admin/Badge';
import StatCard from '@/components/admin/StatCard';
import EmptyState from '@/components/admin/EmptyState';
import Spinner from '@/components/admin/Spinner';
import { confirm, ConfirmDialogHost } from '@/components/admin/ConfirmDialog';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';

// Blueprint v2 uses `feeds` (not the legacy `rss_feeds`). Columns renamed:
// outlet -> name/source_name, active -> is_active, fail_count -> error_count,
// last_pull -> last_polled_at, stale_since removed (derive from last_polled_at).
//
// Unified-feed pivot: `feeds.audience` column stays in DB for back-compat with
// the cluster-mutation RPCs, but the UI no longer surfaces it. Every active
// feed contributes to the same discovery pool; operators pick adult vs kid at
// generation time on the Newsroom page.

type FeedRow = Tables<'feeds'>;
type FeedStatus = 'ok' | 'stale' | 'broken';

type DisplayFeed = FeedRow & {
  outlet: string;
  status: FeedStatus;
  lastPull: string;
  articles: number;
  active: boolean;
  failCount: number;
};

function FeedsAdminInner() {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const [feeds, setFeeds] = useState<FeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newOutlet, setNewOutlet] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [filter, setFilter] = useState<'all' | 'ok' | 'issues'>('all');
  const [search, setSearch] = useState('');
  const [staleHours, setStaleHours] = useState(6);
  const [brokenFailCount, setBrokenFailCount] = useState(10);
  const [pullIntervalMin, setPullIntervalMin] = useState(30);
  const [selected, setSelected] = useState<DisplayFeed | null>(null);
  const [adding, setAdding] = useState(false);

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

      const { data, error: feedsError } = await supabase
        .from('feeds')
        .select('*')
        .order('name');

      if (feedsError) {
        toast.push({ message: `Feeds request failed: ${feedsError.message}`, variant: 'danger' });
        setFeeds([]);
      } else {
        setFeeds(data || []);
      }

      // S6-A59: hydrate stale + broken thresholds from `settings` so this
      // page and /admin/system read the same source of truth. Prior code
      // kept local-state-only values that diverged silently.
      const { data: settingsRows } = await supabase
        .from('settings')
        .select('key, value')
        .in('key', ['stale_feed_hours', 'broken_feed_failures']);
      if (settingsRows) {
        (settingsRows as Array<{ key: string; value: string | null }>).forEach((r) => {
          if (r.value == null) return;
          const n = parseInt(String(r.value), 10);
          if (!Number.isFinite(n) || n <= 0) return;
          if (r.key === 'stale_feed_hours') setStaleHours(n);
          if (r.key === 'broken_feed_failures') setBrokenFailCount(n);
        });
      }

      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // S6-A59: persist threshold edits via the canonical settings upsert
  // so /admin/system + /admin/feeds + the runtime cron read the same
  // value.
  const saveThreshold = async (key: string, value: number) => {
    try {
      const res = await fetch('/api/admin/settings/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: String(value) }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.push({
          message: j.error || `Could not save ${key}`,
          variant: 'danger',
        });
      }
    } catch (err) {
      console.error('[admin.feeds] saveThreshold failed:', err);
      toast.push({ message: 'Save failed — try again', variant: 'danger' });
    }
  };

  const deriveStatus = (f: FeedRow): FeedStatus => {
    const errors = f.error_count ?? 0;
    if (errors >= brokenFailCount) return 'broken';
    const lastPolled = f.last_polled_at ? new Date(f.last_polled_at).getTime() : 0;
    if (lastPolled && Date.now() - lastPolled > staleHours * 3600 * 1000) return 'stale';
    if (!lastPolled) return 'stale';
    return 'ok';
  };

  const normFeed = (f: FeedRow): DisplayFeed => ({
    ...f,
    outlet: f.source_name || f.name || '',
    status: deriveStatus(f),
    lastPull: (f.last_polled_at || '').replace('T', ' ').slice(0, 16) || 'Never',
    articles: f.articles_imported_count ?? 0,
    active: f.is_active ?? true,
    failCount: f.error_count ?? 0,
  });

  // normFeed closes over staleHours + brokenFailCount; listing those as
  // deps is equivalent to listing the function itself (re-created each
  // render, same inputs). Lint can't see the capture.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const displayFeeds = useMemo(() => feeds.map(normFeed), [feeds, staleHours, brokenFailCount]);

  const filtered = useMemo(() => {
    let list = displayFeeds;
    if (filter === 'ok') list = list.filter((f) => f.status === 'ok');
    if (filter === 'issues') list = list.filter((f) => f.status !== 'ok');
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (f) => f.outlet.toLowerCase().includes(q) || (f.url || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [displayFeeds, filter, search]);

  const toggleFeed = async (id: string, nextValue: boolean) => {
    setFeeds((prev) => prev.map((f) => (f.id === id ? { ...f, is_active: nextValue } : f)));
    const res = await fetch(`/api/admin/feeds/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: nextValue }),
    });
    if (!res.ok) {
      setFeeds((prev) => prev.map((f) => (f.id === id ? { ...f, is_active: !nextValue } : f)));
      const json = await res.json().catch(() => ({ error: 'toggle failed' }));
      toast.push({ message: `Toggle failed: ${json.error || 'unknown error'}`, variant: 'danger' });
    } else {
      toast.push({ message: nextValue ? 'Feed resumed' : 'Feed paused', variant: 'success', duration: 1500 });
    }
  };

  const removeFeed = async (feed: DisplayFeed) => {
    const ok = await confirm({
      title: `Remove feed "${feed.outlet}"?`,
      message: 'The feed will stop polling and the row is deleted. Articles already imported remain.',
      confirmLabel: 'Remove feed',
      variant: 'danger',
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/feeds/${feed.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: 'delete failed' }));
      toast.push({ message: `Delete failed: ${json.error || 'unknown error'}`, variant: 'danger' });
      return;
    }
    setFeeds((prev) => prev.filter((f) => f.id !== feed.id));
    setSelected(null);
    toast.push({ message: 'Feed removed', variant: 'success' });
  };

  const rePull = async (id: string) => {
    const res = await fetch(`/api/admin/feeds/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'repull' }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: 're-pull failed' }));
      toast.push({ message: `Re-pull failed: ${json.error || 'unknown error'}`, variant: 'danger' });
      return;
    }
    const now = new Date().toISOString();
    setFeeds((prev) => prev.map((f) => (f.id === id
      ? { ...f, error_count: 0, last_error: null, last_error_at: null, last_polled_at: now }
      : f)));
    toast.push({ message: 'Error count cleared. Next poll will retry.', variant: 'success' });
  };

  const addFeed = async () => {
    if (!newOutlet.trim() || !newUrl.trim()) return;
    setAdding(true);
    const res = await fetch('/api/admin/feeds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newOutlet.trim(),
        source_name: newOutlet.trim(),
        url: newUrl.trim(),
        feed_type: 'rss',
        is_active: true,
        // audience defaults to 'adult' server-side. The unified-feed pivot
        // dropped this column from the UI; the server still accepts it for
        // back-compat with the cluster-mutation RPCs.
      }),
    });
    const json = await res.json().catch(() => ({}));
    setAdding(false);
    if (!res.ok || !json.row) { toast.push({ message: `Add failed: ${json.error || 'unknown error'}`, variant: 'danger' }); return; }
    setFeeds((prev) => [...prev, json.row]);
    toast.push({ message: 'Feed added', variant: 'success' });
    setNewOutlet('');
    setNewUrl('');
    setShowAdd(false);
  };

  const okCount = displayFeeds.filter((f) => f.status === 'ok').length;
  const issueCount = displayFeeds.filter((f) => f.status !== 'ok').length;
  const totalArticles = displayFeeds.reduce((a, f) => a + f.articles, 0);
  const totalFails = displayFeeds.reduce((a, f) => a + f.failCount, 0);

  const statusVariant = (s: FeedStatus): 'success' | 'warn' | 'danger' => {
    if (s === 'ok') return 'success';
    if (s === 'stale') return 'warn';
    return 'danger';
  };
  const statusLabel = (s: FeedStatus) => (s === 'ok' ? 'OK' : s === 'stale' ? 'Stale' : 'Broken');

  const columns = [
    {
      key: 'outlet',
      header: 'Source',
      render: (row: DisplayFeed) => (
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: S[2],
              fontWeight: 600,
              color: row.active ? ADMIN_C.white : ADMIN_C.muted,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.outlet}
            </span>
          </div>
          <div
            style={{
              fontSize: F.xs,
              color: ADMIN_C.muted,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 360,
            }}
          >
            {row.url}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: DisplayFeed) => <Badge variant={statusVariant(row.status)} dot>{statusLabel(row.status)}</Badge>,
      width: 110,
    },
    {
      key: 'lastPull',
      header: 'Last polled',
      render: (row: DisplayFeed) => (
        <span style={{ fontSize: F.sm, color: ADMIN_C.dim }}>{row.lastPull}</span>
      ),
      width: 170,
    },
    {
      key: 'failCount',
      header: 'Errors',
      align: 'right' as const,
      render: (row: DisplayFeed) => (
        <span
          style={{
            fontWeight: 600,
            color: row.failCount > 5 ? ADMIN_C.danger : row.failCount > 0 ? ADMIN_C.warn : ADMIN_C.success,
          }}
        >
          {row.failCount}
        </span>
      ),
      width: 80,
    },
    {
      key: 'articles',
      header: 'Articles',
      align: 'right' as const,
      render: (row: DisplayFeed) => row.articles,
      width: 100,
    },
    {
      key: 'active',
      header: 'Active',
      sortable: false,
      render: (row: DisplayFeed) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Switch checked={row.active} onChange={(next) => toggleFeed(row.id, next)} />
        </div>
      ),
      width: 80,
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
        title="RSS feeds"
        subtitle="News source feeds, health monitoring, and article volume."
        actions={
          <>
            <Badge variant="neutral">
              {displayFeeds.length} feeds
            </Badge>
            <Button variant="primary" onClick={() => setShowAdd(true)}>Add feed</Button>
          </>
        }
      />

      <PageSection title="Overview">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: S[3],
          }}
        >
          <StatCard label="Total feeds" value={displayFeeds.length} />
          <StatCard label="Healthy" value={okCount} />
          <StatCard label="Issues" value={issueCount} />
          <StatCard label="Articles imported" value={totalArticles} />
          <StatCard label="Total errors" value={totalFails} />
        </div>
      </PageSection>

      <PageSection title="Health thresholds" description="Tune when feeds are flagged stale or broken. Values affect the dashboard in real-time.">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[4], alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 140px', minWidth: 120 }}>
            <label style={labelStyle}>Stale after (hours)</label>
            <NumberInput
              size="sm"
              value={staleHours}
              min={1}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10) || 0;
                setStaleHours(n);
                if (n > 0) saveThreshold('stale_feed_hours', n);
              }}
            />
          </div>
          <div style={{ flex: '1 1 140px', minWidth: 120 }}>
            <label style={labelStyle}>Broken after (errors)</label>
            <NumberInput
              size="sm"
              value={brokenFailCount}
              min={1}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10) || 0;
                setBrokenFailCount(n);
                if (n > 0) saveThreshold('broken_feed_failures', n);
              }}
            />
          </div>
          <div style={{ flex: '1 1 140px', minWidth: 120 }}>
            <label style={labelStyle}>Pull interval (min)</label>
            <NumberInput size="sm" value={pullIntervalMin} min={1} onChange={(e) => setPullIntervalMin(parseInt(e.target.value, 10) || 0)} />
          </div>
        </div>
      </PageSection>

      <PageSection title="Feeds">
        <DataTable
          rowKey={(r: DisplayFeed) => r.id}
          columns={columns}
          rows={filtered}
          onRowClick={(r: DisplayFeed) => setSelected(r)}
          toolbar={
            <Toolbar
              left={
                <>
                  <TextInput
                    type="search"
                    placeholder="Search source or URL"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ maxWidth: 280 }}
                  />
                  <Select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value as typeof filter)}
                    block={false}
                    style={{ width: 160 }}
                    options={[
                      { value: 'all', label: 'All statuses' },
                      { value: 'ok', label: 'Healthy only' },
                      { value: 'issues', label: 'Issues only' },
                    ]}
                  />
                </>
              }
            />
          }
          empty={
            <EmptyState
              title="No feeds match"
              description="Clear the filter or add a feed to start importing articles."
              cta={<Button variant="primary" onClick={() => setShowAdd(true)}>Add feed</Button>}
            />
          }
        />
      </PageSection>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.outlet || 'Feed detail'}
        description={selected?.url}
        width="md"
        footer={
          selected && (
            <>
              <Button variant="ghost" onClick={() => selected && removeFeed(selected)}>Remove</Button>
              {selected.status !== 'ok' && (
                <Button variant="primary" onClick={() => selected && rePull(selected.id)}>Re-pull</Button>
              )}
            </>
          )
        }
      >
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
            <KV label="Status" value={<Badge variant={statusVariant(selected.status)} dot>{statusLabel(selected.status)}</Badge>} />
            <KV label="Active" value={<Switch checked={selected.active} onChange={(next) => toggleFeed(selected.id, next)} />} />
            <KV label="Last polled" value={selected.lastPull} />
            <KV label="Error count" value={String(selected.failCount)} />
            <KV label="Articles imported" value={String(selected.articles)} />
            <KV label="Feed type" value={selected.feed_type || 'rss'} />
            <KV label="Language" value={selected.language || '—'} />
            <KV label="Auto-publish" value={selected.is_auto_publish ? 'Yes' : 'No'} />
            <KV label="AI rewrite" value={selected.is_ai_rewrite ? 'Yes' : 'No'} />
            {selected.last_error && (
              <div>
                <div style={labelStyle}>Last error</div>
                <div
                  style={{
                    padding: S[2],
                    borderRadius: 6,
                    background: ADMIN_C.card,
                    border: `1px solid ${ADMIN_C.divider}`,
                    fontSize: F.sm,
                    color: ADMIN_C.danger,
                    fontFamily: 'ui-monospace, monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {selected.last_error}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add feed"
        description="Paste an RSS or Atom URL. The poller will pick it up on the next cycle."
        width="sm"
        dirty={newOutlet !== '' || newUrl !== ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowAdd(false)} disabled={adding}>Cancel</Button>
            <Button variant="primary" loading={adding} disabled={!newOutlet.trim() || !newUrl.trim()} onClick={addFeed}>Add feed</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
          <div>
            <label style={labelStyle}>Outlet name</label>
            <TextInput value={newOutlet} onChange={(e) => setNewOutlet(e.target.value)} placeholder="E.g. Reuters" />
          </div>
          <div>
            <label style={labelStyle}>RSS URL</label>
            <TextInput type="url" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://example.com/rss" />
          </div>
        </div>
      </Modal>

      <ConfirmDialogHost />
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

export default function FeedsAdmin() {
  return (
    <ToastProvider>
      <FeedsAdminInner />
    </ToastProvider>
  );
}
