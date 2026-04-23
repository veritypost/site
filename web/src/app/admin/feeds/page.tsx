// @admin-verified 2026-04-22
'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
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

type FeedRow = Tables<'feeds'>;
type FeedStatus = 'ok' | 'stale' | 'broken';
type AudienceFilter = 'all' | 'adult' | 'kid';
type AudienceValue = 'adult' | 'kid';

const AUDIENCE_FILTERS: AudienceFilter[] = ['all', 'adult', 'kid'];
const audienceLabel = (a: AudienceFilter) => (a === 'all' ? 'All' : a === 'adult' ? 'Adult' : 'Kid');
const parseAudienceFilter = (raw: string | null): AudienceFilter => {
  if (raw === 'adult' || raw === 'kid' || raw === 'all') return raw;
  return 'all';
};
const normalizeAudience = (raw: string | null | undefined): AudienceValue =>
  raw === 'kid' ? 'kid' : 'adult';

type DisplayFeed = FeedRow & {
  outlet: string;
  status: FeedStatus;
  lastPull: string;
  articles: number;
  active: boolean;
  failCount: number;
  audienceValue: AudienceValue;
};

function FeedsAdminInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const toast = useToast();

  const [feeds, setFeeds] = useState<FeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newOutlet, setNewOutlet] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newAudience, setNewAudience] = useState<AudienceValue>('adult');
  const [filter, setFilter] = useState<'all' | 'ok' | 'issues'>('all');
  const [audienceTab, setAudienceTab] = useState<AudienceFilter>(() =>
    parseAudienceFilter(searchParams?.get('audience') ?? null)
  );
  const [search, setSearch] = useState('');
  const [staleHours, setStaleHours] = useState(6);
  const [brokenFailCount, setBrokenFailCount] = useState(10);
  const [pullIntervalMin, setPullIntervalMin] = useState(30);
  const [selected, setSelected] = useState<DisplayFeed | null>(null);
  const [adding, setAdding] = useState(false);

  // Keep the in-state tab in sync with the URL when the user navigates back/forward.
  useEffect(() => {
    const next = parseAudienceFilter(searchParams?.get('audience') ?? null);
    setAudienceTab((prev) => (prev === next ? prev : next));
  }, [searchParams]);

  // Seed the Add modal's audience to the active tab so kid-tab → "Add feed" defaults to kid.
  // 'all' tab keeps the historical default (adult).
  const openAddFeed = useCallback(() => {
    setNewAudience(audienceTab === 'kid' ? 'kid' : 'adult');
    setShowAdd(true);
  }, [audienceTab]);

  const setAudienceTabAndUrl = useCallback(
    (next: AudienceFilter) => {
      setAudienceTab(next);
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (next === 'all') params.delete('audience');
      else params.set('audience', next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

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
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    audienceValue: normalizeAudience((f as { audience?: string | null }).audience),
  });

  const displayFeeds = useMemo(() => feeds.map(normFeed), [feeds, staleHours, brokenFailCount]);

  // Audience tab filters the underlying list before search/status filters run, so the
  // counts and empty-state copy reflect the active audience scope.
  const audienceScoped = useMemo(() => {
    if (audienceTab === 'all') return displayFeeds;
    return displayFeeds.filter((f) => f.audienceValue === audienceTab);
  }, [displayFeeds, audienceTab]);

  const filtered = useMemo(() => {
    let list = audienceScoped;
    if (filter === 'ok') list = list.filter((f) => f.status === 'ok');
    if (filter === 'issues') list = list.filter((f) => f.status !== 'ok');
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((f) => f.outlet.toLowerCase().includes(q) || (f.url || '').toLowerCase().includes(q));
    }
    return list;
  }, [audienceScoped, filter, search]);

  const audienceCounts = useMemo(() => ({
    all: displayFeeds.length,
    adult: displayFeeds.filter((f) => f.audienceValue === 'adult').length,
    kid: displayFeeds.filter((f) => f.audienceValue === 'kid').length,
  }), [displayFeeds]);

  const toggleFeed = async (id: string, nextValue: boolean) => {
    // Optimistic
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
        audience: newAudience,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setAdding(false);
    if (!res.ok || !json.row) { toast.push({ message: `Add failed: ${json.error || 'unknown error'}`, variant: 'danger' }); return; }
    setFeeds((prev) => [...prev, json.row]);
    toast.push({ message: 'Feed added', variant: 'success' });
    setNewOutlet('');
    setNewUrl('');
    setNewAudience('adult');
    setShowAdd(false);
  };

  // Stats are scoped to the active audience tab so the dashboard reflects what the
  // operator is currently looking at (rather than the global mix).
  const okCount = audienceScoped.filter((f) => f.status === 'ok').length;
  const issueCount = audienceScoped.filter((f) => f.status !== 'ok').length;
  const totalArticles = audienceScoped.reduce((a, f) => a + f.articles, 0);
  const totalFails = audienceScoped.reduce((a, f) => a + f.failCount, 0);

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
            <Badge variant={row.audienceValue === 'kid' ? 'info' : 'neutral'} size="xs">
              {row.audienceValue === 'kid' ? 'Kid' : 'Adult'}
            </Badge>
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
              {audienceScoped.length} {audienceTab === 'all' ? 'feeds' : `${audienceLabel(audienceTab).toLowerCase()} feeds`}
            </Badge>
            <Button variant="primary" onClick={openAddFeed}>Add feed</Button>
          </>
        }
      />

      <PageSection title="Audience" description="Switch between adult and kid sources. The selected scope drives every panel below.">
        <div role="tablist" aria-label="Feed audience" style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
          {AUDIENCE_FILTERS.map((tab) => {
            const active = audienceTab === tab;
            return (
              <button
                key={tab}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setAudienceTabAndUrl(tab)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: S[2],
                  padding: `${S[2]}px ${S[3]}px`,
                  borderRadius: 8,
                  border: `1px solid ${active ? ADMIN_C.accent : ADMIN_C.divider}`,
                  background: active ? ADMIN_C.accent : ADMIN_C.card,
                  color: active ? ADMIN_C.white : ADMIN_C.soft,
                  fontSize: F.sm,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <span>{audienceLabel(tab)}</span>
                <Badge variant={active ? 'ghost' : 'neutral'} size="xs">
                  {audienceCounts[tab]}
                </Badge>
              </button>
            );
          })}
        </div>
      </PageSection>

      <PageSection title="Overview">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: S[3],
          }}
        >
          <StatCard label={audienceTab === 'all' ? 'Total feeds' : `${audienceLabel(audienceTab)} feeds`} value={audienceScoped.length} />
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
            <NumberInput size="sm" value={staleHours} min={1} onChange={(e) => setStaleHours(parseInt(e.target.value, 10) || 0)} />
          </div>
          <div style={{ flex: '1 1 140px', minWidth: 120 }}>
            <label style={labelStyle}>Broken after (errors)</label>
            <NumberInput size="sm" value={brokenFailCount} min={1} onChange={(e) => setBrokenFailCount(parseInt(e.target.value, 10) || 0)} />
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
              title={audienceTab === 'all' ? 'No feeds match' : `No ${audienceLabel(audienceTab).toLowerCase()} feeds match`}
              description={
                audienceTab === 'all'
                  ? 'Clear the filter or add a feed to start importing articles.'
                  : `Switch tabs, clear the filter, or add a ${audienceLabel(audienceTab).toLowerCase()} feed to start importing articles.`
              }
              cta={<Button variant="primary" onClick={openAddFeed}>Add feed</Button>}
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
            <KV
              label="Audience"
              value={
                <Badge variant={selected.audienceValue === 'kid' ? 'info' : 'neutral'} size="sm">
                  {selected.audienceValue === 'kid' ? 'Kid' : 'Adult'}
                </Badge>
              }
            />
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
          <div>
            <label style={labelStyle}>Audience</label>
            <Select
              value={newAudience}
              onChange={(e) => setNewAudience(e.target.value === 'kid' ? 'kid' : 'adult')}
              options={[
                { value: 'adult', label: 'Adult — routes into the adult article pool' },
                { value: 'kid', label: 'Kid — routes into the kid-safe pool' },
              ]}
            />
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
