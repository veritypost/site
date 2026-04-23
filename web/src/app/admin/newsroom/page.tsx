/**
 * F7 Newsroom Redesign — single-page operator workspace.
 *
 * Replaces the Phase-4 Task-20 cluster grid + the Task-21 cluster-detail
 * splash with one screen that owns end-to-end newsroom operations:
 *
 *   1. Audience tab — Adult / Kid. URL-persisted via ?audience=. Switches
 *      every downstream query: cluster list, glance bar, filter dropdowns,
 *      preset list, refresh-feeds payload.
 *   2. Glance bar — today's spend, today's run count, kill-switch state,
 *      feed health. Each tile deep-links to the relevant pipeline / feeds
 *      surface. Numbers are scoped to the active audience.
 *   3. Filter row — category, subcategory, outlet, time window, search.
 *      Filters are taxonomy-driven (Stream 2 + Stream 5 supply the editor
 *      surfaces; the data lives in `categories` + `feeds`).
 *   4. Prompt picker — Default / Preset / Custom. Preset list comes from
 *      ai_prompt_presets (Stream 3 ships the editor + API). Custom is
 *      forwarded as freeform_instructions on the generate POST.
 *   5. Provider/model picker — kept as PipelineRunPicker, but the freeform
 *      surface is hidden because the prompt picker above owns instructions.
 *   6. Refresh feeds — POSTs /api/newsroom/ingest/run with the active
 *      audience so only that side's RSS is re-polled.
 *   7. Cluster grid — adult OR kid clusters (never mixed). Source rows are
 *      expanded inline. Per-row controls: Move out, Move to. Per-cluster:
 *      Generate, Generate kids version (adult tab only), Merge with,
 *      Split, Dismiss. Toggle for Show dismissed.
 *   8. Recent runs strip — last 10 pipeline_runs for the active audience.
 *
 * Schema notes — migration 126 adds:
 *   - feed_clusters.audience (NOT NULL, CHECK ('adult','kid'))
 *   - feed_clusters.archived_at, archived_reason
 *   - feed_clusters.dismissed_at, dismissed_by, dismiss_reason
 *   - ai_prompt_presets table
 *
 * Auth: client-side ADMIN_ROLES gate matching the rest of /admin/*.
 */

'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_ROLES } from '@/lib/roles';

import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import Badge from '@/components/admin/Badge';
import EmptyState from '@/components/admin/EmptyState';
import Spinner from '@/components/admin/Spinner';
import Field from '@/components/admin/Field';
import Select from '@/components/admin/Select';
import TextInput from '@/components/admin/TextInput';
import Textarea from '@/components/admin/Textarea';
import GenerationModal from '@/components/admin/GenerationModal';
import PipelineRunPicker, {
  type PickerSelection,
  type PipelineRunPickerHandle,
  estimateClusterCostUsd,
  formatEstimatedCost,
} from '@/components/admin/PipelineRunPicker';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';

type Audience = 'adult' | 'kid';

type ClusterRow = {
  id: string;
  title: string | null;
  summary: string | null;
  is_breaking: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category_id: string | null;
  locked_by: string | null;
  locked_at: string | null;
  // migration 126 columns — typed locally until types:gen runs.
  audience: Audience;
  archived_at: string | null;
  dismissed_at: string | null;
  dismiss_reason: string | null;
};

type DiscoveryRow = {
  id: string;
  feed_id: string | null;
  cluster_id: string | null;
  raw_url: string;
  raw_title: string | null;
  fetched_at: string;
  metadata: { outlet?: string | null; excerpt?: string | null } | null;
};

type FeedLite = {
  id: string;
  name: string;
  source_name: string | null;
  url: string;
  audience: Audience;
  is_active: boolean;
  last_polled_at: string | null;
  error_count: number;
};

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  is_active: boolean;
  is_kids_safe: boolean;
  deleted_at: string | null;
};

type PromptPreset = {
  id: string;
  name: string;
  body: string;
  audience: 'adult' | 'kid' | 'both';
  is_active: boolean;
  sort_order: number;
};

type RecentRun = {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  total_cost_usd: number | string | null;
  model: string | null;
  cluster_id: string | null;
  audience: Audience | null;
};

type GlanceData = {
  todaySpendUsd: number;
  runs: { completed: number; failed: number; running: number };
  killSwitchEnabled: boolean | null;
  unhealthyFeedCount: number;
};

const PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 300;
const STALE_FEED_HOURS = 6;
const TIME_WINDOWS: { value: string; label: string; hours: number | null }[] = [
  { value: '6h', label: 'Last 6 hours', hours: 6 },
  { value: '24h', label: 'Last 24 hours', hours: 24 },
  { value: '72h', label: 'Last 72 hours', hours: 72 },
  { value: '7d', label: 'Last 7 days', hours: 24 * 7 },
  { value: 'all', label: 'All time', hours: null },
];

type PromptMode = 'default' | 'preset' | 'custom';

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

function formatCostUsd(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '$0.00';
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export default function NewsroomAdminPage() {
  return (
    <ToastProvider>
      <NewsroomWorkspace />
    </ToastProvider>
  );
}

function NewsroomWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  // -- Audience tab (URL-persisted) -------------------------------------
  const audienceParam = searchParams.get('audience');
  const audience: Audience = audienceParam === 'kid' ? 'kid' : 'adult';

  // -- Auth gate --------------------------------------------------------
  const [authorized, setAuthorized] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // -- Filter state -----------------------------------------------------
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [feeds, setFeeds] = useState<FeedLite[]>([]);
  const [presets, setPresets] = useState<PromptPreset[]>([]);

  const [filterCategoryId, setFilterCategoryId] = useState<string>('');
  const [filterSubcategoryId, setFilterSubcategoryId] = useState<string>('');
  const [filterFeedId, setFilterFeedId] = useState<string>('');
  const [filterWindow, setFilterWindow] = useState<string>('72h');
  const [searchInput, setSearchInput] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showDismissed, setShowDismissed] = useState(false);

  // -- Prompt picker ----------------------------------------------------
  const [promptMode, setPromptMode] = useState<PromptMode>('default');
  const [promptPresetId, setPromptPresetId] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string>('');

  // -- Provider/model picker -------------------------------------------
  const pickerRef = useRef<PipelineRunPickerHandle | null>(null);
  const [picker, setPicker] = useState<PickerSelection>({
    provider: '',
    model: '',
    freeformInstructions: '',
    inputPricePer1m: null,
    outputPricePer1m: null,
  });
  const onPickerChange = useCallback((sel: PickerSelection) => {
    setPicker(sel);
  }, []);
  const pickerReady = !!picker.provider && !!picker.model;
  const estCost = estimateClusterCostUsd(
    picker.inputPricePer1m,
    picker.outputPricePer1m
  );

  // -- Cluster list -----------------------------------------------------
  const [clusters, setClusters] = useState<ClusterRow[]>([]);
  const [clusterLoading, setClusterLoading] = useState(true);
  const [clusterLoadError, setClusterLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // -- Source items per cluster ----------------------------------------
  const [sourceMap, setSourceMap] = useState<Record<string, DiscoveryRow[]>>({});

  // -- Glance + recent runs --------------------------------------------
  const [glance, setGlance] = useState<GlanceData | null>(null);
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);

  // -- In-flight controls ----------------------------------------------
  const [busyId, setBusyId] = useState<string>('');
  const [busyRefresh, setBusyRefresh] = useState(false);
  const [retryRunId, setRetryRunId] = useState<string>('');
  const [splitMode, setSplitMode] = useState<{ clusterId: string; itemIds: Set<string> } | null>(
    null
  );

  // -- Generate modal target -------------------------------------------
  // sourceUrls is non-empty only for the "Generate kids version" hatch on
  // adult cards — that flow forwards the adult cluster's discovery URLs
  // so the kid run reuses the source set. Plain adult + plain kid runs
  // pass an empty array.
  const [genTarget, setGenTarget] = useState<
    | {
        id: string;
        title: string;
        audience: Audience;
        sourceUrls: string[];
      }
    | null
  >(null);

  // -- URL helpers ------------------------------------------------------
  const setAudienceTab = useCallback(
    (next: Audience) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('audience', next);
      router.replace(`/admin/newsroom?${params.toString()}`);
    },
    [router, searchParams]
  );

  // ----------------------------------------------------------------------
  // Auth boot
  // ----------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        router.push('/login?next=/admin/newsroom');
        return;
      }
      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id);
      if (cancelled) return;
      const names = ((roleRows || []) as Array<{ roles: { name: string } | null }>)
        .map((r) => r.roles?.name)
        .filter(Boolean) as string[];
      if (!names.some((n) => ADMIN_ROLES.has(n))) {
        router.push('/');
        return;
      }
      setAuthorized(true);
      setAuthLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  // ----------------------------------------------------------------------
  // Reference data — categories, feeds, presets. Re-fetched per audience
  // so the kid tab gets the kids-safe filter applied at the source.
  // ----------------------------------------------------------------------
  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;
    (async () => {
      // Categories: top-level + sub. Filter by is_kids_safe on the kid tab.
      const catQuery = supabase
        .from('categories')
        .select('id, name, slug, parent_id, is_active, is_kids_safe, deleted_at')
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (audience === 'kid') {
        catQuery.eq('is_kids_safe', true);
      }
      const { data: cats, error: catErr } = await catQuery;
      if (cancelled) return;
      if (catErr) {
        console.error('[newsroom] categories load failed:', catErr.message);
        toast.push({ message: 'Could not load categories.', variant: 'danger' });
      } else {
        setCategories((cats || []) as CategoryRow[]);
      }

      const { data: feedRows, error: feedErr } = await supabase
        .from('feeds')
        .select('id, name, source_name, url, audience, is_active, last_polled_at, error_count')
        .eq('audience', audience)
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (cancelled) return;
      if (feedErr) {
        console.error('[newsroom] feeds load failed:', feedErr.message);
      } else {
        setFeeds((feedRows || []) as FeedLite[]);
      }

      // Prompt presets — Stream 3's table. Audience is 'adult' | 'kid' | 'both'.
      // Wrapped in try/catch so any transient failure soft-degrades to an
      // empty preset list (the rest of the workspace still works).
      try {
        const presetRes = await supabase
          .from('ai_prompt_presets')
          .select('id, name, body, audience, is_active, sort_order')
          .eq('is_active', true)
          .in('audience', [audience, 'both'])
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true });
        if (cancelled) return;
        if (presetRes.error) {
          console.error('[newsroom] presets load failed:', presetRes.error.message);
          setPresets([]);
        } else {
          setPresets((presetRes.data || []) as PromptPreset[]);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('[newsroom] presets load threw:', err);
        setPresets([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [audience, authorized, supabase, toast]);

  // Reset cascading filters when audience switches — old category may not
  // be kids-safe, old feed may belong to the other audience, etc.
  useEffect(() => {
    setFilterCategoryId('');
    setFilterSubcategoryId('');
    setFilterFeedId('');
    setSplitMode(null);
    setPromptMode('default');
    setPromptPresetId('');
    setCustomPrompt('');
  }, [audience]);

  useEffect(() => {
    setFilterSubcategoryId('');
  }, [filterCategoryId]);

  // ----------------------------------------------------------------------
  // Search debounce
  // ----------------------------------------------------------------------
  useEffect(() => {
    const handle = setTimeout(() => setSearchQuery(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // ----------------------------------------------------------------------
  // Cluster list — refetched whenever any filter or audience changes.
  // ----------------------------------------------------------------------
  const loadClusters = useCallback(
    async (reset: boolean) => {
      if (!authorized) return;
      if (reset) {
        setClusterLoading(true);
        setOffset(0);
      } else {
        setLoadingMore(true);
      }
      const nextOffset = reset ? 0 : offset;

      try {
        let query = supabase
          .from('feed_clusters')
          .select(
            'id, title, summary, is_breaking, is_active, created_at, updated_at, category_id, locked_by, locked_at, audience, archived_at, dismissed_at, dismiss_reason'
          )
          .eq('is_active', true)
          .eq('audience', audience)
          .is('archived_at', null);

        if (!showDismissed) {
          query = query.is('dismissed_at', null);
        }

        if (filterCategoryId) {
          query = query.eq('category_id', filterCategoryId);
        }
        if (filterSubcategoryId) {
          query = query.eq('category_id', filterSubcategoryId);
        }

        const win = TIME_WINDOWS.find((w) => w.value === filterWindow);
        if (win?.hours) {
          const cutoff = new Date(Date.now() - win.hours * 60 * 60 * 1000).toISOString();
          query = query.gte('updated_at', cutoff);
        }

        if (searchQuery) {
          const escaped = searchQuery.replace(/[%_]/g, (m) => `\\${m}`);
          query = query.or(`title.ilike.%${escaped}%,summary.ilike.%${escaped}%`);
        }

        const { data: rows, error } = await query
          .order('updated_at', { ascending: false })
          .range(nextOffset, nextOffset + PAGE_SIZE - 1);

        if (error) {
          console.error('[newsroom] cluster load failed:', error.message);
          setClusterLoadError(true);
          if (reset) setClusters([]);
          toast.push({ message: 'Could not load clusters.', variant: 'danger' });
          setHasMore(false);
          return;
        }

        const baseRows = (rows || []) as unknown as ClusterRow[];
        setClusters((prev) => (reset ? baseRows : [...prev, ...baseRows]));
        setHasMore(baseRows.length === PAGE_SIZE);
        setOffset(nextOffset + PAGE_SIZE);
        setClusterLoadError(false);

        // Outlet filter is post-query: applies to the visible cluster set
        // by intersecting with the discovery rows we fetch next. We do
        // the intersection in render, not here, so the offset+pagination
        // stays predictable.

        // Fetch source rows for the just-loaded clusters. The discovery
        // table forks by audience (discovery_items vs kid_discovery_items)
        // but the column shape is identical, so the result type collapses
        // cleanly to DiscoveryRow[].
        if (baseRows.length > 0) {
          const ids = baseRows.map((r) => r.id);
          const sourceRes =
            audience === 'kid'
              ? await supabase
                  .from('kid_discovery_items')
                  .select('id, feed_id, cluster_id, raw_url, raw_title, fetched_at, metadata')
                  .in('cluster_id', ids)
                  .order('fetched_at', { ascending: false })
              : await supabase
                  .from('discovery_items')
                  .select('id, feed_id, cluster_id, raw_url, raw_title, fetched_at, metadata')
                  .in('cluster_id', ids)
                  .order('fetched_at', { ascending: false });
          if (sourceRes.error) {
            console.error('[newsroom] source load failed:', sourceRes.error.message);
          } else {
            const grouped: Record<string, DiscoveryRow[]> = {};
            for (const row of (sourceRes.data || []) as unknown as DiscoveryRow[]) {
              if (!row.cluster_id) continue;
              if (!grouped[row.cluster_id]) grouped[row.cluster_id] = [];
              grouped[row.cluster_id].push(row);
            }
            setSourceMap((prev) => (reset ? grouped : { ...prev, ...grouped }));
          }
        } else if (reset) {
          setSourceMap({});
        }
      } finally {
        if (reset) setClusterLoading(false);
        else setLoadingMore(false);
      }
    },
    [
      audience,
      authorized,
      filterCategoryId,
      filterSubcategoryId,
      filterWindow,
      offset,
      searchQuery,
      showDismissed,
      supabase,
      toast,
    ]
  );

  useEffect(() => {
    if (!authorized) return;
    void loadClusters(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    audience,
    authorized,
    filterCategoryId,
    filterSubcategoryId,
    filterWindow,
    searchQuery,
    showDismissed,
  ]);

  // ----------------------------------------------------------------------
  // Glance bar — today's runs + spend + kill switch + feed health.
  // ----------------------------------------------------------------------
  const loadGlance = useCallback(async () => {
    if (!authorized) return;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const sinceIso = startOfDay.toISOString();

    const { data: runRows, error: runErr } = await supabase
      .from('pipeline_runs')
      .select('status, total_cost_usd')
      .eq('audience', audience)
      .eq('pipeline_type', 'generate')
      .gte('started_at', sinceIso);

    let spend = 0;
    const counts = { completed: 0, failed: 0, running: 0 };
    if (!runErr && runRows) {
      for (const r of runRows as Array<{ status: string | null; total_cost_usd: number | string | null }>) {
        const cost = typeof r.total_cost_usd === 'string' ? parseFloat(r.total_cost_usd) : r.total_cost_usd;
        if (Number.isFinite(cost)) spend += cost as number;
        const status = (r.status || '').toLowerCase();
        if (status === 'completed' || status === 'success') counts.completed += 1;
        else if (status === 'failed' || status === 'error' || status === 'cancelled' || status === 'canceled')
          counts.failed += 1;
        else if (status === 'running' || status === 'pending') counts.running += 1;
      }
    } else if (runErr) {
      console.error('[newsroom] glance runs load failed:', runErr.message);
    }

    const settingsKey = audience === 'kid' ? 'ai.kid_generation_enabled' : 'ai.adult_generation_enabled';
    let killSwitchEnabled: boolean | null = null;
    const { data: settingsRow, error: settingsErr } = await supabase
      .from('settings')
      .select('value')
      .eq('key', settingsKey)
      .maybeSingle();
    if (settingsErr) {
      console.error('[newsroom] kill switch lookup failed:', settingsErr.message);
    } else if (settingsRow) {
      killSwitchEnabled = String(settingsRow.value) === 'true';
    }

    const staleCutoff = new Date(Date.now() - STALE_FEED_HOURS * 60 * 60 * 1000).toISOString();
    let unhealthy = 0;
    const { data: healthRows, error: healthErr } = await supabase
      .from('feeds')
      .select('id, error_count, last_polled_at')
      .eq('audience', audience)
      .eq('is_active', true);
    if (!healthErr && healthRows) {
      for (const f of healthRows as Array<{ error_count: number; last_polled_at: string | null }>) {
        if (f.error_count > 0) {
          unhealthy += 1;
          continue;
        }
        if (!f.last_polled_at || f.last_polled_at < staleCutoff) {
          unhealthy += 1;
        }
      }
    } else if (healthErr) {
      console.error('[newsroom] feed health lookup failed:', healthErr.message);
    }

    setGlance({
      todaySpendUsd: spend,
      runs: counts,
      killSwitchEnabled,
      unhealthyFeedCount: unhealthy,
    });
  }, [audience, authorized, supabase]);

  // ----------------------------------------------------------------------
  // Recent runs strip — last 10 generate runs for the active audience.
  // ----------------------------------------------------------------------
  const loadRecentRuns = useCallback(async () => {
    if (!authorized) return;
    const { data, error } = await supabase
      .from('pipeline_runs')
      .select('id, status, started_at, completed_at, total_cost_usd, model, cluster_id, audience')
      .eq('audience', audience)
      .eq('pipeline_type', 'generate')
      .order('started_at', { ascending: false })
      .limit(10);
    if (error) {
      console.error('[newsroom] recent runs load failed:', error.message);
      return;
    }
    setRecentRuns((data || []) as unknown as RecentRun[]);
  }, [audience, authorized, supabase]);

  useEffect(() => {
    if (!authorized) return;
    void loadGlance();
    void loadRecentRuns();
  }, [authorized, loadGlance, loadRecentRuns]);

  // ----------------------------------------------------------------------
  // Subcategory list (re-derived from `categories` whenever filterCategoryId changes)
  // ----------------------------------------------------------------------
  const topLevelCategories = useMemo(
    () => categories.filter((c) => c.parent_id === null),
    [categories]
  );
  const subcategoryOptions = useMemo(() => {
    if (!filterCategoryId) return [];
    return categories.filter((c) => c.parent_id === filterCategoryId);
  }, [categories, filterCategoryId]);

  // ----------------------------------------------------------------------
  // Outlet filter (client-side intersection)
  // ----------------------------------------------------------------------
  const visibleClusters = useMemo(() => {
    if (!filterFeedId) return clusters;
    return clusters.filter((c) => {
      const sources = sourceMap[c.id] || [];
      return sources.some((s) => s.feed_id === filterFeedId);
    });
  }, [clusters, sourceMap, filterFeedId]);

  // ----------------------------------------------------------------------
  // Feed name lookup
  // ----------------------------------------------------------------------
  const feedById = useMemo(() => {
    const m: Record<string, FeedLite> = {};
    for (const f of feeds) m[f.id] = f;
    return m;
  }, [feeds]);

  // ----------------------------------------------------------------------
  // Active prompt instructions (computed for GenerationModal freeform)
  // ----------------------------------------------------------------------
  const activePromptBody = useMemo(() => {
    if (promptMode === 'preset' && promptPresetId) {
      const p = presets.find((x) => x.id === promptPresetId);
      return (p?.body || '').trim();
    }
    if (promptMode === 'custom') {
      return customPrompt.trim();
    }
    return '';
  }, [promptMode, promptPresetId, customPrompt, presets]);

  // ----------------------------------------------------------------------
  // Refresh feeds
  // ----------------------------------------------------------------------
  async function refreshFeeds() {
    setBusyRefresh(true);
    try {
      const res = await fetch('/api/newsroom/ingest/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ audience }),
      });
      if (res.status === 429) {
        toast.push({
          message: 'Refreshing too fast. Try again in a moment.',
          variant: 'warn',
        });
        return;
      }
      await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.push({ message: 'Could not refresh feeds.', variant: 'danger' });
        return;
      }
      toast.push({ message: 'Feeds refreshed.', variant: 'success' });
      await loadClusters(true);
      await loadGlance();
    } finally {
      setBusyRefresh(false);
    }
  }

  // ----------------------------------------------------------------------
  // Cluster mutation handlers (Stream 4 routes)
  // ----------------------------------------------------------------------
  async function moveItem(clusterId: string, itemId: string, targetClusterId: string | null) {
    const key = `${clusterId}:move:${itemId}`;
    setBusyId(key);
    try {
      const res = await fetch(`/api/admin/newsroom/clusters/${clusterId}/move-item`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          item_id: itemId,
          target_cluster_id: targetClusterId,
          audience,
        }),
      });
      if (!res.ok) {
        toast.push({ message: 'Could not move item.', variant: 'danger' });
        return;
      }
      toast.push({
        message: targetClusterId ? 'Item moved.' : 'Item moved to a new cluster.',
        variant: 'success',
      });
      await loadClusters(true);
    } finally {
      setBusyId('');
    }
  }

  async function mergeCluster(sourceId: string, targetId: string) {
    const key = `${sourceId}:merge`;
    setBusyId(key);
    try {
      const res = await fetch(`/api/admin/newsroom/clusters/${sourceId}/merge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target_id: targetId }),
      });
      if (!res.ok) {
        toast.push({ message: 'Could not merge clusters.', variant: 'danger' });
        return;
      }
      toast.push({ message: 'Clusters merged.', variant: 'success' });
      await loadClusters(true);
    } finally {
      setBusyId('');
    }
  }

  async function splitCluster(sourceId: string, itemIds: string[]) {
    if (itemIds.length === 0) return;
    const key = `${sourceId}:split`;
    setBusyId(key);
    try {
      const res = await fetch(`/api/admin/newsroom/clusters/${sourceId}/split`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ item_ids: itemIds }),
      });
      if (!res.ok) {
        toast.push({ message: 'Could not split cluster.', variant: 'danger' });
        return;
      }
      toast.push({ message: 'Cluster split.', variant: 'success' });
      setSplitMode(null);
      await loadClusters(true);
    } finally {
      setBusyId('');
    }
  }

  async function dismissCluster(clusterId: string) {
    const reason = typeof window !== 'undefined' ? window.prompt('Dismiss reason (optional)') : '';
    if (reason === null) return; // user cancelled the prompt
    const key = `${clusterId}:dismiss`;
    setBusyId(key);
    try {
      const res = await fetch(`/api/admin/newsroom/clusters/${clusterId}/dismiss`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(reason ? { reason } : {}),
      });
      if (!res.ok) {
        toast.push({ message: 'Could not dismiss cluster.', variant: 'danger' });
        return;
      }
      toast.push({ message: 'Cluster dismissed.', variant: 'success' });
      await loadClusters(true);
    } finally {
      setBusyId('');
    }
  }

  async function undismissCluster(clusterId: string) {
    const key = `${clusterId}:undismiss`;
    setBusyId(key);
    try {
      const res = await fetch(`/api/admin/newsroom/clusters/${clusterId}/dismiss`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        toast.push({ message: 'Could not restore cluster.', variant: 'danger' });
        return;
      }
      toast.push({ message: 'Cluster restored.', variant: 'success' });
      await loadClusters(true);
    } finally {
      setBusyId('');
    }
  }

  async function unlockCluster(clusterId: string) {
    const key = `${clusterId}:unlock`;
    setBusyId(key);
    try {
      const res = await fetch(`/api/admin/newsroom/clusters/${clusterId}/unlock`, {
        method: 'POST',
      });
      if (!res.ok) {
        toast.push({ message: 'Unlock failed.', variant: 'danger' });
        return;
      }
      toast.push({ message: 'Cluster unlocked.', variant: 'success' });
      await loadClusters(true);
    } finally {
      setBusyId('');
    }
  }

  async function retryRun(runId: string) {
    setRetryRunId(runId);
    try {
      const res = await fetch(`/api/admin/pipeline/runs/${runId}/retry`, {
        method: 'POST',
      });
      const body = (await res.json().catch(() => ({}))) as { new_run_id?: string };
      if (!res.ok) {
        toast.push({ message: 'Retry failed.', variant: 'danger' });
        return;
      }
      toast.push({
        message: body.new_run_id ? 'Retry started.' : 'Retry queued.',
        variant: 'success',
      });
      await loadRecentRuns();
    } finally {
      setRetryRunId('');
    }
  }

  // ----------------------------------------------------------------------
  // Generate handlers (host page owns audience; modal is dumb pass-through)
  // ----------------------------------------------------------------------
  function openGenerate(cluster: ClusterRow, options?: { kidVersion?: boolean }) {
    const targetAudience: Audience = options?.kidVersion ? 'kid' : audience;
    const sourceUrls =
      options?.kidVersion && audience === 'adult'
        ? (sourceMap[cluster.id] || []).map((s) => s.raw_url).filter(Boolean)
        : [];
    setGenTarget({
      id: cluster.id,
      title: (cluster.title && cluster.title.trim()) || 'Untitled cluster',
      audience: targetAudience,
      sourceUrls,
    });
  }

  function closeGenerate() {
    setGenTarget(null);
  }

  // ----------------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------------
  if (authLoading) {
    return (
      <Page>
        <div style={{ padding: S[12], textAlign: 'center', color: ADMIN_C.dim }}>
          <Spinner /> Loading newsroom
        </div>
      </Page>
    );
  }
  if (!authorized) return null;

  const headerActions = (
    <>
      <Button variant="secondary" size="md" loading={busyRefresh} onClick={refreshFeeds}>
        Refresh feeds
      </Button>
      <Link href={`/admin/pipeline/runs?audience=${audience}`} style={{ textDecoration: 'none' }}>
        <Button variant="ghost" size="md">
          All runs
        </Button>
      </Link>
    </>
  );

  return (
    <Page>
      <PageHeader
        title="Newsroom"
        subtitle="Operator workspace for clustering and generation. Audience-scoped end to end."
        actions={headerActions}
      />

      <AudienceTabs audience={audience} onSwitch={setAudienceTab} />

      <GlanceBar audience={audience} glance={glance} />

      <FilterRow
        topCategories={topLevelCategories}
        subcategories={subcategoryOptions}
        feeds={feeds}
        filterCategoryId={filterCategoryId}
        filterSubcategoryId={filterSubcategoryId}
        filterFeedId={filterFeedId}
        filterWindow={filterWindow}
        searchInput={searchInput}
        showDismissed={showDismissed}
        onCategoryChange={setFilterCategoryId}
        onSubcategoryChange={setFilterSubcategoryId}
        onFeedChange={setFilterFeedId}
        onWindowChange={setFilterWindow}
        onSearchChange={setSearchInput}
        onShowDismissedChange={setShowDismissed}
      />

      <PromptPicker
        mode={promptMode}
        onModeChange={setPromptMode}
        presets={presets}
        presetId={promptPresetId}
        onPresetChange={setPromptPresetId}
        custom={customPrompt}
        onCustomChange={setCustomPrompt}
      />

      <PipelineRunPicker ref={pickerRef} onChange={onPickerChange} />

      <PageSection
        title="Clusters"
        description={`${visibleClusters.length} visible · audience: ${audience}`}
      >
        {clusterLoading ? (
          <div style={{ padding: S[8], textAlign: 'center', color: ADMIN_C.dim }}>
            <Spinner /> Loading clusters
          </div>
        ) : clusterLoadError && visibleClusters.length === 0 ? (
          <EmptyState
            title="Could not load clusters"
            description="Something went wrong fetching the cluster list. Try refreshing feeds or reload the page."
          />
        ) : visibleClusters.length === 0 ? (
          <EmptyState
            title="No clusters match"
            description="Adjust the filters or click Refresh feeds to ingest. New clusters appear here as they form."
          />
        ) : (
          <ClusterGrid
            clusters={visibleClusters}
            sourceMap={sourceMap}
            feedById={feedById}
            audience={audience}
            pickerReady={pickerReady}
            estCost={estCost}
            busyId={busyId}
            splitMode={splitMode}
            onSplitModeChange={setSplitMode}
            onGenerate={(c) => openGenerate(c)}
            onGenerateKidsVersion={(c) => openGenerate(c, { kidVersion: true })}
            onMoveItem={moveItem}
            onMerge={mergeCluster}
            onSplitCommit={splitCluster}
            onDismiss={dismissCluster}
            onUndismiss={undismissCluster}
            onUnlock={unlockCluster}
          />
        )}

        {hasMore && !clusterLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: S[6] }}>
            <Button
              variant="secondary"
              size="md"
              loading={loadingMore}
              disabled={loadingMore}
              onClick={() => loadClusters(false)}
            >
              Load more
            </Button>
          </div>
        )}
      </PageSection>

      <RecentRunsStrip
        audience={audience}
        runs={recentRuns}
        retryRunId={retryRunId}
        onRetry={retryRun}
      />

      <GenerationModal
        open={genTarget !== null}
        clusterId={genTarget?.id ?? ''}
        clusterTitle={genTarget?.title ?? null}
        audience={genTarget?.audience ?? audience}
        sourceUrls={genTarget?.sourceUrls ?? []}
        provider={picker.provider}
        model={picker.model}
        freeformInstructions={
          // Prompt picker overrides the header's freeform when active, so the
          // operator can pick a preset on the page and it flows into the run
          // without re-typing. Picker freeform stays as a final-layer add-on
          // when no preset/custom is picked.
          activePromptBody || picker.freeformInstructions
        }
        onClose={closeGenerate}
        onGenerateClick={() => {
          pickerRef.current?.reset();
        }}
        onRunSettled={() => {
          void loadClusters(true);
          void loadGlance();
          void loadRecentRuns();
        }}
      />
    </Page>
  );
}

// =====================================================================
// Sub-components — kept inside the same file because they read tightly
// from the workspace's local state and are not reused elsewhere.
// =====================================================================

function AudienceTabs({
  audience,
  onSwitch,
}: {
  audience: Audience;
  onSwitch: (next: Audience) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Audience"
      style={{
        display: 'flex',
        gap: S[2],
        padding: `${S[2]}px 0`,
        marginBottom: S[3],
        borderBottom: `1px solid ${ADMIN_C.divider}`,
      }}
    >
      {(['adult', 'kid'] as const).map((opt) => {
        const active = audience === opt;
        return (
          <button
            key={opt}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSwitch(opt)}
            style={{
              padding: `${S[2]}px ${S[4]}px`,
              border: 'none',
              borderBottom: `2px solid ${active ? ADMIN_C.accent : 'transparent'}`,
              background: 'transparent',
              color: active ? ADMIN_C.white : ADMIN_C.dim,
              fontWeight: active ? 600 : 500,
              fontSize: F.md,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {opt === 'adult' ? 'Adult' : 'Kid'}
          </button>
        );
      })}
    </div>
  );
}

function GlanceBar({ audience, glance }: { audience: Audience; glance: GlanceData | null }) {
  const cards = [
    {
      label: "Today's spend",
      value: glance ? formatCostUsd(glance.todaySpendUsd) : '—',
      hint: 'Generate runs since 00:00 local',
      href: `/admin/pipeline/costs?audience=${audience}`,
    },
    {
      label: "Today's runs",
      value: glance
        ? `${glance.runs.completed + glance.runs.failed + glance.runs.running}`
        : '—',
      hint: glance
        ? `${glance.runs.completed} done · ${glance.runs.failed} failed · ${glance.runs.running} running`
        : 'Generate pipeline only',
      href: `/admin/pipeline/runs?audience=${audience}`,
    },
    {
      label: 'Kill switch',
      value:
        glance?.killSwitchEnabled === null
          ? '—'
          : glance?.killSwitchEnabled
            ? 'Enabled'
            : 'Disabled',
      hint: 'Click to manage',
      href: '/admin/pipeline/settings',
      danger: glance?.killSwitchEnabled === false,
    },
    {
      label: 'Feed health',
      value: glance ? `${glance.unhealthyFeedCount} need attention` : '—',
      hint: 'Errors or stale > 6h',
      href: `/admin/feeds?audience=${audience}`,
      danger: (glance?.unhealthyFeedCount ?? 0) > 0,
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: S[3],
        marginBottom: S[4],
      }}
    >
      {cards.map((c) => (
        <Link
          key={c.label}
          href={c.href}
          style={{ textDecoration: 'none' }}
          // The settings page is a separate concern surface; opening it in
          // a new tab keeps the operator's filter context here intact.
          target={c.label === 'Kill switch' ? '_blank' : undefined}
          rel={c.label === 'Kill switch' ? 'noopener noreferrer' : undefined}
        >
          <div
            style={{
              padding: S[3],
              border: `1px solid ${c.danger ? ADMIN_C.danger : ADMIN_C.divider}`,
              borderRadius: 8,
              background: ADMIN_C.bg,
              transition: 'background 120ms ease, border-color 120ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = ADMIN_C.hover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = ADMIN_C.bg;
            }}
          >
            <div style={{ fontSize: F.xs, color: ADMIN_C.muted, marginBottom: 2 }}>{c.label}</div>
            <div
              style={{
                fontSize: F.lg,
                fontWeight: 600,
                color: c.danger ? ADMIN_C.danger : ADMIN_C.white,
                lineHeight: 1.2,
              }}
            >
              {c.value}
            </div>
            <div style={{ fontSize: F.xs, color: ADMIN_C.dim, marginTop: 2 }}>{c.hint}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function FilterRow({
  topCategories,
  subcategories,
  feeds,
  filterCategoryId,
  filterSubcategoryId,
  filterFeedId,
  filterWindow,
  searchInput,
  showDismissed,
  onCategoryChange,
  onSubcategoryChange,
  onFeedChange,
  onWindowChange,
  onSearchChange,
  onShowDismissedChange,
}: {
  topCategories: CategoryRow[];
  subcategories: CategoryRow[];
  feeds: FeedLite[];
  filterCategoryId: string;
  filterSubcategoryId: string;
  filterFeedId: string;
  filterWindow: string;
  searchInput: string;
  showDismissed: boolean;
  onCategoryChange: (id: string) => void;
  onSubcategoryChange: (id: string) => void;
  onFeedChange: (id: string) => void;
  onWindowChange: (val: string) => void;
  onSearchChange: (val: string) => void;
  onShowDismissedChange: (next: boolean) => void;
}) {
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 9,
        background: ADMIN_C.bg,
        padding: `${S[3]}px 0`,
        marginBottom: S[3],
        borderBottom: `1px solid ${ADMIN_C.divider}`,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: S[3],
        }}
      >
        <Field id="f-category" label="Category">
          <Select
            id="f-category"
            value={filterCategoryId}
            placeholder="All categories"
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onCategoryChange(e.target.value)}
            options={[
              { value: '', label: 'All categories' },
              ...topCategories.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </Field>

        <Field id="f-subcategory" label="Subcategory">
          <Select
            id="f-subcategory"
            value={filterSubcategoryId}
            placeholder={
              !filterCategoryId
                ? 'Pick a category first'
                : subcategories.length === 0
                  ? 'No subcategories'
                  : 'All subcategories'
            }
            disabled={!filterCategoryId || subcategories.length === 0}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              onSubcategoryChange(e.target.value)
            }
            options={[
              { value: '', label: 'All subcategories' },
              ...subcategories.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </Field>

        <Field id="f-outlet" label="Outlet">
          <Select
            id="f-outlet"
            value={filterFeedId}
            placeholder="All outlets"
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onFeedChange(e.target.value)}
            options={[
              { value: '', label: 'All outlets' },
              ...feeds.map((f) => ({
                value: f.id,
                label: f.source_name || f.name,
              })),
            ]}
          />
        </Field>

        <Field id="f-window" label="Time window">
          <Select
            id="f-window"
            value={filterWindow}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onWindowChange(e.target.value)}
            options={TIME_WINDOWS.map((w) => ({ value: w.value, label: w.label }))}
          />
        </Field>

        <Field id="f-search" label="Search">
          <TextInput
            id="f-search"
            type="search"
            value={searchInput}
            placeholder="Title or summary"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
          />
        </Field>

        <Field id="f-dismissed" label="Dismissed">
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: S[2],
              fontSize: F.sm,
              color: ADMIN_C.soft,
              cursor: 'pointer',
              padding: `6px 0`,
            }}
          >
            <input
              id="f-dismissed"
              type="checkbox"
              checked={showDismissed}
              onChange={(e) => onShowDismissedChange(e.target.checked)}
            />
            Show dismissed
          </label>
        </Field>
      </div>
    </div>
  );
}

function PromptPicker({
  mode,
  onModeChange,
  presets,
  presetId,
  onPresetChange,
  custom,
  onCustomChange,
}: {
  mode: PromptMode;
  onModeChange: (m: PromptMode) => void;
  presets: PromptPreset[];
  presetId: string;
  onPresetChange: (id: string) => void;
  custom: string;
  onCustomChange: (val: string) => void;
}) {
  const activePreset = presets.find((p) => p.id === presetId) || null;

  return (
    <div
      style={{
        padding: S[3],
        border: `1px solid ${ADMIN_C.divider}`,
        borderRadius: 8,
        background: ADMIN_C.card,
        marginBottom: S[4],
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: S[3],
          marginBottom: S[3],
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: S[2] }}>
          {(['default', 'preset', 'custom'] as const).map((opt) => {
            const active = mode === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onModeChange(opt)}
                style={{
                  padding: `6px ${S[3]}px`,
                  fontSize: F.sm,
                  border: `1px solid ${active ? ADMIN_C.accent : ADMIN_C.border}`,
                  borderRadius: 6,
                  background: active ? ADMIN_C.accent : 'transparent',
                  color: active ? ADMIN_C.bg : ADMIN_C.soft,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: active ? 600 : 500,
                }}
              >
                {opt === 'default' ? 'Default' : opt === 'preset' ? 'Preset' : 'Custom'}
              </button>
            );
          })}
        </div>
        <Link href="/admin/prompt-presets" style={{ textDecoration: 'none' }}>
          <Button variant="ghost" size="sm">
            Manage presets
          </Button>
        </Link>
      </div>

      {mode === 'default' && (
        <div style={{ fontSize: F.sm, color: ADMIN_C.dim, lineHeight: 1.5 }}>
          Default editorial-guide flow. No extra instructions injected — the standard pipeline
          runs as configured in Settings.
        </div>
      )}

      {mode === 'preset' && (
        <>
          <Field id="prompt-preset" label="Preset">
            <Select
              id="prompt-preset"
              value={presetId}
              placeholder={presets.length === 0 ? 'No presets available' : 'Choose a preset'}
              disabled={presets.length === 0}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onPresetChange(e.target.value)}
              options={presets.map((p) => ({
                value: p.id,
                label: `${p.name}${p.audience === 'both' ? ' (both)' : p.audience === 'kid' ? ' (kid)' : ''}`,
              }))}
            />
          </Field>
          {activePreset && (
            <div
              style={{
                marginTop: S[2],
                padding: S[3],
                background: ADMIN_C.bg,
                border: `1px solid ${ADMIN_C.divider}`,
                borderRadius: 6,
                fontSize: F.sm,
                color: ADMIN_C.soft,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                maxHeight: 240,
                overflowY: 'auto',
              }}
            >
              {activePreset.body}
            </div>
          )}
        </>
      )}

      {mode === 'custom' && (
        <Field
          id="prompt-custom"
          label="Custom instructions"
          hint="Forwarded to the generate run as freeform_instructions. Resets per-run."
        >
          <Textarea
            id="prompt-custom"
            rows={4}
            value={custom}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onCustomChange(e.target.value)}
            placeholder="e.g. focus on the legal angle; keep it under 600 words."
          />
        </Field>
      )}
    </div>
  );
}

function ClusterGrid({
  clusters,
  sourceMap,
  feedById,
  audience,
  pickerReady,
  estCost,
  busyId,
  splitMode,
  onSplitModeChange,
  onGenerate,
  onGenerateKidsVersion,
  onMoveItem,
  onMerge,
  onSplitCommit,
  onDismiss,
  onUndismiss,
  onUnlock,
}: {
  clusters: ClusterRow[];
  sourceMap: Record<string, DiscoveryRow[]>;
  feedById: Record<string, FeedLite>;
  audience: Audience;
  pickerReady: boolean;
  estCost: number | null;
  busyId: string;
  splitMode: { clusterId: string; itemIds: Set<string> } | null;
  onSplitModeChange: (next: { clusterId: string; itemIds: Set<string> } | null) => void;
  onGenerate: (c: ClusterRow) => void;
  onGenerateKidsVersion: (c: ClusterRow) => void;
  onMoveItem: (clusterId: string, itemId: string, targetClusterId: string | null) => void;
  onMerge: (sourceId: string, targetId: string) => void;
  onSplitCommit: (sourceId: string, itemIds: string[]) => void;
  onDismiss: (clusterId: string) => void;
  onUndismiss: (clusterId: string) => void;
  onUnlock: (clusterId: string) => void;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))',
        gap: S[4],
      }}
    >
      {clusters.map((c) => {
        const sources = sourceMap[c.id] || [];
        const locked = !!c.locked_by;
        const dismissed = !!c.dismissed_at;
        const title = (c.title && c.title.trim()) || 'Untitled cluster';
        const otherClusters = clusters.filter((x) => x.id !== c.id);
        const inSplit = splitMode?.clusterId === c.id;
        const splitSelected = inSplit ? splitMode.itemIds : new Set<string>();

        return (
          <div
            key={c.id}
            style={{
              border: `1px solid ${dismissed ? ADMIN_C.warn : ADMIN_C.divider}`,
              borderRadius: 8,
              background: ADMIN_C.bg,
              padding: S[4],
              display: 'flex',
              flexDirection: 'column',
              gap: S[3],
              opacity: dismissed ? 0.7 : 1,
            }}
          >
            <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap', alignItems: 'center' }}>
              {c.is_breaking && (
                <Badge variant="danger" size="xs">
                  Breaking
                </Badge>
              )}
              {locked && (
                <span
                  title={
                    c.locked_at
                      ? `Locked ${relativeTime(c.locked_at)} (auto-expires after 10 min via RPC TTL)`
                      : 'Cluster is locked; another run is in progress.'
                  }
                >
                  <Badge variant="warn" size="xs">
                    Locked
                  </Badge>
                </span>
              )}
              {dismissed && (
                <Badge variant="warn" size="xs">
                  Dismissed{c.dismiss_reason ? `: ${truncate(c.dismiss_reason, 60)}` : ''}
                </Badge>
              )}
              <span style={{ marginLeft: 'auto', fontSize: F.xs, color: ADMIN_C.muted }}>
                {relativeTime(c.updated_at)}
              </span>
            </div>

            <div
              style={{
                fontSize: F.md,
                fontWeight: 600,
                color: ADMIN_C.white,
                lineHeight: 1.3,
              }}
            >
              {title}
            </div>

            {c.summary && (
              <div
                style={{
                  fontSize: F.sm,
                  color: ADMIN_C.dim,
                  lineHeight: 1.5,
                }}
              >
                {truncate(c.summary, 240)}
              </div>
            )}

            {/* Source rows */}
            <div
              style={{
                borderTop: `1px solid ${ADMIN_C.divider}`,
                paddingTop: S[3],
                display: 'flex',
                flexDirection: 'column',
                gap: S[2],
              }}
            >
              <div
                style={{
                  fontSize: F.xs,
                  color: ADMIN_C.muted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                }}
              >
                {sources.length} source{sources.length === 1 ? '' : 's'}
              </div>
              {sources.length === 0 && (
                <div style={{ fontSize: F.xs, color: ADMIN_C.muted, fontStyle: 'italic' }}>
                  No source rows linked. The cluster may be matched to an existing article.
                </div>
              )}
              {sources.map((s) => {
                const feed = s.feed_id ? feedById[s.feed_id] : null;
                const outlet =
                  feed?.source_name || feed?.name || s.metadata?.outlet || 'Unknown outlet';
                const headline =
                  (s.raw_title && s.raw_title.trim()) ||
                  (s.raw_url ? new URL(s.raw_url).pathname.split('/').filter(Boolean).slice(-1)[0] : '') ||
                  '(untitled)';
                const lede = s.metadata?.excerpt || '';
                const moveKey = `${c.id}:move:${s.id}`;
                const checked = splitSelected.has(s.id);
                return (
                  <div
                    key={s.id}
                    style={{
                      padding: S[2],
                      border: `1px solid ${ADMIN_C.divider}`,
                      borderRadius: 6,
                      background: ADMIN_C.card,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: S[1],
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
                      {inSplit && (
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = new Set(splitSelected);
                            if (next.has(s.id)) next.delete(s.id);
                            else next.add(s.id);
                            onSplitModeChange({ clusterId: c.id, itemIds: next });
                          }}
                        />
                      )}
                      <span style={{ fontSize: F.xs, color: ADMIN_C.dim, fontWeight: 600 }}>
                        {outlet}
                      </span>
                      <span style={{ fontSize: F.xs, color: ADMIN_C.muted }}>
                        · {relativeTime(s.fetched_at)}
                      </span>
                    </div>
                    <a
                      href={s.raw_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: F.sm,
                        color: ADMIN_C.white,
                        textDecoration: 'none',
                        fontWeight: 500,
                        lineHeight: 1.4,
                      }}
                    >
                      {truncate(headline, 140)}
                    </a>
                    {lede && (
                      <div style={{ fontSize: F.xs, color: ADMIN_C.dim, lineHeight: 1.5 }}>
                        {truncate(lede, 200)}
                      </div>
                    )}
                    {!inSplit && (
                      <div
                        style={{
                          display: 'flex',
                          gap: S[2],
                          flexWrap: 'wrap',
                          marginTop: S[1],
                        }}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyId !== ''}
                          loading={busyId === moveKey}
                          onClick={() => onMoveItem(c.id, s.id, null)}
                          title="Detach this source from the cluster (creates a singleton)"
                        >
                          Move out
                        </Button>
                        {otherClusters.length > 0 && (
                          <Select
                            size="sm"
                            value=""
                            placeholder="Move to..."
                            disabled={busyId !== ''}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                              const target = e.target.value;
                              if (target) onMoveItem(c.id, s.id, target);
                            }}
                            options={otherClusters.map((oc) => ({
                              value: oc.id,
                              label: truncate((oc.title || 'Untitled cluster').trim(), 50),
                            }))}
                            block={false}
                            style={{ width: 200 }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Cost line */}
            {pickerReady && estCost !== null && (
              <div style={{ fontSize: F.xs, color: ADMIN_C.muted }}>
                Predicted: {formatEstimatedCost(estCost)}
              </div>
            )}

            {/* Action row */}
            <div
              style={{
                display: 'flex',
                gap: S[2],
                flexWrap: 'wrap',
                alignItems: 'center',
                marginTop: S[1],
              }}
            >
              {inSplit ? (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={splitSelected.size === 0 || busyId !== ''}
                    loading={busyId === `${c.id}:split`}
                    onClick={() => onSplitCommit(c.id, Array.from(splitSelected))}
                  >
                    Split into new cluster ({splitSelected.size})
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onSplitModeChange(null)}>
                    Cancel split
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={locked || busyId !== '' || !pickerReady || dismissed}
                    onClick={() => onGenerate(c)}
                    title={
                      locked
                        ? 'Cluster is locked; another run is in progress.'
                        : !pickerReady
                          ? 'Pick a provider and model below first.'
                          : dismissed
                            ? 'Restore the cluster before generating.'
                            : undefined
                    }
                  >
                    Generate {audience === 'kid' ? 'kid' : 'adult'} article
                  </Button>

                  {audience === 'adult' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={locked || busyId !== '' || !pickerReady || dismissed}
                      onClick={() => onGenerateKidsVersion(c)}
                      title="Run the kid pipeline against this cluster's adult sources."
                    >
                      Generate kids version
                    </Button>
                  )}

                  {otherClusters.length > 0 && (
                    <Select
                      size="sm"
                      value=""
                      placeholder="Merge with..."
                      disabled={busyId !== '' || dismissed}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                        const target = e.target.value;
                        if (target) onMerge(c.id, target);
                      }}
                      options={otherClusters.map((oc) => ({
                        value: oc.id,
                        label: truncate((oc.title || 'Untitled cluster').trim(), 50),
                      }))}
                      block={false}
                      style={{ width: 220 }}
                    />
                  )}

                  {sources.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyId !== '' || dismissed}
                      onClick={() =>
                        onSplitModeChange({ clusterId: c.id, itemIds: new Set() })
                      }
                    >
                      Split…
                    </Button>
                  )}

                  {dismissed ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyId !== ''}
                      loading={busyId === `${c.id}:undismiss`}
                      onClick={() => onUndismiss(c.id)}
                    >
                      Restore
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyId !== ''}
                      loading={busyId === `${c.id}:dismiss`}
                      onClick={() => onDismiss(c.id)}
                    >
                      Dismiss
                    </Button>
                  )}

                  {locked && (
                    <Button
                      variant="danger"
                      size="sm"
                      loading={busyId === `${c.id}:unlock`}
                      disabled={busyId !== ''}
                      onClick={() => onUnlock(c.id)}
                    >
                      Unlock
                    </Button>
                  )}

                  {/* TODO Stream 6.1 — delete /admin/newsroom/clusters/[id]
                       once the workspace has full parity. View link kept
                       active so PM's cleanup pass can sweep it cleanly. */}
                  <Link
                    href={`/admin/newsroom/clusters/${c.id}`}
                    style={{ textDecoration: 'none', marginLeft: 'auto' }}
                  >
                    <Button variant="ghost" size="sm">
                      View
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecentRunsStrip({
  audience,
  runs,
  retryRunId,
  onRetry,
}: {
  audience: Audience;
  runs: RecentRun[];
  retryRunId: string;
  onRetry: (id: string) => void;
}) {
  return (
    <PageSection
      title="Recent runs"
      description={`Last ${runs.length} generate runs for the ${audience} audience.`}
      aside={
        <Link href={`/admin/pipeline/runs?audience=${audience}`} style={{ textDecoration: 'none' }}>
          <Button variant="ghost" size="sm">
            View all
          </Button>
        </Link>
      }
    >
      {runs.length === 0 ? (
        <div style={{ fontSize: F.sm, color: ADMIN_C.dim, padding: S[3] }}>
          No generate runs yet for this audience.
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: S[1],
          }}
        >
          {runs.map((r) => {
            const status = (r.status || '').toLowerCase();
            const failed = status === 'failed' || status === 'error' || status === 'cancelled' || status === 'canceled';
            return (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: S[3],
                  padding: `${S[2]}px ${S[3]}px`,
                  border: `1px solid ${ADMIN_C.divider}`,
                  borderRadius: 6,
                  background: ADMIN_C.bg,
                  fontSize: F.sm,
                }}
              >
                <span style={{ color: ADMIN_C.muted, fontSize: F.xs, minWidth: 110 }}>
                  {relativeTime(r.started_at)}
                </span>
                <Badge
                  size="xs"
                  variant={
                    status === 'completed' || status === 'success'
                      ? 'success'
                      : failed
                        ? 'danger'
                        : status === 'running' || status === 'pending'
                          ? 'info'
                          : 'neutral'
                  }
                >
                  {r.status || '—'}
                </Badge>
                <span
                  style={{
                    color: ADMIN_C.dim,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: F.xs,
                  }}
                >
                  {r.model || '—'}
                </span>
                <span style={{ color: ADMIN_C.dim, fontSize: F.xs }}>
                  {formatCostUsd(r.total_cost_usd)}
                </span>
                <Link
                  href={`/admin/pipeline/runs/${r.id}`}
                  style={{
                    color: ADMIN_C.soft,
                    textDecoration: 'none',
                    fontSize: F.xs,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    marginLeft: 'auto',
                  }}
                >
                  {r.id.slice(0, 8)}
                </Link>
                {failed && (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={retryRunId === r.id}
                    disabled={retryRunId !== ''}
                    onClick={() => onRetry(r.id)}
                  >
                    Retry
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PageSection>
  );
}
