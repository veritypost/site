// Phase C — pipeline health observability.
//
// GET /api/admin/pipeline/health
// Permission gate: admin.pipeline.run_ingest (same as the manual ingest
// trigger — anyone who can run an ingest can see its history).
//
// All queries are scoped to pipeline_type='ingest'. The endpoint must NOT
// surface generate / cleanup / other pipeline rows because those have a
// finer-grained gate (admin.pipeline.runs.detail) and their error_message
// fields can include freeform LLM-prompt context that ingest-only
// operators have no permission to see.
//
// Returns (ingest pipeline only):
//   - recentRuns: most-recent 10 ingest pipeline_runs rows
//   - orphanReapedLast7d: count of orphan-reaped ingest runs in the last
//     7 days (status='failed' AND error_type='abort' AND
//     pipeline_type='ingest')
//   - currentlyRunning: count of ingest pipeline_runs rows in
//     status='running' (always 0 or 1 under the singleflight index)
//
// Used by the /admin/newsroom Discovery tab health pill and by future
// ops surfaces.
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { permissionError } from '@/lib/adminMutation';

export async function GET() {
  try {
    await requirePermission('admin.pipeline.run_ingest');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();

  const [recent, orphans, running] = await Promise.all([
    service
      .from('pipeline_runs')
      .select('id, pipeline_type, status, started_at, completed_at, duration_ms, items_created, error_message')
      .eq('pipeline_type', 'ingest')
      .order('started_at', { ascending: false })
      .limit(10),
    service
      .from('pipeline_runs')
      .select('id', { count: 'exact', head: true })
      .eq('pipeline_type', 'ingest')
      .eq('status', 'failed')
      .eq('error_type', 'abort')
      .gte('completed_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    service
      .from('pipeline_runs')
      .select('id', { count: 'exact', head: true })
      .eq('pipeline_type', 'ingest')
      .eq('status', 'running'),
  ]);

  if (recent.error) {
    return NextResponse.json({ error: recent.error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    recentRuns: recent.data ?? [],
    orphanReapedLast7d: orphans.count ?? 0,
    currentlyRunning: running.count ?? 0,
  });
}
