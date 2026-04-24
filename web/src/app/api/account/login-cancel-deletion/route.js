// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-18
import { NextResponse } from 'next/server';
import { createClient, createClientFromToken, createServiceClient } from '@/lib/supabase/server';

// Login-time auto-cancel for account deletions still inside the 30-day
// grace window (D40 / 027_phase19_deletion.sql). Silent welcome-back:
// the caller just logged in; if their deletion was pending, clear it.
//
// Called from two places:
//   - Web: inline service-client RPC call in /api/auth/login + /api/auth/callback
//     (they're already server routes, no extra HTTP hop needed). This endpoint
//     exists primarily for iOS, which authenticates directly via Supabase SDK
//     and has no web auth route to piggyback on.
//   - iOS: AuthViewModel.login() POSTs here with the session access token
//     after a successful signIn. Best-effort — failure does not block login.
//
// Idempotent: cancel_account_deletion RETURNs quietly when nothing is
// scheduled; the row-lock overhead is negligible. No 4xx leaks info about
// whether a deletion was or wasn't pending.
//
// CSRF: cookie branch (no bearer) mutates account state — mirror the
// /api/account/delete origin allowlist. Bearer branch skips the origin
// check because mobile clients don't send a trustworthy Origin.
function isAllowedOrigin(origin) {
  if (!origin) return false;
  const allowed = [
    process.env.NEXT_PUBLIC_SITE_URL,
    'http://localhost:3333',
    'https://veritypost.com',
    'https://www.veritypost.com',
  ].filter(Boolean);
  return allowed.includes(origin);
}

export async function POST(request) {
  try {
    const auth = request.headers.get('authorization') || '';
    const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null;

    if (!bearer) {
      const origin = request.headers.get('origin');
      if (!isAllowedOrigin(origin)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const authClient = bearer ? createClientFromToken(bearer) : await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const service = createServiceClient();
    const { data, error } = await service.rpc('cancel_account_deletion', {
      p_user_id: user.id,
    });
    if (error) {
      console.error('[account.login-cancel-deletion]', error.message);
      return NextResponse.json(
        { cancelled: false, error: 'Could not cancel deletion' },
        { status: 500 }
      );
    }
    return NextResponse.json({ cancelled: !!data });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
