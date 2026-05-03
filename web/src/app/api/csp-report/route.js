// H-05 — CSP violation sink. The middleware emits
// `Content-Security-Policy` (enforce mode, flipped 2026-04-21) with
// `report-uri /api/csp-report`; browsers POST violation payloads here.
//
// Rate limit: per-IP via shared DB-backed limiter (checkRateLimit).
// Max 30 reports per 60-second window per client IP; excess returns 204
// immediately (still accepted, not logged). Using DB-backed limiter so
// the cap is enforced across all serverless instances, not just per-instance.

import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { getRateLimitPolicy } from '@/lib/rateLimits';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const supabase = createServiceClient();
  const ip = await getClientIp();

  const policy = getRateLimitPolicy('CSP_REPORT_PER_IP');
  const hit = await checkRateLimit(supabase, {
    key: `csp_report:ip:${ip}`,
    policyKey: 'csp_report_per_ip',
    ...policy,
  });
  if (hit.limited) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const body = await req.text();
    console.warn('[csp-report]', body);
  } catch (err) {
    console.warn('[csp-report] failed to read body:', err?.message || err);
  }
  return new NextResponse(null, { status: 204 });
}
