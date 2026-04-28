/**
 * F7 Phase 3 Task 19 — GET /api/cron/pipeline-cleanup
 *
 * Daily (Hobby tier) safety net with four idempotent best-effort sweeps:
 *
 *   1. Orphan runs: pipeline_runs rows in status='running' older than 10 min
 *      are marked 'failed' with error_type='abort'. Threshold > generate's
 *      maxDuration=300s with 5-min grace buffer. duration_ms is left NULL —
 *      per-row compute would require an RPC (out of scope for this task).
 *
 *   2. Orphan discovery items: discovery_items rows stuck in state='generating'
 *      older than 10 min are reset to 'clustered' so next ingest cycle can
 *      re-queue them. Generate's finally normally handles this reset; this
 *      sweep catches the case where the lambda was killed before its finally
 *      ran. (Phase 1 of AI + Plan Change Implementation dropped
 *      kid_discovery_items; the unified discovery_items table covers both.)
 *
 *   3. Orphan locks: feed_clusters rows where locked_at is older than
 *      15 minutes (> the RPC's 10-minute TTL + 5-minute grace) are
 *      cleared (locked_by/locked_at/generation_state → NULL). Double-
 *      insurance against release_cluster_lock failures.
 *
 *   4. Cluster expiry (Stage 3 / Stream 7): feed_clusters older than
 *      14 days that have NO articles referencing them (in any status —
 *      draft, review, published, archived) are soft-archived via the
 *      archive_cluster RPC with reason='auto_expired_14d'. Capped at
 *      500/run to bound runtime. The "any status" filter is load-bearing:
 *      a draft article queued against a cluster keeps the cluster alive
 *      even before publish. Phase 1 consolidated kid runs into `articles`
 *      so a single scan covers both audiences.
 *
 * Auth: verifyCronAuth (x-vercel-cron header OR CRON_SECRET bearer).
 * Response always 200 — per-sweep errors surface via console.error + cron
 * wrapper's Sentry capture, not via HTTP status (Vercel would retry on 5xx).
 *
 * Depends on migrations 116 + 120 + 126 (locked_* cols + error_type +
 * archive_cluster RPC / archived_at column). Until applied, updates fail
 * silently and the affected sweep no-ops — acceptable while the pipeline
 * is itself STAGED.
 *
 * TODO(T241) — Source broken-link verification cron. Sources have no
 * expiry-checking today; URLs go stale silently. The proposed cron is a
 * weekly sweep (separate route from this one — schedule e.g. "0 7 * * 0")
 * that HEADs each `sources.url`, updates a `last_verified_at timestamptz`
 * column with now(), and stores the HTTP `status_code int`. Admin source-
 * list view then surfaces 4xx/5xx flagged rows for manual review. T5
 * schema halt blocks implementation until the two columns + an idempotent
 * backfill migration are approved:
 *
 *   alter table sources add column last_verified_at timestamptz;
 *   alter table sources add column status_code      int;
 *   create index sources_status_code_idx on sources (status_code) where status_code >= 400;
 *
 * Cron route would live at `web/src/app/api/cron/verify-sources/route.ts`
 * with cap = 500 URLs/run, 5s timeout per HEAD, AbortController, and the
 * same verifyCronAuth + logCronHeartbeat envelope as this file. Pair with
 * a vercel.json crons[] entry once shipped.
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/cronHeartbeat';
import { captureMessage } from '@/lib/observability';

const CRON_NAME = 'pipeline-cleanup';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// M12 — bumped from 15s. The 4 sweeps include a capped 500/run cluster
// archive loop that on a busy week can take 30s+ on its own; 15s gave
// no headroom for the 3 prior sweeps and risked a half-completed pass.
// 60s is the Vercel Hobby tier max and matches the other cron routes.
export const maxDuration = 60;

async function run(request: Request) {
  // Cron auth — must verify CRON_SECRET header before any work; see
  // web/src/lib/cronAuth.js for the timing-safe compare history.
  if (!verifyCronAuth(request).ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  await logCronHeartbeat(CRON_NAME, 'start');

  const service = createServiceClient();
  const now = new Date();
  const thresholdIso = new Date(now.getTime() - 10 * 60 * 1000).toISOString();

  // 1. Orphan runs
  let orphanRunsCount = 0;
  let orphanRunsErrCode: string | null = null;
  try {
    const { data, error } = await service
      .from('pipeline_runs')
      .update({
        status: 'failed',
        completed_at: now.toISOString(),
        error_message: 'Orphaned run — auto-cleanup',
        error_type: 'abort',
        // duration_ms intentionally NULL — per-row compute needs an RPC; acceptable.
      })
      .eq('status', 'running')
      .lt('started_at', thresholdIso)
      .select('id');
    if (error) {
      console.error('[cron.pipeline-cleanup.orphan_runs]', error.message);
      await captureMessage('pipeline-cleanup orphan_runs failed', 'warning', {
        error: String(error.message),
        sweep: 'orphan_runs',
        threshold_iso: thresholdIso,
      });
      orphanRunsErrCode = 'orphan_runs_failed';
    } else {
      orphanRunsCount = data?.length ?? 0;
    }
  } catch (err) {
    console.error('[cron.pipeline-cleanup.orphan_runs]', err);
    await captureMessage('pipeline-cleanup orphan_runs failed', 'warning', {
      error: String(err),
      sweep: 'orphan_runs',
      threshold_iso: thresholdIso,
    });
    orphanRunsErrCode = 'orphan_runs_failed';
  }

  // 2. Orphan discovery items — Phase 1 consolidated to discovery_items only
  let orphanItemsCount = 0;
  let orphanItemsErrCode: string | null = null;
  for (const table of ['discovery_items'] as const) {
    try {
      const { data, error } = await service
        .from(table)
        .update({ state: 'clustered', updated_at: now.toISOString() })
        .eq('state', 'generating')
        .lt('updated_at', thresholdIso)
        .select('id');
      if (error) {
        console.error(`[cron.pipeline-cleanup.orphan_items.${table}]`, error.message);
        await captureMessage('pipeline-cleanup orphan_items failed', 'warning', {
          error: String(error.message),
          sweep: 'orphan_items',
          table,
          threshold_iso: thresholdIso,
        });
        orphanItemsErrCode = 'orphan_items_failed';
      } else {
        orphanItemsCount += data?.length ?? 0;
      }
    } catch (err) {
      console.error(`[cron.pipeline-cleanup.orphan_items.${table}]`, err);
      await captureMessage('pipeline-cleanup orphan_items failed', 'warning', {
        error: String(err),
        sweep: 'orphan_items',
        table,
        threshold_iso: thresholdIso,
      });
      orphanItemsErrCode = 'orphan_items_failed';
    }
  }

  // 3. Orphan locks — Session A: now sweeps feed_cluster_locks (per-audience
  //    table) instead of feed_clusters.locked_by/locked_at. Lock expiry is
  //    computed from locked_at + TTL (default 600s in claim_cluster_lock_v2).
  //    Cron sweeps locks older than 15 min — exceeds the RPC's TTL so we
  //    only catch truly stuck locks, not live ones mid-grace. Legacy
  //    feed_clusters.locked_at columns are no longer written by any
  //    in-tree caller (Session E drops them); skipping them here is
  //    intentional.
  const lockThresholdIso = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
  let orphanLocksCount = 0;
  let orphanLocksErrCode: string | null = null;
  try {
    const { data, error } = await service
      .from('feed_cluster_locks')
      .delete()
      .lt('locked_at', lockThresholdIso)
      .select('cluster_id');
    if (error) {
      console.error('[cron.pipeline-cleanup.orphan_locks]', error.message);
      await captureMessage('pipeline-cleanup orphan_locks failed', 'warning', {
        error: String(error.message),
        sweep: 'orphan_locks',
        lock_threshold_iso: lockThresholdIso,
      });
      orphanLocksErrCode = 'orphan_locks_failed';
    } else {
      orphanLocksCount = data?.length ?? 0;
    }
  } catch (err) {
    console.error('[cron.pipeline-cleanup.orphan_locks]', err);
    await captureMessage('pipeline-cleanup orphan_locks failed', 'warning', {
      error: String(err),
      sweep: 'orphan_locks',
      lock_threshold_iso: lockThresholdIso,
    });
    orphanLocksErrCode = 'orphan_locks_failed';
  }

  // 3b. Orphan audience-state — Session A. Reset feed_cluster_audience_state
  //     rows stuck in 'generating' older than 10 min back to 'pending'.
  //     Guard: skip if a pipeline_run with that (cluster, audience) is still
  //     in 'running' status, so a slow run that hasn't terminalized yet
  //     doesn't get its card pulled out from under it.
  let orphanAudienceCount = 0;
  let orphanAudienceErrCode: string | null = null;
  try {
    const { data: stuck, error: stuckErr } = await service
      .from('feed_cluster_audience_state')
      .select('cluster_id, audience_band')
      .eq('state', 'generating')
      .lt('updated_at', thresholdIso);
    if (stuckErr) throw stuckErr;
    for (const row of stuck ?? []) {
      const audienceFilter = row.audience_band === 'adult' ? 'adult' : 'kid';
      const { count, error: liveErr } = await service
        .from('pipeline_runs')
        .select('id', { count: 'exact', head: true })
        .eq('cluster_id', row.cluster_id)
        .eq('audience', audienceFilter)
        .eq('status', 'running');
      if (liveErr) {
        orphanAudienceErrCode = 'orphan_audience_partial';
        continue;
      }
      if ((count ?? 0) > 0) continue;
      const { error: updErr } = await service
        .from('feed_cluster_audience_state')
        .update({ state: 'pending' })
        .eq('cluster_id', row.cluster_id)
        .eq('audience_band', row.audience_band)
        .eq('state', 'generating');
      if (updErr) {
        orphanAudienceErrCode = 'orphan_audience_partial';
        continue;
      }
      orphanAudienceCount += 1;
    }
  } catch (err) {
    console.error('[cron.pipeline-cleanup.orphan_audience]', err);
    await captureMessage('pipeline-cleanup orphan_audience failed', 'warning', {
      error: err instanceof Error ? err.message : String(err),
      sweep: 'orphan_audience',
      threshold_iso: thresholdIso,
    });
    orphanAudienceErrCode = 'orphan_audience_failed';
  }

  // 4. Cluster expiry (Stream 7 / Stage 3). Soft-archive feed_clusters
  //    that are >14d old AND have no referencing articles (in any status).
  //    Phase 1 consolidated kid runs into `articles` so a single scan
  //    covers both audiences. Capped at 500/run to bound the per-sweep
  //    blast radius — a healthy queue should never approach this; the cap
  //    is a safety bound, not a steady-state expectation.
  //
  //    The "any status" filter is critical. We check `cluster_id IS NOT
  //    NULL` only — we deliberately do NOT filter on articles.status,
  //    so a draft, review, or archived article queued against a cluster
  //    keeps it alive. Operators get the full 14-day window plus
  //    indefinite extension for any draft work-in-progress.
  const CLUSTER_EXPIRY_CAP = 500;
  const expiryThresholdIso = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  let clustersArchivedCount = 0;
  let clustersArchivedErrCode: string | null = null;
  try {
    // Single scan against articles → set of in-use cluster_ids, then filter
    // feed_clusters by NOT IN that set. Doing this client-side avoids a NOT
    // IN subquery against PostgREST.
    const articleRefs = await service
      .from('articles')
      .select('cluster_id')
      .not('cluster_id', 'is', null);
    if (articleRefs.error) throw articleRefs.error;

    const inUseIds = new Set<string>();
    for (const r of articleRefs.data ?? []) {
      if (r.cluster_id) inUseIds.add(r.cluster_id);
    }

    // Pull candidate clusters (>14d old, not yet archived, not actively
    // generating, not currently locked). Cap the read at CLUSTER_EXPIRY_CAP * 2
    // to leave headroom after the in-use filter.
    //
    // locked_at + generation_state guards: a cluster could be 14d+ old AND
    // have no articles yet AND be mid-generate (long pipeline run, retry
    // after failure, etc.). Without these guards the sweep races the
    // generator and archives a cluster whose run is about to write articles.
    const { data: candidates, error: candErr } = await service
      .from('feed_clusters')
      .select('id, locked_at, generation_state')
      .is('archived_at', null)
      .is('locked_at', null)
      .lt('created_at', expiryThresholdIso)
      .limit(CLUSTER_EXPIRY_CAP * 2);
    if (candErr) throw candErr;

    const toArchive: string[] = [];
    for (const c of candidates ?? []) {
      if (toArchive.length >= CLUSTER_EXPIRY_CAP) break;
      if (inUseIds.has(c.id)) continue;
      if ((c as { generation_state?: string | null }).generation_state === 'generating') continue;
      toArchive.push(c.id);
    }

    // archive_cluster is defined in migration 126; types/database.ts
    // hasn't been regenerated against it yet, so cast through `unknown`
    // — same pattern as adminMutation.requireAdminOutranks for
    // post-generation RPCs.
    type RpcFn = (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
    const rpcCall = service.rpc as unknown as RpcFn;
    for (const id of toArchive) {
      const { error: rpcErr } = await rpcCall('archive_cluster', {
        p_cluster_id: id,
        p_reason: 'auto_expired_14d',
      });
      if (rpcErr) {
        console.error('[cron.pipeline-cleanup.cluster_expiry.rpc]', id, rpcErr.message);
        await captureMessage('pipeline-cleanup cluster_expiry failed', 'warning', {
          error: String(rpcErr.message),
          sweep: 'cluster_expiry',
          stage: 'rpc',
          cluster_id: id,
          expiry_threshold_iso: expiryThresholdIso,
        });
        clustersArchivedErrCode = 'cluster_expiry_partial';
        continue;
      }
      clustersArchivedCount += 1;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cron.pipeline-cleanup.cluster_expiry]', msg);
    await captureMessage('pipeline-cleanup cluster_expiry failed', 'warning', {
      error: msg,
      sweep: 'cluster_expiry',
      stage: 'outer',
      expiry_threshold_iso: expiryThresholdIso,
    });
    clustersArchivedErrCode = 'cluster_expiry_failed';
  }

  const errors = {
    orphan_runs: orphanRunsErrCode,
    orphan_items: orphanItemsErrCode,
    orphan_locks: orphanLocksErrCode,
    orphan_audience: orphanAudienceErrCode,
    cluster_expiry: clustersArchivedErrCode,
  };
  const anyErr = Object.values(errors).some((e) => e !== null);
  const heartbeatPayload = {
    orphan_runs_cleaned: orphanRunsCount,
    orphan_items_cleaned: orphanItemsCount,
    orphan_locks_cleaned: orphanLocksCount,
    orphan_audience_cleaned: orphanAudienceCount,
    clusters_archived: clustersArchivedCount,
    errors,
  };
  // Per-sweep errors are logged but the route still returns 200 (Vercel would
  // retry on 5xx). Emit an 'error' heartbeat when any sweep errored so the
  // operator can see partial failures alongside the succeeded counters.
  await logCronHeartbeat(CRON_NAME, anyErr ? 'error' : 'end', heartbeatPayload);
  return NextResponse.json({
    ok: true,
    ran_at: now.toISOString(),
    orphan_runs_cleaned: orphanRunsCount,
    orphan_items_cleaned: orphanItemsCount,
    orphan_locks_cleaned: orphanLocksCount,
    orphan_audience_cleaned: orphanAudienceCount,
    clusters_archived: clustersArchivedCount,
    errors,
  });
}

export const GET = withCronLog('pipeline-cleanup', run);
export const POST = withCronLog('pipeline-cleanup', run);
