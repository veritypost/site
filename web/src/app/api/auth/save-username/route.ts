// [S3-Q2-e] /api/auth/save-username — set the authed user's
// username with an atomic UNIQUE-violation → 409 contract.
//
// PATCH { username: string } → 200 { ok: true } on success
//                              → 401 if not authed
//                              → 400 on bad input
//                              → 409 on UNIQUE race
//                              → 500 on RPC error
//
// Why this endpoint when the web pick-username page already calls
// the `update_own_profile` RPC directly: iOS needs a stable contract
// (see Q2-f published in /api/auth/send-magic-link/route.js header).
// The PATCH shape with a 409 race signal is what
// AuthViewModel.handleDeepLink expects to surface "taken — try
// another" without inspecting Postgres error codes.
//
// Reserved username + format checks happen here too so iOS doesn't
// have to duplicate the regex.

import { NextResponse } from 'next/server';
import {
  createClient,
  createClientFromToken,
  createServiceClient,
} from '@/lib/supabase/server';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

const USERNAME_RE = /^[a-z0-9_]+$/;

// Resolve a user-scoped Supabase client. Bearer (iOS) wins; falls
// back to the cookie-scoped client (web). The user-scoped client is
// what the `update_own_profile` RPC needs — it reads `auth.uid()`
// from the JWT, which the service-role client can't supply.
async function resolveUserClient(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return createClientFromToken(token);
  }
  return createClient();
}

export async function PATCH(request: Request) {
  const userClient = await resolveUserClient(request);
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401, headers: NO_STORE });
  }

  let payload: { username?: unknown } = {};
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: NO_STORE });
  }

  const raw = typeof payload.username === 'string' ? payload.username.trim().toLowerCase() : '';
  if (!raw || raw.length < 3 || raw.length > 20 || !USERNAME_RE.test(raw)) {
    return NextResponse.json(
      { error: 'Username must be 3–20 characters using letters, numbers, or underscores.' },
      { status: 400, headers: NO_STORE }
    );
  }

  // Reserved-name check pre-flight via service-role (the
  // `reserved_usernames` table isn't readable by the anon role).
  // Returning 409 for reserved keeps the iOS error path uniform —
  // "taken just now" is the single retry signal regardless of
  // whether the name is taken or reserved.
  const service = createServiceClient();
  const { data: reservedRow } = await service
    .from('reserved_usernames')
    .select('username')
    .eq('username', raw)
    .maybeSingle();
  if (reservedRow) {
    return NextResponse.json(
      { error: "That username isn't available — try another." },
      { status: 409, headers: NO_STORE }
    );
  }

  // Run the RPC under the user's auth context so `update_own_profile`
  // sees auth.uid(). The RPC enforces the same field allow-list as
  // every other update_own_profile call site.
  const { error: rpcError } = await userClient.rpc('update_own_profile', {
    p_fields: { username: raw },
  });

  if (rpcError) {
    if (rpcError.code === '23505') {
      return NextResponse.json(
        { error: 'That username was taken just now — pick another.' },
        { status: 409, headers: NO_STORE }
      );
    }
    console.error('[auth.save-username]', rpcError.message || rpcError);
    return NextResponse.json(
      { error: 'Could not save username. Please try again.' },
      { status: 500, headers: NO_STORE }
    );
  }

  return NextResponse.json({ ok: true }, { status: 200, headers: NO_STORE });
}
