/**
 * F7 Phase 3 Task 19 — GET /api/cron/pipeline-cleanup
 *
 * Every-5-min safety net with three idempotent best-effort sweeps:
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
 * Auth: verifyCronAuth (x-vercel-cron header OR CRON_SECRET bearer).
 * Response always 200 — per-sweep errors surface via console.error + cron
 * wrapper's Sentry capture, not via HTTP status (Vercel would retry on 5xx).
 *
 * Depends on migrations 116 + 120 (locked_* cols + error_type). Until applied,
 * updates fail silently and the cron no-ops — acceptable while the pipeline
 * is itself STAGED.
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;

async function run(request: Request) {
  if (!verifyCronAuth(request).ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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
      } as never)
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

  return NextResponse.json({
    ok: true,
    ran_at: now.toISOString(),
    orphan_runs_cleaned: orphanRunsCount,
    orphan_items_cleaned: orphanItemsCount,
    orphan_locks_cleaned: orphanLocksCount,
    errors: {
      orphan_runs: orphanRunsErrCode,
      orphan_items: orphanItemsErrCode,
      orphan_locks: orphanLocksErrCode,
    },
  });
}

export const GET = withCronLog('pipeline-cleanup', run);
export const POST = withCronLog('pipeline-cleanup', run);
