// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { truncateIpV4 } from '@/lib/apiErrors';

// Client-side error sink. Called by app/error.js and app/global-error.js
// when the React tree throws. Anon-friendly (unauthenticated session
// errors still useful).
//
// F-069 — prior route had no rate limit. Any caller could flood
// error_logs with 2 KB messages + 8 KB stacks until the disk filled.
// Per-IP rate limit (60/min) lets real error storms through and
// drops abuse.
//
// F-139 — prior route stored the full x-forwarded-for IP. GDPR
// classifies IP addresses as personal data requiring lawful basis.
// Truncate to /24 so logs are useful for abuse correlation without
// pinpointing the device.
export async function POST(request) {
  const ip = await getClientIp();

  try {
    const service = createServiceClient();
    const rl = await checkRateLimit(service, {
      key: `errors:ip:${ip}`,
      policyKey: 'errors',
      max: 60,
      windowSec: 60,
    });
    if (rl.limited) {
      // Silently drop when limited — the client has no actionable
      // response and surfacing 429 would encourage error loops.
      return NextResponse.json({ ok: true, dropped: true });
    }
  } catch (err) {
    // T-073 — prior code fell through on catch, meaning a
    // `createServiceClient()` throw or a misconfigured env let an
    // unbounded request through. Fail closed here: drop the report.
    // The rate limiter itself already fail-closes on RPC errors, so
    // reaching this catch implies a bootstrap-level defect and
    // letting traffic through is worse than losing a few client
    // errors until the helper is restored.
    console.error('[api/errors] rate limit bootstrap failed, dropping:', err?.message || err);
    return NextResponse.json({ ok: true, dropped: true });
  }

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: true }); }

  const msg = typeof body?.message === 'string' ? body.message.slice(0, 2000) : 'Unknown client error';
  const stack = typeof body?.stack === 'string' ? body.stack.slice(0, 8000) : null;
  const route = typeof body?.route === 'string' ? body.route.slice(0, 200) : null;
  const severity = ['info', 'warning', 'error', 'fatal'].includes(body?.severity) ? body.severity : 'error';

  let userId = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id || null;
  } catch {}

  try {
    const service = createServiceClient();
    await service.from('error_logs').insert({
      severity,
      source: 'client',
      route,
      message: msg,
      stack,
      user_id: userId,
      user_agent: request.headers.get('user-agent')?.slice(0, 1000) || null,
      ip_address: truncateIpV4(ip),
      metadata: body?.metadata && typeof body.metadata === 'object' ? body.metadata : {},
    });
  } catch {
    // Logging the log failure would be circular.
  }
  return NextResponse.json({ ok: true });
}
