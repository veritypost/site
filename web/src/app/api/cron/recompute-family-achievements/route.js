// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';

// Auth: CRON_SECRET via verifyCronAuth. Fail-closed 403.
// Phase 17.1: sweeps every active verity_family / verity_family_xl owner,
// recomputes criteria-based family achievements, stamps earned_at on
// newly satisfied ones. Daily cadence — the lag is acceptable.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function run(request) {
  if (!verifyCronAuth(request).ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createServiceClient();
  const { data, error } = await service.rpc('recompute_family_achievements');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, ran_at: new Date().toISOString() });
}

export const GET = withCronLog('recompute-family-achievements', run);
export const POST = withCronLog('recompute-family-achievements', run);
