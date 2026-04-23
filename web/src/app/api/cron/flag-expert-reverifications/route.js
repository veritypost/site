// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/observability';
import { safeErrorResponse } from '@/lib/apiErrors';

const CRON_NAME = 'flag-expert-reverifications';

// Auth: CRON_SECRET via verifyCronAuth. Fail-closed 403.
// Blueprint 2.4: annual expert re-verification. Weekly sweep flags
// approved experts whose credentials expire within 30 days, emails them,
// and stamps reverification_notified_at so we don't spam. Admins review
// via /admin/verification. No auto-revoke.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function run(request) {
  if (!verifyCronAuth(request).ok)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await logCronHeartbeat(CRON_NAME, 'start');
  try {
    const service = createServiceClient();
    const { data, error } = await service.rpc('flag_expert_reverifications_due', {
      p_warning_days: 30,
    });
    if (error) {
      await logCronHeartbeat(CRON_NAME, 'error', { error: error.message });
      return safeErrorResponse(NextResponse, error, {
        route: 'cron.flag_expert_reverifications',
        fallbackStatus: 500,
      });
    }
    await logCronHeartbeat(CRON_NAME, 'end', { flagged_count: data });
    return NextResponse.json({ flagged_count: data, ran_at: new Date().toISOString() });
  } catch (err) {
    await logCronHeartbeat(CRON_NAME, 'error', { error: err?.message || String(err) });
    throw err;
  }
}

export const GET = withCronLog('flag-expert-reverifications', run);
export const POST = withCronLog('flag-expert-reverifications', run);
