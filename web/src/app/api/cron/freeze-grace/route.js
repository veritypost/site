// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';

// D40: freeze every user whose 7-day grace has expired. Runs hourly.
// Auth: CRON_SECRET via verifyCronAuth (timing-safe compare + x-vercel-cron).
// No user-session gate; fail-closed 403 on bad/missing secret.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function run(request) {
  if (!verifyCronAuth(request).ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createServiceClient();
  const { data, error } = await service.rpc('billing_freeze_expired_grace');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ frozen_count: data, ran_at: new Date().toISOString() });
}

export const GET = withCronLog('freeze-grace', run);
export const POST = withCronLog('freeze-grace', run);
