'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Tables } from '@/types/database-helpers';

import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import DataTable from '@/components/admin/DataTable';
import Toolbar from '@/components/admin/Toolbar';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import NumberInput from '@/components/admin/NumberInput';
import Switch from '@/components/admin/Switch';
import Drawer from '@/components/admin/Drawer';
import Modal from '@/components/admin/Modal';
import Badge from '@/components/admin/Badge';
import StatCard from '@/components/admin/StatCard';
import EmptyState from '@/components/admin/EmptyState';
import Spinner from '@/components/admin/Spinner';
import { confirm, ConfirmDialogHost } from '@/components/admin/ConfirmDialog';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';
import ExtractionConfigEditor from './_ExtractionConfigEditor';
import ReclassifyModal from './_ReclassifyModal';

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

type EnrichedFeed = FeedRow & {
  items_24h: number;
  items_7d: number;
};

type DisplayFeed = EnrichedFeed & {
  outlet: string;
  status: FeedStatus;
  lastPull: string;
  active: boolean;
  failCount: number;
  priority_weight: number;
  allowed_category_slugs: string[];
  zeroResultsStreak: number;
};

type ListResponse = {
  feeds: EnrichedFeed[];
  topContributor: { feed_id: string; outlet: string; items_7d: number; share_pct: number } | null;
  totals: {
    items_24h: number;
    items_7d: number;
    active: number;
    inactive: number;
    silent_7d: number;
    failing: number;
  };
};

type FilterChip = 'all' | 'producing' | 'silent7d' | 'failing';

// Default chip: all. The page must be a 1:1 mirror of the feeds table — newly
// added feeds that haven't polled yet would otherwise be hidden under a
// 'producing today' default and the operator would think the seed never
// landed. Operator can click 'Producing today' / 'Silent 7d' / 'Failing'
// chips to narrow.
const DEFAULT_FILTER: FilterChip = 'all';

// Human label for the `feeds.feed_type` column. RSS variants ('feed' / 'rss')
// collapse to "RSS" since the operator distinction is irrelevant; scrape modes
// get explicit labels. Falls back to the raw value defensively for unknown
// future values so a misconfigured row stays visible rather than silently
// rendering as an empty cell.
function feedTypeLabel(feed_type: string | null | undefined): string {
  switch (feed_type) {
    case 'feed':
    case 'rss':
    case null:
    case undefined:
    case '':
      return 'RSS';
    case 'scrape_html':
      return 'Scrape HTML';
    case 'scrape_json':
      return 'Scrape JSON';
    default:
      return feed_type;
  }
}

function FeedsAdminInner() {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const [feeds, setFeeds] = useState<EnrichedFeed[]>([]);
  const [totals, setTotals] = useState<ListResponse['totals'] | null>(null);
  const [topContributor, setTopContributor] = useState<ListResponse['topContributor']>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newOutlet, setNewOutlet] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [filter, setFilter] = useState<FilterChip>(DEFAULT_FILTER);
  const [search, setSearch] = useState('');
  const [staleHours] = useState(6);
  const [brokenFailCount] = useState(10);
  const [selected, setSelected] = useState<DisplayFeed | null>(null);
  const [adding, setAdding] = useState(false);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [alertDismissed, setAlertDismissed] = useState(false);
  const priorityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bulk selection state.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);
  // Typed delete confirmation state.
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  // Phase C — reclassify wizard state.
  const [showReclassify, setShowReclassify] = useState(false);

  const loadFeeds = async () => {
    const res = await fetch('/api/admin/feeds/list');
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.push({ message: (j as { error?: string }).error ?? 'Failed to load feeds', variant: 'danger' });
      return;
    }
    const data = (await res.json()) as ListResponse;
    setFeeds(data.feeds ?? []);
    setTotals(data.totals ?? null);
    setTopContributor(data.topContributor ?? null);
  };

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

      await loadFeeds();

      const { data: catRows } = await supabase.from('categories').select('id, name, slug').order('name');
      if (catRows) setCategories(catRows as Array<{ id: string; name: string; slug: string }>);

      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveFeedField = async (id: string, key: string, value: unknown) => {
    const res = await fetch(`/api/admin/feeds/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.push({ message: (j as { error?: string }).error ?? `Save failed`, variant: 'danger' });
      return;
    }
    setFeeds((prev) => prev.map((f) => f.id === id ? { ...f, [key]: value } : f));
    setSelected((prev) => prev ? ({ ...prev, [key]: value } as DisplayFeed) : prev);
    toast.push({ message: 'Saved', variant: 'success', duration: 1200 });
  };

  const deriveStatus = (f: EnrichedFeed): FeedStatus => {
    const errors = f.error_count ?? 0;
    if (errors >= brokenFailCount) return 'broken';
    const lastPolled = f.last_polled_at ? new Date(f.last_polled_at).getTime() : 0;
    if (lastPolled && Date.now() - lastPolled > staleHours * 3600 * 1000) return 'stale';
    if (!lastPolled) return 'stale';
    return 'ok';
  };

  const normFeed = (f: EnrichedFeed): DisplayFeed => {
    const r = f as EnrichedFeed & { priority_weight?: number | null; allowed_category_slugs?: string[] | null };
    const meta = (f.metadata && typeof f.metadata === 'object' ? f.metadata : {}) as Record<
      string,
      unknown
    >;
    const streak = typeof meta.zero_results_streak === 'number' ? (meta.zero_results_streak as number) : 0;
    return {
      ...f,
      outlet: f.source_name || f.name || '',
      status: deriveStatus(f),
      lastPull: (f.last_polled_at || '').replace('T', ' ').slice(0, 16) || 'Never',
      active: f.is_active ?? true,
      failCount: f.error_count ?? 0,
      priority_weight: r.priority_weight ?? 5,
      allowed_category_slugs: r.allowed_category_slugs ?? [],
      zeroResultsStreak: streak,
    };
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const displayFeeds = useMemo(() => feeds.map(normFeed), [feeds, staleHours, brokenFailCount]);

  const filtered = useMemo(() => {
    let list = displayFeeds;
    if (filter === 'producing') list = list.filter((f) => f.items_24h > 0);
    if (filter === 'silent7d') list = list.filter((f) => f.active && f.items_7d === 0);
    if (filter === 'failing') list = list.filter((f) => f.failCount > 0);
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
      message: 'The feed will stop polling and is hidden from the admin list. Imported articles, comments, and reading history are kept. Re-adding the same URL restores the feed.',
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

  const clearErrors = async (id: string) => {
    const res = await fetch(`/api/admin/feeds/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear_errors' }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: 'clear errors failed' }));
      toast.push({ message: `Failed to clear errors: ${json.error || 'unknown error'}`, variant: 'danger' });
      return;
    }
    const now = new Date().toISOString();
    setFeeds((prev) => prev.map((f) => (f.id === id
      ? { ...f, error_count: 0, last_error: null, last_error_at: null, last_polled_at: now }
      : f)));
    toast.push({ message: 'Error count cleared. The feed will retry on its next ingest run.', variant: 'success' });
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
      }),
    });
    const json = await res.json().catch(() => ({}));
    setAdding(false);
    if (!res.ok || !json.row) { toast.push({ message: `Add failed: ${json.error || 'unknown error'}`, variant: 'danger' }); return; }
    // Reload to get enriched counts on the new row.
    await loadFeeds();
    toast.push({ message: 'Feed added', variant: 'success' });
    setNewOutlet('');
    setNewUrl('');
    setShowAdd(false);
  };

  // ── Bulk operations ──────────────────────────────────────────────────────────

  // Server bulk endpoint rejects payloads > 200 ids. Cap client-side to give
  // a clear message rather than a silent 400.
  const MAX_BULK_IDS = 200;

  const visibleIds = filtered.map((f) => f.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        // Cap at MAX_BULK_IDS: if the filtered list has > 200 rows, select-all
        // selects only the first 200 so the bulk operation stays within limits.
        const toAdd = visibleIds.slice(0, MAX_BULK_IDS);
        toAdd.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const doBulkOp = async (op: 'pause' | 'resume' | 'delete') => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    if (op === 'pause' || op === 'resume') {
      const label = op === 'pause' ? 'Pause' : 'Resume';
      const msg = `${label} ${ids.length} feed${ids.length === 1 ? '' : 's'}?`;
      if (!window.confirm(msg)) return;
    }

    setBulkWorking(true);
    try {
      const res = await fetch('/api/admin/feeds/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, op }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.push({ message: (json as { error?: string }).error ?? `${op} failed`, variant: 'danger' });
        return;
      }
      toast.push({ message: `${op === 'delete' ? 'Deleted' : op === 'pause' ? 'Paused' : 'Resumed'} ${(json as { affected?: number }).affected ?? ids.length} feed(s)`, variant: 'success' });
      setSelectedIds(new Set());
      await loadFeeds();
    } finally {
      setBulkWorking(false);
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.size > 5) {
      setDeleteConfirmText('');
      setShowBulkDeleteModal(true);
    } else {
      const ids = Array.from(selectedIds);
      if (!window.confirm(`Hide ${ids.length} feed(s) from the list? Imported articles and history are kept; re-adding the same URL restores them.`)) return;
      void doBulkOp('delete');
    }
  };

  const confirmTypedDelete = async () => {
    if (deleteConfirmText !== 'delete') return;
    setShowBulkDeleteModal(false);
    setDeleteConfirmText('');
    await doBulkOp('delete');
  };

  // ── Stat values ──────────────────────────────────────────────────────────────

  const producingToday = displayFeeds.filter((f) => f.items_24h > 0).length;
  const silent7dCount = totals?.silent_7d ?? displayFeeds.filter((f) => f.active && f.items_7d === 0).length;
  const failingCount = totals?.failing ?? displayFeeds.filter((f) => f.failCount > 0).length;
  const items24h = totals?.items_24h ?? 0;

  const topLabel = topContributor
    ? `${topContributor.outlet} — ${topContributor.items_7d} items / 7d`
    : '—';

  const statusVariant = (s: FeedStatus): 'success' | 'warn' | 'danger' => {
    if (s === 'ok') return 'success';
    if (s === 'stale') return 'warn';
    return 'danger';
  };
  const statusLabel = (s: FeedStatus) => (s === 'ok' ? 'OK' : s === 'stale' ? 'Stale' : 'Broken');

  // ── Table columns ────────────────────────────────────────────────────────────

  const columns = [
    {
      key: 'checkbox',
      header: (
        <input
          type="checkbox"
          checked={allVisibleSelected}
          ref={(el) => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected; }}
          onChange={toggleSelectAll}
          aria-label="Select all filtered feeds"
          style={{ cursor: 'pointer' }}
        />
      ),
      render: (row: DisplayFeed) => (
        <div onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selectedIds.has(row.id)}
            onChange={() => toggleSelectRow(row.id)}
            aria-label={`Select ${row.outlet}`}
            style={{ cursor: 'pointer' }}
          />
        </div>
      ),
      width: 40,
      sortable: false,
    },
    {
      key: 'outlet',
      header: 'Source',
      render: (row: DisplayFeed) => {
        let dotColor: string | undefined;
        if (row.active) {
          dotColor = row.status === 'ok' ? ADMIN_C.success : row.status === 'stale' ? ADMIN_C.warn : ADMIN_C.danger;
        }
        const showError = row.status === 'broken' && row.last_error;
        const showStreak = row.zeroResultsStreak >= 3;
        return (
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: S[2], fontWeight: 600, color: row.active ? ADMIN_C.ink : ADMIN_C.muted }}>
              {dotColor && (
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0, display: 'inline-block' }} />
              )}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.outlet}
              </span>
              {showStreak && (
                <span
                  style={{
                    fontSize: F.xs,
                    color: ADMIN_C.dim,
                    background: ADMIN_C.card,
                    border: `1px solid ${ADMIN_C.divider}`,
                    borderRadius: 10,
                    padding: '1px 6px',
                    fontWeight: 500,
                    flexShrink: 0,
                  }}
                  title="This feed produced no unique items across the last few ingest runs (after cross-feed dedup)."
                >
                  no unique items {row.zeroResultsStreak}+ runs
                </span>
              )}
            </div>
            <div style={{ fontSize: F.xs, color: ADMIN_C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>
              {row.url}
            </div>
            {showError && (
              <div style={{ fontSize: F.xs, color: ADMIN_C.danger, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>
                {(row.last_error ?? '').length > 60 ? (row.last_error ?? '').slice(0, 60) + '…' : (row.last_error ?? '')}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'feed_type',
      header: 'Type',
      sortable: false,
      render: (row: DisplayFeed) => (
        <Badge variant="neutral">{feedTypeLabel(row.feed_type)}</Badge>
      ),
      width: 120,
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
      key: 'items_24h',
      header: 'Items / 24h',
      align: 'right' as const,
      render: (row: DisplayFeed) => (
        <span
          style={{
            fontWeight: row.items_24h > 50 ? 700 : 400,
            color: row.items_24h === 0 ? ADMIN_C.muted : ADMIN_C.ink,
          }}
        >
          {row.items_24h}
        </span>
      ),
      width: 100,
    },
    {
      key: 'items_7d',
      header: 'Items / 7d',
      align: 'right' as const,
      render: (row: DisplayFeed) => (
        <span style={{ fontSize: F.xs, color: ADMIN_C.dim }}>{row.items_7d}</span>
      ),
      width: 90,
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
      key: 'active',
      header: 'Active',
      sortable: false,
      // bulkWorking guard: disable per-row switch while a bulk op is in flight
      // to prevent conflicting individual saves during the batch request.
      render: (row: DisplayFeed) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Switch checked={row.active} onChange={(next) => toggleFeed(row.id, next)} disabled={bulkWorking} />
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
            <Button
              variant="ghost"
              onClick={() => setShowReclassify(true)}
              disabled={bulkWorking}
            >
              Reclassify
            </Button>
            <Button variant="primary" onClick={() => setShowAdd(true)} disabled={bulkWorking}>Add feed</Button>
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
          <StatCard label="Producing today" value={producingToday} />
          <StatCard label="Silent 7d" value={silent7dCount} />
          <StatCard label="Failing" value={failingCount} />
          <StatCard label="Items today" value={items24h} />
          <StatCard label="Top contributor" value={topLabel} />
        </div>
      </PageSection>

      {!alertDismissed && displayFeeds.filter((f) => f.active && f.status === 'broken').length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: S[2], padding: `${S[2]}px ${S[3]}px`, marginBottom: S[3], background: '#FEF2F2', border: `1px solid ${ADMIN_C.danger}`, borderRadius: 8, fontSize: F.sm }}>
          <span style={{ flex: 1, color: ADMIN_C.danger, fontWeight: 600 }}>
            {displayFeeds.filter((f) => f.active && f.status === 'broken').length} active feed(s) need attention.
          </span>
          <button type="button" onClick={() => setAlertDismissed(true)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: F.sm, color: ADMIN_C.danger, fontFamily: 'inherit' }}>Dismiss</button>
        </div>
      )}

      <PageSection title="Feeds">
        {/* Bulk action bar — shown when ≥1 row is selected */}
        {selectedIds.size > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: S[2],
              padding: `${S[2]}px ${S[3]}px`,
              marginBottom: S[2],
              background: ADMIN_C.card,
              border: `1px solid ${ADMIN_C.border}`,
              borderRadius: 8,
              fontSize: F.sm,
              position: 'sticky',
              top: 0,
              zIndex: 10,
            }}
          >
            <span style={{ flex: 1, fontWeight: 600, color: ADMIN_C.ink }}>
              {selectedIds.size} selected
              {selectedIds.size > MAX_BULK_IDS && (
                <span style={{ fontWeight: 400, color: ADMIN_C.warn, marginLeft: S[2] }}>
                  Select up to {MAX_BULK_IDS} feeds at a time. Currently {selectedIds.size} selected.
                </span>
              )}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={bulkWorking || selectedIds.size > MAX_BULK_IDS}
              onClick={() => void doBulkOp('pause')}
            >
              Pause
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={bulkWorking || selectedIds.size > MAX_BULK_IDS}
              onClick={() => void doBulkOp('resume')}
            >
              Resume
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={bulkWorking || selectedIds.size > MAX_BULK_IDS}
              onClick={handleBulkDelete}
            >
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={bulkWorking}
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </Button>
          </div>
        )}

        <DataTable
          rowKey={(r: DisplayFeed) => r.id}
          columns={columns}
          rows={filtered}
          onRowClick={bulkWorking ? undefined : (r: DisplayFeed) => setSelected(r)}
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
                  {/* Filter chips */}
                  <div style={{ display: 'flex', gap: S[1] }}>
                    {(
                      [
                        { key: 'all', label: 'All' },
                        { key: 'producing', label: 'Producing today' },
                        { key: 'silent7d', label: 'Silent 7d' },
                        { key: 'failing', label: 'Failing' },
                      ] as { key: FilterChip; label: string }[]
                    ).map((chip) => (
                      <button
                        key={chip.key}
                        type="button"
                        onClick={() => setFilter(chip.key)}
                        style={{
                          padding: `${S[1]}px ${S[2]}px`,
                          borderRadius: 20,
                          border: `1px solid ${filter === chip.key ? ADMIN_C.border : ADMIN_C.divider}`,
                          background: filter === chip.key ? ADMIN_C.ink : ADMIN_C.bg,
                          color: filter === chip.key ? '#ffffff' : ADMIN_C.dim,
                          fontSize: F.sm,
                          fontWeight: filter === chip.key ? 600 : 400,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
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

      {/* Feed detail drawer */}
      <Drawer
        open={!!selected}
        onClose={() => {
          // Flush any pending priority_weight debounce so the operator's last
          // keystroke saves even if the drawer is closed within the 300ms window.
          if (priorityDebounceRef.current) {
            clearTimeout(priorityDebounceRef.current);
            priorityDebounceRef.current = null;
            if (selected) void saveFeedField(selected.id, 'priority_weight', selected.priority_weight);
          }
          setSelected(null);
        }}
        title={selected?.outlet || 'Feed detail'}
        description={selected?.url}
        width="md"
        footer={
          selected && (
            <>
              <Button variant="ghost" onClick={() => selected && removeFeed(selected)}>Remove</Button>
              <Button variant="ghost" onClick={() => selected && clearErrors(selected.id)}>Clear errors</Button>
            </>
          )
        }
      >
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
            <KV label="Status" value={<Badge variant={statusVariant(selected.status)} dot>{statusLabel(selected.status)}</Badge>} />
            <KV label="Active" value={<Switch checked={selected.active} onChange={(next) => toggleFeed(selected.id, next)} />} />
            <div>
              <div style={labelStyle}>Priority weight (1–10)</div>
              <NumberInput
                size="sm"
                value={selected.priority_weight}
                min={1}
                max={10}
                step={1}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const n = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 5));
                  setSelected((prev) => prev ? ({ ...prev, priority_weight: n } as DisplayFeed) : prev);
                  setFeeds((prev) => prev.map((f) => f.id === selected.id ? { ...f, priority_weight: n } : f));
                  if (priorityDebounceRef.current) clearTimeout(priorityDebounceRef.current);
                  priorityDebounceRef.current = setTimeout(() => void saveFeedField(selected.id, 'priority_weight', n), 300);
                }}
              />
              <div style={{ fontSize: F.xs, color: ADMIN_C.muted, marginTop: S[1] }}>Higher = more stories from this feed in the daily pool</div>
            </div>
            <div>
              <div style={labelStyle}>Topic filter (empty = all topics)</div>
              <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: S[1], padding: `${S[1]}px 0` }}>
                {categories.length === 0 ? (
                  <div style={{ fontSize: F.xs, color: ADMIN_C.muted }}>No categories loaded</div>
                ) : categories.map((cat) => (
                  <label key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: S[2], fontSize: F.sm, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={(selected.allowed_category_slugs ?? []).includes(cat.slug)}
                      onChange={(e) => {
                        const current = selected.allowed_category_slugs ?? [];
                        const next = e.target.checked
                          ? [...current, cat.slug]
                          : current.filter((s) => s !== cat.slug);
                        setSelected((prev) => prev ? ({ ...prev, allowed_category_slugs: next } as DisplayFeed) : prev);
                        setFeeds((prev) => prev.map((f) => f.id === selected.id ? { ...f, allowed_category_slugs: next } : f));
                        void saveFeedField(selected.id, 'allowed_category_slugs', next);
                      }}
                    />
                    {cat.name}
                  </label>
                ))}
              </div>
            </div>
            <KV label="Last polled" value={selected.lastPull} />
            <KV label="Items / 24h" value={String(selected.items_24h)} />
            <KV label="Items / 7d" value={String(selected.items_7d)} />
            <KV label="Error count" value={String(selected.failCount)} />
            <KV label="Feed type" value={feedTypeLabel(selected.feed_type)} />
            <KV label="Language" value={selected.language || '—'} />
            <KV label="Auto-publish" value={selected.is_auto_publish ? 'Yes' : 'No'} />
            <KV label="Wire rewrite" value={selected.is_ai_rewrite ? 'Yes' : 'No'} />
            {selected.feed_type === 'scrape_json' && (
              <ExtractionConfigEditor
                key={selected.id}
                feed={selected}
                onSaved={(updated) => {
                  setSelected((prev) =>
                    prev ? ({ ...prev, extraction_config: updated } as DisplayFeed) : prev
                  );
                  setFeeds((prev) =>
                    prev.map((f) =>
                      f.id === selected.id
                        ? ({ ...f, extraction_config: updated } as EnrichedFeed)
                        : f
                    )
                  );
                }}
              />
            )}
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

      {/* Add feed modal */}
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

      {/* Bulk delete typed-confirmation modal (used when N > 5) */}
      <Modal
        open={showBulkDeleteModal}
        onClose={() => { setShowBulkDeleteModal(false); setDeleteConfirmText(''); }}
        title={`Delete ${selectedIds.size} feeds?`}
        description="Feeds are hidden from the list and stop polling. Imported articles, comments, discovery items, and reading history are kept. Re-adding the same URL restores a feed."
        width="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setShowBulkDeleteModal(false); setDeleteConfirmText(''); }}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={deleteConfirmText !== 'delete'}
              onClick={confirmTypedDelete}
            >
              Delete feeds
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
          <div style={{ fontSize: F.sm, color: ADMIN_C.dim }}>
            Type <strong style={{ color: ADMIN_C.ink }}>delete</strong> to confirm.
          </div>
          <TextInput
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="delete"
            autoFocus
          />
        </div>
      </Modal>

      <ReclassifyModal
        open={showReclassify}
        onClose={() => setShowReclassify(false)}
        feeds={feeds}
        onApplied={loadFeeds}
      />

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
      <span style={{ fontSize: F.sm, color: ADMIN_C.ink, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

export default function FeedsAdmin() {
  return (
    <FeedsAdminInner />
  );
}
