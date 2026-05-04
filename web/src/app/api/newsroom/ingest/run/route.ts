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
import { preCluster, getClusterOverlapPct, type ClusterInputArticle } from '@/lib/pipeline/cluster';
import {
  findBestMatch,
  loadStoryMatchCandidates,
  getStoryMatchOverlapPct,
} from '@/lib/pipeline/story-match';
import { scrapeDiscovery, type DiscoveredArticle } from '@/lib/pipeline/scrape-discovery';
import { scrapeJson } from '@/lib/pipeline/scrape-json';
import { validateExtractionConfig } from '@/lib/pipeline/extraction-config';

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
  source_class: 'rss' | 'scrape_html' | 'scrape_json';
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

  // 5. Main body — on any throw, mark run failed and return 500
  try {
    // 6. Fetch active feeds across all four consumer types. The unified-feed
    // pivot dropped audience filtering — every active feed contributes to the
    // same discovery pool. The audience column stays in DB (defaulted to
    // 'adult') for back-compat with the cluster-mutation RPCs that still take
    // it as a defensive parameter.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serviceAny = service as any;
    const { data: feedsData, error: feedsErr } = await serviceAny
      .from('feeds')
      .select('id,url,source_name,feed_type,name,priority_weight,allowed_category_slugs,error_count,extraction_config,metadata')
      .eq('is_active', true)
      .is('deleted_at', null)
      .in('feed_type', ['feed', 'rss', 'scrape_html', 'scrape_json']);
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
    for (const f of feeds) {
      if (f.feed_type === 'feed' || f.feed_type === 'rss') rssFeeds.push(f);
      else if (f.feed_type === 'scrape_html') scrapeHtmlFeeds.push(f);
      else if (f.feed_type === 'scrape_json') scrapeJsonFeeds.push(f);
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
    let itemsFromRss = 0;
    let itemsFromScrapeHtml = 0;
    let itemsFromScrapeJson = 0;

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

    // 7d. Run all three consumer fanouts concurrently.
    await Promise.all([rssRun, scrapeHtmlRun, scrapeJsonRun]);

    // Restore the priority contract: RSS-found URLs win over scrape_html-found
    // URLs win over scrape_json-found URLs when the same raw_url appears in
    // multiple buckets. Within each bucket, items were pushed in
    // priority_weight-DESC order, which the stable sort (V8/Node) preserves.
    const SOURCE_CLASS_PRIORITY: Record<FlatItem['source_class'], number> = {
      rss: 0,
      scrape_html: 1,
      scrape_json: 2,
    };
    allItems.sort(
      (a, b) => SOURCE_CLASS_PRIORITY[a.source_class] - SOURCE_CLASS_PRIORITY[b.source_class]
    );

    // Aggregate counters preserved for back-compat with existing consumers
    // of the response/output_summary shape. unconfigured rows count toward
    // feedsSucceeded because they are intentionally polled-with-no-fetch
    // (last_polled_at advances, error_count untouched).
    const feedsSucceeded =
      rssSucceeded + scrapeHtmlSucceeded + scrapeJsonSucceeded + scrapeJsonUnconfigured;
    const feedsFailed = rssFailed + scrapeHtmlFailed + scrapeJsonFailed;

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
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

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
          if (!Number.isNaN(pubMs) && pubMs < oneDayAgo) {
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
    } = await processItems(dedupedItems);

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
      sourceClass: 'rss' | 'scrape_html' | 'scrape_json' | 'feed';
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
    };
    const itemsBySource = {
      rss: itemsFromRss,
      scrape_html: itemsFromScrapeHtml,
      scrape_json: itemsFromScrapeJson,
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
        feedsByType,
        itemsBySource,
      },
    });

    // 13. Response
    return NextResponse.json({
      ok: true,
      runId,
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
