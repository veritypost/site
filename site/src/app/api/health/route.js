import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// Production cutover health check. DB ping + env presence.
export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();
  const out = { ok: true, checks: {}, latency_ms: 0, ts: new Date().toISOString() };

  try {
    const service = createServiceClient();
    const { data, error } = await service.from('settings').select('key').limit(1);
    out.checks.db = error ? `err: ${error.message}` : 'ok';
    if (error) out.ok = false;
  } catch (err) {
    out.checks.db = `err: ${err.message}`;
    out.ok = false;
  }

  out.checks.stripe_secret = process.env.STRIPE_SECRET_KEY ? 'present' : 'missing';
  out.checks.stripe_webhook_secret = process.env.STRIPE_WEBHOOK_SECRET ? 'present' : 'missing';
  out.checks.resend_api_key = process.env.RESEND_API_KEY ? 'present' : 'missing';
  out.checks.cron_secret = process.env.CRON_SECRET ? 'present' : 'missing';

  out.latency_ms = Date.now() - started;
  return NextResponse.json(out, { status: out.ok ? 200 : 503 });
}
