// [S3-Q2-e][S3-Q2b] Username availability check — session-scoped, boolean-only.
//
// Method: GET (?u=<name>) or POST ({ username }) for backward compat with
// transitional iOS callers. Both shapes return the SAME { available: boolean }
// — no `reserved` field, no taken-vs-reserved oracle. Reserved usernames
// (system handles, profanity, brand-protected) collapse to `available: false`
// at the API surface; the inline UX check is polish only — the DB UNIQUE
// constraint is the real enforcement at save time.
//
// Session-scoped (Q2b): anonymous calls 401. The pre-auth signup flow
// under magic-link has no use for a username check — username is picked
// in the post-signin /welcome/pick-username step (Q2-e), where the user
// already has a session. Rate limit is per-session.
//
// Drops:
// - `reserved` field — collapsed into `available: false`
// - per-IP anonymous access — replaced by per-session
// - `policyKey: 'check_username'` DB row — superseded by the
//   AUTH_USERNAME_CHECK_PER_SESSION code default in lib/rateLimits.ts

import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { getRateLimitPolicy } from '@/lib/rateLimits';
import { getUser } from '@/lib/auth';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

function badRequest() {
  return NextResponse.json({ error: 'Invalid username' }, { status: 400, headers: NO_STORE });
}

function unauthenticated() {
  return NextResponse.json({ error: 'Unauthenticated' }, { status: 401, headers: NO_STORE });
}

async function resolveUsername(request) {
  if (request.method === 'GET') {
    const u = new URL(request.url).searchParams.get('u');
    return typeof u === 'string' ? u.trim() : '';
  }
  let payload = null;
  try {
    payload = await request.json();
  } catch {
    return '';
  }
  return typeof payload?.username === 'string' ? payload.username.trim() : '';
}

async function handle(request) {
  const user = await getUser();
  if (!user) return unauthenticated();

  const raw = await resolveUsername(request);
  if (!raw || raw.length < 3 || raw.length > 20 || !/^[a-z0-9_]+$/.test(raw)) {
    return badRequest();
  }

  const service = createServiceClient();

  const policy = getRateLimitPolicy('AUTH_USERNAME_CHECK_PER_SESSION');
  const hit = await checkRateLimit(service, {
    key: `check_username:user:${user.id}`,
    policyKey: 'auth_username_check_per_session',
    ...policy,
  });
  if (hit.limited) {
    return NextResponse.json(
      { error: 'Too many attempts' },
      { status: 429, headers: { ...NO_STORE, 'Retry-After': String(policy.windowSec) } }
    );
  }

  try {
    const [{ data: reservedRow }, { data: takenRow }] = await Promise.all([
      service.from('reserved_usernames').select('username').eq('username', raw).maybeSingle(),
      service.from('users').select('id').eq('username', raw).maybeSingle(),
    ]);
    return NextResponse.json(
      { available: !reservedRow && !takenRow },
      { status: 200, headers: NO_STORE }
    );
  } catch (err) {
    console.error('[auth.check-username]', err);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500, headers: NO_STORE });
  }
}

export async function GET(request) {
  return handle(request);
}

export async function POST(request) {
  return handle(request);
}
