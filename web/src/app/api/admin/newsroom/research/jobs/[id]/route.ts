/**
 * Wave 4 — Stream D Run Feed UI
 *
 * GET /api/admin/newsroom/research/jobs/:id
 *
 * Powers the 2s phase-label progress polling and the result-screen
 * counters. Returns the research_jobs row's status + phase + counters.
 *
 * Permission: admin.pipeline.run_ingest.
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { permissionError } from '@/lib/adminMutation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    await requirePermission('admin.pipeline.run_ingest', supabase);
  } catch (err) {
    return permissionError(err);
  }
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from('research_jobs')
    .select(
      'id, status, phase, request_body, started_at, finished_at, items_fetched, items_kept, stories_formed, stories_extended, error',
    )
    .eq('id', params.id)
    .maybeSingle();
  if (error) {
    console.error('[research.jobs.get]', error.message);
    return NextResponse.json({ error: 'Could not load job' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  return NextResponse.json({ job: data });
}
