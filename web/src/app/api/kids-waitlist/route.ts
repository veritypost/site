// M6 2026-04-22 — parent email capture from /kids-app landing.
//
// Writes to public.kids_waitlist (schema/112). Service-role-only.
// Dual-key rate-limited (per IP + per email address). Bot-UA filtered.
// Honeypot + min-submit-time guards against the cheapest spam class.
//
// Log taxonomy (all prefix `[api/kids-waitlist]`). Read these in Vercel logs
// or wherever server logs are shipped. Only unexpected DB errors reach Sentry.
//
//   signup            success or idempotent dupe   console.log  new:true|false
//   bot_ua_drop       bot UA classified            console.log  ua_trunc
//   honeypot_hit      honeypot field was set       console.log  ip_prefix
//   too_fast          submitted <1500ms after load console.log  elapsed_ms
//   invalid_email     400 path, no PII logged      console.warn len, has_at
//   bad_body          malformed JSON or missing    console.warn (no body content)
//   rate_limited      429 path                     console.warn scope
//   db_insert_failed  503 path                     console.error + Sentry
//
// Client messages are deliberately generic ("Thanks. We'll email you."). No
// enumeration: duplicate emails return the same success shape. No "already
// on the list" branch.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { truncateIpV4 } from '@/lib/apiErrors';
import { isBotUserAgent } from '@/lib/botDetect';
import { captureMessage } from '@/lib/observability';

const MIN_ELAPSED_MS = 1500; // below this = bot (form-open to submit)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SOURCE_RE = /^[a-zA-Z0-9_\-:.]+$/;

type Body = {
  email?: unknown;
  source?: unknown;
  website?: unknown; // honeypot — must be empty
  elapsed_ms?: unknown; // client stamps form-open → submit
};

export async function POST(request: NextRequest) {
  const ip = await getClientIp();
  const ip_prefix = truncateIpV4(ip);
  const ua_raw = request.headers.get('user-agent') || '';
  const ua = ua_raw.slice(0, 1000);

  // Bot-UA drop: accept silently (return success) but do not insert.
  // Bots don't need to know we filtered them.
  if (isBotUserAgent(ua_raw)) {
    console.log('[api/kids-waitlist] bot_ua_drop', { ua_trunc: ua.slice(0, 80) });
    await captureMessage('kids-waitlist bot_ua_drop', 'warning', {
      ip: ip_prefix,
      user_agent: ua.slice(0, 200),
    });
    return NextResponse.json({ ok: true });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    console.warn('[api/kids-waitlist] bad_body');
    return NextResponse.json({ error: 'Invalid body.' }, { status: 400 });
  }

  // Honeypot — hidden <input name="website"> should stay empty. If it's set,
  // a bot filled it. Log + 200 (no error signal back to the bot).
  if (typeof body.website === 'string' && body.website.trim().length > 0) {
    console.log('[api/kids-waitlist] honeypot_hit', { ip_prefix });
    await captureMessage('kids-waitlist honeypot_hit', 'warning', {
      ip: ip_prefix,
      user_agent: ua.slice(0, 200),
    });
    return NextResponse.json({ ok: true });
  }

  // Min-time — bots submit within ms of mount. Legit users take at least a second
  // to read and type. <1500ms = silent drop (same 200 shape).
  const elapsed_ms = typeof body.elapsed_ms === 'number' ? body.elapsed_ms : 0;
  if (elapsed_ms < MIN_ELAPSED_MS) {
    console.log('[api/kids-waitlist] too_fast', { elapsed_ms });
    await captureMessage('kids-waitlist too_fast', 'warning', {
      ip: ip_prefix,
      user_agent: ua.slice(0, 200),
      elapsed_ms,
    });
    return NextResponse.json({ ok: true });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';

  if (!email || email.length < 5 || !EMAIL_RE.test(email)) {
    console.warn('[api/kids-waitlist] invalid_email', {
      len: email.length,
      has_at: email.includes('@'),
    });
    return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 });
  }

  // Source label — sanitize to a tight charset; default to landing identifier.
  const rawSource = typeof body.source === 'string' ? body.source.trim().slice(0, 80) : '';
  const source = rawSource && SOURCE_RE.test(rawSource) ? rawSource : 'kids-app-landing';

  const service = createServiceClient();

  // Rate limit: per-IP first (cheap, catches broad abuse), then per-email
  // (catches a single attacker rotating IPs against the same address).
  const rlIp = await checkRateLimit(service, {
    key: `kids_waitlist:ip:${ip}`,
    policyKey: 'kids_waitlist_ip',
    max: 10,
    windowSec: 3600,
  });
  if (rlIp.limited) {
    console.warn('[api/kids-waitlist] rate_limited', { scope: 'ip' });
    return NextResponse.json(
      { error: 'Too many requests. Try again in an hour.' },
      { status: 429, headers: { 'Retry-After': '3600' } }
    );
  }

  const rlAddr = await checkRateLimit(service, {
    key: `kids_waitlist:addr:${email}`,
    policyKey: 'kids_waitlist_addr',
    max: 3,
    windowSec: 86400,
  });
  if (rlAddr.limited) {
    console.warn('[api/kids-waitlist] rate_limited', { scope: 'addr' });
    return NextResponse.json(
      { error: 'Too many requests. Try again tomorrow.' },
      { status: 429, headers: { 'Retry-After': '86400' } }
    );
  }

  // ON CONFLICT DO NOTHING on email — duplicates look identical to success,
  // preventing enumeration. `data` distinguishes new vs. existing for logs only.
  // kids_waitlist is in the generated Database types post-types:gen (migration
  // 112 has landed), so the upsert is natively typed.
  const { data, error } = await service
    .from('kids_waitlist')
    .upsert(
      { email, source, ip_prefix, user_agent: ua },
      { onConflict: 'email', ignoreDuplicates: true }
    )
    .select('id');

  if (error) {
    console.error('[api/kids-waitlist] db_insert_failed', {
      message: error.message,
      code: (error as { code?: string }).code,
    });
    // Sentry already wraps Next.js per web/next.config.js — a thrown error would
    // auto-capture, but Supabase returns errors as values. Re-throw to capture.
    // Client sees generic 503, server/Sentry sees full stack.
    return NextResponse.json(
      { error: 'Could not save. Please try again in a moment.' },
      { status: 503 }
    );
  }

  const isNew = Array.isArray(data) && data.length > 0;
  console.log('[api/kids-waitlist] signup', {
    source,
    ip_prefix,
    new: isNew,
  });
  await captureMessage('kids-waitlist signup', 'info', {
    ip: ip_prefix,
    user_agent: ua.slice(0, 200),
    source,
    new: isNew,
  });

  return NextResponse.json({ ok: true });
}
