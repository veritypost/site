/**
 * F7 Phase 3 Task 18 — POST /api/admin/pipeline/runs/:id/cancel
 *
 * SOFT cancel for an in-flight generate run. Marks pipeline_runs.status='failed'
 * with error_type='abort', releases the cluster lock best-effort, resets
 * discovery_items.state from 'generating' back to 'clustered'. The worker
 * continues its current LLM step — true mid-step abort would require status
 * polling between every callModel site in generate/route.ts (separate task).
 *
 * Race semantics: the UPDATE re-checks `status='running'` to avoid stomping
 * a finally block that beat us. If cancel fires first and generate's worker
 * later reaches its own finally, generate WILL overwrite (its finally is not
 * status-gated). This asymmetry is correct — generate's finally must complete
 * its bookkeeping (lock release, discovery reset, cost accounting) regardless.
 *
 * Audit: pipeline_cancel action recorded against the run id; newValue carries
 * was_status + was_started_at for forensic context.
 *
 * Depends on migration 120 (pipeline_runs.error_type column) — STAGED. Without
 * it, the UPDATE fails with column-not-found. Generate has the same dep at
 * route.ts:1581. Acceptable: pipeline is itself STAGED, no production traffic.
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';
import * as Sentry from '@sentry/nextjs';
import type { Json } from '@/types/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const userClient = createClient();

  let actor;
  try {
    actor = await requirePermission('admin.pipeline.runs.cancel', userClient);
  } catch (err) {
    return permissionError(err);
  }
  void actor;

  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid run id' }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: run, error: fetchErr } = await service
    .from('pipeline_runs')
    .select('id, status, pipeline_type, cluster_id, audience, started_at')
    .eq('id', params.id)
    .maybeSingle();

  if (fetchErr) {
    console.error('[admin.pipeline.runs.cancel.fetch]', fetchErr);
    Sentry.captureException(fetchErr);
    return NextResponse.json({ error: 'Could not load run' }, { status: 500 });
  }

  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  if (run.pipeline_type !== 'generate') {
    return NextResponse.json({ error: 'Only generate runs can be cancelled' }, { status: 400 });
  }

  if (run.status !== 'running') {
    return NextResponse.json({ error: 'Run is not running' }, { status: 409 });
  }

  const completedAt = new Date();
  const startedAtMs = new Date(run.started_at as string).getTime();
  const durationMs = completedAt.getTime() - startedAtMs;
  const ERROR_MSG = 'Cancelled by admin';
  const ERROR_TYPE = 'abort';

  try {
    await service
      .from('pipeline_runs')
      .update({
        status: 'failed',
        completed_at: completedAt.toISOString(),
        duration_ms: durationMs,
        error_message: ERROR_MSG,
        error_type: ERROR_TYPE,
        output_summary: { cancelled_by_admin: true, error_type: ERROR_TYPE } as unknown as Json,
      } as never)
      .eq('id', params.id)
      .eq('status', 'running');
  } catch (markErr) {
    console.error('[admin.pipeline.runs.cancel.mark]', markErr);
    Sentry.captureException(markErr);
    return NextResponse.json({ error: 'Cancel failed' }, { status: 500 });
  }

  if (run.cluster_id) {
    try {
      await service.rpc('release_cluster_lock', {
        p_cluster_id: run.cluster_id,
        p_locked_by: params.id,
      });
    } catch (lockErr) {
      console.error('[admin.pipeline.runs.cancel.unlock]', lockErr);
    }
  }

  if (run.cluster_id && run.audience) {
    const discoveryTable = run.audience === 'kid' ? 'kid_discovery_items' : 'discovery_items';
    try {
      await service
        .from(discoveryTable)
        .update({ state: 'clustered', updated_at: new Date().toISOString() })
        .eq('cluster_id', run.cluster_id)
        .eq('state', 'generating');
    } catch (stateErr) {
      console.error('[admin.pipeline.runs.cancel.state]', stateErr);
    }
  }

  try {
    await recordAdminAction({
      action: 'pipeline_cancel',
      targetTable: 'pipeline_runs',
      targetId: params.id,
      newValue: {
        cluster_id: run.cluster_id,
        audience: run.audience,
        soft_cancel: true,
        was_status: run.status,
        was_started_at: run.started_at,
      },
    });
  } catch (auditErr) {
    console.error('[admin.pipeline.runs.cancel.audit]', auditErr);
  }

  return NextResponse.json({
    ok: true,
    run_id: params.id,
    cancel_kind: 'soft',
    note: 'Worker may complete the current step before exiting',
  });
}
