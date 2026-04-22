/**
 * F7 Phase 3 Task 12 — GET /api/admin/pipeline/runs/:id
 *
 * Admin observability: fetches a pipeline_runs row with its joined
 * pipeline_costs children. Computes totals (cost_usd, latency_ms,
 * tokens, cache hit ratio, retry counts) in the response. Read-only.
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { permissionError } from '@/lib/adminMutation';
import { captureWithRedact } from '@/lib/pipeline/redact';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// UUID v4 shape — defensive, avoids hitting DB on garbage ids
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  // 1. Perm gate (read-only)
  let actor;
  try {
    const supabase = createClient();
    actor = await requirePermission('admin.pipeline.runs.detail', supabase);
  } catch (err) {
    return permissionError(err);
  }
  void actor;

  const runId = params.id;
  if (!UUID_RE.test(runId)) {
    return NextResponse.json({ error: 'Invalid run id' }, { status: 400 });
  }

  const service = createServiceClient();

  // 2. Fetch run + children in one round-trip via PostgREST join.
  // FK `fk_pipeline_costs_pipeline_run_id` is the only FK on
  // pipeline_costs → pipeline_runs, so auto-detect resolves to it.
  const { data: run, error: runErr } = await service
    .from('pipeline_runs')
    .select(
      `
      *,
      pipeline_costs (
        id, step, model, provider,
        input_tokens, output_tokens, total_tokens,
        cache_read_input_tokens, cache_creation_input_tokens,
        cost_usd, latency_ms, success,
        error_type, error_message, retry_count,
        article_id, cluster_id, audience,
        created_at
      )
    `
    )
    .eq('id', runId)
    .maybeSingle();

  if (runErr) {
    console.error('[admin.pipeline.runs.detail]', runErr.message);
    captureWithRedact(runErr);
    return NextResponse.json({ error: 'Could not load run' }, { status: 500 });
  }
  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  const steps = ((run as Record<string, unknown>).pipeline_costs ?? []) as Array<{
    id: string;
    step: string;
    model: string;
    provider: string;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
    cost_usd: number | string; // numeric → string in some Supabase JSON paths
    latency_ms: number | null;
    success: boolean;
    error_type: string | null;
    error_message: string | null;
    retry_count: number;
    article_id: string | null;
    cluster_id: string | null;
    audience: string;
    created_at: string;
  }>;

  // 3. Compute totals (client-side — cheap, avoids another DB trip)
  let totalCostUsd = 0;
  let totalLatencyMs = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheRead = 0;
  let totalCacheCreation = 0;
  let retryCount = 0;
  let failureCount = 0;

  for (const s of steps) {
    const c = typeof s.cost_usd === 'string' ? Number.parseFloat(s.cost_usd) : s.cost_usd;
    if (Number.isFinite(c)) totalCostUsd += c;
    if (s.latency_ms != null) totalLatencyMs += s.latency_ms;
    totalInputTokens += s.input_tokens ?? 0;
    totalOutputTokens += s.output_tokens ?? 0;
    totalCacheRead += s.cache_read_input_tokens ?? 0;
    totalCacheCreation += s.cache_creation_input_tokens ?? 0;
    retryCount += s.retry_count ?? 0;
    if (!s.success) failureCount += 1;
  }

  const cacheInputTokens = totalCacheRead + totalCacheCreation;
  const cacheHitRatio = cacheInputTokens > 0 ? totalCacheRead / cacheInputTokens : 0;

  // Strip the joined children off the run payload — return them separately
  // for cleaner consumer shape
  const { pipeline_costs: _joined, ...runRow } = run as typeof run & {
    pipeline_costs?: unknown;
  };
  void _joined;

  return NextResponse.json({
    ok: true,
    run: runRow,
    steps: steps.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ),
    totals: {
      cost_usd: Number(totalCostUsd.toFixed(6)),
      latency_ms: totalLatencyMs,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      cache_read_input_tokens: totalCacheRead,
      cache_creation_input_tokens: totalCacheCreation,
      cache_hit_ratio: Number(cacheHitRatio.toFixed(4)),
      retry_count: retryCount,
      failure_count: failureCount,
      step_count: steps.length,
    },
  });
}
