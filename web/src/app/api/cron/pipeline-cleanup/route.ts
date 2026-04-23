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
 *   2. Orphan discovery items: both discovery_items + kid_discovery_items
 *      rows stuck in state='generating' older than 10 min are reset to
 *      'clustered' so next ingest cycle can re-queue them. Generate's
 *      finally normally handles this reset; this sweep catches the case
 *      where the lambda was killed before its finally ran.
 *
 *   3. Orphan locks: feed_clusters rows where locked_at is older than
 *      15 minutes (> the RPC's 10-minute TTL + 5-minute grace) are
 *      cleared (locked_by/locked_at/generation_state → NULL). Double-
 *      insurance against release_cluster_lock failures.
 *
 *   4. Cluster expiry (Stage 3 / Stream 7): feed_clusters older than
 *      14 days that have NO articles or kid_articles referencing them
 *      (in any status — draft, review, published, archived) are soft-
 *      archived via the archive_cluster RPC with reason='auto_expired_14d'.
 *      Capped at 500/run to bound runtime. The "any status" filter is
 *      load-bearing: a draft article queued against a cluster keeps the
 *      cluster alive even before publish.
 *
 * Auth: verifyCronAuth (x-vercel-cron header OR CRON_SECRET bearer).
 * Response always 200 — per-sweep errors surface via console.error + cron
 * wrapper's Sentry capture, not via HTTP status (Vercel would retry on 5xx).
 *
 * Depends on migrations 116 + 120 + 126 (locked_* cols + error_type +
 * archive_cluster RPC / archived_at column). Until applied, updates fail
 * silently and the affected sweep no-ops — acceptable while the pipeline
 * is itself STAGED.
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/observability';

const CRON_NAME = 'pipeline-cleanup';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;

async function run(request: Request) {
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
      orphanRunsErrCode = 'orphan_runs_failed';
    } else {
      orphanRunsCount = data?.length ?? 0;
    }
  } catch (err) {
    console.error('[cron.pipeline-cleanup.orphan_runs]', err);
    orphanRunsErrCode = 'orphan_runs_failed';
  }

  // 2. Orphan discovery items (both audiences) — P1-A from adversary
  let orphanItemsCount = 0;
  let orphanItemsErrCode: string | null = null;
  for (const table of ['discovery_items', 'kid_discovery_items'] as const) {
    try {
      const { data, error } = await service
        .from(table)
        .update({ state: 'clustered', updated_at: now.toISOString() })
        .eq('state', 'generating')
        .lt('updated_at', thresholdIso)
        .select('id');
      if (error) {
        console.error(`[cron.pipeline-cleanup.orphan_items.${table}]`, error.message);
        orphanItemsErrCode = 'orphan_items_failed';
      } else {
        orphanItemsCount += data?.length ?? 0;
      }
    } catch (err) {
      console.error(`[cron.pipeline-cleanup.orphan_items.${table}]`, err);
      orphanItemsErrCode = 'orphan_items_failed';
    }
  }

  // 3. Orphan locks. Migration 116 has no `locked_until` column; lock expiry
  //    is computed from locked_at + TTL (default 600s in claim_cluster_lock
  //    RPC). Cron sweeps locks older than 15 min — exceeds RPC's TTL so we
  //    only catch truly stuck locks, not live ones mid-grace.
  const lockThresholdIso = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
  let orphanLocksCount = 0;
  let orphanLocksErrCode: string | null = null;
  try {
    const { data, error } = await service
      .from('feed_clusters')
      .update({ locked_by: null, locked_at: null, generation_state: null })
      .not('locked_at', 'is', null)
      .lt('locked_at', lockThresholdIso)
      .select('id');
    if (error) {
      console.error('[cron.pipeline-cleanup.orphan_locks]', error.message);
      orphanLocksErrCode = 'orphan_locks_failed';
    } else {
      orphanLocksCount = data?.length ?? 0;
    }
  } catch (err) {
    console.error('[cron.pipeline-cleanup.orphan_locks]', err);
    orphanLocksErrCode = 'orphan_locks_failed';
  }

  // 4. Cluster expiry (Stream 7 / Stage 3). Soft-archive feed_clusters
  //    that are >14d old AND have no referencing articles or kid_articles
  //    (in any status). Capped at 500/run to bound the per-sweep blast
  //    radius — a healthy queue should never approach this; the cap is
  //    a safety bound, not a steady-state expectation.
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
    // Two scans (articles + kid_articles) → union of in-use cluster_ids,
    // then filter feed_clusters by NOT IN that set. Doing this client-side
    // avoids a NOT IN subquery against PostgREST, which doesn't support
    // it cleanly across two source tables.
    const [adultRefs, kidRefs] = await Promise.all([
      service.from('articles').select('cluster_id').not('cluster_id', 'is', null),
      service.from('kid_articles').select('cluster_id').not('cluster_id', 'is', null),
    ]);
    if (adultRefs.error) throw adultRefs.error;
    if (kidRefs.error) throw kidRefs.error;

    const inUseIds = new Set<string>();
    for (const r of adultRefs.data ?? []) {
      if (r.cluster_id) inUseIds.add(r.cluster_id);
    }
    for (const r of kidRefs.data ?? []) {
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
        clustersArchivedErrCode = 'cluster_expiry_partial';
        continue;
      }
      clustersArchivedCount += 1;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cron.pipeline-cleanup.cluster_expiry]', msg);
    clustersArchivedErrCode = 'cluster_expiry_failed';
  }

  const errors = {
    orphan_runs: orphanRunsErrCode,
    orphan_items: orphanItemsErrCode,
    orphan_locks: orphanLocksErrCode,
    cluster_expiry: clustersArchivedErrCode,
  };
  const anyErr = Object.values(errors).some((e) => e !== null);
  const heartbeatPayload = {
    orphan_runs_cleaned: orphanRunsCount,
    orphan_items_cleaned: orphanItemsCount,
    orphan_locks_cleaned: orphanLocksCount,
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
    clusters_archived: clustersArchivedCount,
    errors,
  });
}

export const GET = withCronLog('pipeline-cleanup', run);
export const POST = withCronLog('pipeline-cleanup', run);
