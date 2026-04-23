/**
 * Stream 7 / Stage 3 — Admin manual-trigger for the pipeline-cleanup cron.
 *
 * GET  → list recent cleanup runs (from webhook_log, source='cron',
 *        event_type='cron:pipeline-cleanup'), default 30-day window.
 * POST → run the cron handler now, server-side, with the configured
 *        CRON_SECRET injected. Surfaces the same JSON shape the cron
 *        scheduler sees.
 *
 * Both branches gate on `admin.pipeline.clusters.manage` (the same perm that
 * authorises archive_cluster from the Newsroom). Rate-limited via
 * `admin_pipeline_cleanup` policy (DB override available; falls back
 * to 6/3600s in code) — the cron runs daily; manual triggers shouldn't
 * exceed a handful per hour.
 *
 * The browser never sees CRON_SECRET. The POST handler builds an
 * internal Request to the cron route's exported handler so we don't
 * round-trip through the network or duplicate the sweep logic.
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';
import { GET as cronCleanupHandler } from '@/app/api/cron/pipeline-cleanup/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type CleanupRunRow = {
  id: string;
  started_at: string;
  duration_ms: number | null;
  status_code: number | null;
  processing_status: string | null;
  processing_error: string | null;
};

export async function GET(request: Request) {
  let user;
  try {
    user = await requirePermission('admin.pipeline.clusters.manage');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();

  const url = new URL(request.url);
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '30', 10) || 30, 1), 90);
  const cutoffIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data, error } = await service
      .from('webhook_log')
      .select(
        'id, payload, processing_status, processing_error, processing_duration_ms, created_at'
      )
      .eq('source', 'cron')
      .eq('event_type', 'cron:pipeline-cleanup')
      .gte('created_at', cutoffIso)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      console.error('[admin.pipeline.cleanup.list]', error.message);
      return NextResponse.json({ error: 'List failed' }, { status: 500 });
    }
    const runs: CleanupRunRow[] = (data ?? []).map((r) => {
      const payload = (r.payload ?? {}) as {
        started_at?: string;
        duration_ms?: number;
        status_code?: number;
      };
      return {
        id: r.id,
        started_at: payload.started_at ?? r.created_at ?? new Date(0).toISOString(),
        duration_ms: payload.duration_ms ?? r.processing_duration_ms ?? null,
        status_code: payload.status_code ?? null,
        processing_status: r.processing_status ?? null,
        processing_error: r.processing_error ?? null,
      };
    });
    return NextResponse.json({ runs, actor_id: user.id });
  } catch (err) {
    console.error('[admin.pipeline.cleanup.list.threw]', err);
    return NextResponse.json({ error: 'List failed' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let user;
  try {
    user = await requirePermission('admin.pipeline.clusters.manage');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();
  const rl = await checkRateLimit(service, {
    key: `admin_pipeline_cleanup:${user.id}`,
    policyKey: 'admin_pipeline_cleanup',
    max: 6,
    windowSec: 3600,
  });
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Rate limited. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.windowSec) } }
    );
  }

  // Build an internal Request that satisfies the cron route's
  // verifyCronAuth — bearer path with the configured CRON_SECRET.
  // The browser never receives this header; the server constructs it
  // here and discards after the call.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[admin.pipeline.cleanup.run] CRON_SECRET missing');
    return NextResponse.json({ error: 'Cleanup not configured' }, { status: 503 });
  }

  const internalReq = new Request(new URL(request.url).origin + '/api/cron/pipeline-cleanup', {
    method: 'GET',
    headers: { authorization: `Bearer ${secret}` },
  });

  let cronResponse: Response;
  try {
    cronResponse = await cronCleanupHandler(internalReq);
  } catch (err) {
    console.error('[admin.pipeline.cleanup.run.threw]', err);
    return NextResponse.json({ error: 'Cleanup run failed' }, { status: 500 });
  }

  let payload: unknown = null;
  try {
    payload = await cronResponse.clone().json();
  } catch {
    payload = null;
  }

  await recordAdminAction({
    action: 'pipeline_cleanup.manual_run',
    targetTable: 'webhook_log',
    targetId: null,
    reason: 'manual cleanup trigger',
    newValue: payload as Record<string, unknown> | null,
  });

  return NextResponse.json(
    { ok: cronResponse.ok, status: cronResponse.status, result: payload },
    { status: cronResponse.ok ? 200 : 502 }
  );
}
