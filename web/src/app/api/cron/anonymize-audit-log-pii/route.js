// @migrated-to-permissions 2026-04-27
// @feature-verified system_auth 2026-04-27
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/cronHeartbeat';
import { safeErrorResponse } from '@/lib/apiErrors';

const CRON_NAME = 'anonymize-audit-log-pii';

// T352 — runs nightly. Calls anonymize_audit_log_pii() which NULLs
// actor_id + target_id and strips PII keys from metadata for rows older
// than 90 days where the action is in the PII-class set. Aggregate
// signals (action string + timestamp) survive for retention/analysis.
// GDPR data-minimization aligned.
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
    const { data, error } = await service.rpc('anonymize_audit_log_pii');
    if (error) {
      await logCronHeartbeat(CRON_NAME, 'error', { error: error.message });
      return safeErrorResponse(NextResponse, error, {
        route: 'cron.anonymize_audit_log_pii',
        fallbackStatus: 500,
      });
    }
    await logCronHeartbeat(CRON_NAME, 'end', { rows_anonymized: data });
    return NextResponse.json({ rows_anonymized: data, ran_at: new Date().toISOString() });
  } catch (err) {
    await logCronHeartbeat(CRON_NAME, 'error', { error: err?.message || String(err) });
    throw err;
  }
}

export const GET = withCronLog(CRON_NAME, run);
export const POST = withCronLog(CRON_NAME, run);
