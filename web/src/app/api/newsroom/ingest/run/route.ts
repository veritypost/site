/**
 * F7 Phase 2 Task 9 — /api/newsroom/ingest/run
 *
 * POST handler for the admin "Refresh feeds" button. Fetches all active
 * RSS feeds, deduplicates against discovery_items by raw_url, and inserts
 * new pending rows for the pipeline orchestrator (Task 10) to pick up.
 *
 * Ported from snapshot: verity-post-pipeline-snapshot/src/app/api/ingest/route.js
 * Differences from snapshot:
 *   - Writes to discovery_items (no audience-split anymore — the unified-feed
 *     pivot collapses adult and kid sources into one pool; the operator
 *     picks audience at generation time)
 *   - The legacy `feeds.audience` column stays in DB for back-compat with
 *     mutation RPCs but is no longer a UI primary; ingest writes every
 *     active feed regardless of its audience tag
 *   - No scraping here (snapshot also deferred scraping per line 287)
 *   - Writes pipeline_runs row for observability
 *   - Admin-gated via admin.pipeline.run_ingest (not open)
 *   - Rate-limited via rate_limits.newsroom_ingest (5 per 600s)
 *   - Kill-switched via settings.ai.ingest_enabled
 */

import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';
import { captureWithRedact } from '@/lib/pipeline/redact';
import type { Database, Json } from '@/types/database';
import { preCluster, getClusterOverlapPct, type ClusterInputArticle } from '@/lib/pipeline/cluster';
import {
  findBestMatch,
  loadStoryMatchCandidates,
  getStoryMatchOverlapPct,
} from '@/lib/pipeline/story-match';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

type DiscoveryInsert = Database['public']['Tables']['discovery_items']['Insert'];
type FeedRow = Pick<
  Database['public']['Tables']['feeds']['Row'],
  'id' | 'url' | 'source_name' | 'feed_type'
> & { name?: string | null };

interface FlatItem {
  feed_id: string;
  raw_url: string;
  raw_title: string | null;
  excerpt: string;
  pubDate: string | null;
  outlet: string;
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

  // Body parse — the legacy shape included an `audience` field; we still
  // accept it for back-compat but ignore it. The unified-feed pivot polls
  // every active feed in one pass.
  try {
    const text = await req.text();
    if (text.trim().length > 0) {
      // Validate JSON only — ignore the parsed body.
      JSON.parse(text);
    }
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

  // 4. Create pipeline_runs row (status=running)
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
    console.error('[newsroom.ingest.run] pipeline_runs insert failed:', runErr?.message);
    captureWithRedact(runErr ?? new Error('pipeline_runs insert returned no row'));
    return NextResponse.json({ error: 'Could not start ingest run' }, { status: 500 });
  }
  const runId = runRow.id as string;

  // 5. Main body — on any throw, mark run failed and return 500
  try {
    // 6. Fetch active feeds (rss/feed types only). The unified-feed pivot
    // dropped audience filtering — every active feed contributes to the same
    // discovery pool. The audience column stays in DB (defaulted to 'adult')
    // for back-compat with the cluster-mutation RPCs that still take it as
    // a defensive parameter.
    const { data: feedsData, error: feedsErr } = await service
      .from('feeds')
      .select('id,url,source_name,feed_type,name')
      .eq('is_active', true)
      .in('feed_type', ['feed', 'rss']);
    if (feedsErr) {
      throw new Error(`feeds lookup failed: ${feedsErr.message}`);
    }
    const feeds: FeedRow[] = feedsData ?? [];

    // 7. Fetch all feeds — full Promise.allSettled fanout, 6s timeout per feed
    const fetchResults = await Promise.allSettled(
      feeds.map((f) => fetchWithTimeout(f.url).then((rss) => ({ feed: f, rss })))
    );

    let feedsSucceeded = 0;
    let feedsFailed = 0;
    const allItems: FlatItem[] = [];

    // 8. Flatten — ignore items without .link
    for (const result of fetchResults) {
      if (result.status === 'fulfilled') {
        feedsSucceeded++;
        const { feed, rss } = result.value;
        const items = rss?.items ?? [];
        for (const item of items) {
          if (!item.link) continue;
          const outlet = feed.source_name || feed.name || 'Unknown';
          allItems.push({
            feed_id: feed.id,
            raw_url: item.link,
            raw_title: item.title?.trim() || null,
            excerpt: (item.contentSnippet || '').slice(0, 500),
            pubDate: item.pubDate || item.isoDate || null,
            outlet,
          });
        }
      } else {
        feedsFailed++;
      }
    }

    // 9. Dedup + insert into the single discovery_items pool.
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    async function processItems(
      items: FlatItem[]
    ): Promise<{ inserted: number; skipped: number; raceDeduped: number }> {
      if (items.length === 0) return { inserted: 0, skipped: 0, raceDeduped: 0 };

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
          if (!Number.isNaN(pubMs) && pubMs < oneDayAgo) {
            skipped++;
            continue;
          }
        }
        fresh.push(it);
      }

      if (fresh.length === 0) return { inserted: 0, skipped, raceDeduped: 0 };

      // Map to insert rows
      const rows: DiscoveryInsert[] = fresh.map((it) => ({
        feed_id: it.feed_id,
        raw_url: it.raw_url,
        raw_title: it.raw_title,
        raw_body: null,
        raw_published_at: it.pubDate ? new Date(it.pubDate).toISOString() : null,
        state: 'pending',
        metadata: { outlet: it.outlet, excerpt: it.excerpt } as Json,
      }));

      // Upsert in batches of 500
      let inserted = 0;
      let raceDeduped = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const { data: insData, error: insErr } = await service
          .from('discovery_items')
          .upsert(batch, {
            onConflict: 'raw_url',
            ignoreDuplicates: true,
          })
          .select('id');
        if (insErr) {
          throw new Error(`discovery_items upsert failed: ${insErr.message}`);
        }
        const written = (insData ?? []).length;
        inserted += written;
        // M6 — visibility on race-window dedup. ignoreDuplicates silently
        // drops rows that another concurrent ingest (or a re-run within
        // the same minute) already inserted between our SELECT-dedup pass
        // and this UPSERT. Surfacing the gap makes "fresh feed but zero
        // inserted" debuggable instead of mysterious.
        if (written < batch.length) {
          raceDeduped += batch.length - written;
        }
      }

      return { inserted, skipped, raceDeduped };
    }

    const {
      inserted: itemsInserted,
      skipped: itemsSkipped,
      raceDeduped: itemsRaceDeduped,
    } = await processItems(allItems);

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
      clustersCreated: number;
      singletons: number;
      matchedExisting: number;
      itemsIgnored: number;
      clusterErrors: { title: string; error: string }[];
    }

    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
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
        matchedExisting: 0,
        itemsIgnored: 0,
        clusterErrors: [],
      };

      // Load story-match candidates ONCE — the adult article pool. Kid
      // articles aren't matched against here because the unified feed
      // produces both adult and kid from the same cluster, so a kid-side
      // story match would create a false dedupe against an adult article
      // that happens to share keywords.
      const storyMatchStart = Date.now();
      const candidates = await loadStoryMatchCandidates(service);
      const storyMatchMs = Date.now() - storyMatchStart;

      // Pull recently-fetched pending items.
      const cutoffIso = new Date(Date.now() - SIX_HOURS_MS).toISOString();
      const { data: pendingRows, error: pendingErr } = await service
        .from('discovery_items')
        .select('id, raw_title, metadata')
        .eq('state', 'pending')
        .gte('fetched_at', cutoffIso)
        .order('fetched_at', { ascending: false });
      if (pendingErr) {
        summary.clusterErrors.push({
          title: '[load-pending]',
          error: `discovery_items pending lookup failed: ${pendingErr.message}`,
        });
        return { summary, durationMs: Date.now() - audienceStart, storyMatchMs };
      }

      const rows = pendingRows ?? [];
      summary.itemsConsidered = rows.length;
      if (rows.length === 0) {
        return { summary, durationMs: Date.now() - audienceStart, storyMatchMs };
      }

      // Build cluster input. Items without a usable title become singletons
      // (preCluster handles 0-keyword articles), but we keep them in the input
      // so their state isn't disturbed.
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

      for (const cluster of clusters) {
        try {
          const match = findBestMatch(cluster.keywords, candidates, storyMatchThresholdPct);
          const itemIds = cluster.articles.map((a) => a.id);

          if (match.matchedArticleId) {
            // Existing-story duplicate: mark items 'ignored', no cluster row.
            const updateRes = await service
              .from('discovery_items')
              .update({ state: 'ignored', updated_at: new Date().toISOString() })
              .in('id', itemIds);
            if (updateRes.error) {
              throw new Error(`mark-ignored failed: ${updateRes.error.message}`);
            }
            summary.matchedExisting += 1;
            summary.itemsIgnored += itemIds.length;
            continue;
          }

          // Net-new story: insert feed_clusters row, then link items.
          // audience defaults to 'adult' for back-compat with the cluster
          // mutation RPCs (require_audience checks on move/merge/split).
          // The UI no longer surfaces this column — operators pick adult vs
          // kid at generation time.
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

      return { summary, durationMs: Date.now() - audienceStart, storyMatchMs };
    }

    const clusterRun = await clusterPool();

    // 11. Mark run completed
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAtMs;
    const itemsCreated = itemsInserted;
    const itemsProcessed = allItems.length;
    const skippedDuplicates = itemsSkipped;
    const output: Json = {
      feedsSucceeded,
      feedsFailed,
      itemsInserted,
      itemsSkipped,
      itemsRaceDeduped, // M6 — surface concurrent-ingest dedup count
      clustering: clusterRun.summary,
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

    // 12. Audit log — best-effort via SECDEF RPC on cookie-scoped client
    await recordAdminAction({
      action: 'newsroom.ingest.run',
      targetTable: 'pipeline_runs',
      targetId: runId,
      newValue: {
        itemsCreated,
        durationMs,
        clustersCreated: clusterRun.summary.clustersCreated,
        matchedExisting: clusterRun.summary.matchedExisting,
      },
    });

    // 13. Response
    return NextResponse.json({
      ok: true,
      runId,
      feedsSucceeded,
      feedsFailed,
      totalScanned: itemsProcessed,
      itemsInserted,
      skippedDuplicates,
      raceDeduped: itemsRaceDeduped, // M6 — visibility on concurrent-ingest collisions
      durationMs,
      clustering: clusterRun.summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const stack = err instanceof Error ? (err.stack ?? null) : null;
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAtMs;
    console.error('[newsroom.ingest.run] run failed:', message);
    captureWithRedact(err);

    await service
      .from('pipeline_runs')
      .update({
        status: 'failed',
        error_message: message,
        error_stack: stack,
        completed_at: completedAt.toISOString(),
        duration_ms: durationMs,
      })
      .eq('id', runId);

    return NextResponse.json({ error: 'Ingest run failed' }, { status: 500 });
  }
}
