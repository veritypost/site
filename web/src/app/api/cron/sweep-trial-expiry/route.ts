import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/cronHeartbeat';
import { safeErrorResponse } from '@/lib/apiErrors';

const CRON_NAME = 'sweep-trial-expiry';

// Daily cron that downgrades beta pro users whose trial clock has run out.
// Logic: coalesce(trial_extension_until, comped_until) < now() → drop to free.
// Null comped_until = no expiry (lifetime), skipped per plan spec.
// Auth: CRON_SECRET via verifyCronAuth. Fail-closed 403.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

async function run(request: Request) {
  if (!verifyCronAuth(request).ok)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await logCronHeartbeat(CRON_NAME, 'start');
  try {
    const service = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (service as any).rpc('sweep_trial_expiries');
    if (error) {
      await logCronHeartbeat(CRON_NAME, 'error', { error: error.message });
      return safeErrorResponse(NextResponse, error, {
        route: 'cron.sweep_trial_expiry',
        fallbackStatus: 500,
      });
    }
    await logCronHeartbeat(CRON_NAME, 'end', { downgraded_count: data });
    return NextResponse.json({ downgraded_count: data, ran_at: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logCronHeartbeat(CRON_NAME, 'error', { error: msg });
    throw err;
  }
}

export const GET = withCronLog(CRON_NAME, run);
export const POST = withCronLog(CRON_NAME, run);
