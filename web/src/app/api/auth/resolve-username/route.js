// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

// POST { username } -> { email } | 404
//
// Calls the resolve_username_to_email SECURITY DEFINER RPC (migration
// 053) to look up the email for a given username so the login form can
// accept either. Rate-limited per IP to mitigate enumeration: 10 req /
// minute is generous for legitimate typing but will catch automated
// probes. Responses always return the same shape with fuzzy error
// copy — caller should combine with a consistent "Invalid credentials"
// message on subsequent signin failure.
//
// F-032 / F-033: migration 060 revokes EXECUTE on the RPC from anon
// and authenticated. This route now brokers access via the service
// client so the rate limit is enforceable; direct PostgREST calls from
// the browser fail.

export async function POST(request) {
  let payload = null;
  try { payload = await request.json(); } catch { /* noop */ }
  const raw = typeof payload?.username === 'string' ? payload.username.trim() : '';

  if (!raw || raw.length < 2 || raw.length > 50) {
    return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
  }

  const service = createServiceClient();

  const ip = await getClientIp();
  const hit = await checkRateLimit(service, {
    key: `resolve_username:ip:${ip}`,
    policyKey: 'resolve_username',
    max: 10,
    windowSec: 60,
  });
  if (hit.limited) {
    return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });
  }

  const { data: email, error } = await service.rpc('resolve_username_to_email', {
    p_username: raw,
  });

  if (error) {
    console.error('resolve_username_to_email RPC error', error);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }

  if (!email) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ email });
}
