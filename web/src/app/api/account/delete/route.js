// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-18
import { NextResponse } from 'next/server';
import { createClient, createClientFromToken, createServiceClient } from '@/lib/supabase/server';
import { hasPermissionServer } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';

// Phase 19.2: user self-initiates account deletion. Schedules the
// 30-day grace timer + writes a data_requests row. Cron anonymizes
// after the timer expires.
//
// Auth: accepts either a same-origin cookie session (web) or a
// `Authorization: Bearer <access_token>` header (iOS). Mirrors the
// branch in /api/account/login-cancel-deletion.
//
// F-108 — the cookie-session branch is CSRF-sensitive (a destructive
// action taken under ambient auth). Next.js same-origin-by-default
// cookie policy mitigates most real cases, but a missing explicit
// origin check meant a crafted cross-origin form POST against a
// misconfigured deployment could pass. Enforce an origin allowlist
// on the cookie branch. Bearer branch skips the origin check because
// mobile clients do not send a trustworthy Origin.
function isAllowedOrigin(origin) {
  if (!origin) return false;
  const allowed = [
    process.env.NEXT_PUBLIC_SITE_URL,
    'http://localhost:3333',
    'https://veritypost.com',
    'https://www.veritypost.com',
  ].filter(Boolean).map((s) => {
    try { return new URL(s).origin; } catch { return null; }
  }).filter(Boolean);
  try {
    const probe = new URL(origin).origin;
    return allowed.includes(probe);
  } catch {
    return false;
  }
}

async function resolveAuth(request) {
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null;

  if (bearer) {
    const authClient = createClientFromToken(bearer);
    const { data: { user } } = await authClient.auth.getUser();
    return { user, authClient };
  }

  const origin = request.headers.get('origin');
  if (!isAllowedOrigin(origin)) {
    return { user: null, authClient: null };
  }
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  return { user, authClient };
}

export async function POST(request) {
  const { user, authClient } = await resolveAuth(request);
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const allowed = await hasPermissionServer('settings.data.request_deletion', authClient);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();

  // Rate-limit: 5 schedule-deletion attempts per hour per user. Prevents
  // an attacker with a stolen session cookie from thrashing the 30-day
  // timer (repeatedly rescheduling/cancelling can confuse the
  // grace-period state machine).
  const rate = await checkRateLimit(service, {
    key: `account-delete:${user.id}`,
    policyKey: 'account_delete',
    max: 5,
    windowSec: 3600,
  });
  if (rate.limited) {
    return NextResponse.json({ error: 'Too many deletion requests. Try again later.' }, { status: 429, headers: { 'Retry-After': '3600' } });
  }

  const { reason } = await request.json().catch(() => ({}));

  const { data, error } = await service.rpc('schedule_account_deletion', {
    p_user_id: user.id,
    p_reason: reason || null,
  });
  if (error) return safeErrorResponse(NextResponse, error, { route: 'account.delete', fallbackStatus: 400 });
  return NextResponse.json(data);
}

export async function DELETE(request) {
  const { user, authClient } = await resolveAuth(request);
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const allowed = await hasPermissionServer('settings.data.deletion.cancel', authClient);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const { data, error } = await service.rpc('cancel_account_deletion', {
    p_user_id: user.id,
  });
  if (error) return safeErrorResponse(NextResponse, error, { route: 'account.delete', fallbackStatus: 400 });
  return NextResponse.json({ cancelled: !!data });
}
