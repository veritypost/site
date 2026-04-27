// @migrated-to-permissions 2026-04-26
// @feature-verified beta_cohort 2026-04-26
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/cronHeartbeat';
import { safeErrorResponse } from '@/lib/apiErrors';

const CRON_NAME = 'sweep-beta';

// Beta cohort sweeper. Behavior depends on settings.beta_active:
//   true  → clears any stale comped_until / verify_locked_at (re-enable case).
//   false → stamps comped_until = now() + beta_grace_days for verified beta
//           users; stamps verify_locked_at = now() for unverified beta users;
//           downgrades any beta user past their grace window to free.
// Auth: CRON_SECRET via verifyCronAuth. Fail-closed 403.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

async function run(request) {
  // Cron auth — must verify CRON_SECRET header before any work; see
  // web/src/lib/cronAuth.js for the timing-safe compare history.
  if (!verifyCronAuth(request).ok)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await logCronHeartbeat(CRON_NAME, 'start');
  try {
    const service = createServiceClient();
    const { data, error } = await service.rpc('sweep_beta_expirations');
    if (error) {
      await logCronHeartbeat(CRON_NAME, 'error', { error: error.message });
      return safeErrorResponse(NextResponse, error, {
        route: 'cron.sweep_beta',
        fallbackStatus: 500,
      });
    }
    await logCronHeartbeat(CRON_NAME, 'end', { result: data });
    return NextResponse.json({ result: data, ran_at: new Date().toISOString() });
  } catch (err) {
    await logCronHeartbeat(CRON_NAME, 'error', { error: err?.message || String(err) });
    throw err;
  }
}

export const GET = withCronLog('sweep-beta', run);
export const POST = withCronLog('sweep-beta', run);
