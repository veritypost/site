// Server-side error reporter. Writes to error_logs via the service
// client. Never throws — a logging failure must not mask the real
// error. Call with the error and free-form context.
//
// Usage inside a route:
//   import { reportError } from '@/lib/errorReport';
//   try { ... } catch (err) {
//     await reportError(err, { source: 'server', route: '/api/foo', userId });
//     throw err; // or return 500
//   }

import { createServiceClient } from '@/lib/supabase/server';

export async function reportError(err, ctx = {}) {
  try {
    const service = createServiceClient();
    await service.from('error_logs').insert({
      severity: ctx.severity || 'error',
      source: ctx.source || 'server',
      route: ctx.route || null,
      message: (err && err.message) || String(err) || 'Unknown error',
      stack: err && err.stack ? String(err.stack).slice(0, 8000) : null,
      user_id: ctx.userId || null,
      session_id: ctx.sessionId || null,
      user_agent: ctx.userAgent || null,
      ip_address: ctx.ip || null,
      metadata: ctx.metadata || {},
    });
  } catch {
    // Swallow — logging failures never mask the original error.
  }
}
