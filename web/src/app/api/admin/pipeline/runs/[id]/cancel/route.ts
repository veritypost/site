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
 * a finally block that beat us. Generate's main finally now carries the same
 * `.eq('status','running')` guard (route.ts pipeline_runs UPDATE in finally
 * block c), so the asymmetry from Task 18 is closed — whichever path
 * terminalizes the row first wins, and the loser's UPDATE no-ops cleanly
 * without stomping cancel/cron-orphan state. Lock release + discovery reset
 * still run unconditionally because they are idempotent.
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
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';
import { captureWithRedact } from '@/lib/pipeline/redact';
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

  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid run id' }, { status: 400 });
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.pipeline.runs.cancel:${actor.id}`,
    policyKey: 'admin.pipeline.runs.cancel',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const { data: run, error: fetchErr } = await service
    .from('pipeline_runs')
    .select('id, status, pipeline_type, cluster_id, audience, started_at, input_params')
    .eq('id', params.id)
    .maybeSingle();

  if (fetchErr) {
    console.error('[admin.pipeline.runs.cancel.fetch]', fetchErr);
    captureWithRedact(fetchErr);
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
        output_summary: { cancelled_by_admin: true } as Json,
      })
      .eq('id', params.id)
      .eq('status', 'running');
  } catch (markErr) {
    console.error('[admin.pipeline.runs.cancel.mark]', markErr);
    captureWithRedact(markErr);
    return NextResponse.json({ error: 'Cancel failed' }, { status: 500 });
  }

  // Session A — derive audience_band from input_params.age_band (written
  // by generate at run start). Falls back to the legacy mapping if the
  // run predates that field: audience='adult' → 'adult', audience='kid'
  // without explicit age_band → 'kids'. A run with audience='kid' and no
  // captured age_band is conservatively treated as kids — mirrors the
  // generate route's effectiveAgeBand default.
  let audienceBand: 'adult' | 'tweens' | 'kids' | null = null;
  if (run.audience === 'adult') {
    audienceBand = 'adult';
  } else if (run.audience === 'kid') {
    const ip =
      run.input_params && typeof run.input_params === 'object' && !Array.isArray(run.input_params)
        ? (run.input_params as Record<string, unknown>)
        : {};
    const fromParams = typeof ip.age_band === 'string' ? ip.age_band : null;
    audienceBand =
      fromParams === 'tweens' || fromParams === 'kids' || fromParams === 'adult'
        ? (fromParams as 'tweens' | 'kids' | 'adult')
        : 'kids';
  }

  if (run.cluster_id && audienceBand) {
    try {
      await service.rpc('release_cluster_lock_v2', {
        p_cluster_id: run.cluster_id,
        p_audience_band: audienceBand,
        p_locked_by: params.id,
      });
    } catch (lockErr) {
      console.error('[admin.pipeline.runs.cancel.unlock]', lockErr);
    }
  }

  if (run.cluster_id && run.audience) {
    try {
      await service
        .from('discovery_items')
        .update({ state: 'clustered', updated_at: new Date().toISOString() })
        .eq('cluster_id', run.cluster_id)
        .eq('state', 'generating');
    } catch (stateErr) {
      console.error('[admin.pipeline.runs.cancel.state]', stateErr);
    }
  }

  // Session A — reset the audience-state row from 'generating' back to
  // 'pending' so the new Newsroom card returns to its idle state. Guard
  // with state='generating' so a generate finally that has already run
  // (and wrote 'failed') isn't clobbered.
  if (run.cluster_id && audienceBand) {
    try {
      await service
        .from('feed_cluster_audience_state')
        .update({ state: 'pending' })
        .eq('cluster_id', run.cluster_id)
        .eq('audience_band', audienceBand)
        .eq('state', 'generating');
    } catch (stateErr) {
      console.error('[admin.pipeline.runs.cancel.audience_state]', stateErr);
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
