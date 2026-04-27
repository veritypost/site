/**
 * Phase 5 of AI + Plan Change Implementation — graduation token claim.
 *
 * POST /api/auth/graduate-kid/claim
 *   { token, email, password }
 *
 * Two-step flow handled here:
 *   1. Sign up the new adult `auth.users` row via Supabase Admin API
 *      (skip email-confirm since the parent already vetted the email).
 *   2. Call `claim_graduation_token(token, new_user_id)` RPC to consume
 *      the token and link the new user to the family + carry over kid
 *      categories.
 *
 * Returns the claim result so the client can render a "welcome" UX.
 *
 * Public route — no auth required (the token IS the auth here).
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function clientIp(request: Request): string | null {
  const fwd = request.headers.get('x-forwarded-for');
  return fwd ? fwd.split(',')[0].trim() : request.headers.get('x-real-ip');
}

export async function POST(request: Request) {
  let body: { token?: unknown; email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 422 });
  }

  if (typeof body.token !== 'string' || body.token.length < 16) {
    return NextResponse.json({ error: 'token required', code: 'token_required' }, { status: 400 });
  }
  if (typeof body.email !== 'string' || !EMAIL_RE.test(body.email.trim())) {
    return NextResponse.json(
      { error: 'valid email required', code: 'email_required' },
      { status: 400 }
    );
  }
  if (typeof body.password !== 'string' || body.password.length < 10) {
    return NextResponse.json(
      { error: 'password required (min 10 chars)', code: 'password_required' },
      { status: 400 }
    );
  }

  const email = body.email.trim().toLowerCase();
  const service = createServiceClient();

  // Pre-check: token exists, not consumed, not expired, email matches.
  // The RPC re-verifies but we want a clean error before creating the
  // auth.users row (which is harder to roll back).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tokenRow } = await (service.from('graduation_tokens' as any) as any)
    .select('token, intended_email, expires_at, consumed_at')
    .eq('token', body.token)
    .maybeSingle();
  if (!tokenRow) {
    return NextResponse.json({ error: 'Invalid token', code: 'token_not_found' }, { status: 404 });
  }
  const t = tokenRow as { intended_email: string; expires_at: string; consumed_at: string | null };
  if (t.consumed_at) {
    return NextResponse.json(
      { error: 'Token already used', code: 'token_consumed' },
      { status: 410 }
    );
  }
  if (new Date(t.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Token expired', code: 'token_expired' }, { status: 410 });
  }
  if (t.intended_email.toLowerCase() !== email) {
    return NextResponse.json(
      { error: 'Email does not match the address the parent provided', code: 'email_mismatch' },
      { status: 400 }
    );
  }

  // Create the new adult auth.users row. Supabase admin API skips the
  // confirm-email round-trip since the parent vetted the email already.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auth = (service as any).auth;
  if (!auth?.admin?.createUser) {
    return NextResponse.json(
      { error: 'Auth admin API unavailable', code: 'auth_admin_missing' },
      { status: 500 }
    );
  }
  const { data: created, error: createErr } = await auth.admin.createUser({
    email,
    password: body.password,
    email_confirm: true,
    user_metadata: {
      graduated_from_kid_app: true,
      graduation_ip: clientIp(request),
    },
  });
  if (createErr) {
    const msg = typeof createErr.message === 'string' ? createErr.message : 'create_user_failed';
    return NextResponse.json(
      {
        error: msg,
        code: /already.*registered|exists/i.test(msg) ? 'email_in_use' : 'create_user_failed',
      },
      { status: 400 }
    );
  }
  const newUserId = created?.user?.id as string | undefined;
  if (!newUserId) {
    return NextResponse.json(
      { error: 'Auth user creation returned no id', code: 'create_user_failed' },
      { status: 500 }
    );
  }

  // Consume the token + carry over categories.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = service.rpc as any;
  const { data: claimData, error: claimErr } = await rpc('claim_graduation_token', {
    p_token: body.token,
    p_new_user_id: newUserId,
  });
  if (claimErr) {
    // Best-effort cleanup: if the token claim fails, we should delete
    // the orphan auth.users row we just created. Otherwise the email
    // is squatted permanently.
    try {
      await auth.admin.deleteUser(newUserId);
    } catch (cleanupErr) {
      console.error('[graduate-kid.claim.cleanup]', cleanupErr);
    }
    return NextResponse.json(
      { error: claimErr.message, code: claimErr.code ?? 'claim_failed' },
      { status: 400 }
    );
  }
  const claimRow = Array.isArray(claimData) ? claimData[0] : claimData;

  return NextResponse.json({
    ok: true,
    user_id: newUserId,
    kid_profile_id: claimRow?.kid_profile_id ?? null,
    parent_user_id: claimRow?.parent_user_id ?? null,
    display_name: claimRow?.display_name ?? null,
  });
}
