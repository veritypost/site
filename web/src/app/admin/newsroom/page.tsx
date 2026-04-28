/**
 * F7 Newsroom Redesign — single-page operator workspace, unified feed.
 *
 * One feed pool, one cluster list. Adult and kid sources are no longer
 * separated upstream — every active feed contributes to a single discovery
 * pool, clusters form across the whole pool, and the operator picks
 * audience at GENERATION TIME via a 3-button picker (Adult / Kid / Both).
 *
 *   1. GlanceBar — combined numbers across both pipelines: today's spend,
 *      today's runs, kill switches (adult + kid side-by-side), feed health.
 *   2. Filter row — category, subcategory, outlet, time window, search,
 *      Show dismissed. (No audience filter — there is no audience tab now.)
 *   3. Prompt picker — Default / Preset / Custom (preset list pulled from
 *      ai_prompt_presets, scoped to "both" since both audiences may render).
 *   4. Provider/model picker (PipelineRunPicker, freeform hidden).
 *   5. "Refresh feeds" — single button (POST to /api/newsroom/ingest/run
 *      with no audience body — the route polls every active feed).
 *   6. Cluster list — ONE flat sorted list (updated_at desc), 50 per page,
 *      single "Load more". Per row: title + dim metadata, generated-state
 *      badges (`Adult: View` / `Kid: View` if articles exist), Generate
 *      picker button, Move/Merge/Split/Dismiss controls, source-row
 *      disclosure toggle.
 *   7. Recent runs strip — last 10 across both audiences interleaved.
 *
 * Source-row reads route through /api/admin/newsroom/clusters/sources
 * (service-role; bypasses the `admin.system.view` SELECT RLS on
 * discovery_items). Article-existence reads route through
 * /api/admin/newsroom/clusters/articles (service-role; reads `articles`
 * partitioned by is_kids_safe per Phase 1 of AI + Plan Change Implementation).
 *
 * URL persistence:
 *   ?cat=<uuid>           top-level category
 *   ?sub=<uuid>           subcategory (only meaningful with cat)
 *   ?outlet=<uuid>        feed id
 *   ?window=6h|24h|72h|7d|all
 *   ?q=<text>             search (post-debounce)
 *   ?dismissed=1          show dismissed (otherwise hidden)
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
import { useToast } from '@/components/admin/Toast';
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
  raw_body: string | null;
  fetched_at: string;
  metadata: { outlet?: string | null; excerpt?: string | null } | null;
  state: string | null;
};

type FeedLite = {
  id: string;
  name: string;
  source_name: string | null;
  url: string;
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
  killSwitches: { adultEnabled: boolean | null; kidEnabled: boolean | null };
  unhealthyFeedCount: number;
};

type ArticleHit = {
  cluster_id: string;
  audience: Audience;
  article_id: string;
  status: string;
};

type ArticleMap = Record<
  string,
  {
    adultId?: string;
    kidId?: string;
    adultStatus?: string;
    kidStatus?: string;
  }
>;

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;
const STALE_FEED_HOURS = 6;
const RECENT_RUNS_LIMIT = 10;
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
    <NewsroomWorkspace />
  );
}

function NewsroomWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  // -- Auth gate ------------------------------------------------------------
  const [authorized, setAuthorized] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // -- Reference data (categories + feeds + presets) ----------------------
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [feeds, setFeeds] = useState<FeedLite[]>([]);
  const [presets, setPresets] = useState<PromptPreset[]>([]);

  // -- Filter state ---------------------------------------------------------
  const [filterCategoryId, setFilterCategoryId] = useState<string>(
    searchParams.get('cat') || ''
  );
  const [filterSubcategoryId, setFilterSubcategoryId] = useState<string>(
    searchParams.get('sub') || ''
  );
  const [filterFeedId, setFilterFeedId] = useState<string>(searchParams.get('outlet') || '');
  const [filterWindow, setFilterWindow] = useState<string>(searchParams.get('window') || '72h');
  const [searchInput, setSearchInput] = useState<string>(searchParams.get('q') || '');
  const [searchQuery, setSearchQuery] = useState<string>(searchParams.get('q') || '');
  const [showDismissed, setShowDismissed] = useState(searchParams.get('dismissed') === '1');

  // -- Prompt picker --------------------------------------------------------
  const [promptMode, setPromptMode] = useState<PromptMode>('default');
  const [promptPresetId, setPromptPresetId] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string>('');

  // -- Provider/model picker ----------------------------------------------
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
  const estCost = estimateClusterCostUsd(picker.inputPricePer1m, picker.outputPricePer1m);

  // -- Cluster list (single flat list) ------------------------------------
  const [clusters, setClusters] = useState<ClusterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // -- Source items per cluster -------------------------------------------
  const [sourceMap, setSourceMap] = useState<Record<string, DiscoveryRow[]>>({});

  // -- Per-cluster article-existence map ----------------------------------
  const [articleMap, setArticleMap] = useState<ArticleMap>({});

  // -- Glance + recent runs -----------------------------------------------
  const [glance, setGlance] = useState<GlanceData | null>(null);
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);

  // -- In-flight controls -------------------------------------------------
  const [busyId, setBusyId] = useState<string>('');
  const [busyRefresh, setBusyRefresh] = useState(false);
  const [retryRunId, setRetryRunId] = useState<string>('');
  const [splitMode, setSplitMode] = useState<{ clusterId: string; itemIds: Set<string> } | null>(
    null
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // -- Generate modal target ----------------------------------------------
  const [genTarget, setGenTarget] = useState<
    | {
        id: string;
        title: string;
      }
    | null
  >(null);

  // -- URL writer ---------------------------------------------------------
  const writeUrl = useCallback(
    (
      overrides: Partial<{
        cat: string;
        sub: string;
        outlet: string;
        window: string;
        q: string;
        dismissed: boolean;
      }>
    ) => {
      const params = new URLSearchParams(searchParams.toString());
      const next = {
        cat: overrides.cat ?? filterCategoryId,
        sub: overrides.sub ?? filterSubcategoryId,
        outlet: overrides.outlet ?? filterFeedId,
        window: overrides.window ?? filterWindow,
        q: overrides.q ?? searchQuery,
        dismissed: overrides.dismissed ?? showDismissed,
      };
      // Strip legacy filters that no longer apply.
      params.delete('audience');
      params.delete('show');
      if (next.cat) params.set('cat', next.cat);
      else params.delete('cat');
      if (next.sub) params.set('sub', next.sub);
      else params.delete('sub');
      if (next.outlet) params.set('outlet', next.outlet);
      else params.delete('outlet');
      if (next.window && next.window !== '72h') params.set('window', next.window);
      else params.delete('window');
      if (next.q) params.set('q', next.q);
      else params.delete('q');
      if (next.dismissed) params.set('dismissed', '1');
      else params.delete('dismissed');
      const qs = params.toString();
      router.replace(qs ? `/admin/newsroom?${qs}` : '/admin/newsroom');
    },
    [
      searchParams,
      router,
      filterCategoryId,
      filterSubcategoryId,
      filterFeedId,
      filterWindow,
      searchQuery,
      showDismissed,
    ]
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
  // Reference data — categories, feeds (no audience split), presets.
  // ----------------------------------------------------------------------
  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;
    (async () => {
      const { data: cats, error: catErr } = await supabase
        .from('categories')
        .select('id, name, slug, parent_id, is_active, is_kids_safe, deleted_at')
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (cancelled) return;
      if (catErr) {
        console.error('[newsroom] categories load failed:', catErr.message);
        toast.push({ message: 'Could not load categories.', variant: 'danger' });
      } else {
        setCategories((cats || []) as CategoryRow[]);
      }

      const { data: feedRows, error: feedsErr } = await supabase
        .from('feeds')
        .select('id, name, source_name, url, is_active, last_polled_at, error_count')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (cancelled) return;
      if (feedsErr) {
        console.error('[newsroom] feeds load failed:', feedsErr.message);
      } else {
        setFeeds((feedRows || []) as FeedLite[]);
      }

      try {
        const presetRes = await supabase
          .from('ai_prompt_presets')
          .select('id, name, body, audience, is_active, sort_order')
          .eq('is_active', true)
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
  }, [authorized, supabase, toast]);

  // Reset subcategory when top-level category clears or changes.
  useEffect(() => {
    setFilterSubcategoryId('');
  }, [filterCategoryId]);

  // ----------------------------------------------------------------------
  // Search debounce (writes through to URL on commit).
  // ----------------------------------------------------------------------
  useEffect(() => {
    const handle = setTimeout(() => {
      const trimmed = searchInput.trim();
      setSearchQuery(trimmed);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // ----------------------------------------------------------------------
  // Source-row fetch via the service-role API. One call per page load.
  // ----------------------------------------------------------------------
  const fetchSourcesFor = useCallback(
    async (clusterIds: string[]): Promise<DiscoveryRow[]> => {
      if (clusterIds.length === 0) return [];
      try {
        const res = await fetch('/api/admin/newsroom/clusters/sources', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ cluster_ids: clusterIds }),
        });
        if (!res.ok) {
          if (res.status !== 429) {
            console.error('[newsroom] source fetch failed status', res.status);
          }
          return [];
        }
        const body = (await res.json().catch(() => ({}))) as { rows?: DiscoveryRow[] };
        return Array.isArray(body.rows) ? body.rows : [];
      } catch (err) {
        console.error('[newsroom] source fetch threw:', err);
        return [];
      }
    },
    []
  );

  // ----------------------------------------------------------------------
  // Article-existence fetch via the service-role API. One call per load.
  // ----------------------------------------------------------------------
  const fetchArticlesFor = useCallback(
    async (clusterIds: string[]): Promise<ArticleHit[]> => {
      if (clusterIds.length === 0) return [];
      try {
        const res = await fetch('/api/admin/newsroom/clusters/articles', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ cluster_ids: clusterIds }),
        });
        if (!res.ok) {
          if (res.status !== 429) {
            console.error('[newsroom] article fetch failed status', res.status);
          }
          return [];
        }
        const body = (await res.json().catch(() => ({}))) as { rows?: ArticleHit[] };
        return Array.isArray(body.rows) ? body.rows : [];
      } catch (err) {
        console.error('[newsroom] article fetch threw:', err);
        return [];
      }
    },
    []
  );

  // ----------------------------------------------------------------------
  // Cluster query builder — single flat list, no audience filter.
  // ----------------------------------------------------------------------
  const buildClusterQuery = useCallback(
    (fromOffset: number) => {
      let query = supabase
        .from('feed_clusters')
        .select(
          'id, title, summary, is_breaking, is_active, created_at, updated_at, category_id, locked_by, locked_at, audience, archived_at, dismissed_at, dismiss_reason'
        )
        .eq('is_active', true)
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

      return query
        .order('updated_at', { ascending: false })
        .range(fromOffset, fromOffset + PAGE_SIZE - 1);
    },
    [supabase, showDismissed, filterCategoryId, filterSubcategoryId, filterWindow, searchQuery]
  );

  // ----------------------------------------------------------------------
  // Load clusters (used by both initial + load-more).
  // ----------------------------------------------------------------------
  const loadClusters = useCallback(
    async (reset: boolean) => {
      if (!authorized) return;
      const currentOffset = reset ? 0 : offset;

      if (reset) setLoading(true);
      else setLoadingMore(true);

      try {
        const { data: rows, error } = await buildClusterQuery(currentOffset);
        if (error) {
          console.error('[newsroom] cluster load failed:', error.message);
          setLoadError(true);
          if (reset) setClusters([]);
          toast.push({ message: 'Could not load clusters.', variant: 'danger' });
          setHasMore(false);
          return;
        }
        const baseRows = (rows || []) as unknown as ClusterRow[];
        setClusters((prev) => (reset ? baseRows : [...prev, ...baseRows]));
        setHasMore(baseRows.length === PAGE_SIZE);
        setOffset(currentOffset + PAGE_SIZE);
        setLoadError(false);

        // Source-row + article-existence batch fetches in parallel.
        if (baseRows.length > 0) {
          const ids = baseRows.map((r) => r.id);
          const [sourceRows, articleRows] = await Promise.all([
            fetchSourcesFor(ids),
            fetchArticlesFor(ids),
          ]);

          const grouped: Record<string, DiscoveryRow[]> = {};
          for (const r of sourceRows) {
            if (!r.cluster_id) continue;
            if (!grouped[r.cluster_id]) grouped[r.cluster_id] = [];
            grouped[r.cluster_id].push(r);
          }

          const articles: ArticleMap = {};
          for (const hit of articleRows) {
            if (!hit.cluster_id) continue;
            if (!articles[hit.cluster_id]) articles[hit.cluster_id] = {};
            if (hit.audience === 'adult') {
              articles[hit.cluster_id].adultId = hit.article_id;
              articles[hit.cluster_id].adultStatus = hit.status;
            } else {
              articles[hit.cluster_id].kidId = hit.article_id;
              articles[hit.cluster_id].kidStatus = hit.status;
            }
          }

          setSourceMap((prev) => {
            const next = reset
              ? Object.fromEntries(Object.entries(prev).filter(([k]) => !ids.includes(k)))
              : { ...prev };
            for (const id of ids) next[id] = grouped[id] || [];
            return next;
          });
          setArticleMap((prev) => {
            const next = reset
              ? Object.fromEntries(Object.entries(prev).filter(([k]) => !ids.includes(k)))
              : { ...prev };
            for (const id of ids) next[id] = articles[id] || {};
            return next;
          });
        } else if (reset) {
          setSourceMap({});
          setArticleMap({});
        }
      } finally {
        if (reset) setLoading(false);
        else setLoadingMore(false);
      }
    },
    [authorized, buildClusterQuery, offset, fetchSourcesFor, fetchArticlesFor, toast]
  );

  // Reset whenever any filter changes. We deliberately omit `loadClusters`
  // from the deps array — it transitively depends on `offset`, and
  // refetching when an offset bumps would loop. The exhaustive-deps disable
  // is intentional and scoped tight.
  useEffect(() => {
    if (!authorized) return;
    void loadClusters(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized, filterCategoryId, filterSubcategoryId, filterWindow, searchQuery, showDismissed]);

  // ----------------------------------------------------------------------
  // Glance bar — combined across both pipelines.
  // ----------------------------------------------------------------------
  const computeGlance = useCallback(async (): Promise<GlanceData> => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const sinceIso = startOfDay.toISOString();

    const { data: runRows, error: runErr } = await supabase
      .from('pipeline_runs')
      .select('status, total_cost_usd, audience')
      .in('audience', ['adult', 'kid'])
      .eq('pipeline_type', 'generate')
      .gte('started_at', sinceIso);

    let spend = 0;
    const counts = { completed: 0, failed: 0, running: 0 };
    if (!runErr && runRows) {
      for (const r of runRows as Array<{
        status: string | null;
        total_cost_usd: number | string | null;
      }>) {
        const cost =
          typeof r.total_cost_usd === 'string' ? parseFloat(r.total_cost_usd) : r.total_cost_usd;
        if (Number.isFinite(cost)) spend += cost as number;
        const status = (r.status || '').toLowerCase();
        if (status === 'completed' || status === 'success') counts.completed += 1;
        else if (
          status === 'failed' ||
          status === 'error' ||
          status === 'cancelled' ||
          status === 'canceled'
        )
          counts.failed += 1;
        else if (status === 'running' || status === 'pending') counts.running += 1;
      }
    } else if (runErr) {
      console.error('[newsroom] glance runs load failed:', runErr.message);
    }

    // Two kill switches — both surfaced side-by-side.
    let adultEnabled: boolean | null = null;
    let kidEnabled: boolean | null = null;
    const { data: settingsRows, error: settingsErr } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['ai.adult_generation_enabled', 'ai.kid_generation_enabled']);
    if (settingsErr) {
      console.error('[newsroom] kill switch lookup failed:', settingsErr.message);
    } else if (settingsRows) {
      for (const r of settingsRows as Array<{ key: string; value: string | null }>) {
        const enabled = String(r.value) === 'true';
        if (r.key === 'ai.adult_generation_enabled') adultEnabled = enabled;
        if (r.key === 'ai.kid_generation_enabled') kidEnabled = enabled;
      }
    }

    const staleCutoff = new Date(Date.now() - STALE_FEED_HOURS * 60 * 60 * 1000).toISOString();
    let unhealthy = 0;
    const { data: healthRows, error: healthErr } = await supabase
      .from('feeds')
      .select('id, error_count, last_polled_at')
      .eq('is_active', true);
    if (!healthErr && healthRows) {
      for (const f of healthRows as Array<{
        error_count: number;
        last_polled_at: string | null;
      }>) {
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

    return {
      todaySpendUsd: spend,
      runs: counts,
      killSwitches: { adultEnabled, kidEnabled },
      unhealthyFeedCount: unhealthy,
    };
  }, [supabase]);

  const loadGlance = useCallback(async () => {
    if (!authorized) return;
    const g = await computeGlance();
    setGlance(g);
  }, [authorized, computeGlance]);

  // ----------------------------------------------------------------------
  // Recent runs — interleaved across both audiences.
  // ----------------------------------------------------------------------
  const loadRecentRuns = useCallback(async () => {
    if (!authorized) return;
    const { data, error } = await supabase
      .from('pipeline_runs')
      .select('id, status, started_at, completed_at, total_cost_usd, model, cluster_id, audience')
      .in('audience', ['adult', 'kid'])
      .eq('pipeline_type', 'generate')
      .order('started_at', { ascending: false })
      .limit(RECENT_RUNS_LIMIT);
    if (error) {
      console.error('[newsroom] recent runs load failed:', error.message);
      return;
    }
    setRecentRuns((data || []) as unknown as RecentRun[]);
  }, [authorized, supabase]);

  useEffect(() => {
    if (!authorized) return;
    void loadGlance();
    void loadRecentRuns();
  }, [authorized, loadGlance, loadRecentRuns]);

  // ----------------------------------------------------------------------
  // Derived data
  // ----------------------------------------------------------------------
  const topLevelCategories = useMemo(
    () => categories.filter((c) => c.parent_id === null),
    [categories]
  );
  const subcategoryOptions = useMemo(() => {
    if (!filterCategoryId) return [];
    return categories.filter((c) => c.parent_id === filterCategoryId);
  }, [categories, filterCategoryId]);

  // Outlet filter intersection (post-query, against the discovery rows we
  // already fetched).
  const visibleClusters = useMemo(() => {
    if (!filterFeedId) return clusters;
    return clusters.filter((c) =>
      (sourceMap[c.id] || []).some((s) => s.feed_id === filterFeedId)
    );
  }, [clusters, sourceMap, filterFeedId]);

  // Feed lookup index for the source-row outlet display.
  const feedById = useMemo(() => {
    const m: Record<string, FeedLite> = {};
    for (const f of feeds) m[f.id] = f;
    return m;
  }, [feeds]);

  // Category lookup for the row metadata line.
  const catById = useMemo(() => {
    const m: Record<string, CategoryRow> = {};
    for (const c of categories) m[c.id] = c;
    return m;
  }, [categories]);

  // Active prompt body (forwarded into GenerationModal as freeform).
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
  // Refresh feeds — single button.
  // ----------------------------------------------------------------------
  async function refreshFeeds() {
    setBusyRefresh(true);
    try {
      const res = await fetch('/api/newsroom/ingest/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
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
      await Promise.all([loadClusters(true), loadGlance()]);
    } finally {
      setBusyRefresh(false);
    }
  }

  // ----------------------------------------------------------------------
  // Cluster mutation handlers
  // ----------------------------------------------------------------------
  function audienceOf(clusterId: string): Audience {
    const c = clusters.find((x) => x.id === clusterId);
    return c?.audience ?? 'adult';
  }

  async function moveItem(clusterId: string, itemId: string, targetClusterId: string | null) {
    const aud = audienceOf(clusterId);
    const key = `${clusterId}:move:${itemId}`;
    setBusyId(key);
    try {
      const res = await fetch(`/api/admin/newsroom/clusters/${clusterId}/move-item`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          item_id: itemId,
          target_cluster_id: targetClusterId,
          audience: aud,
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
    const reason =
      typeof window !== 'undefined' ? window.prompt('Dismiss reason (optional)') : '';
    if (reason === null) return;
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
  // Generate handlers — open the modal in audience-picker mode.
  // ----------------------------------------------------------------------
  function openGenerate(cluster: ClusterRow) {
    setGenTarget({
      id: cluster.id,
      title: (cluster.title && cluster.title.trim()) || 'Untitled cluster',
    });
  }

  function closeGenerate() {
    setGenTarget(null);
  }

  // ----------------------------------------------------------------------
  // Expand toggle
  // ----------------------------------------------------------------------
  function toggleExpanded(clusterId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(clusterId)) next.delete(clusterId);
      else next.add(clusterId);
      return next;
    });
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

  // Source URLs forwarded to the modal so picker-mode kid runs can reuse the
  // cluster's discovery items. The server also auto-derives, so this is a
  // belt-and-braces handoff that lets the modal show the "Reusing N
  // sources" badge accurately.
  const targetSourceUrls: string[] = genTarget
    ? (sourceMap[genTarget.id] || []).map((s) => s.raw_url).filter(Boolean)
    : [];

  const headerActions = (
    <>
      <Button
        variant="secondary"
        size="md"
        loading={busyRefresh}
        disabled={busyRefresh}
        onClick={() => void refreshFeeds()}
      >
        Refresh feeds
      </Button>
      <Link href="/admin/pipeline/runs" style={{ textDecoration: 'none' }}>
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
        subtitle="Operator workspace — one feed pool, one cluster list. Pick adult, kid, or both at generation time."
        actions={headerActions}
      />

      <GlanceBar glance={glance} />

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
        onCategoryChange={(id) => {
          setFilterCategoryId(id);
          writeUrl({ cat: id, sub: '' });
        }}
        onSubcategoryChange={(id) => {
          setFilterSubcategoryId(id);
          writeUrl({ sub: id });
        }}
        onFeedChange={(id) => {
          setFilterFeedId(id);
          writeUrl({ outlet: id });
        }}
        onWindowChange={(val) => {
          setFilterWindow(val);
          writeUrl({ window: val });
        }}
        onSearchChange={(val) => {
          setSearchInput(val);
        }}
        onShowDismissedChange={(next) => {
          setShowDismissed(next);
          writeUrl({ dismissed: next });
        }}
      />

      <SearchUrlSync searchQuery={searchQuery} writeUrl={writeUrl} />

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

      <ClusterListSection
        loading={loading}
        loadError={loadError}
        rows={visibleClusters}
        totalCount={visibleClusters.length}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={() => loadClusters(false)}
        sourceMap={sourceMap}
        articleMap={articleMap}
        feedById={feedById}
        catById={catById}
        expanded={expanded}
        onToggleExpand={toggleExpanded}
        pickerReady={pickerReady}
        estCost={estCost}
        busyId={busyId}
        splitMode={splitMode}
        onSplitModeChange={setSplitMode}
        onGenerate={openGenerate}
        onMoveItem={moveItem}
        onMerge={mergeCluster}
        onSplitCommit={splitCluster}
        onDismiss={dismissCluster}
        onUndismiss={undismissCluster}
        onUnlock={unlockCluster}
      />

      <RecentRunsStrip runs={recentRuns} retryRunId={retryRunId} onRetry={retryRun} />

      <GenerationModal
        open={genTarget !== null}
        clusterId={genTarget?.id ?? ''}
        clusterTitle={genTarget?.title ?? null}
        audienceMode="picker"
        sourceUrls={targetSourceUrls}
        provider={picker.provider}
        model={picker.model}
        freeformInstructions={activePromptBody || picker.freeformInstructions}
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
// Sub-components
// =====================================================================

function SearchUrlSync({
  searchQuery,
  writeUrl,
}: {
  searchQuery: string;
  writeUrl: (overrides: Partial<{ q: string }>) => void;
}) {
  useEffect(() => {
    writeUrl({ q: searchQuery });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);
  return null;
}

function GlanceBar({ glance }: { glance: GlanceData | null }) {
  const cards = [
    {
      label: "Today's spend",
      value: glance ? formatCostUsd(glance.todaySpendUsd) : '—',
      hint: 'Generate runs since 00:00 local (adult + kid)',
      href: `/admin/pipeline/costs`,
    },
    {
      label: "Today's runs",
      value: glance
        ? `${glance.runs.completed + glance.runs.failed + glance.runs.running}`
        : '—',
      hint: glance
        ? `${glance.runs.completed} done · ${glance.runs.failed} failed · ${glance.runs.running} running`
        : 'Generate pipeline only',
      href: `/admin/pipeline/runs`,
    },
    {
      label: 'Feed health',
      value: glance ? `${glance.unhealthyFeedCount} need attention` : '—',
      hint: 'Errors or stale > 6h',
      href: `/admin/feeds`,
      danger: (glance?.unhealthyFeedCount ?? 0) > 0,
    },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: S[3],
        marginBottom: S[4],
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: S[3],
        }}
      >
        {cards.map((c) => (
          <Link key={c.label} href={c.href} style={{ textDecoration: 'none' }}>
            <div
              style={{
                padding: S[3],
                border: `1px solid ${c.danger ? ADMIN_C.danger : ADMIN_C.divider}`,
                borderRadius: 8,
                background: ADMIN_C.card,
                transition: 'background 120ms ease, border-color 120ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = ADMIN_C.hover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = ADMIN_C.card;
              }}
            >
              <div style={{ fontSize: F.xs, color: ADMIN_C.muted, marginBottom: 2 }}>
                {c.label}
              </div>
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

      {/* Two kill switches side-by-side. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: S[3],
        }}
      >
        <KillSwitchCard
          label="Adult generation"
          enabled={glance?.killSwitches.adultEnabled ?? null}
        />
        <KillSwitchCard
          label="Kid generation"
          enabled={glance?.killSwitches.kidEnabled ?? null}
        />
      </div>
    </div>
  );
}

function KillSwitchCard({
  label,
  enabled,
}: {
  label: string;
  enabled: boolean | null;
}) {
  const danger = enabled === false;
  const value = enabled === null ? '—' : enabled ? 'Enabled' : 'Disabled';
  return (
    <Link href="/admin/pipeline/settings" style={{ textDecoration: 'none' }}>
      <div
        style={{
          padding: S[3],
          border: `1px solid ${danger ? ADMIN_C.danger : ADMIN_C.divider}`,
          borderRadius: 8,
          background: ADMIN_C.card,
          transition: 'background 120ms ease, border-color 120ms ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = ADMIN_C.hover;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = ADMIN_C.card;
        }}
      >
        <div style={{ fontSize: F.xs, color: ADMIN_C.muted, marginBottom: 2 }}>{label}</div>
        <div
          style={{
            fontSize: F.lg,
            fontWeight: 600,
            color: danger ? ADMIN_C.danger : ADMIN_C.white,
            lineHeight: 1.2,
          }}
        >
          {value}
        </div>
        <div style={{ fontSize: F.xs, color: ADMIN_C.dim, marginTop: 2 }}>Click to manage</div>
      </div>
    </Link>
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
                label: `${p.name}${
                  p.audience === 'both' ? ' (both)' : p.audience === 'kid' ? ' (kid)' : ' (adult)'
                }`,
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

function ClusterListSection({
  loading,
  loadError,
  rows,
  totalCount,
  hasMore,
  loadingMore,
  onLoadMore,
  sourceMap,
  articleMap,
  feedById,
  catById,
  expanded,
  onToggleExpand,
  pickerReady,
  estCost,
  busyId,
  splitMode,
  onSplitModeChange,
  onGenerate,
  onMoveItem,
  onMerge,
  onSplitCommit,
  onDismiss,
  onUndismiss,
  onUnlock,
}: {
  loading: boolean;
  loadError: boolean;
  rows: ClusterRow[];
  totalCount: number;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  sourceMap: Record<string, DiscoveryRow[]>;
  articleMap: ArticleMap;
  feedById: Record<string, FeedLite>;
  catById: Record<string, CategoryRow>;
  expanded: Set<string>;
  onToggleExpand: (clusterId: string) => void;
  pickerReady: boolean;
  estCost: number | null;
  busyId: string;
  splitMode: { clusterId: string; itemIds: Set<string> } | null;
  onSplitModeChange: (next: { clusterId: string; itemIds: Set<string> } | null) => void;
  onGenerate: (c: ClusterRow) => void;
  onMoveItem: (clusterId: string, itemId: string, targetClusterId: string | null) => void;
  onMerge: (sourceId: string, targetId: string) => void;
  onSplitCommit: (sourceId: string, itemIds: string[]) => void;
  onDismiss: (clusterId: string) => void;
  onUndismiss: (clusterId: string) => void;
  onUnlock: (clusterId: string) => void;
}) {
  return (
    <PageSection
      title="Clusters"
      description={loading ? 'Loading…' : `${totalCount} cluster${totalCount === 1 ? '' : 's'}`}
    >
      {loading ? (
        <div style={{ padding: S[6], textAlign: 'center', color: ADMIN_C.dim }}>
          <Spinner /> Loading clusters
        </div>
      ) : loadError && rows.length === 0 ? (
        <EmptyState
          title="Could not load clusters"
          description="Something went wrong fetching the cluster list. Try refreshing feeds or reload the page."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No clusters match"
          description="Adjust filters above or refresh feeds. New clusters appear here as they form."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
          {rows.map((c) => (
            <ClusterRowItem
              key={c.id}
              cluster={c}
              sources={sourceMap[c.id] || []}
              articles={articleMap[c.id] || {}}
              feedById={feedById}
              catById={catById}
              expanded={expanded.has(c.id)}
              onToggleExpand={() => onToggleExpand(c.id)}
              otherClusters={rows.filter((r) => r.id !== c.id)}
              pickerReady={pickerReady}
              estCost={estCost}
              busyId={busyId}
              splitMode={splitMode}
              onSplitModeChange={onSplitModeChange}
              onGenerate={onGenerate}
              onMoveItem={onMoveItem}
              onMerge={onMerge}
              onSplitCommit={onSplitCommit}
              onDismiss={onDismiss}
              onUndismiss={onUndismiss}
              onUnlock={onUnlock}
            />
          ))}
        </div>
      )}

      {hasMore && !loading && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: S[4] }}>
          <Button
            variant="secondary"
            size="md"
            loading={loadingMore}
            disabled={loadingMore}
            onClick={onLoadMore}
          >
            Load more
          </Button>
        </div>
      )}
    </PageSection>
  );
}

function ClusterRowItem({
  cluster,
  sources,
  articles,
  feedById,
  catById,
  expanded,
  onToggleExpand,
  otherClusters,
  pickerReady,
  estCost,
  busyId,
  splitMode,
  onSplitModeChange,
  onGenerate,
  onMoveItem,
  onMerge,
  onSplitCommit,
  onDismiss,
  onUndismiss,
  onUnlock,
}: {
  cluster: ClusterRow;
  sources: DiscoveryRow[];
  articles: ArticleMap[string];
  feedById: Record<string, FeedLite>;
  catById: Record<string, CategoryRow>;
  expanded: boolean;
  onToggleExpand: () => void;
  otherClusters: ClusterRow[];
  pickerReady: boolean;
  estCost: number | null;
  busyId: string;
  splitMode: { clusterId: string; itemIds: Set<string> } | null;
  onSplitModeChange: (next: { clusterId: string; itemIds: Set<string> } | null) => void;
  onGenerate: (c: ClusterRow) => void;
  onMoveItem: (clusterId: string, itemId: string, targetClusterId: string | null) => void;
  onMerge: (sourceId: string, targetId: string) => void;
  onSplitCommit: (sourceId: string, itemIds: string[]) => void;
  onDismiss: (clusterId: string) => void;
  onUndismiss: (clusterId: string) => void;
  onUnlock: (clusterId: string) => void;
}) {
  const c = cluster;
  const locked = !!c.locked_by;
  const dismissed = !!c.dismissed_at;
  const title = (c.title && c.title.trim()) || 'Untitled cluster';
  const inSplit = splitMode?.clusterId === c.id;
  const splitSelected = inSplit ? splitMode.itemIds : new Set<string>();

  const cat = c.category_id ? catById[c.category_id] : null;
  const parent = cat?.parent_id ? catById[cat.parent_id] : null;
  const catLine = cat ? (parent ? `${parent.name} > ${cat.name}` : cat.name) : '—';

  const sourceCount = sources.length;
  const adultArticleId = articles?.adultId || null;
  const kidArticleId = articles?.kidId || null;

  return (
    <div
      style={{
        border: `1px solid ${dismissed ? ADMIN_C.warn : ADMIN_C.divider}`,
        borderRadius: 8,
        background: ADMIN_C.bg,
        opacity: dismissed ? 0.75 : 1,
      }}
    >
      <div
        style={{
          padding: `${S[3]}px ${S[3]}px`,
          display: 'flex',
          alignItems: 'flex-start',
          gap: S[3],
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={onToggleExpand}
          aria-label={expanded ? 'Collapse sources' : 'Expand sources'}
          aria-expanded={expanded}
          style={{
            background: 'transparent',
            border: 'none',
            color: ADMIN_C.soft,
            cursor: 'pointer',
            fontSize: F.md,
            padding: 4,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          {expanded ? '▾' : '▸'}
        </button>

        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: S[2],
              marginBottom: 2,
            }}
          >
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
            <button
              type="button"
              onClick={onToggleExpand}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                margin: 0,
                color: ADMIN_C.white,
                fontSize: F.md,
                fontWeight: 600,
                lineHeight: 1.3,
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              {truncate(title, 80)}
            </button>
          </div>
          <div
            style={{
              fontSize: F.xs,
              color: ADMIN_C.muted,
              lineHeight: 1.4,
            }}
          >
            {catLine} · {relativeTime(c.updated_at)} ·{' '}
            <span title="Source articles linked to this cluster">
              {sourceCount} source{sourceCount === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {/* Right-side action buttons */}
        <div
          style={{
            display: 'flex',
            gap: S[2],
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'flex-end',
            flex: '0 1 auto',
          }}
        >
          {/* Generated badges + View links — open in story-manager */}
          {adultArticleId && (
            <Link
              href={`/admin/story-manager?article=${adultArticleId}`}
              style={{ textDecoration: 'none' }}
            >
              <Badge variant="success" size="sm">
                Adult ✓ View
              </Badge>
            </Link>
          )}
          {kidArticleId && (
            <Link
              href={`/admin/story-manager?article=${kidArticleId}`}
              style={{ textDecoration: 'none' }}
            >
              <Badge variant="info" size="sm">
                Kid ✓ View
              </Badge>
            </Link>
          )}

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
                Cancel
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
                      ? 'Pick a provider and model first.'
                      : dismissed
                        ? 'Restore the cluster before generating.'
                        : 'Pick adult, kid, or both at the next step.'
                }
              >
                Generate
              </Button>

              {otherClusters.length > 0 && (
                <Select
                  size="sm"
                  value=""
                  placeholder="Move…"
                  disabled={busyId !== '' || dismissed}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    const target = e.target.value;
                    if (target) {
                      onToggleExpand();
                    }
                  }}
                  options={otherClusters.map((oc) => ({
                    value: oc.id,
                    label: truncate((oc.title || 'Untitled cluster').trim(), 50),
                  }))}
                  block={false}
                  style={{ width: 140 }}
                />
              )}

              {otherClusters.length > 0 && (
                <Select
                  size="sm"
                  value=""
                  placeholder="Merge with…"
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
                  style={{ width: 170 }}
                />
              )}

              {sourceCount > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId !== '' || dismissed}
                  onClick={() => {
                    onSplitModeChange({ clusterId: c.id, itemIds: new Set() });
                    if (!expanded) onToggleExpand();
                  }}
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
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div
          style={{
            borderTop: `1px solid ${ADMIN_C.divider}`,
            padding: S[3],
            display: 'flex',
            flexDirection: 'column',
            gap: S[2],
            background: ADMIN_C.card,
          }}
        >
          {pickerReady && estCost !== null && (
            <div style={{ fontSize: F.xs, color: ADMIN_C.muted }}>
              Predicted cost (per audience): {formatEstimatedCost(estCost)}
            </div>
          )}
          {c.summary && (
            <div
              style={{
                fontSize: F.sm,
                color: ADMIN_C.dim,
                lineHeight: 1.5,
              }}
            >
              {truncate(c.summary, 320)}
            </div>
          )}
          {sourceCount === 0 && (
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
              (s.raw_url
                ? new URL(s.raw_url).pathname.split('/').filter(Boolean).slice(-1)[0]
                : '') ||
              '(untitled)';
            const lede = s.metadata?.excerpt || (s.raw_body || '').trim();
            const moveKey = `${c.id}:move:${s.id}`;
            const checked = splitSelected.has(s.id);
            return (
              <div
                key={s.id}
                style={{
                  padding: S[2],
                  border: `1px solid ${ADMIN_C.divider}`,
                  borderRadius: 6,
                  background: ADMIN_C.bg,
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
                  <a
                    href={s.raw_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: F.xs,
                      color: ADMIN_C.muted,
                      marginLeft: 'auto',
                      textDecoration: 'underline',
                    }}
                  >
                    Open
                  </a>
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
                        placeholder="Move to…"
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
      )}
    </div>
  );
}

function RecentRunsStrip({
  runs,
  retryRunId,
  onRetry,
}: {
  runs: RecentRun[];
  retryRunId: string;
  onRetry: (id: string) => void;
}) {
  return (
    <PageSection
      title="Recent runs"
      description={`Last ${runs.length} generate runs across both audiences.`}
      aside={
        <Link href="/admin/pipeline/runs" style={{ textDecoration: 'none' }}>
          <Button variant="ghost" size="sm">
            View all
          </Button>
        </Link>
      }
    >
      {runs.length === 0 ? (
        <div style={{ fontSize: F.sm, color: ADMIN_C.dim, padding: S[3] }}>
          No generate runs yet.
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
            const failed =
              status === 'failed' ||
              status === 'error' ||
              status === 'cancelled' ||
              status === 'canceled';
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
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ color: ADMIN_C.muted, fontSize: F.xs, minWidth: 90 }}>
                  {relativeTime(r.started_at)}
                </span>
                <Badge size="xs" variant={r.audience === 'kid' ? 'info' : 'neutral'}>
                  {r.audience === 'kid' ? 'Kid' : r.audience === 'adult' ? 'Adult' : '—'}
                </Badge>
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
