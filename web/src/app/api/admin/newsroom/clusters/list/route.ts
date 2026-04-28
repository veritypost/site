/**
 * Session B — GET /api/admin/newsroom/clusters/list
 *
 * Single fetch behind the new Discovery tab. Returns enough data per
 * Story to render 3 audience cards + the shared sources block without
 * fanning out additional calls per card.
 *
 * Query:
 *   tab    'active' | 'completed' | 'all'  (default 'active')
 *   limit  1..100                          (default 50)
 *   cursor ISO timestamp from previous page (older-than)
 *
 * Response:
 *   {
 *     clusters: [{
 *       cluster: {...},
 *       audience_state: [3 rows, one per band],
 *       sources: [{outlet_name, title, url, fetched_at}, ...up to 10],
 *       recent_run_per_band: [{audience_band, run, ...} | null × 3],
 *     }],
 *     cursor: ISO | null,
 *   }
 *
 * Filters out synthetic standalone clusters ('standalone' = ANY(keywords))
 * because those are tracked via the article they produced, not via Story
 * cards. Also filters out archived/dismissed clusters.
 *
 * Permission: dual-check (newsroom.run_feed, admin.pipeline.run_ingest).
 * Rate limit: gentle (60/60s) — same bucket as cluster mutations.
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError } from '@/lib/adminMutation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

type AudienceBand = 'adult' | 'tweens' | 'kids';

type ClusterRow = {
  id: string;
  title: string | null;
  summary: string | null;
  is_breaking: boolean | null;
  is_active: boolean | null;
  category_id: string | null;
  audience: string | null;
  keywords: string[] | null;
  created_at: string | null;
  updated_at: string | null;
};

type AudienceStateRow = {
  cluster_id: string;
  audience_band: AudienceBand;
  state: string;
  article_id: string | null;
  skipped_at: string | null;
  generated_at: string | null;
  updated_at: string | null;
};

type DiscoveryRow = {
  id: string;
  cluster_id: string | null;
  feed_id: string | null;
  raw_title: string | null;
  raw_url: string;
  fetched_at: string | null;
  created_at: string | null;
};

type FeedLite = { id: string; source_name: string | null; name: string | null };

type RecentRunRow = {
  cluster_id: string | null;
  audience: string | null;
  id: string;
  status: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_type: string | null;
  output_summary: { age_band?: AudienceBand } | null;
  input_params: { age_band?: AudienceBand } | null;
};

type LifecycleRow = { cluster_id: string; completed: boolean };

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const ALL_BANDS: AudienceBand[] = ['adult', 'tweens', 'kids'];

function parseTab(raw: string | null): 'active' | 'completed' | 'all' {
  if (raw === 'completed') return 'completed';
  if (raw === 'all') return 'all';
  return 'active';
}

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

// pipeline_runs.audience is the legacy 'adult'|'kid' column. We disambiguate
// kids vs tweens by reading age_band out of input_params or output_summary
// (the generate route writes it on the way in).
function deriveBand(run: RecentRunRow): AudienceBand | null {
  if (run.audience === 'adult') return 'adult';
  const fromOutput = run.output_summary?.age_band;
  if (fromOutput === 'kids' || fromOutput === 'tweens') return fromOutput;
  const fromInput = run.input_params?.age_band;
  if (fromInput === 'kids' || fromInput === 'tweens') return fromInput;
  if (run.audience === 'kid') return 'kids';
  return null;
}

export async function GET(req: Request) {
  // 1. Permission gate.
  let actor;
  try {
    const supabase = createClient();
    actor = await requirePermission(['newsroom.run_feed', 'admin.pipeline.run_ingest'], supabase);
  } catch (err) {
    return permissionError(err);
  }
  const actorId = actor.id as string;

  // 2. Rate limit.
  const service = createServiceClient();
  const rl = await checkRateLimit(service, {
    key: `admin_cluster_mutate:${actorId}`,
    policyKey: 'admin_cluster_mutate',
    max: 60,
    windowSec: 60,
  });
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  // 3. Query parsing.
  const url = new URL(req.url);
  const tab = parseTab(url.searchParams.get('tab'));
  const limit = parseLimit(url.searchParams.get('limit'));
  const cursorRaw = url.searchParams.get('cursor');
  const cursor = cursorRaw && !Number.isNaN(Date.parse(cursorRaw)) ? cursorRaw : null;

  // 4. Read clusters (filter standalone marker + archived + dismissed).
  //    Sort by latest discovery_items.created_at descending. We approximate
  //    that ordering with feed_clusters.updated_at, which the ingest path
  //    bumps when it links a new discovery row.
  let clusterQ = service
    .from('feed_clusters')
    .select('id, title, summary, is_breaking, is_active, category_id, audience, keywords, created_at, updated_at')
    .is('archived_at', null)
    .is('dismissed_at', null)
    .not('keywords', 'cs', '{standalone}')
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(limit + 1); // peek one for cursor
  if (cursor) clusterQ = clusterQ.lt('updated_at', cursor);
  const { data: clustersRaw, error: clustersErr } = await clusterQ;
  if (clustersErr) {
    console.error('[newsroom.clusters.list.read]', clustersErr.message);
    return NextResponse.json({ error: 'Could not load clusters' }, { status: 500 });
  }
  const clusters = (clustersRaw ?? []) as ClusterRow[];
  const hasMore = clusters.length > limit;
  const page = hasMore ? clusters.slice(0, limit) : clusters;
  const nextCursor = hasMore ? page[page.length - 1]?.updated_at ?? null : null;

  if (page.length === 0) {
    return NextResponse.json({ clusters: [], cursor: null });
  }

  const clusterIds = page.map((c) => c.id);

  // 5. Audience state (3 rows per cluster), lifecycle (completed flag),
  //    discovery items (sources), and recent pipeline_runs — all in
  //    parallel for the page.
  const [stateRes, lifecycleRes, discoveryRes, runsRes] = await Promise.all([
    service
      .from('feed_cluster_audience_state')
      .select('cluster_id, audience_band, state, article_id, skipped_at, generated_at, updated_at')
      .in('cluster_id', clusterIds),
    service
      .from('v_cluster_lifecycle')
      .select('cluster_id, completed')
      .in('cluster_id', clusterIds),
    service
      .from('discovery_items')
      .select('id, cluster_id, feed_id, raw_title, raw_url, fetched_at, created_at')
      .in('cluster_id', clusterIds)
      .order('created_at', { ascending: false })
      .limit(clusterIds.length * 10),
    service
      .from('pipeline_runs')
      .select(
        'id, cluster_id, audience, status, started_at, completed_at, error_type, output_summary, input_params'
      )
      .eq('pipeline_type', 'generate')
      .in('cluster_id', clusterIds)
      .order('started_at', { ascending: false })
      .limit(clusterIds.length * 12),
  ]);

  if (stateRes.error) {
    console.error('[newsroom.clusters.list.state]', stateRes.error.message);
    return NextResponse.json({ error: 'Could not load audience state' }, { status: 500 });
  }
  if (lifecycleRes.error) {
    console.error('[newsroom.clusters.list.lifecycle]', lifecycleRes.error.message);
    return NextResponse.json({ error: 'Could not load lifecycle view' }, { status: 500 });
  }
  if (discoveryRes.error) {
    console.error('[newsroom.clusters.list.discovery]', discoveryRes.error.message);
    return NextResponse.json({ error: 'Could not load sources' }, { status: 500 });
  }
  if (runsRes.error) {
    console.error('[newsroom.clusters.list.runs]', runsRes.error.message);
    return NextResponse.json({ error: 'Could not load runs' }, { status: 500 });
  }

  // 6. Resolve feed source_name in one batched lookup.
  const feedIds = Array.from(
    new Set((discoveryRes.data as DiscoveryRow[]).map((d) => d.feed_id).filter((id): id is string => !!id))
  );
  let feedMap = new Map<string, FeedLite>();
  if (feedIds.length > 0) {
    const { data: feeds, error: feedsErr } = await service
      .from('feeds')
      .select('id, source_name, name')
      .in('id', feedIds);
    if (feedsErr) {
      console.error('[newsroom.clusters.list.feeds]', feedsErr.message);
    } else {
      feedMap = new Map((feeds as FeedLite[]).map((f) => [f.id, f]));
    }
  }

  // 7. Index everything by cluster_id.
  const stateByCluster = new Map<string, AudienceStateRow[]>();
  for (const row of (stateRes.data as AudienceStateRow[]) ?? []) {
    const arr = stateByCluster.get(row.cluster_id) ?? [];
    arr.push(row);
    stateByCluster.set(row.cluster_id, arr);
  }
  const lifecycleByCluster = new Map<string, boolean>();
  for (const row of (lifecycleRes.data as LifecycleRow[]) ?? []) {
    lifecycleByCluster.set(row.cluster_id, row.completed);
  }
  const sourcesByCluster = new Map<string, DiscoveryRow[]>();
  for (const row of (discoveryRes.data as DiscoveryRow[]) ?? []) {
    if (!row.cluster_id) continue;
    const arr = sourcesByCluster.get(row.cluster_id) ?? [];
    if (arr.length < 10) arr.push(row);
    sourcesByCluster.set(row.cluster_id, arr);
  }
  // Most recent run per (cluster_id, audience_band).
  type RunByBand = Partial<Record<AudienceBand, RecentRunRow>>;
  const runsByCluster = new Map<string, RunByBand>();
  for (const row of (runsRes.data as RecentRunRow[]) ?? []) {
    if (!row.cluster_id) continue;
    const band = deriveBand(row);
    if (!band) continue;
    const bucket = runsByCluster.get(row.cluster_id) ?? {};
    if (!bucket[band]) bucket[band] = row; // first row wins (already sorted desc)
    runsByCluster.set(row.cluster_id, bucket);
  }

  // 8. Apply tab filter using v_cluster_lifecycle.
  const tabFiltered = page.filter((c) => {
    if (tab === 'all') return true;
    const completed = lifecycleByCluster.get(c.id) ?? false;
    return tab === 'completed' ? completed : !completed;
  });

  // 9. Shape response. Pad audience_state and recent_run_per_band to 3 rows.
  const result = tabFiltered.map((c) => {
    const stateRows = stateByCluster.get(c.id) ?? [];
    const audienceState = ALL_BANDS.map<AudienceStateRow>((band) => {
      const existing = stateRows.find((s) => s.audience_band === band);
      if (existing) return existing;
      return {
        cluster_id: c.id,
        audience_band: band,
        state: 'pending',
        article_id: null,
        skipped_at: null,
        generated_at: null,
        updated_at: null,
      };
    });

    const sourceRows = sourcesByCluster.get(c.id) ?? [];
    const sources = sourceRows.map((d) => {
      const feed = d.feed_id ? feedMap.get(d.feed_id) : undefined;
      return {
        outlet_name: feed?.source_name ?? feed?.name ?? 'Unknown source',
        title: d.raw_title,
        url: d.raw_url,
        fetched_at: d.fetched_at,
      };
    });

    const runBuckets = runsByCluster.get(c.id) ?? {};
    const recentRunPerBand = ALL_BANDS.map((band) => {
      const r = runBuckets[band];
      if (!r) return null;
      return {
        audience_band: band,
        id: r.id,
        status: r.status,
        started_at: r.started_at,
        completed_at: r.completed_at,
        error_type: r.error_type,
      };
    });

    return {
      cluster: {
        id: c.id,
        title: c.title,
        summary: c.summary,
        is_breaking: c.is_breaking ?? false,
        is_active: c.is_active ?? true,
        category_id: c.category_id,
        keywords: c.keywords ?? [],
        created_at: c.created_at,
        updated_at: c.updated_at,
        completed: lifecycleByCluster.get(c.id) ?? false,
      },
      audience_state: audienceState,
      sources,
      recent_run_per_band: recentRunPerBand,
    };
  });

  return NextResponse.json({
    clusters: result,
    cursor: tabFiltered.length === page.length ? nextCursor : null,
  });
}
