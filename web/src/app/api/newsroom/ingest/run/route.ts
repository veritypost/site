/**
 * F7 Phase 2 Task 9 — /api/newsroom/ingest/run
 *
 * POST handler for the admin "Refresh feeds" button. Fetches all active
 * feeds across three consumer types in parallel, deduplicates against
 * discovery_items by raw_url, and inserts new pending rows for the
 * pipeline orchestrator (Task 10) to pick up.
 *
 * Consumer types fanned out in parallel:
 *   - 'feed' / 'rss'    — rss-parser path (fetchWithTimeout)
 *   - 'scrape_html'     — Jina+Cheerio discovery scrape (scrapeDiscovery)
 *   - 'scrape_json'     — Phase B: vendor JSON APIs (NewsAPI, GNews, etc).
 *                         Per-feed extraction_config drives field mapping +
 *                         optional env-var-allow-listed Authorization. Empty
 *                         config = unconfigured (operator hasn't filled it
 *                         in yet); row is polled-as-unconfigured. Validation
 *                         failures recorded as failures.
 *
 * Ported from snapshot: verity-post-pipeline-snapshot/src/app/api/ingest/route.js
 * Differences from snapshot:
 *   - Writes to discovery_items (no audience-split anymore — the unified-feed
 *     pivot collapses adult and kid sources into one pool; the operator
 *     picks audience at generation time)
 *   - The legacy `feeds.audience` column stays in DB for back-compat with
 *     mutation RPCs but is no longer a UI primary; ingest writes every
 *     active feed regardless of its audience tag
 *   - Writes pipeline_runs row for observability
 *   - Admin-gated via admin.pipeline.run_ingest (not open)
 *   - Rate-limited via rate_limits.newsroom_ingest (5 per 600s)
 *   - Kill-switched via settings.ai.ingest_enabled
 *   - Singleflight-enforced via partial unique index
 *     `pipeline_runs_singleflight_ingest`. Concurrent POSTs return 409
 *     with the running run's id; in-route orphan-reap unblocks the
 *     index when a Vercel lambda was killed before completion.
 *
 * feeds.metadata.zero_results_streak (jsonb, integer):
 *   Number of consecutive successful runs where this feed contributed
 *   ZERO unique discovery_items after cross-feed dedup. Reset to 0 on
 *   any non-zero contribution. Surfaced in /admin/feeds via the
 *   "no unique items 3+ runs" badge and in the staleStreaks response
 *   field. Distinct from error_count: a feed that publishes only
 *   duplicates of higher-priority feeds looks "healthy" by error_count
 *   alone (fetch succeeded) but contributes nothing — this metric
 *   surfaces that case.
 */

import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';
import { captureWithRedact } from '@/lib/pipeline/redact';
import type { Database, Json } from '@/types/database';
import {
  preCluster,
  getClusterOverlapPct,
  keywordOverlap,
  extractKeywords,
  type ClusterInputArticle,
} from '@/lib/pipeline/cluster';
import { getStoryMatchOverlapPct } from '@/lib/pipeline/story-match';
import { scrapeDiscovery, type DiscoveredArticle } from '@/lib/pipeline/scrape-discovery';
import { scrapeJson } from '@/lib/pipeline/scrape-json';
import { validateExtractionConfig } from '@/lib/pipeline/extraction-config';
import { reserveCostOrFail, reconcileCostReservation } from '@/lib/pipeline/cost-reservation';
import {
  runGrabPlan,
  applyGrabPlanFilter,
  GrabPlanParseError,
  type GrabPlan,
} from '@/lib/pipeline/grab-plan';
import { searchWikipedia } from '@/lib/pipeline/wikipedia-search';
import { pickStoryMetadata } from '@/lib/pipeline/story-metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

type DiscoveryInsert = Database['public']['Tables']['discovery_items']['Insert'];
type ResearchJobInsert = Database['public']['Tables']['research_jobs']['Insert'];
type StoryObservationInsert = Database['public']['Tables']['story_observations']['Insert'];

// Wave 2 — Run Feed body shape per AI_Redesign.md § Run Feed entry point.
//
// `lookbackMs` drives both the pubDate filter and the clustering window
// (replaces the hardcoded 24h + 6h pair). Default 24h when omitted.
//
// Topic mode: either `query.text` (operator-typed, optionally `saveAs` a
// new research_queries row) OR `queryId` (pick a saved query). General
// mode = both omitted; the grab plan is skipped.
const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const MIN_LOOKBACK_MS = 15 * 60 * 1000;        // 15 min
const MAX_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const GRAB_PLAN_RESERVATION_USD = 0.01;

interface RunFeedBody {
  lookbackMs: number;
  feedIds: string[] | null;        // null = all active
  query: { text: string; saveAs?: string } | null;
  queryId: string | null;
}

class CancelledError extends Error {
  constructor() {
    super('research_job cancelled');
    this.name = 'CancelledError';
  }
}
type FeedRow = Pick<
  Database['public']['Tables']['feeds']['Row'],
  'id' | 'url' | 'source_name' | 'feed_type'
> & {
  name?: string | null;
  priority_weight?: number | null;
  allowed_category_slugs?: string[] | null;
  error_count?: number | null;
  extraction_config?: unknown;
  metadata?: Record<string, unknown> | null;
};

interface FlatItem {
  feed_id: string;
  raw_url: string;
  raw_title: string | null;
  excerpt: string;
  pubDate: string | null;
  outlet: string | null;
  source_class: 'rss' | 'scrape_html' | 'scrape_json' | 'search_api';
}

// ----------------------------------------------------------------------------
// Ingest kill-switch — 60s cached settings read (pattern from cost-tracker.ts)
// ----------------------------------------------------------------------------

const INGEST_ENABLED_TTL_MS = 60_000;
let _ingestEnabledCache: { value: boolean; expiresAt: number } | null = null;

async function isIngestEnabled(service: ReturnType<typeof createServiceClient>): Promise<boolean> {
  const now = Date.now();
  if (_ingestEnabledCache && _ingestEnabledCache.expiresAt > now) {
    return _ingestEnabledCache.value;
  }
  const { data, error } = await service
    .from('settings')
    .select('value, value_type')
    .eq('key', 'ai.ingest_enabled')
    .maybeSingle();
  if (error) {
    console.error('[newsroom.ingest.run] settings lookup failed:', error.message);
    // Fail closed on settings-read error — caller will surface 503.
    return false;
  }
  const enabled = !!(data && String(data.value) === 'true');
  _ingestEnabledCache = { value: enabled, expiresAt: now + INGEST_ENABLED_TTL_MS };
  return enabled;
}

// ----------------------------------------------------------------------------
// RSS fetch — ported verbatim from snapshot ingest/route.js L8-21
// ----------------------------------------------------------------------------

const parser = new Parser({
  timeout: 5000,
  headers: { 'User-Agent': 'VerityPost/1.0' },
});

function fetchWithTimeout(url: string, ms = 6000): Promise<Parser.Output<unknown>> {
  return Promise.race([
    parser.parseURL(url),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

// ----------------------------------------------------------------------------
// POST handler
// ----------------------------------------------------------------------------

export async function POST(req: Request) {
  // 1. Permission gate
  let actor;
  try {
    const supabase = createClient();
    actor = await requirePermission('admin.pipeline.run_ingest', supabase);
  } catch (err) {
    return permissionError(err);
  }
  const actorId = actor.id as string;

  // Wave 2 — strict body parse for the Run Feed shape. Empty body is
  // valid (defaults to General-mode, 24h lookback, all active feeds —
  // matches today's "Refresh feeds" click semantics).
  let body: RunFeedBody;
  try {
    const text = (await req.text()).trim();
    const raw = text.length > 0 ? JSON.parse(text) : {};
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      return NextResponse.json({ error: 'Invalid body shape' }, { status: 422 });
    }
    const r = raw as Record<string, unknown>;

    let lookbackMs = DEFAULT_LOOKBACK_MS;
    if (r.lookbackMs !== undefined) {
      const n = Number(r.lookbackMs);
      if (!Number.isFinite(n) || n < MIN_LOOKBACK_MS || n > MAX_LOOKBACK_MS) {
        return NextResponse.json(
          { error: `lookbackMs must be ${MIN_LOOKBACK_MS}..${MAX_LOOKBACK_MS}` },
          { status: 422 },
        );
      }
      lookbackMs = Math.floor(n);
    }

    let feedIds: string[] | null = null;
    if (r.feedIds !== undefined) {
      if (!Array.isArray(r.feedIds) || !r.feedIds.every((v) => typeof v === 'string' && v.length > 0)) {
        return NextResponse.json({ error: 'feedIds must be string[]' }, { status: 422 });
      }
      feedIds = r.feedIds.length > 0 ? (r.feedIds as string[]) : null;
    }

    let query: RunFeedBody['query'] = null;
    if (r.query !== undefined && r.query !== null) {
      if (typeof r.query !== 'object' || Array.isArray(r.query)) {
        return NextResponse.json({ error: 'query must be an object' }, { status: 422 });
      }
      const q = r.query as Record<string, unknown>;
      if (typeof q.text !== 'string' || q.text.trim().length === 0) {
        return NextResponse.json({ error: 'query.text required' }, { status: 422 });
      }
      const saveAs = typeof q.saveAs === 'string' && q.saveAs.trim().length > 0 ? q.saveAs.trim() : undefined;
      query = { text: q.text.trim(), saveAs };
    }

    let queryId: string | null = null;
    if (r.queryId !== undefined && r.queryId !== null) {
      if (typeof r.queryId !== 'string' || r.queryId.length === 0) {
        return NextResponse.json({ error: 'queryId must be a string' }, { status: 422 });
      }
      queryId = r.queryId;
    }
    if (query && queryId) {
      return NextResponse.json(
        { error: 'pass either query OR queryId, not both' },
        { status: 422 },
      );
    }

    body = { lookbackMs, feedIds, query, queryId };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 422 });
  }

  const service = createServiceClient();

  // 2. Kill switch
  const enabled = await isIngestEnabled(service);
  if (!enabled) {
    return NextResponse.json({ error: 'Ingestion disabled' }, { status: 503 });
  }

  // 3. Rate limit — DB policy `newsroom_ingest` is authoritative; the
  // max/windowSec args here are FALLBACK only (used pre-seed or when the
  // rate_limits row is missing). Retry-After tracks the effective window
  // so a runtime policy retune lands in the response without a code edit.
  const rl = await checkRateLimit(service, {
    key: `newsroom_ingest:user:${actorId}`,
    policyKey: 'newsroom_ingest',
    max: 5,
    windowSec: 600,
  });
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.windowSec ?? 600) } }
    );
  }

  // 4. Singleflight enforcement.
  //
  // Phase C added a partial unique index on
  // pipeline_runs (pipeline_type) WHERE status='running' AND pipeline_type='ingest'.
  // At most one running ingest row may exist at a time. The insert below
  // raises postgres 23505 (unique_violation) if another ingest is already
  // in flight; we catch that and return 409 with the running run's id.
  //
  // Pre-flight: reap orphan runs older than 10 minutes (longer than the
  // 300s maxDuration plus a 5-minute grace buffer). A Vercel-killed
  // lambda otherwise leaves a permanently-running row that blocks the
  // singleflight index until /api/cron/pipeline-cleanup runs the next
  // morning. Doing this in-route makes the next operator click recover
  // immediately. The daily cron stays as a defense-in-depth safety net.
  const orphanCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: reapedOrphans, error: reapErr } = await service
    .from('pipeline_runs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: 'orphan run reaped — lambda likely killed',
      error_type: 'abort',
    })
    .eq('status', 'running')
    .eq('pipeline_type', 'ingest')
    .lt('started_at', orphanCutoff)
    .select('id');
  if (reapErr) {
    // Non-fatal — log and continue. Worst case the singleflight insert
    // below collides and the operator gets a 409 they can retry once
    // the daily cleanup cron runs.
    console.warn('[newsroom.ingest.orphan_reap_failed]', reapErr.message);
  } else if ((reapedOrphans?.length ?? 0) > 0) {
    console.info('[newsroom.ingest.orphan_reap]', { count: reapedOrphans!.length });
  }

  // Wave 2 — same orphan-reap semantics on research_jobs. Without this,
  // a Vercel-killed lambda leaves a permanently-running research_jobs
  // row that blocks the parallel singleflight index until the next day.
  const { error: reapJobsErr, data: reapedJobs } = await service
    .from('research_jobs')
    .update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error: 'orphan run reaped — lambda likely killed',
    })
    .eq('status', 'running')
    .lt('started_at', orphanCutoff)
    .select('id');
  if (reapJobsErr) {
    console.warn('[newsroom.ingest.research_jobs_orphan_reap_failed]', reapJobsErr.message);
  } else if ((reapedJobs?.length ?? 0) > 0) {
    console.info('[newsroom.ingest.research_jobs_orphan_reap]', { count: reapedJobs!.length });
  }

  // 5. Create pipeline_runs row (status=running). Singleflight-protected.
  const startedAtDate = new Date();
  const startedAtMs = startedAtDate.getTime();
  const { data: runRow, error: runErr } = await service
    .from('pipeline_runs')
    .insert({
      status: 'running',
      pipeline_type: 'ingest',
      triggered_by: 'manual',
      triggered_by_user: actorId,
      started_at: startedAtDate.toISOString(),
      total_cost_usd: 0,
      items_processed: 0,
      items_created: 0,
      items_failed: 0,
      input_params: {} as Json,
      output_summary: {} as Json,
      step_timings_ms: {} as Json,
    })
    .select('id')
    .single();
  if (runErr || !runRow) {
    // Postgres 23505 = unique_violation, surfaced by Supabase as code '23505'.
    if (runErr && (runErr.code === '23505')) {
      // Another ingest run is already in flight. Look up its id (best-effort)
      // so the operator can see which run is blocking and decide whether
      // to wait or escalate.
      const { data: blocker } = await service
        .from('pipeline_runs')
        .select('id, started_at, triggered_by_user')
        .eq('status', 'running')
        .eq('pipeline_type', 'ingest')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return NextResponse.json(
        {
          error: 'Ingest run already in progress',
          runningRunId: (blocker?.id as string | undefined) ?? null,
          startedAt: (blocker?.started_at as string | undefined) ?? null,
        },
        { status: 409 }
      );
    }
    console.error('[newsroom.ingest.run] pipeline_runs insert failed:', runErr?.message);
    captureWithRedact(runErr ?? new Error('pipeline_runs insert returned no row'));
    return NextResponse.json({ error: 'Could not start ingest run' }, { status: 500 });
  }
  const runId = runRow.id as string;

  // Wave 2 — resolve / persist the research_query, then insert the
  // research_jobs row. This is the parallel singleflight + audit lane;
  // pipeline_runs above is the cost / observability lane (callModel
  // writes pipeline_costs against runId). One operator click = one row
  // in each table, joined via discovery_runs at finalize.
  let researchQueryId: string | null = body.queryId;
  let researchQueryNameSnapshot: string | null = null;
  let researchQueryTextSnapshot: string | null = null;

  if (body.queryId) {
    const { data: existing, error: qErr } = await service
      .from('research_queries')
      .select('id, name, query_text')
      .eq('id', body.queryId)
      .maybeSingle();
    if (qErr || !existing) {
      // Mark the pipeline_runs row failed so it doesn't pin singleflight.
      await service
        .from('pipeline_runs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: 'queryId not found',
          error_type: 'validation',
        })
        .eq('id', runId);
      return NextResponse.json({ error: 'queryId not found' }, { status: 404 });
    }
    researchQueryId = existing.id;
    researchQueryNameSnapshot = existing.name ?? null;
    researchQueryTextSnapshot = existing.query_text ?? null;
  } else if (body.query) {
    if (body.query.saveAs) {
      const { data: inserted, error: insErr } = await service
        .from('research_queries')
        .insert({ name: body.query.saveAs, query_text: body.query.text })
        .select('id, name, query_text')
        .single();
      if (insErr || !inserted) {
        await service
          .from('pipeline_runs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: `research_queries insert failed: ${insErr?.message ?? 'unknown'}`,
            error_type: 'db',
          })
          .eq('id', runId);
        return NextResponse.json({ error: 'Could not save query' }, { status: 500 });
      }
      researchQueryId = inserted.id;
      researchQueryNameSnapshot = inserted.name ?? null;
      researchQueryTextSnapshot = inserted.query_text ?? null;
    } else {
      // Inline (one-off) topic-mode call — snapshot the text so the
      // discovery_runs audit row carries forensics even though no
      // research_queries row exists.
      researchQueryTextSnapshot = body.query.text;
    }
  }

  const isTopicMode = !!(body.query || researchQueryId);
  const lookbackMs = body.lookbackMs;

  // research_jobs insert. Singleflight via the WHERE status='running'
  // partial unique index (Wave 1 migration). Postgres 23505 → 409.
  const researchJobInsert: ResearchJobInsert = {
    status: 'running',
    request_body: body as unknown as Json,
    phase: 'planning',
    started_at: new Date().toISOString(),
  };
  const { data: jobRow, error: jobErr } = await service
    .from('research_jobs')
    .insert(researchJobInsert)
    .select('id')
    .single();
  if (jobErr || !jobRow) {
    if (jobErr && jobErr.code === '23505') {
      const { data: blocker } = await service
        .from('research_jobs')
        .select('id, started_at')
        .eq('status', 'running')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      // Roll back the pipeline_runs row so it doesn't leak.
      await service
        .from('pipeline_runs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: 'research_jobs singleflight collision',
          error_type: 'abort',
        })
        .eq('id', runId);
      return NextResponse.json(
        {
          error: 'Run already in progress',
          runningJobId: (blocker?.id as string | undefined) ?? null,
          startedAt: (blocker?.started_at as string | undefined) ?? null,
        },
        { status: 409 },
      );
    }
    console.error('[newsroom.ingest.run] research_jobs insert failed:', jobErr?.message);
    captureWithRedact(jobErr ?? new Error('research_jobs insert returned no row'));
    await service
      .from('pipeline_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: `research_jobs insert failed: ${jobErr?.message ?? 'unknown'}`,
        error_type: 'db',
      })
      .eq('id', runId);
    return NextResponse.json({ error: 'Could not start research job' }, { status: 500 });
  }
  const jobId = jobRow.id as string;

  // Phase-checkpoint helpers — single source of truth for phase writes
  // and cancel detection. Cancel button writes status='cancelled' on the
  // research_jobs row; we sample the row between phases. SELECT-only
  // contention is cheap (4 sub-100ms queries per run).
  const setPhase = async (phase: 'planning' | 'fetching' | 'forming' | 'finalizing'): Promise<void> => {
    const { error } = await service
      .from('research_jobs')
      .update({ phase })
      .eq('id', jobId);
    if (error) {
      console.warn('[newsroom.ingest.phase_write_failed]', { phase, error: error.message });
    }
  };
  const checkCancel = async (): Promise<void> => {
    const { data, error } = await service
      .from('research_jobs')
      .select('status')
      .eq('id', jobId)
      .maybeSingle();
    if (error) {
      console.warn('[newsroom.ingest.cancel_check_failed]', error.message);
      return;
    }
    if (data?.status === 'cancelled') {
      throw new CancelledError();
    }
  };

  // 5. Main body — on any throw, mark run failed and return 500
  let grabPlan: GrabPlan | null = null;
  let topicReservationCreated = false;
  try {
    // Wave 2 — Topic mode: one Haiku call inside the planning phase
    // produces the deterministic grab plan that the post-fetch filter
    // executes. reserveCostOrFail guards the daily cap; second parse
    // failure throws and the catch block flips the job to 'failed'.
    if (isTopicMode) {
      const queryText = body.query?.text ?? researchQueryTextSnapshot ?? '';
      if (queryText.trim().length === 0) {
        throw new Error('topic mode requires non-empty query.text');
      }
      const reservation = await reserveCostOrFail(runId, GRAB_PLAN_RESERVATION_USD);
      topicReservationCreated = true;
      if (!reservation.accepted) {
        throw new Error(
          `cost_cap_exceeded: today=${reservation.today_usd} cap=${reservation.cap_usd}`,
        );
      }
      try {
        const { plan } = await runGrabPlan({
          queryText,
          pipelineRunId: runId,
        });
        grabPlan = plan;
      } catch (err) {
        if (err instanceof GrabPlanParseError) {
          // Re-throw with the canonical error tag the spec calls out.
          throw new Error(`grab_plan_failed: ${err.message}`);
        }
        throw err;
      }
      // Persist the plan onto research_jobs so the result screen and
      // post-mortem can read it without a separate audit lookup.
      await service
        .from('research_jobs')
        .update({ grab_plan: grabPlan as unknown as Json })
        .eq('id', jobId);
    }

    // Phase boundary — planning done, fetching starts.
    await checkCancel();
    await setPhase('fetching');

    // 6. Fetch active feeds across all four consumer types. The unified-feed
    // pivot dropped audience filtering — every active feed contributes to the
    // same discovery pool. The audience column stays in DB (defaulted to
    // 'adult') for back-compat with the cluster-mutation RPCs that still take
    // it as a defensive parameter.
    //
    // Wave 2 — when `body.feedIds` is provided, the feeds query narrows to
    // that explicit set. Empty / null → all active (today's behavior).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serviceAny = service as any;
    // Wave 3 — `search_api` feeds (Wikipedia today, paid news search later)
    // are included in this query but DO NOT participate in the normal feed
    // fanout. They only fire when the grab plan emits non-empty
    // `wikipedia_topics` (Topic mode); General-mode runs leave them dormant.
    // Equivalent to "polling cron WHERE feed_type != 'search_api'" — the
    // fanout below partitions search_api into its own bucket and only the
    // wikipediaRun consumer ever calls fetch() on those rows.
    let feedsQuery = serviceAny
      .from('feeds')
      .select('id,url,source_name,feed_type,name,priority_weight,allowed_category_slugs,error_count,extraction_config,metadata')
      .eq('is_active', true)
      .is('deleted_at', null)
      .in('feed_type', ['feed', 'rss', 'scrape_html', 'scrape_json', 'search_api']);
    if (body.feedIds && body.feedIds.length > 0) {
      feedsQuery = feedsQuery.in('id', body.feedIds);
    }
    const { data: feedsData, error: feedsErr } = await feedsQuery;
    if (feedsErr) {
      throw new Error(`feeds lookup failed: ${(feedsErr as { message: string }).message}`);
    }
    // Sort feeds by priority_weight DESC so that when two feeds carry the same
    // URL, the higher-weight feed's version appears first in allItems and wins
    // the first-occurrence-wins dedup below. Sort applies before bucket
    // partition so each bucket retains the same DESC ordering.
    const feeds: FeedRow[] = ((feedsData as FeedRow[]) ?? []).sort(
      (a, b) => (b.priority_weight ?? 5) - (a.priority_weight ?? 5)
    );

    // Partition into per-consumer buckets. Unknown feed_type rows are silently
    // skipped (defensive — no throw); they get no writeback and no items.
    const rssFeeds: FeedRow[] = [];
    const scrapeHtmlFeeds: FeedRow[] = [];
    const scrapeJsonFeeds: FeedRow[] = [];
    const searchApiFeeds: FeedRow[] = [];
    for (const f of feeds) {
      if (f.feed_type === 'feed' || f.feed_type === 'rss') rssFeeds.push(f);
      else if (f.feed_type === 'scrape_html') scrapeHtmlFeeds.push(f);
      else if (f.feed_type === 'scrape_json') scrapeJsonFeeds.push(f);
      else if (f.feed_type === 'search_api') searchApiFeeds.push(f);
    }

    // Per-feed outcome map — populated during fanout, consumed after insert.
    // ok=true: fetch succeeded (regardless of item count);
    // ok=false: fetch rejected;
    // unconfigured=true: scrape_json bucket — handler exists, but
    //   extraction_config is `{}`. Row is polled-as-unconfigured so
    //   last_polled_at advances without inflating error_count. Operator fills
    //   in the config via /admin/feeds drawer.
    // currentErrorCount is read from the already-fetched feeds row so we can
    // compute error_count + 1 without an extra round-trip.
    // Known race: if two ingest runs overlap, error_count increments can race.
    // Runs are single-flighted via pipeline_runs, so this is acceptable.
    interface FeedOutcome {
      ok: boolean;
      error?: string;
      currentErrorCount: number;
      unconfigured?: boolean;
    }
    const feedOutcomes = new Map<string, FeedOutcome>();
    const allItems: FlatItem[] = [];

    let rssSucceeded = 0;
    let rssFailed = 0;
    let scrapeHtmlSucceeded = 0;
    let scrapeHtmlFailed = 0;
    let scrapeJsonSucceeded = 0;
    let scrapeJsonFailed = 0;
    let scrapeJsonUnconfigured = 0;
    let searchApiSucceeded = 0;
    let searchApiFailed = 0;
    let searchApiSkipped = 0;
    let itemsFromRss = 0;
    let itemsFromScrapeHtml = 0;
    let itemsFromScrapeJson = 0;
    let itemsFromSearchApi = 0;

    // 7a. RSS fanout — full Promise.allSettled, 6s timeout per feed via
    // fetchWithTimeout. Promise.allSettled preserves input order so
    // higher-weight feeds appear first in fetchResults, matching the sorted
    // rssFeeds array.
    const rssRun = (async () => {
      const fetchResults = await Promise.allSettled(
        rssFeeds.map((f) => fetchWithTimeout(f.url).then((rss) => ({ feed: f, rss })))
      );

      // 7a.i Flatten — ignore items without .link
      for (let i = 0; i < fetchResults.length; i++) {
        const result = fetchResults[i];
        const feed = rssFeeds[i];
        if (result.status === 'fulfilled') {
          rssSucceeded++;
          const { rss } = result.value;
          feedOutcomes.set(feed.id, { ok: true, currentErrorCount: feed.error_count ?? 0 });

          const items = rss?.items ?? [];
          const allowedSlugs = feed.allowed_category_slugs ?? [];
          for (const item of items) {
            if (!item.link) continue;
            if (allowedSlugs.length > 0) {
              const text = `${item.title ?? ''} ${item.contentSnippet ?? ''}`.toLowerCase();
              if (!allowedSlugs.some((slug) => text.includes(slug.toLowerCase()))) continue;
            }
            const outlet = feed.source_name || feed.name || null;
            allItems.push({
              feed_id: feed.id,
              raw_url: item.link,
              raw_title: item.title?.trim() || null,
              excerpt: (item.contentSnippet || '').slice(0, 500),
              pubDate: item.pubDate || item.isoDate || null,
              outlet,
              source_class: 'rss',
            });
            itemsFromRss++;
          }
        } else {
          rssFailed++;
          const errMsg = String((result as PromiseRejectedResult).reason).slice(0, 500);
          feedOutcomes.set(feed.id, {
            ok: false,
            error: errMsg,
            currentErrorCount: feed.error_count ?? 0,
          });
        }
      }
    })();

    // 7b. Scrape HTML fanout — scrapeDiscovery silent-fails to [] internally.
    // An empty array is a SUCCESSFUL fetch with zero items, NOT a failure
    // (mirrors the RSS path's "fetch succeeded but feed had zero items").
    // Defense-in-depth: if scrapeDiscovery throws despite its silent-fail
    // contract, catch inline so a single feed never aborts the batch.
    const scrapeHtmlRun = (async () => {
      const fetchResults = await Promise.allSettled(
        scrapeHtmlFeeds.map(async (f) => {
          try {
            const items = await scrapeDiscovery(f.url, 15_000);
            return { feed: f, items, error: null as string | null };
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.warn('[newsroom.ingest.scrape_html_failed]', {
              feed_id: f.id,
              url: f.url,
              error: errMsg.slice(0, 500),
            });
            return { feed: f, items: [] as DiscoveredArticle[], error: errMsg.slice(0, 500) };
          }
        })
      );

      for (let i = 0; i < fetchResults.length; i++) {
        const result = fetchResults[i];
        const feed = scrapeHtmlFeeds[i];
        // Promise.allSettled here is belt-and-braces — the inner try/catch
        // already swallows throws into a fulfilled { error } shape — so a
        // 'rejected' branch indicates an unexpected failure path.
        if (result.status === 'fulfilled') {
          const { items, error } = result.value;
          if (error) {
            scrapeHtmlFailed++;
            feedOutcomes.set(feed.id, {
              ok: false,
              error,
              currentErrorCount: feed.error_count ?? 0,
            });
            continue;
          }
          scrapeHtmlSucceeded++;
          feedOutcomes.set(feed.id, { ok: true, currentErrorCount: feed.error_count ?? 0 });

          const allowedSlugs = feed.allowed_category_slugs ?? [];
          const outlet = feed.source_name || feed.name || null;
          for (const item of items) {
            if (!item.url) continue;
            if (allowedSlugs.length > 0) {
              const text = `${item.title ?? ''} ${item.excerpt ?? ''}`.toLowerCase();
              if (!allowedSlugs.some((slug) => text.includes(slug.toLowerCase()))) continue;
            }
            allItems.push({
              feed_id: feed.id,
              raw_url: item.url,
              raw_title: item.title?.trim() || null,
              excerpt: (item.excerpt ?? '').slice(0, 500),
              pubDate: item.pubDate ?? null,
              outlet,
              source_class: 'scrape_html',
            });
            itemsFromScrapeHtml++;
          }
        } else {
          scrapeHtmlFailed++;
          const errMsg = String((result as PromiseRejectedResult).reason).slice(0, 500);
          console.warn('[newsroom.ingest.scrape_html_failed]', {
            feed_id: feed.id,
            url: feed.url,
            error: errMsg,
          });
          feedOutcomes.set(feed.id, {
            ok: false,
            error: errMsg,
            currentErrorCount: feed.error_count ?? 0,
          });
        }
      }
    })();

    // 7c. scrape_json fanout — Phase B. Per-feed extraction_config drives the
    // JSON consumer. Empty {} = unconfigured (operator hasn't filled it in
    // yet); row is polled-as-unconfigured (last_polled_at advances,
    // error_count untouched, no fetch). Non-empty configs that pass
    // validateExtractionConfig are scraped via scrapeJson(). Non-empty
    // configs that FAIL validation are recorded as failures (real
    // configuration bug worth surfacing).
    const scrapeJsonRun = (async () => {
      const fetchResults = await Promise.allSettled(
        scrapeJsonFeeds.map(async (f) => {
          const cfg = f.extraction_config;
          const isEmpty =
            !cfg ||
            (typeof cfg === 'object' &&
              !Array.isArray(cfg) &&
              Object.keys(cfg as object).length === 0);
          if (isEmpty) {
            return { feed: f, kind: 'unconfigured' as const };
          }
          if (!validateExtractionConfig(cfg)) {
            return { feed: f, kind: 'invalid' as const };
          }
          const articles = await scrapeJson(f.url, cfg);
          return { feed: f, kind: 'ok' as const, articles };
        })
      );

      for (const result of fetchResults) {
        if (result.status === 'rejected') {
          // scrape-json is silent-fail; this branch is defense-in-depth.
          continue;
        }
        const settled = result.value;
        const f = settled.feed;
        const currentErrorCount = (f.error_count ?? 0) as number;

        if (settled.kind === 'unconfigured') {
          feedOutcomes.set(f.id, { ok: true, currentErrorCount, unconfigured: true });
          scrapeJsonUnconfigured++;
          continue;
        }
        if (settled.kind === 'invalid') {
          feedOutcomes.set(f.id, {
            ok: false,
            error: 'invalid extraction_config',
            currentErrorCount,
          });
          scrapeJsonFailed++;
          continue;
        }
        // kind === 'ok'
        feedOutcomes.set(f.id, { ok: true, currentErrorCount });
        scrapeJsonSucceeded++;
        itemsFromScrapeJson += settled.articles.length;

        const allowedSlugs = f.allowed_category_slugs ?? [];
        const outlet = f.source_name || f.name || null;
        for (const a of settled.articles) {
          if (!a.url) continue;
          if (allowedSlugs.length > 0) {
            const text = `${a.title ?? ''} ${a.excerpt ?? ''}`.toLowerCase();
            if (!allowedSlugs.some((slug) => text.includes(slug.toLowerCase()))) continue;
          }
          allItems.push({
            feed_id: f.id,
            raw_url: a.url,
            raw_title: a.title?.trim() || null,
            excerpt: (a.excerpt ?? '').slice(0, 500),
            pubDate: a.pubDate ?? null,
            outlet,
            source_class: 'scrape_json',
          });
        }
      }
    })();

    // 7d. Wikipedia fanout (Wave 3) — only fires when grab plan emits a
    // non-empty `wikipedia_topics` list AND a `feed_type='search_api'`
    // row is configured for provider='wikipedia'. Silent-fail per topic;
    // the whole consumer is silent-fail if no row is configured.
    const wikipediaRun = (async () => {
      if (!grabPlan || grabPlan.wikipedia_topics.length === 0) return;
      const wikiFeed = searchApiFeeds.find((f) => {
        const cfg = f.extraction_config;
        if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return false;
        return (cfg as { provider?: unknown }).provider === 'wikipedia';
      });
      if (!wikiFeed) return;

      const cfg = wikiFeed.extraction_config as { endpoint?: unknown };
      const endpoint = typeof cfg.endpoint === 'string' ? cfg.endpoint : '';
      if (!endpoint) {
        feedOutcomes.set(wikiFeed.id, {
          ok: false,
          error: 'wikipedia extraction_config missing endpoint',
          currentErrorCount: wikiFeed.error_count ?? 0,
        });
        searchApiFailed++;
        return;
      }

      try {
        const { items, failed } = await searchWikipedia({
          endpoint,
          topics: grabPlan.wikipedia_topics,
        });
        feedOutcomes.set(wikiFeed.id, {
          ok: true,
          currentErrorCount: wikiFeed.error_count ?? 0,
        });
        searchApiSucceeded++;
        if (failed > 0) searchApiSkipped += failed;

        const outlet = wikiFeed.source_name || wikiFeed.name || 'Wikipedia';
        for (const it of items) {
          if (!it.url) continue;
          allItems.push({
            feed_id: wikiFeed.id,
            raw_url: it.url,
            raw_title: it.title.trim() || null,
            excerpt: it.excerpt.slice(0, 500),
            pubDate: null,
            outlet,
            source_class: 'search_api',
          });
          itemsFromSearchApi++;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn('[newsroom.ingest.wikipedia_failed]', {
          feed_id: wikiFeed.id,
          error: errMsg.slice(0, 500),
        });
        feedOutcomes.set(wikiFeed.id, {
          ok: false,
          error: errMsg.slice(0, 500),
          currentErrorCount: wikiFeed.error_count ?? 0,
        });
        searchApiFailed++;
      }
    })();

    // 7e. Run all four consumer fanouts concurrently.
    await Promise.all([rssRun, scrapeHtmlRun, scrapeJsonRun, wikipediaRun]);

    // Restore the priority contract: RSS-found URLs win over scrape_html-found
    // URLs win over scrape_json-found URLs when the same raw_url appears in
    // multiple buckets. Within each bucket, items were pushed in
    // priority_weight-DESC order, which the stable sort (V8/Node) preserves.
    const SOURCE_CLASS_PRIORITY: Record<FlatItem['source_class'], number> = {
      rss: 0,
      scrape_html: 1,
      scrape_json: 2,
      // Wave 3 — Wikipedia is encyclopedic; if a topic also surfaces on a
      // news feed, the news version's outlet attribution should win.
      search_api: 3,
    };
    allItems.sort(
      (a, b) => SOURCE_CLASS_PRIORITY[a.source_class] - SOURCE_CLASS_PRIORITY[b.source_class]
    );

    // Aggregate counters preserved for back-compat with existing consumers
    // of the response/output_summary shape. unconfigured rows count toward
    // feedsSucceeded because they are intentionally polled-with-no-fetch
    // (last_polled_at advances, error_count untouched).
    const feedsSucceeded =
      rssSucceeded +
      scrapeHtmlSucceeded +
      scrapeJsonSucceeded +
      scrapeJsonUnconfigured +
      searchApiSucceeded;
    const feedsFailed = rssFailed + scrapeHtmlFailed + scrapeJsonFailed + searchApiFailed;

    // Deduplicate allItems by raw_url — keep first occurrence.
    // Feeds were sorted by priority_weight DESC above, so higher-weight feeds
    // appear first here. When two feeds carry the same URL, the higher-weight
    // feed's version (outlet attribution, excerpt) wins.
    const dedupedItems: FlatItem[] = [];
    const seenUrls = new Set<string>();
    for (const item of allItems) {
      if (!seenUrls.has(item.raw_url)) {
        seenUrls.add(item.raw_url);
        dedupedItems.push(item);
      }
    }

    // 9. Dedup + insert into the single discovery_items pool.
    // Wave 2 — lookback cutoff is operator-driven (`body.lookbackMs`),
    // replacing the hardcoded 24h pubDate floor.
    const lookbackCutoffMs = Date.now() - lookbackMs;

    // Wave 2 — Topic mode applies the grab plan deterministically against
    // fetched items: title+excerpt include pass, then negative-keyword
    // exclusion. Runs BEFORE discovery_items insert so the keep-rate is
    // honest in `items_kept` accounting.
    let scopedItems = dedupedItems;
    if (grabPlan) {
      scopedItems = applyGrabPlanFilter(dedupedItems, grabPlan);
    }

    async function processItems(items: FlatItem[]): Promise<{
      inserted: number;
      skipped: number;
      raceDeduped: number;
      insertedByFeed: Map<string, number>;
    }> {
      if (items.length === 0) {
        return { inserted: 0, skipped: 0, raceDeduped: 0, insertedByFeed: new Map() };
      }

      // Dedup query in batches of 100
      const existingUrls = new Set<string>();
      const urls = items.map((i) => i.raw_url);
      for (let i = 0; i < urls.length; i += 100) {
        const batch = urls.slice(i, i + 100);
        const { data: existing, error: existErr } = await service
          .from('discovery_items')
          .select('raw_url')
          .in('raw_url', batch);
        if (existErr) {
          throw new Error(`discovery_items dedup lookup failed: ${existErr.message}`);
        }
        for (const row of existing ?? []) {
          if (row.raw_url) existingUrls.add(row.raw_url);
        }
      }

      // Filter: already-seen + older than 24h
      const fresh: FlatItem[] = [];
      let skipped = 0;
      for (const it of items) {
        if (existingUrls.has(it.raw_url)) {
          skipped++;
          continue;
        }
        if (it.pubDate) {
          const pubMs = new Date(it.pubDate).getTime();
          if (!Number.isNaN(pubMs) && pubMs < lookbackCutoffMs) {
            skipped++;
            continue;
          }
        }
        fresh.push(it);
      }

      if (fresh.length === 0) {
        return { inserted: 0, skipped, raceDeduped: 0, insertedByFeed: new Map() };
      }

      // Map to insert rows
      const rows: DiscoveryInsert[] = fresh.map((it) => ({
        feed_id: it.feed_id,
        raw_url: it.raw_url,
        raw_title: it.raw_title,
        raw_body: null,
        raw_published_at: it.pubDate ? new Date(it.pubDate).toISOString() : null,
        state: 'pending',
        research_job_id: jobId,
        metadata: { outlet: it.outlet, excerpt: it.excerpt } as Json,
      }));

      // Upsert in batches of 500
      let inserted = 0;
      let raceDeduped = 0;
      const insertedByFeed = new Map<string, number>();
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const { data: insData, error: insErr } = await service
          .from('discovery_items')
          .upsert(batch, {
            onConflict: 'raw_url',
            ignoreDuplicates: true,
          })
          .select('id, feed_id');
        if (insErr) {
          throw new Error(`discovery_items upsert failed: ${insErr.message}`);
        }
        const written = (insData ?? []).length;
        inserted += written;
        // Tally per-feed inserted counts from the actually-written rows.
        for (const row of insData ?? []) {
          if (row.feed_id) {
            insertedByFeed.set(row.feed_id, (insertedByFeed.get(row.feed_id) ?? 0) + 1);
          }
        }
        // M6 — visibility on race-window dedup. ignoreDuplicates silently
        // drops rows that another concurrent ingest (or a re-run within
        // the same minute) already inserted between our SELECT-dedup pass
        // and this UPSERT. Surfacing the gap makes "fresh feed but zero
        // inserted" debuggable instead of mysterious.
        if (written < batch.length) {
          raceDeduped += batch.length - written;
        }
      }

      return { inserted, skipped, raceDeduped, insertedByFeed };
    }

    const {
      inserted: itemsInserted,
      skipped: itemsSkipped,
      raceDeduped: itemsRaceDeduped,
      insertedByFeed,
    } = await processItems(scopedItems);

    // Phase boundary — fetching done, story-formation starts.
    await checkCancel();
    await setPhase('forming');

    // ----------------------------------------------------------------------
    // 10. Clustering orchestration (F7 Phase 2 wire-up — closes F1).
    //
    // Runs preCluster + story-match dedupe over the last 6 hours of pending
    // discovery items. The unified pivot collapsed both audiences into one
    // pool, so we run a single pass — clusters land with audience='adult'
    // by default (the column stays in DB for back-compat with mutation RPCs
    // that still take it as a defensive parameter).
    //
    // Per-cluster failures are caught and recorded into clusterErrors; one
    // bad cluster never aborts the batch.
    // ----------------------------------------------------------------------

    interface ClusteringSummary {
      itemsConsidered: number;
      clustersCreated: number;       // legacy feed_clusters writes (back-compat)
      singletons: number;
      storiesFormed: number;         // Wave 2 — new stories created at ingest
      storiesExtended: number;       // Wave 2 — existing stories that gained observations
      observationsWritten: number;
      clusterErrors: { title: string; error: string }[];
    }

    const clusterThresholdPct = await getClusterOverlapPct();
    const storyMatchThresholdPct = await getStoryMatchOverlapPct();

    async function clusterPool(): Promise<{
      summary: ClusteringSummary;
      durationMs: number;
      storyMatchMs: number;
    }> {
      const audienceStart = Date.now();
      const summary: ClusteringSummary = {
        itemsConsidered: 0,
        clustersCreated: 0,
        singletons: 0,
        storiesFormed: 0,
        storiesExtended: 0,
        observationsWritten: 0,
        clusterErrors: [],
      };

      // Pull recently-fetched pending items. Wave 2 — cluster window
      // matches the operator-chosen lookback.
      const cutoffIso = new Date(Date.now() - lookbackMs).toISOString();
      const { data: pendingRows, error: pendingErr } = await service
        .from('discovery_items')
        .select('id, raw_title, raw_url, raw_published_at, feed_id, metadata')
        .eq('state', 'pending')
        .gte('fetched_at', cutoffIso)
        .order('fetched_at', { ascending: false });
      if (pendingErr) {
        summary.clusterErrors.push({
          title: '[load-pending]',
          error: `discovery_items pending lookup failed: ${pendingErr.message}`,
        });
        return { summary, durationMs: Date.now() - audienceStart, storyMatchMs: 0 };
      }

      const rows = pendingRows ?? [];
      summary.itemsConsidered = rows.length;
      if (rows.length === 0) {
        return { summary, durationMs: Date.now() - audienceStart, storyMatchMs: 0 };
      }

      // Index full discovery rows by id so the observation snapshot can
      // capture url / title / outlet without a second round-trip.
      type PendingRow = {
        id: string;
        raw_title: string | null;
        raw_url: string;
        raw_published_at: string | null;
        feed_id: string | null;
        metadata: { outlet?: string | null; excerpt?: string | null } | null;
      };
      const rowById = new Map<string, PendingRow>();
      for (const r of rows) {
        rowById.set(r.id, r as unknown as PendingRow);
      }

      // Pre-load source_class per feed once so we can stamp observations
      // without a per-item lookup. Same feed-set as the fetch fanout.
      const feedSourceClass = new Map<string, 'rss' | 'scrape_html' | 'scrape_json' | 'search_api'>();
      for (const f of feeds) {
        const fc = f.feed_type;
        if (fc === 'feed' || fc === 'rss') feedSourceClass.set(f.id, 'rss');
        else if (fc === 'scrape_html') feedSourceClass.set(f.id, 'scrape_html');
        else if (fc === 'scrape_json') feedSourceClass.set(f.id, 'scrape_json');
        else if (fc === 'search_api') feedSourceClass.set(f.id, 'search_api');
      }

      const inputs: ClusterInputArticle[] = rows.map((r) => {
        const md = (r.metadata ?? {}) as { outlet?: string | null };
        return {
          id: r.id,
          title: r.raw_title ?? '',
          outlet_name: md.outlet ?? null,
        };
      });

      const { clusters, singletons } = preCluster(inputs, clusterThresholdPct);
      summary.singletons = singletons.length;

      const storyMatchStart = Date.now();

      for (const cluster of clusters) {
        try {
          const itemIds = cluster.articles.map((a) => a.id);

          // Wave 2 — unbounded story match against stories.keywords using
          // the GIN index added in Wave 1. No recency cap, no time window
          // ("3-year revival is the feature" per AI_Redesign.md). Locked
          // stories are excluded from auto-attach via is_locked filter.
          let matchedStoryId: string | null = null;
          let matchScore = 0;
          if (cluster.keywords.length > 0) {
            const { data: candidates, error: candErr } = await service
              .from('stories')
              .select('id, keywords')
              .overlaps('keywords', cluster.keywords)
              .eq('is_locked', false);
            if (candErr) {
              throw new Error(`stories overlap lookup failed: ${candErr.message}`);
            }
            for (const c of candidates ?? []) {
              const ck = (c.keywords ?? []) as string[];
              if (ck.length === 0) continue;
              const score = keywordOverlap(cluster.keywords, ck);
              if (score > matchScore && score >= storyMatchThresholdPct) {
                matchScore = score;
                matchedStoryId = c.id as string;
              }
            }
          }

          // Legacy feed_clusters write — kept until Wave 5 rebuilds the
          // Discovery tab on stories. Existing /admin/newsroom UI still
          // reads from this table.
          const insertPayload = {
            title: cluster.title,
            summary: '',
            keywords: cluster.keywords,
            is_active: true,
            is_breaking: false,
            generation_state: 'clustered',
            primary_article_id: null,
            category_id: null,
            similarity_threshold: clusterThresholdPct,
            audience: 'adult' as const,
          };
          const { data: clusterRow, error: clusterErr } = await service
            .from('feed_clusters')
            .insert(insertPayload)
            .select('id')
            .single();
          if (clusterErr || !clusterRow) {
            throw new Error(
              `feed_clusters insert failed: ${clusterErr?.message ?? 'no row returned'}`
            );
          }

          const linkRes = await service
            .from('discovery_items')
            .update({
              cluster_id: clusterRow.id,
              state: 'clustered',
              updated_at: new Date().toISOString(),
            })
            .in('id', itemIds);
          if (linkRes.error) {
            throw new Error(`link-cluster failed: ${linkRes.error.message}`);
          }
          summary.clustersCreated += 1;

          // Story side — match-extends or new-formation.
          let storyId: string;
          const nowIso = new Date().toISOString();
          if (matchedStoryId) {
            storyId = matchedStoryId;
            // Bump last_observed_at; keywords on existing stories are SET
            // ONCE at formation per spec (re-compute deferred to v1.1 at
            // article-generation time when the LLM context is loaded).
            const { error: bumpErr } = await service
              .from('stories')
              .update({ last_observed_at: nowIso })
              .eq('id', storyId);
            if (bumpErr) {
              throw new Error(`stories last_observed_at bump failed: ${bumpErr.message}`);
            }
            summary.storiesExtended += 1;
          } else {
            // Net-new story. Slug = slugified cluster title + 8-hex hash
            // for guaranteed uniqueness against the existing UNIQUE index.
            const baseSlug = (cluster.title || 'story')
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '')
              .slice(0, 72);
            const hashSuffix = Math.random().toString(16).slice(2, 10);
            const slug = `${baseSlug || 'story'}-${hashSuffix}`;
            const { data: newStory, error: newErr } = await service
              .from('stories')
              .insert({
                slug,
                title: cluster.title || 'Untitled',
                keywords: cluster.keywords,
                first_seen_at: nowIso,
                last_observed_at: nowIso,
                generation_state: 'forming',
                research_query_id: researchQueryId,
              })
              .select('id')
              .single();
            if (newErr || !newStory) {
              throw new Error(`stories insert failed: ${newErr?.message ?? 'no row returned'}`);
            }
            storyId = newStory.id as string;
            summary.storiesFormed += 1;

            // Wave 7 — AI picks category + subcategory for newly-formed stories.
            // Best-effort: if the pick fails or returns nulls, the story still
            // ships uncategorized; operator can fill it in later.
            const clusterSources = itemIds.flatMap((id) => {
              const r = rowById.get(id);
              if (!r) return [];
              const md = r.metadata ?? {};
              return [{ outlet: md.outlet ?? null, title: r.raw_title, excerpt: md.excerpt ?? null }];
            });
            try {
              const clusterMeta = await pickStoryMetadata(
                {
                  title: cluster.title || 'Untitled',
                  keywords: cluster.keywords,
                  sources: clusterSources,
                },
                runId,
              );
              if (clusterMeta.category_id !== null || clusterMeta.subcategory_id !== null) {
                await service
                  .from('stories')
                  .update({
                    ai_category_id: clusterMeta.category_id,
                    ai_subcategory_id: clusterMeta.subcategory_id,
                  })
                  .eq('id', storyId);
              }
            } catch (metaErr) {
              const metaMsg = metaErr instanceof Error ? metaErr.message : 'unknown error';
              console.warn('[newsroom.ingest.run] cluster story metadata pick failed:', metaMsg);
              captureWithRedact(metaErr);
              summary.clusterErrors.push({
                title: cluster.title || '(untitled)',
                error: `metadata pick failed: ${metaMsg}`,
              });
            }
          }

          // story_observations — one per cluster article. Snapshot the
          // url / title / outlet so provenance survives later soft-deletes
          // of the feed or cleanup of the discovery row.
          const observations: StoryObservationInsert[] = [];
          for (const id of itemIds) {
            const r = rowById.get(id);
            if (!r) continue;
            const md = r.metadata ?? {};
            observations.push({
              story_id: storyId,
              discovery_item_id: id,
              observed_at: nowIso,
              match_score: matchedStoryId ? matchScore : null,
              url_snapshot: r.raw_url,
              title_snapshot: r.raw_title,
              excerpt_snapshot: md.excerpt ?? null,
              outlet_snapshot: md.outlet ?? null,
              source_class: r.feed_id ? feedSourceClass.get(r.feed_id) ?? null : null,
              feed_id: r.feed_id,
            });
          }
          if (observations.length > 0) {
            const { error: obsErr } = await service
              .from('story_observations')
              .insert(observations);
            if (obsErr) {
              throw new Error(`story_observations insert failed: ${obsErr.message}`);
            }
            summary.observationsWritten += observations.length;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'unknown error';
          console.error('[newsroom.ingest.run] cluster persist failed:', message);
          captureWithRedact(err);
          summary.clusterErrors.push({
            title: cluster.title || '(untitled)',
            error: message,
          });
        }
      }

      // Wave 7 — Singleton story-match + formation.
      //
      // Singletons are items that didn't cluster with any other item during
      // the preCluster pass. Previously they were counted but never persisted
      // to stories / story_observations, so a single-outlet item showed up
      // "ungrouped" on the result screen with only a Promote button.
      //
      // For each singleton with extractable keywords:
      //   - Run the same overlap-against-stories.keywords search used for
      //     clusters (same storyMatchThresholdPct, same is_locked=false filter).
      //   - Match found  → bump last_observed_at + attach via story_observations
      //     + write a single-item feed_clusters row for back-compat (cluster_id).
      //   - No match     → form a NEW story + write the singleton feed_clusters
      //     row + observation.
      //   - Empty keywords → skip (left as ungrouped discovery_item, as before).
      //
      // All of this uses the same try/catch + clusterErrors pattern the cluster
      // loop above uses. The existing cluster-loop behavior is unchanged.
      for (const singleton of singletons) {
        const singletonItem = singleton.articles[0];
        if (!singletonItem) continue;

        const singletonRow = rowById.get(singletonItem.id);
        if (!singletonRow) continue;

        const singletonKeywords = extractKeywords(singletonRow.raw_title);
        if (singletonKeywords.length === 0) continue;

        try {
          const nowIsoS = new Date().toISOString();

          // Story-match pass — identical query to the cluster path.
          let singletonMatchedStoryId: string | null = null;
          let singletonMatchScore = 0;
          const { data: sCandidates, error: sCandErr } = await service
            .from('stories')
            .select('id, keywords')
            .overlaps('keywords', singletonKeywords)
            .eq('is_locked', false);
          if (sCandErr) {
            throw new Error(`singleton stories overlap lookup failed: ${sCandErr.message}`);
          }
          for (const c of sCandidates ?? []) {
            const ck = (c.keywords ?? []) as string[];
            if (ck.length === 0) continue;
            const score = keywordOverlap(singletonKeywords, ck);
            if (score > singletonMatchScore && score >= storyMatchThresholdPct) {
              singletonMatchScore = score;
              singletonMatchedStoryId = c.id as string;
            }
          }

          // Single-item feed_clusters row — keeps back-compat with Discovery
          // tab generation paths that resolve cluster_id from discovery_items.
          const singletonClusterPayload = {
            title: singletonRow.raw_title ?? 'Untitled',
            summary: '',
            keywords: singletonKeywords,
            is_active: true,
            is_breaking: false,
            generation_state: 'clustered',
            primary_article_id: null,
            category_id: null,
            similarity_threshold: clusterThresholdPct,
            audience: 'adult' as const,
          };
          const { data: sClusterRow, error: sClusterErr } = await service
            .from('feed_clusters')
            .insert(singletonClusterPayload)
            .select('id')
            .single();
          if (sClusterErr || !sClusterRow) {
            throw new Error(
              `singleton feed_clusters insert failed: ${sClusterErr?.message ?? 'no row returned'}`,
            );
          }

          // Link the discovery_item to the new cluster row.
          const sLinkRes = await service
            .from('discovery_items')
            .update({
              cluster_id: sClusterRow.id,
              state: 'clustered',
              updated_at: nowIsoS,
            })
            .eq('id', singletonItem.id);
          if (sLinkRes.error) {
            throw new Error(`singleton link-cluster failed: ${sLinkRes.error.message}`);
          }
          summary.clustersCreated += 1;

          // Story side.
          let singletonStoryId: string;
          if (singletonMatchedStoryId) {
            singletonStoryId = singletonMatchedStoryId;
            const { error: sBumpErr } = await service
              .from('stories')
              .update({ last_observed_at: nowIsoS })
              .eq('id', singletonStoryId);
            if (sBumpErr) {
              throw new Error(`singleton stories last_observed_at bump failed: ${sBumpErr.message}`);
            }
            summary.storiesExtended += 1;
          } else {
            // Net-new story from singleton.
            const sBaseSlug = (singletonRow.raw_title || 'story')
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '')
              .slice(0, 72);
            const sHashSuffix = Math.random().toString(16).slice(2, 10);
            const sSlug = `${sBaseSlug || 'story'}-${sHashSuffix}`;
            const { data: sNewStory, error: sNewErr } = await service
              .from('stories')
              .insert({
                slug: sSlug,
                title: singletonRow.raw_title ?? 'Untitled',
                keywords: singletonKeywords,
                first_seen_at: nowIsoS,
                last_observed_at: nowIsoS,
                generation_state: 'forming',
                research_query_id: researchQueryId,
              })
              .select('id')
              .single();
            if (sNewErr || !sNewStory) {
              throw new Error(`singleton stories insert failed: ${sNewErr?.message ?? 'no row returned'}`);
            }
            singletonStoryId = sNewStory.id as string;
            summary.storiesFormed += 1;

            // Wave 7 — AI metadata pick for singleton-formed stories.
            const singletonSources = [
              {
                outlet: (singletonRow.metadata ?? {}).outlet ?? null,
                title: singletonRow.raw_title,
                excerpt: (singletonRow.metadata ?? {}).excerpt ?? null,
              },
            ];
            try {
              const sMeta = await pickStoryMetadata(
                {
                  title: singletonRow.raw_title ?? 'Untitled',
                  keywords: singletonKeywords,
                  sources: singletonSources,
                },
                runId,
              );
              if (sMeta.category_id !== null || sMeta.subcategory_id !== null) {
                await service
                  .from('stories')
                  .update({
                    ai_category_id: sMeta.category_id,
                    ai_subcategory_id: sMeta.subcategory_id,
                  })
                  .eq('id', singletonStoryId);
              }
            } catch (sMetaErr) {
              const sMetaMsg = sMetaErr instanceof Error ? sMetaErr.message : 'unknown error';
              console.warn('[newsroom.ingest.run] singleton story metadata pick failed:', sMetaMsg);
              captureWithRedact(sMetaErr);
              summary.clusterErrors.push({
                title: singletonRow.raw_title ?? '(untitled)',
                error: `singleton metadata pick failed: ${sMetaMsg}`,
              });
            }
          }

          // story_observations — one row for the singleton.
          const sMd = singletonRow.metadata ?? {};
          const sObs: StoryObservationInsert = {
            story_id: singletonStoryId,
            discovery_item_id: singletonItem.id,
            observed_at: nowIsoS,
            match_score: singletonMatchedStoryId ? singletonMatchScore : null,
            url_snapshot: singletonRow.raw_url,
            title_snapshot: singletonRow.raw_title,
            excerpt_snapshot: sMd.excerpt ?? null,
            outlet_snapshot: sMd.outlet ?? null,
            source_class: singletonRow.feed_id
              ? feedSourceClass.get(singletonRow.feed_id) ?? null
              : null,
            feed_id: singletonRow.feed_id,
          };
          const { error: sObsErr } = await service
            .from('story_observations')
            .insert(sObs);
          if (sObsErr) {
            throw new Error(`singleton story_observations insert failed: ${sObsErr.message}`);
          }
          summary.observationsWritten += 1;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'unknown error';
          console.error('[newsroom.ingest.run] singleton persist failed:', message);
          captureWithRedact(err);
          summary.clusterErrors.push({
            title: singletonRow.raw_title ?? '(untitled)',
            error: message,
          });
        }
      }

      return {
        summary,
        durationMs: Date.now() - audienceStart,
        storyMatchMs: Date.now() - storyMatchStart,
      };
    }

    const clusterRun = await clusterPool();

    // 10b. Per-feed health writeback.
    //
    // Writes last_polled_at, error_count, last_error, and last_error_at back
    // to each feeds row so the admin /feeds page shows live health status.
    //
    // lifetime articles_imported_count was removed 2026-05-04; per-feed 24h/7d
    // counts come from discovery_items joins now (see /api/admin/feeds/list).
    //
    // Race note: error_count increments use values read from the feeds row
    // fetched in step 6 above (read-modify-write). Two concurrent ingest runs
    // could both read the same value and write the same incremented result,
    // losing one increment. This is acceptable because runs are serialized
    // via the pipeline_runs lock (one running row at a time per manual
    // trigger); a true race requires two simultaneous HTTP calls to this
    // endpoint by different admin users, which is operationally negligible
    // pre-launch.
    let feedWritebackSucceeded = 0;
    let feedWritebackFailed = 0;
    const nowIso = new Date().toISOString();

    // Build a lookup of current feed error counts + metadata + display name
    // from the already-fetched rows. metadata.zero_results_streak is read
    // pre-write so the increment branch can compute the next value without
    // an extra round-trip; staleStreaks is built from the post-write value.
    interface FeedCounter {
      errorCount: number;
      metadata: Record<string, unknown>;
      name: string | null;
      sourceClass: 'rss' | 'scrape_html' | 'scrape_json' | 'search_api' | 'feed';
    }
    const feedCounters = new Map<string, FeedCounter>();
    for (const f of feeds) {
      feedCounters.set(f.id, {
        errorCount: f.error_count ?? 0,
        metadata: (f.metadata && typeof f.metadata === 'object' ? f.metadata : {}) as Record<
          string,
          unknown
        >,
        name: f.source_name || f.name || null,
        sourceClass: (f.feed_type as FeedCounter['sourceClass']) ?? 'feed',
      });
    }

    // Cross-feed dedup attribution (Phase C Fix 1).
    //
    // After dedup, a feed may have FETCHED items but contributed ZERO
    // unique discovery_items because every URL was already inserted by a
    // higher-priority feed. error_count alone hides this — fetch
    // succeeded so error_count resets to 0, last_polled_at advances, and
    // the row looks healthy forever while contributing nothing.
    //
    // metadata.zero_results_streak (jsonb integer) tracks the consecutive
    // count of ok-but-zero-unique runs. Reset on any non-zero contribution.
    // Only counts FETCHED feeds — unconfigured scrape_json rows do not
    // increment (the row was deliberately not fetched).
    const nextStreaks = new Map<string, number>();

    const writebackPromises = Array.from(feedOutcomes.entries()).map(
      async ([feedId, outcome]) => {
        try {
          const counters = feedCounters.get(feedId);
          const errorCount = counters?.errorCount ?? 0;
          const existingMetadata = counters?.metadata ?? {};
          if (outcome.unconfigured) {
            // scrape_json: polled-as-unconfigured — advance last_polled_at
            // only. Do not touch error_count / last_error / last_error_at
            // since the row was deliberately not fetched (extraction_config
            // is empty; operator hasn't filled it in yet). Streak counter
            // is also untouched — unfetched rows can't have "stale results".
            const { error: wErr } = await service
              .from('feeds')
              .update({ last_polled_at: nowIso })
              .eq('id', feedId);
            if (wErr) throw wErr;
          } else if (outcome.ok) {
            const uniqueContributed = insertedByFeed.get(feedId) ?? 0;
            const prevStreak =
              typeof existingMetadata.zero_results_streak === 'number'
                ? (existingMetadata.zero_results_streak as number)
                : 0;
            const nextStreak = uniqueContributed === 0 ? prevStreak + 1 : 0;
            nextStreaks.set(feedId, nextStreak);
            const mergedMetadata: Record<string, unknown> = {
              ...existingMetadata,
              zero_results_streak: nextStreak,
            };
            const { error: wErr } = await service
              .from('feeds')
              .update({
                last_polled_at: nowIso,
                error_count: 0,
                last_error: null,
                last_error_at: null,
                metadata: mergedMetadata as Json,
              })
              .eq('id', feedId);
            if (wErr) throw wErr;
          } else {
            // Failed fetch — leave streak counter untouched. error_count
            // already surfaces this case; double-counting under a separate
            // metric would conflate "broken parser" with "publishes only
            // duplicates of higher-priority feeds".
            const { error: wErr } = await service
              .from('feeds')
              .update({
                last_polled_at: nowIso,
                error_count: errorCount + 1,
                last_error: outcome.error ?? null,
                last_error_at: nowIso,
              })
              .eq('id', feedId);
            if (wErr) throw wErr;
          }
          feedWritebackSucceeded++;
        } catch (wbErr) {
          feedWritebackFailed++;
          console.warn('[newsroom.ingest.feed_writeback_failed]', {
            feed_id: feedId,
            error: String(wbErr),
          });
        }
      }
    );

    await Promise.all(writebackPromises);

    // Build staleStreaks for the response — feeds whose post-write streak
    // is >= 3 (operator-actionable threshold). Sorted by streak DESC, capped
    // at 25.
    interface StaleStreak {
      feed_id: string;
      name: string | null;
      source_class: FeedCounter['sourceClass'];
      streak: number;
    }
    const staleStreaks: StaleStreak[] = [];
    for (const [feedId, streak] of nextStreaks.entries()) {
      if (streak < 3) continue;
      const counter = feedCounters.get(feedId);
      staleStreaks.push({
        feed_id: feedId,
        name: counter?.name ?? null,
        source_class: counter?.sourceClass ?? 'feed',
        streak,
      });
    }
    staleStreaks.sort((a, b) => b.streak - a.streak);
    if (staleStreaks.length > 25) staleStreaks.length = 25;

    // 11. Mark run completed
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAtMs;
    const itemsCreated = itemsInserted;
    const itemsProcessed = dedupedItems.length;
    const skippedDuplicates = itemsSkipped;
    const feedsByType = {
      rss: {
        polled: rssFeeds.length,
        succeeded: rssSucceeded,
        failed: rssFailed,
      },
      scrape_html: {
        polled: scrapeHtmlFeeds.length,
        succeeded: scrapeHtmlSucceeded,
        failed: scrapeHtmlFailed,
      },
      scrape_json: {
        polled: scrapeJsonFeeds.length,
        succeeded: scrapeJsonSucceeded,
        failed: scrapeJsonFailed,
        unconfigured: scrapeJsonUnconfigured,
      },
      search_api: {
        polled: searchApiFeeds.length,
        succeeded: searchApiSucceeded,
        failed: searchApiFailed,
        skippedTopics: searchApiSkipped,
      },
    };
    const itemsBySource = {
      rss: itemsFromRss,
      scrape_html: itemsFromScrapeHtml,
      scrape_json: itemsFromScrapeJson,
      search_api: itemsFromSearchApi,
    };

    const output: Json = {
      feedsSucceeded,
      feedsFailed,
      feedsByType,
      itemsInserted,
      itemsBySource,
      itemsSkipped,
      itemsRaceDeduped, // M6 — surface concurrent-ingest dedup count
      clustering: clusterRun.summary,
      feedsWriteback: { succeeded: feedWritebackSucceeded, failed: feedWritebackFailed },
      staleStreaks, // Phase C — feeds contributing 0 unique items 3+ runs
    } as unknown as Json;

    const stepTimings: Json = {
      cluster_ms: clusterRun.durationMs,
      story_match_ms: clusterRun.storyMatchMs,
    } as unknown as Json;

    const { error: updateErr } = await service
      .from('pipeline_runs')
      .update({
        status: 'completed',
        completed_at: completedAt.toISOString(),
        duration_ms: durationMs,
        items_processed: itemsProcessed,
        items_created: itemsCreated,
        items_failed: feedsFailed,
        output_summary: output,
        step_timings_ms: stepTimings,
      })
      .eq('id', runId);
    if (updateErr) {
      console.error('[newsroom.ingest.run] run update failed:', updateErr.message);
      captureWithRedact(updateErr);
    }

    // Wave 2 — final phase + research_jobs flip + discovery_runs audit.
    // Sequential (not a true xact — Supabase JS client doesn't expose
    // BEGIN/COMMIT) but ordered so that even a partial failure leaves
    // discoverable state: research_jobs is the singleflight lane and
    // MUST flip to 'done' or the next operator click is wedged.
    await checkCancel();
    await setPhase('finalizing');

    const itemsKept = itemsInserted;
    const { error: jobDoneErr } = await service
      .from('research_jobs')
      .update({
        status: 'done',
        finished_at: completedAt.toISOString(),
        items_fetched: itemsProcessed,
        items_kept: itemsKept,
        stories_formed: clusterRun.summary.storiesFormed,
        stories_extended: clusterRun.summary.storiesExtended,
      })
      .eq('id', jobId);
    if (jobDoneErr) {
      console.error('[newsroom.ingest.run] research_jobs done flip failed:', jobDoneErr.message);
      captureWithRedact(jobDoneErr);
    }

    const { error: drunErr } = await service
      .from('discovery_runs')
      .insert({
        pipeline_run_id: runId,
        research_query_id: researchQueryId,
        query_name_snapshot: researchQueryNameSnapshot,
        query_text_snapshot: researchQueryTextSnapshot,
        lookback_ms: lookbackMs,
        items_fetched: itemsProcessed,
        items_kept: itemsKept,
        stories_formed: clusterRun.summary.storiesFormed,
        stories_extended: clusterRun.summary.storiesExtended,
      });
    if (drunErr) {
      console.error('[newsroom.ingest.run] discovery_runs insert failed:', drunErr.message);
      captureWithRedact(drunErr);
    }

    // 12. Audit log — best-effort via SECDEF RPC on cookie-scoped client
    await recordAdminAction({
      action: 'newsroom.ingest.run',
      targetTable: 'pipeline_runs',
      targetId: runId,
      newValue: {
        itemsCreated,
        durationMs,
        clustersCreated: clusterRun.summary.clustersCreated,
        storiesFormed: clusterRun.summary.storiesFormed,
        storiesExtended: clusterRun.summary.storiesExtended,
        feedsByType,
        itemsBySource,
      },
    });

    // 13. Response
    return NextResponse.json({
      ok: true,
      runId,
      jobId,
      feedsSucceeded,
      feedsFailed,
      feedsByType,
      totalScanned: itemsProcessed,
      itemsInserted,
      itemsBySource,
      skippedDuplicates,
      raceDeduped: itemsRaceDeduped, // M6 — visibility on concurrent-ingest collisions
      durationMs,
      clustering: clusterRun.summary,
      staleStreaks, // Phase C — feeds with zero_results_streak >= 3
      grabPlan, // null in General mode
    });
  } catch (err) {
    const cancelled = err instanceof CancelledError;
    const message = err instanceof Error ? err.message : 'unknown error';
    const stack = err instanceof Error ? (err.stack ?? null) : null;
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAtMs;
    if (!cancelled) {
      console.error('[newsroom.ingest.run] run failed:', message);
      captureWithRedact(err);
    } else {
      console.info('[newsroom.ingest.run] run cancelled mid-flight');
    }

    await service
      .from('pipeline_runs')
      .update({
        status: cancelled ? 'completed' : 'failed',
        error_message: cancelled ? null : message,
        error_stack: cancelled ? null : stack,
        error_type: cancelled ? null : 'pipeline',
        completed_at: completedAt.toISOString(),
        duration_ms: durationMs,
      })
      .eq('id', runId);

    // Wave 2 — research_jobs flip. Cancelled runs already have status
    // ='cancelled' written by the operator's Cancel button; preserve it.
    // Failed runs get the spec-mandated 'failed' + error string.
    if (!cancelled) {
      await service
        .from('research_jobs')
        .update({
          status: 'failed',
          finished_at: completedAt.toISOString(),
          error: message.slice(0, 500),
        })
        .eq('id', jobId);
    } else {
      await service
        .from('research_jobs')
        .update({ finished_at: completedAt.toISOString() })
        .eq('id', jobId);
    }

    // Always insert the discovery_runs audit row — partial counters are
    // better than no record. ON DELETE RESTRICT on pipeline_run_id keeps
    // the join intact even after legacy reaper passes.
    await service
      .from('discovery_runs')
      .insert({
        pipeline_run_id: runId,
        research_query_id: researchQueryId,
        query_name_snapshot: researchQueryNameSnapshot,
        query_text_snapshot: researchQueryTextSnapshot,
        lookback_ms: lookbackMs,
        items_fetched: 0,
        items_kept: 0,
        stories_formed: 0,
        stories_extended: 0,
      });

    if (cancelled) {
      return NextResponse.json(
        { ok: false, cancelled: true, runId, jobId, durationMs },
        { status: 200 },
      );
    }
    return NextResponse.json({ error: 'Ingest run failed' }, { status: 500 });
  } finally {
    if (topicReservationCreated) {
      try {
        await reconcileCostReservation(runId);
      } catch (reconcileErr) {
        console.error('[newsroom.ingest.run.finally.reconcile]', reconcileErr);
      }
    }
  }
}
