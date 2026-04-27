/**
 * Ext-CCC.5 — daily cleanup for rate_limit_events.
 *
 * Each allowed call writes a row; nothing was trimming. With 7-day
 * retention the table stays bounded and existing rate-limit windows
 * (max 1 hour) remain intact.
 *
 * Calls public.cleanup_rate_limit_events(7) — schema/170. Auth via the
 * standard cron auth (x-vercel-cron header OR CRON_SECRET bearer).
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/cronHeartbeat';

const CRON_NAME = 'rate-limit-cleanup';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

async function run(request: Request) {
  // Cron auth — must verify CRON_SECRET header before any work; see
  // web/src/lib/cronAuth.js for the timing-safe compare history.
  if (!verifyCronAuth(request).ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  await logCronHeartbeat(CRON_NAME, 'start');

  const service = createServiceClient();
  let deleted = 0;
  let errMsg: string | null = null;

  try {
    const { data, error } = await (
      service.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>
      ) => Promise<{ data: number | null; error: { message: string } | null }>
    )('cleanup_rate_limit_events', { p_retention_days: 7 });
    if (error) errMsg = error.message;
    else deleted = data || 0;
  } catch (err) {
    errMsg = err instanceof Error ? err.message : String(err);
  }

  if (errMsg) {
    console.error('[cron.rate-limit-cleanup] cleanup_rate_limit_events failed:', errMsg);
    await logCronHeartbeat(CRON_NAME, 'error', { error: errMsg });
    return NextResponse.json({ ok: false, deleted: 0, error: 'Cleanup failed' });
  }

  await logCronHeartbeat(CRON_NAME, 'ok', { deleted });
  return NextResponse.json({ ok: true, deleted });
}

export const GET = withCronLog(CRON_NAME, run);
