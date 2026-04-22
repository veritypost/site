/**
 * F7 Phase 3 Task 17 — POST /api/admin/pipeline/runs/:id/retry
 *
 * Admin-triggered retry of a failed generate run. Re-constructs the request
 * body from the stored run's named columns (cluster_id, audience, provider,
 * model, freeform_instructions) and forwards to /api/admin/pipeline/generate
 * via internal same-origin fetch with the caller's cookie header. Generate
 * applies its own guards (kill switch, cost cap, rate limit, cluster lock)
 * and creates a new pipeline_runs row. Retry returns generate's response
 * shape plus `old_run_id` + `new_run_id` for the admin UI.
 *
 * Only runs with pipeline_type='generate' AND status='failed' are retryable.
 * Other types → 400. Other statuses → 409.
 *
 * Audit: pipeline_retry action recorded against the old run id; newValue
 * includes new_run_id + original_error_type for forensic context.
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';
import { captureWithRedact } from '@/lib/pipeline/redact';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// UUID v4 shape — defensive, avoids hitting DB on garbage ids
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  // 1. Perm gate (mutation — user client so RLS + session resolve the actor)
  let actor;
  try {
    const supabase = createClient();
    actor = await requirePermission('admin.pipeline.runs.retry', supabase);
  } catch (err) {
    return permissionError(err);
  }
  void actor;

  // 2. Validate id shape
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid run id' }, { status: 400 });
  }

  // 3. Load the failed run. error_type is read from the dedicated column
  // (migration 120 applied; the one-cycle output_summary stash was dropped).
  const service = createServiceClient();
  const { data: run, error: runErr } = await service
    .from('pipeline_runs')
    .select(
      'id, status, pipeline_type, cluster_id, audience, provider, model, freeform_instructions, error_type'
    )
    .eq('id', params.id)
    .maybeSingle();

  if (runErr) {
    console.error('[admin.pipeline.runs.retry]', runErr.message);
    captureWithRedact(runErr);
    return NextResponse.json({ error: 'Could not load run' }, { status: 500 });
  }
  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  // 4. Gate: retry applies only to failed generate runs with full params.
  if (run.pipeline_type !== 'generate') {
    return NextResponse.json({ error: 'Only generate runs can be retried' }, { status: 400 });
  }
  if (run.status !== 'failed') {
    return NextResponse.json({ error: 'Run is not failed' }, { status: 409 });
  }
  if (!run.cluster_id || !run.audience) {
    return NextResponse.json({ error: 'Run has insufficient params' }, { status: 422 });
  }

  // 5. Forward to generate route via internal same-origin fetch.
  // Cookie pass-through preserves the admin session so generate's own
  // requirePermission('admin.pipeline.generate') resolves against the same actor.
  const generateUrl = new URL('/api/admin/pipeline/generate', req.url);
  const cookieHeader = req.headers.get('cookie') ?? '';

  let response: Response;
  try {
    response = await fetch(generateUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify({
        cluster_id: run.cluster_id,
        audience: run.audience as 'adult' | 'kid',
        provider: (run.provider as 'anthropic' | 'openai' | null) ?? 'anthropic',
        model: run.model ?? 'claude-sonnet-4-6',
        ...(run.freeform_instructions ? { freeform_instructions: run.freeform_instructions } : {}),
      }),
    });
  } catch (fetchErr) {
    console.error('[admin.pipeline.runs.retry.fetch]', fetchErr);
    captureWithRedact(fetchErr);
    return NextResponse.json({ error: 'Retry dispatch failed' }, { status: 500 });
  }

  // Parse body safely — generate may return success, 4xx guard hit, or 5xx.
  let bodyJson: Record<string, unknown> = {};
  try {
    bodyJson = (await response.json()) as Record<string, unknown>;
  } catch {
    /* swallow — non-JSON body is surfaced via status code only */
  }
  const newRunId = typeof bodyJson.run_id === 'string' ? bodyJson.run_id : null;

  // 6. Extract original failure reason for audit forensics from the dedicated
  // error_type column (migration 120). Legacy output_summary stash is gone.
  const originalErrorType = run.error_type ?? null;

  // 7. Audit only when generate actually spawned a new run.
  if (response.ok && newRunId) {
    try {
      await recordAdminAction({
        action: 'pipeline_retry',
        targetTable: 'pipeline_runs',
        targetId: params.id,
        newValue: {
          new_run_id: newRunId,
          cluster_id: run.cluster_id,
          audience: run.audience,
          original_error_type: originalErrorType,
        },
      });
    } catch (auditErr) {
      console.error('[admin.pipeline.runs.retry.audit]', auditErr);
    }
  }

  // 8. Pass through generate's status + body; append old/new run ids for the UI.
  return NextResponse.json(
    { ...bodyJson, old_run_id: params.id, new_run_id: newRunId },
    { status: response.status }
  );
}
