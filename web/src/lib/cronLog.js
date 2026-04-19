import { createServiceClient } from '@/lib/supabase/server';
import { captureException, captureMessage } from '@/lib/observability';

// DA-140 — pre-Chunk-10 cron runs produced no durable trace. A failed
// `/api/cron/send-push` was discovered the next day when users
// reported no push. This wrapper records every cron run (success and
// failure) into `webhook_log` with `source='cron'` and surfaces
// failures to Sentry via observability.
//
// Schema reuse: webhook_log (reset_and_rebuild_v2.sql:221) carries
// source/event_type/event_id/payload/processing_status/
// processing_duration_ms/processing_error fields. Populating these
// with `source='cron'` and `event_id='cron:{name}:{started_iso}'`
// sidesteps the need for a new migration (owner directive for
// Chunk 10).
//
// Probe responses (HTTP 401 / 403 from an attacker or misconfigured
// cron secret) are NOT logged — the row would be a fake "run" and
// would flood the log. Only real runs (secret verified, handler
// executed) get a webhook_log entry.

export function withCronLog(name, handler) {
  return async function wrappedCronHandler(request, context) {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();

    let response;
    let caught;
    try {
      response = await handler(request, context);
    } catch (err) {
      caught = err;
    }
    const durationMs = Date.now() - t0;
    const statusCode = caught ? 500 : (response?.status ?? 200);

    // Treat 401/403 as probes — no durable record, no Sentry line.
    // Let the response pass through untouched.
    if (!caught && (statusCode === 401 || statusCode === 403)) {
      return response;
    }

    const service = createServiceClient();
    try {
      await service.from('webhook_log').insert({
        source: 'cron',
        event_type: `cron:${name}`,
        event_id: `cron:${name}:${startedAt}`,
        payload: {
          cron: name,
          started_at: startedAt,
          duration_ms: durationMs,
          status_code: statusCode,
        },
        processing_status: caught ? 'failed' : (statusCode >= 500 ? 'failed' : 'processed'),
        processing_error: caught
          ? (caught.message || String(caught))
          : (statusCode >= 500 ? `non-2xx status ${statusCode}` : null),
        processing_duration_ms: durationMs,
        processed_at: new Date().toISOString(),
        signature_valid: true,
      });
    } catch (err) {
      // Observability should never block the job. Log and move on.
      console.error(`[cron:${name}] webhook_log insert failed:`, err?.message || err);
    }

    if (caught) {
      await captureException(caught, { cron: name, duration_ms: durationMs });
      throw caught;
    }
    if (statusCode >= 500) {
      await captureMessage(
        `cron ${name} returned ${statusCode}`,
        'error',
        { cron: name, duration_ms: durationMs, status_code: statusCode }
      );
    } else if (durationMs > 30_000) {
      await captureMessage(
        `cron ${name} completed in ${durationMs}ms`,
        'warning',
        { cron: name, duration_ms: durationMs }
      );
    }
    return response;
  };
}
