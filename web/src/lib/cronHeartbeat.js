// Server-only cron heartbeat. Split out from lib/observability.js
// because observability.js is imported by ObservabilityInit.tsx
// (client component), and webpack's static-analysis pass was pulling
// `next/headers` (via @/lib/supabase/server) into the client bundle
// even though the supabase import was dynamic. Giving heartbeat its
// own module keeps the client graph clean.
//
// Y6 (cron observability): explicit phase markers (start/end/error) on
// top of the existing withCronLog wrapper. withCronLog writes one row
// per run with event_type='cron:NAME'; logCronHeartbeat writes
// event_type='cron:NAME:PHASE' rows so an operator can tell "fired but
// died early" from "never fired" from "fired clean" without inferring
// from a single end-of-run row.
//
// Insert is best-effort: any failure is swallowed (console.error only)
// so a webhook_log outage cannot bring down a cron job.

import { createServiceClient } from '@/lib/supabase/server';

export async function logCronHeartbeat(name, phase, payload) {
  try {
    const service = createServiceClient();
    await service.from('webhook_log').insert({
      source: 'cron',
      event_type: `cron:${name}:${phase}`,
      payload: payload ?? {},
    });
  } catch (err) {
    console.error(`[cron.heartbeat] cron:${name}:${phase} insert failed:`, err?.message || err);
  }
}
