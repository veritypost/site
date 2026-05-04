/**
 * Wave 4 — Stream D Run Feed UI
 *
 * POST /api/admin/newsroom/research/jobs/:id/cancel
 *
 * Operator clicks Cancel on the inline progress view. We flip
 * research_jobs.status='cancelled'; the run handler reads the row
 * between phases (4 checkpoints) and aborts at the next one,
 * writing whatever items already landed plus the audit row.
 *
 * Idempotent — already-finished jobs return 409.
 *
 * Permission: admin.pipeline.run_ingest.
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
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

  const { data: existing, error: readErr } = await service
    .from('research_jobs')
    .select('id, status')
    .eq('id', params.id)
    .maybeSingle();
  if (readErr) {
    console.error('[research.jobs.cancel.read]', readErr.message);
    return NextResponse.json({ error: 'Could not load job' }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  if (existing.status !== 'running') {
    return NextResponse.json(
      { error: `Job is ${existing.status}, cannot cancel` },
      { status: 409 },
    );
  }

  const { error: updErr } = await service
    .from('research_jobs')
    .update({ status: 'cancelled' })
    .eq('id', params.id)
    .eq('status', 'running');
  if (updErr) {
    console.error('[research.jobs.cancel.update]', updErr.message);
    return NextResponse.json({ error: 'Could not cancel job' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'research.job.cancel',
    targetTable: 'research_jobs',
    targetId: params.id,
  });

  return NextResponse.json({ ok: true });
}
