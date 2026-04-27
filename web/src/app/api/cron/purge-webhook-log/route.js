// @migrated-to-permissions 2026-04-27
// @feature-verified system_auth 2026-04-27
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/cronHeartbeat';
import { safeErrorResponse } from '@/lib/apiErrors';

const CRON_NAME = 'purge-webhook-log';

// T353 — runs daily. Calls purge_webhook_log() which hard-deletes rows
// older than 30 days. Stripe-idempotency only needs ~24h of recent
// events; 30d is the safety margin. Older rows were dead weight slowing
// the UNIQUE-constraint check on every new webhook delivery.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

async function run(request) {
  if (!verifyCronAuth(request).ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  await logCronHeartbeat(CRON_NAME, 'start');
  try {
    const service = createServiceClient();
    const { data, error } = await service.rpc('purge_webhook_log');
    if (error) {
      await logCronHeartbeat(CRON_NAME, 'error', { error: error.message });
      return safeErrorResponse(NextResponse, error, {
        route: 'cron.purge_webhook_log',
        fallbackStatus: 500,
      });
    }
    await logCronHeartbeat(CRON_NAME, 'end', { rows_deleted: data });
    return NextResponse.json({ rows_deleted: data, ran_at: new Date().toISOString() });
  } catch (err) {
    await logCronHeartbeat(CRON_NAME, 'error', { error: err?.message || String(err) });
    throw err;
  }
}

export const GET = withCronLog(CRON_NAME, run);
export const POST = withCronLog(CRON_NAME, run);
