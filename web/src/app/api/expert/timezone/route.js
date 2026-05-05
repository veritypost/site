// EXPERT_THREADS Wave 4a — POST /api/expert/timezone
//
// Auto-populates `users.timezone` from the browser's IANA TZ on first
// render of the Quiet hours editor. Calls the SECURITY DEFINER RPC
// `ensure_user_timezone` which only writes when the column is NULL —
// subsequent calls with a different TZ are no-ops, so the user keeps
// the manually-confirmed value.
//
// Body: { tz: string } — IANA tz id, max 64 chars (RPC enforces).
//
// Auth: bearer/cookie required. Caller_id is the auth user; the RPC's
// p_uid arg is set from `user.id` server-side so a malicious client can't
// write someone else's row.

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';
import { checkRateLimit } from '@/lib/rateLimit';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

// Cheap shape gate — IANA names are alnum + '/' + '_' + '-' + '+' (rare).
// 64 chars matches the RPC's bound.
const TZ_RX = /^[A-Za-z0-9_+\-/]{1,64}$/;

export async function POST(request) {
  const supabase = createClient();
  let user;
  try {
    user = await requireAuth(supabase);
  } catch (err) {
    return NextResponse.json(
      { error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' },
      { status: err?.status ?? 401, headers: NO_STORE }
    );
  }

  // Light per-user rate limit — first-render fire + occasional refresh
  // banner accept; spam is a sign of a buggy client.
  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `expert.timezone:${user.id}`,
    policyKey: 'expert_timezone_save',
    max: 20,
    windowSec: 3600,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests.' },
      { status: 429, headers: { 'Retry-After': '3600', ...NO_STORE } }
    );
  }

  const b = await request.json().catch(() => ({}));
  const tz = typeof b.tz === 'string' ? b.tz.trim() : '';
  if (!TZ_RX.test(tz)) {
    return NextResponse.json(
      { error: 'tz must be an IANA timezone identifier.' },
      { status: 400, headers: NO_STORE }
    );
  }

  const { error: rpcErr } = await supabase.rpc('ensure_user_timezone', {
    p_uid: user.id,
    p_tz: tz,
  });

  if (rpcErr) {
    console.error('[expert.timezone.rpc]', rpcErr?.message || rpcErr);
    return safeErrorResponse(NextResponse, rpcErr, {
      route: 'expert.timezone',
      fallbackStatus: 400,
      headers: NO_STORE,
    });
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
