// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/cronHeartbeat';
import { safeErrorResponse } from '@/lib/apiErrors';

const CRON_NAME = 'recompute-family-achievements';

// Auth: CRON_SECRET via verifyCronAuth. Fail-closed 403.
// Sweeps every active verity_family owner, recomputes criteria-based
// family achievements, stamps earned_at on newly satisfied ones. Daily
// cadence — the lag is acceptable. (Pre-T319 also swept
// verity_family_xl, retired 2026-04-27.)
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Pin to 60s — daily sweep over active family owners; RPC-bounded work.
export const maxDuration = 60;

async function run(request) {
  // Cron auth — must verify CRON_SECRET header before any work; see
  // web/src/lib/cronAuth.js for the timing-safe compare history.
  if (!verifyCronAuth(request).ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  await logCronHeartbeat(CRON_NAME, 'start');
  try {
    const service = createServiceClient();
    const { data, error } = await service.rpc('recompute_family_achievements');
    if (error) {
      await logCronHeartbeat(CRON_NAME, 'error', { error: error.message });
      return safeErrorResponse(NextResponse, error, {
        route: 'cron.recompute_family_achievements',
        fallbackStatus: 500,
      });
    }
    await logCronHeartbeat(CRON_NAME, 'end', data && typeof data === 'object' ? data : {});
    return NextResponse.json({ ...data, ran_at: new Date().toISOString() });
  } catch (err) {
    await logCronHeartbeat(CRON_NAME, 'error', { error: err?.message || String(err) });
    throw err;
  }
}

export const GET = withCronLog('recompute-family-achievements', run);
export const POST = withCronLog('recompute-family-achievements', run);
