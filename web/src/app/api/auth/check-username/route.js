// @migrated-to-permissions 2026-04-24
// @feature-verified system_auth 2026-04-24
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

// POST { username } -> { available: boolean, reserved: boolean }
//
// Tier 2 #18 — iOS signup previously ran two direct PostgREST queries
// (reserved_usernames.select + users.select) from the anon client with
// no rate limit, enabling trivial enumeration of every taken + reserved
// handle. The web signup already brokers these lookups through the
// server. iOS now routes here too.
//
// Gating: anon-callable (pre-auth). Rate limit is the only abuse control.
// 20 req / 60s per IP — generous for legitimate typing with the existing
// 300ms debounce, tight enough to ruin a crawler's economics.
//
// The response intentionally flattens "taken" and "reserved" into two
// booleans. No username is echoed back, no suggestion list is returned;
// the client already builds suggestions locally.

export async function POST(request) {
  let payload = null;
  try {
    payload = await request.json();
  } catch {
    /* noop */
  }
  const raw = typeof payload?.username === 'string' ? payload.username.trim() : '';

  if (!raw || raw.length < 3 || raw.length > 20 || !/^[a-z0-9_]+$/.test(raw)) {
    return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
  }

  const service = createServiceClient();

  const ip = await getClientIp();
  const hit = await checkRateLimit(service, {
    key: `check_username:ip:${ip}`,
    policyKey: 'check_username',
    max: 20,
    windowSec: 60,
  });
  if (hit.limited) {
    return NextResponse.json(
      { error: 'Too many attempts' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  try {
    const [{ data: reservedRow }, { data: takenRow }] = await Promise.all([
      service.from('reserved_usernames').select('username').eq('username', raw).maybeSingle(),
      service.from('users').select('id').eq('username', raw).maybeSingle(),
    ]);
    return NextResponse.json({
      available: !reservedRow && !takenRow,
      reserved: !!reservedRow,
    });
  } catch (err) {
    console.error('[auth.check-username]', err);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
}
