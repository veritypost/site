// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
//
// Production cutover health check. DB ping only. Env-var enumeration was removed
// in Round 4 Track W - an unauthenticated attacker could map the backend config
// from the previous present/missing response shape. For an authenticated detailed
// probe, pass header x-health-token: <HEALTH_CHECK_SECRET>; matching requests get
// the full env-presence list, others get a bare { ok } + DB state.

import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const started = Date.now();
  const out = { ok: true, checks: {}, latency_ms: 0, ts: new Date().toISOString() };

  try {
    const service = createServiceClient();
    const { error } = await service.from('settings').select('key').limit(1);
    out.checks.db = error ? `err: ${error.message}` : 'ok';
    if (error) out.ok = false;
  } catch (err) {
    out.checks.db = `err: ${err.message}`;
    out.ok = false;
  }

  // M-03 — constant-time compare for x-health-token. Prior impl used
  // `===`, which leaks secret length/prefix via string-equality timing.
  const secret = process.env.HEALTH_CHECK_SECRET;
  const provided = req.headers.get('x-health-token') || '';
  let detailed = false;
  if (secret) {
    const a = Buffer.from(provided);
    const b = Buffer.from(secret);
    try {
      detailed = a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      detailed = false;
    }
  }

  if (detailed) {
    out.checks.stripe_secret = process.env.STRIPE_SECRET_KEY ? 'present' : 'missing';
    out.checks.stripe_webhook_secret = process.env.STRIPE_WEBHOOK_SECRET ? 'present' : 'missing';
    out.checks.resend_api_key = process.env.RESEND_API_KEY ? 'present' : 'missing';
    out.checks.cron_secret = process.env.CRON_SECRET ? 'present' : 'missing';
  }

  out.latency_ms = Date.now() - started;
  return NextResponse.json(out, { status: out.ok ? 200 : 503 });
}
