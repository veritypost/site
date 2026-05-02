import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/cronHeartbeat';
import { safeErrorResponse } from '@/lib/apiErrors';

const CRON_NAME = 'expire-mutes';

// Daily cron that clears is_muted / mute_level / muted_until once muted_until
// has passed. Without this, the is_muted flag stays set forever; admin panels
// and any check that reads is_muted without a time-bound see stale mutes.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

async function run(request: Request) {
  if (!verifyCronAuth(request).ok)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await logCronHeartbeat(CRON_NAME, 'start');
  try {
    const service = createServiceClient();
    const { error } = await service.rpc('expire_elapsed_mutes');
    if (error) {
      await logCronHeartbeat(CRON_NAME, 'error', { error: error.message });
      return safeErrorResponse(NextResponse, error, {
        route: 'cron.expire_mutes',
        fallbackStatus: 500,
      });
    }
    await logCronHeartbeat(CRON_NAME, 'end');
    return NextResponse.json({ ran_at: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logCronHeartbeat(CRON_NAME, 'error', { error: msg });
    throw err;
  }
}

export const GET = withCronLog(CRON_NAME, run);
