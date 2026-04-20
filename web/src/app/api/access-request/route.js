// Round D H-19 — rate-limited access-request intake.
//
// The `access_requests` table ships with an intentionally permissive
// RLS policy: anon writes are the product (waitlist / invite requests).
// The advisor `rls_policy_always_true` flag is a deliberate posture
// documented in the attack plan, not a bug to close.
//
// Defence-in-depth therefore moves up the stack. This route wraps the
// anon insert with:
//   - per-IP rate limit (3 / hour — legitimate signup-flow retries
//     fit comfortably; bulk enumeration does not)
//   - field validation + length caps (no oversized payloads hitting PG)
//   - truncated IPv4 logging for abuse correlation (F-139 GDPR posture)
//   - user-agent capture (first 1000 chars) for the same reason
//
// Matches the helper shape used by the other anon-facing rate-limited
// routes (/api/errors, /api/auth/check-email, /api/ads/impression).

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { truncateIpV4 } from '@/lib/apiErrors';

export async function POST(request) {
  const ip = await getClientIp();
  const service = createServiceClient();

  const rl = await checkRateLimit(service, {
    key: `access_request:ip:${ip}`,
    policyKey: 'access_request',
    max: 3,
    windowSec: 3600,
  });
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests. Try again in an hour.' },
      { status: 429 },
    );
  }

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 120) : null;
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 1000) : null;
  const referral = typeof body?.referral_source === 'string' ? body.referral_source.trim().slice(0, 80) : null;
  const type = typeof body?.type === 'string' ? body.type.trim().slice(0, 40) : 'general';

  if (!email || !email.includes('@') || email.length < 5) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  const { error } = await service.from('access_requests').insert({
    email,
    name,
    reason,
    referral_source: referral,
    type,
    status: 'pending',
    ip_address: truncateIpV4(ip),
    user_agent: request.headers.get('user-agent')?.slice(0, 1000) || null,
  });

  if (error) {
    console.error('[api/access-request] insert failed:', error.message);
    return NextResponse.json({ error: 'Could not submit. Try again later.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
