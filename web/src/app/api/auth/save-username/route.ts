// [S3-Q2-e] /api/auth/save-username — set the authed user's
// username with an atomic UNIQUE-violation → 409 contract.
//
// PATCH { username: string } → 200 { ok: true } on success
//                              → 401 if not authed
//                              → 400 on bad input
//                              → 403 if username already set on the account
//                              → 409 on UNIQUE race
//                              → 500 on RPC error
//
// Why this endpoint when WelcomeModal could call the
// `update_own_profile` RPC directly: iOS needs a stable contract (see
// Q2-f published in /api/auth/send-magic-link/route.js header). The
// PATCH shape with a 409 race signal is what AuthViewModel.handleDeepLink
// expects to surface "taken — try another" without inspecting Postgres
// error codes. WelcomeModal POSTs here too so web + iOS share one path.
//
// Reserved username + format checks happen here too so iOS doesn't
// have to duplicate the regex.
//
// Item 10 — username lock: once an account has a non-empty username,
// self-rename is rejected. The route short-circuits with an explicit 403
// (instead of letting the RPC's 42501 fall through to the catch-all 500)
// so iOS can show "Username already set on this account." and call
// auth.loadUser() to dismiss the picker sheet on a cross-device
// first-pick race. Admin renames go through /api/admin/users/[id], not
// here. The RPC and users_protect_columns trigger enforce the same lock
// at the DB layer (see 2026-05-01_lock_username_in_update_own_profile.sql
// and 2026-05-01_protect_users_username.sql).

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

  // Defense-in-depth: short-circuit before hitting the RPC so iOS doesn't
  // see 42501 mapped through the P0002 retry loop in AuthViewModel.swift:639.
  // Returns explicit 403 with copy iOS can show as "Username already set on
  // this account." instead of the generic 500 from the catch-all below.
  // Admins are allowed through (the RPC and trigger both bypass via
  // is_admin_or_above() / service-role); this route is the user-facing
  // first-pick contract, so admins shouldn't normally reach it after pick.
  const { data: existing } = await service
    .from('users')
    .select('username')
    .eq('id', user.id)
    .maybeSingle();
  if (existing?.username && existing.username !== '') {
    const { data: isAdmin, error: adminCheckError } = await userClient.rpc('is_admin_or_above');
    if (adminCheckError) {
      return NextResponse.json(
        { error: 'Could not verify account permissions. Please try again.' },
        { status: 500, headers: NO_STORE }
      );
    }
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Username already set on this account.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
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
