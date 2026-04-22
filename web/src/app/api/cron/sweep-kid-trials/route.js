// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { safeErrorResponse } from '@/lib/apiErrors';

// D44: freeze kid trials past their 7-day window. Daily.
// Auth: CRON_SECRET via verifyCronAuth. Fail-closed 403.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function run(request) {
  if (!verifyCronAuth(request).ok)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { data, error } = await service.rpc('sweep_kid_trial_expiries');
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'cron.sweep_kid_trials',
      fallbackStatus: 500,
    });
  return NextResponse.json({ frozen_count: data, ran_at: new Date().toISOString() });
}

export const GET = withCronLog('sweep-kid-trials', run);
export const POST = withCronLog('sweep-kid-trials', run);
