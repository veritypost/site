// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/cronHeartbeat';
import { safeErrorResponse } from '@/lib/apiErrors';

const CRON_NAME = 'freeze-grace';

// D40: freeze every user whose 7-day grace has expired. Runs hourly.
// Auth: CRON_SECRET via verifyCronAuth (timing-safe compare + x-vercel-cron).
// No user-session gate; fail-closed 403 on bad/missing secret.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Vercel default cron timeout is long; pin to 60s to fail loudly if the
// RPC misbehaves rather than letting a stuck call soak the serverless
// budget. 60s is Hobby-tier ceiling; bump to higher value on Pro once
// we measure real p99 runtime.
export const maxDuration = 60;

async function run(request) {
  if (!verifyCronAuth(request).ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  await logCronHeartbeat(CRON_NAME, 'start');
  try {
    const service = createServiceClient();
    const { data, error } = await service.rpc('billing_freeze_expired_grace');
    if (error) {
      await logCronHeartbeat(CRON_NAME, 'error', { error: error.message });
      return safeErrorResponse(NextResponse, error, {
        route: 'cron.freeze_grace',
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

export const GET = withCronLog('freeze-grace', run);
export const POST = withCronLog('freeze-grace', run);
