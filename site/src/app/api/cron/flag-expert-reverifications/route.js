import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';

// Blueprint 2.4: annual expert re-verification. Weekly sweep flags
// approved experts whose credentials expire within 30 days, emails them,
// and stamps reverification_notified_at so we don't spam. Admins review
// via /admin/verification. No auto-revoke.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function run(request) {
  if (!verifyCronAuth(request).ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { data, error } = await service.rpc('flag_expert_reverifications_due', { p_warning_days: 30 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ flagged_count: data, ran_at: new Date().toISOString() });
}

export const GET = withCronLog('flag-expert-reverifications', run);
export const POST = withCronLog('flag-expert-reverifications', run);
