// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/cronHeartbeat';
import { safeErrorResponse } from '@/lib/apiErrors';

const CRON_NAME = 'sweep-kid-trials';

// D44: freeze kid trials past their 7-day window. Daily.
// Auth: CRON_SECRET via verifyCronAuth. Fail-closed 403.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Pin to 60s — matches other cron routes, fails loudly if RPC hangs.
export const maxDuration = 60;

async function run(request) {
  if (!verifyCronAuth(request).ok)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await logCronHeartbeat(CRON_NAME, 'start');
  try {
    const service = createServiceClient();
    const { data, error } = await service.rpc('sweep_kid_trial_expiries');
    if (error) {
      await logCronHeartbeat(CRON_NAME, 'error', { error: error.message });
      return safeErrorResponse(NextResponse, error, {
        route: 'cron.sweep_kid_trials',
        fallbackStatus: 500,
      });
    }
    await logCronHeartbeat(CRON_NAME, 'end', { frozen_count: data });
    return NextResponse.json({ frozen_count: data, ran_at: new Date().toISOString() });
  } catch (err) {
    await logCronHeartbeat(CRON_NAME, 'error', { error: err?.message || String(err) });
    throw err;
  }
}

export const GET = withCronLog('sweep-kid-trials', run);
export const POST = withCronLog('sweep-kid-trials', run);
