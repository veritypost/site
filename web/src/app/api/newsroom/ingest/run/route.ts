/**
 * F7 Phase 2 Task 9 — /api/newsroom/ingest/run
 *
 * POST handler for the admin "Refresh feeds" button. Fetches all active
 * RSS feeds, deduplicates against discovery_items/kid_discovery_items by
 * raw_url, and inserts new pending rows for the pipeline orchestrator
 * (Task 10) to pick up.
 *
 * Ported from snapshot: verity-post-pipeline-snapshot/src/app/api/ingest/route.js
 * Differences from snapshot:
 *   - Writes to discovery_items / kid_discovery_items (not scanned_articles)
 *   - Splits by feeds.audience at ingest time (kid vs adult discovery)
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
import * as Sentry from '@sentry/nextjs';
import type { Database, Json } from '@/types/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

type DiscoveryInsert = Database['public']['Tables']['discovery_items']['Insert'];
type KidDiscoveryInsert = Database['public']['Tables']['kid_discovery_items']['Insert'];
type FeedRow = Pick<
  Database['public']['Tables']['feeds']['Row'],
  'id' | 'url' | 'source_name' | 'audience' | 'feed_type'
> & { name?: string | null };

interface FlatItem {
  feed_id: string;
  audience: string;
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

export async function POST() {
  // 1. Permission gate
  let actor;
  try {
    const supabase = createClient();
    actor = await requirePermission('admin.pipeline.run_ingest', supabase);
  } catch (err) {
    return permissionError(err);
  }
  const actorId = actor.id as string;

  const service = createServiceClient();

  // 2. Kill switch
  const enabled = await isIngestEnabled(service);
  if (!enabled) {
    return NextResponse.json({ error: 'Ingestion disabled' }, { status: 503 });
  }

  // 3. Rate limit — DB policy drives effective max/window via policyKey
  const rl = await checkRateLimit(service, {
    key: `newsroom_ingest:user:${actorId}`,
    policyKey: 'newsroom_ingest',
    max: 5,
    windowSec: 600,
  });
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '600' } }
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
    Sentry.captureException(runErr ?? new Error('pipeline_runs insert returned no row'));
    return NextResponse.json({ error: 'Could not start ingest run' }, { status: 500 });
  }
  const runId = runRow.id as string;

  // 5. Main body — on any throw, mark run failed and return 500
  try {
    // 6. Fetch active feeds (rss/feed types only)
    const { data: feedsData, error: feedsErr } = await service
      .from('feeds')
      .select('id,url,source_name,audience,feed_type,name')
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
            audience: feed.audience,
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

    // 9. Split by audience
    const adultItems = allItems.filter((i) => i.audience === 'adult');
    const kidItems = allItems.filter((i) => i.audience === 'kid');

    // 10. Dedup + insert per target table
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    async function processAudience<TInsert extends DiscoveryInsert | KidDiscoveryInsert>(
      items: FlatItem[],
      table: 'discovery_items' | 'kid_discovery_items'
    ): Promise<{ inserted: number; skipped: number }> {
      if (items.length === 0) return { inserted: 0, skipped: 0 };

      // Dedup query in batches of 100
      const existingUrls = new Set<string>();
      const urls = items.map((i) => i.raw_url);
      for (let i = 0; i < urls.length; i += 100) {
        const batch = urls.slice(i, i + 100);
        const { data: existing, error: existErr } = await service
          .from(table)
          .select('raw_url')
          .in('raw_url', batch);
        if (existErr) {
          throw new Error(`${table} dedup lookup failed: ${existErr.message}`);
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

      if (fresh.length === 0) return { inserted: 0, skipped };

      // Map to insert rows
      const rows: TInsert[] = fresh.map((it) => {
        const row: DiscoveryInsert = {
          feed_id: it.feed_id,
          raw_url: it.raw_url,
          raw_title: it.raw_title,
          raw_body: null,
          raw_published_at: it.pubDate ? new Date(it.pubDate).toISOString() : null,
          state: 'pending',
          metadata: { outlet: it.outlet, excerpt: it.excerpt } as Json,
        };
        return row as TInsert;
      });

      // Upsert in batches of 500
      let inserted = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const query =
          table === 'discovery_items'
            ? service
                .from('discovery_items')
                .upsert(batch as DiscoveryInsert[], {
                  onConflict: 'raw_url',
                  ignoreDuplicates: true,
                })
                .select('id')
            : service
                .from('kid_discovery_items')
                .upsert(batch as KidDiscoveryInsert[], {
                  onConflict: 'raw_url',
                  ignoreDuplicates: true,
                })
                .select('id');
        const { data: insData, error: insErr } = await query;
        if (insErr) {
          throw new Error(`${table} upsert failed: ${insErr.message}`);
        }
        inserted += (insData ?? []).length;
      }

      return { inserted, skipped };
    }

    const { inserted: adultInserted, skipped: adultSkipped } =
      await processAudience<DiscoveryInsert>(adultItems, 'discovery_items');
    const { inserted: kidInserted, skipped: kidSkipped } =
      await processAudience<KidDiscoveryInsert>(kidItems, 'kid_discovery_items');

    // 11. Mark run completed
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAtMs;
    const itemsCreated = adultInserted + kidInserted;
    const itemsProcessed = allItems.length;
    const skippedDuplicates = adultSkipped + kidSkipped;
    const output: Json = {
      feedsSucceeded,
      feedsFailed,
      adultInserted,
      kidInserted,
      adultSkipped,
      kidSkipped,
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
      })
      .eq('id', runId);
    if (updateErr) {
      console.error('[newsroom.ingest.run] run update failed:', updateErr.message);
      Sentry.captureException(updateErr);
    }

    // 12. Audit log — best-effort via SECDEF RPC on cookie-scoped client
    await recordAdminAction({
      action: 'newsroom.ingest.run',
      targetTable: 'pipeline_runs',
      targetId: runId,
      newValue: { itemsCreated, durationMs },
    });

    // 13. Response
    return NextResponse.json({
      ok: true,
      runId,
      feedsSucceeded,
      feedsFailed,
      totalScanned: itemsProcessed,
      adultInserted,
      kidInserted,
      skippedDuplicates,
      durationMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const stack = err instanceof Error ? (err.stack ?? null) : null;
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAtMs;
    console.error('[newsroom.ingest.run] run failed:', message);
    Sentry.captureException(err);

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
