import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/cronHeartbeat';
import { reconcileCostReservation } from '@/lib/pipeline/cost-reservation';

const CRON_NAME = 'reap-cost-reservations';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

async function run(request: Request) {
  if (!verifyCronAuth(request).ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  await logCronHeartbeat(CRON_NAME, 'start');

  const service = createServiceClient();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  let swept = 0;
  let released = 0;

  try {
    // Fetch all active reservations older than 1 hour (hard timeout safety net).
    const { data: agedRows, error: agedErr } = await service
      .from('pipeline_cost_reservations')
      .select('id, pipeline_run_id')
      .eq('status', 'active')
      .lt('created_at', oneHourAgo);

    if (agedErr) {
      console.error('[cron.reap-cost-reservations.aged_fetch]', agedErr.message);
      await logCronHeartbeat(CRON_NAME, 'error', { error: agedErr.message });
      return NextResponse.json({ swept: 0, released: 0, error: 'fetch_failed' });
    }

    // Fetch active reservations whose linked run is no longer 'running'.
    // Cast through unknown: PostgREST !inner join with a not-in filter on a
    // related table is not representable in the generated types; same pattern
    // as archive_cluster in pipeline-cleanup.
    type ReservationRow = { id: string; pipeline_run_id: string };
    const { data: staleRows, error: staleErr } = await (service as unknown as {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            not: (col: string, op: string, val: string) => {
              gte: (col: string, val: string) => Promise<{ data: ReservationRow[] | null; error: { message: string } | null }>;
            };
          };
        };
      };
    }).from('pipeline_cost_reservations').select(
      'id, pipeline_run_id, pipeline_runs!pipeline_cost_reservations_pipeline_run_id_fkey(status)',
    ).eq('status', 'active').not('pipeline_runs.status', 'in', '("running")').gte('created_at', oneHourAgo);

    if (staleErr) {
      console.error('[cron.reap-cost-reservations.stale_fetch]', staleErr.message);
    }

    // Deduplicate across both result sets.
    const seen = new Set<string>();
    const candidates: ReservationRow[] = [];
    for (const r of [...(agedRows ?? []), ...(staleRows ?? [])]) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        candidates.push({ id: r.id, pipeline_run_id: r.pipeline_run_id });
      }
    }

    swept = candidates.length;

    for (const row of candidates) {
      try {
        await reconcileCostReservation(row.pipeline_run_id);
        released += 1;
      } catch (rowErr) {
        console.error('[cron.reap-cost-reservations.reconcile]', row.pipeline_run_id, rowErr);
      }
    }
  } catch (err) {
    console.error('[cron.reap-cost-reservations]', err);
    await logCronHeartbeat(CRON_NAME, 'error', { error: String(err) });
    return NextResponse.json({ swept: 0, released: 0, error: 'sweep_failed' });
  }

  await logCronHeartbeat(CRON_NAME, 'end', { swept, released });
  return NextResponse.json({ swept, released });
}

export const GET = withCronLog(CRON_NAME, run);
