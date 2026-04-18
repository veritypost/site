import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';

// Phase 19.2: daily sweep that anonymizes every account whose 30-day
// deletion grace period has expired. Batch size is enforced inside the
// sweep RPC (LIMIT 500 per run).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function run(request) {
  if (!verifyCronAuth(request).ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createServiceClient();
  const { data, error } = await service.rpc('sweep_expired_deletions');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ anonymized_count: data, ran_at: new Date().toISOString() });
}

export const GET = withCronLog('process-deletions', run);
export const POST = withCronLog('process-deletions', run);
