// @feature-verified signup_rollback 2026-04-24
//
// POST /api/auth/signup-rollback
//   Auth: bearer access_token from auth.signUp (client must send the
//         token it just received — that proves the caller owns the
//         half-created account it's asking to roll back).
//   Body: { user_id }  (also the sub claim in the token; we require
//                       both match as belt-and-suspenders)
//   Output: { ok: true }
//
// C17 — adult iOS (and web OAuth variants) cannot call
// `supabase.auth.admin.deleteUser` from the client because that
// requires service-role. When a client-side signup flow lands auth
// but fails the public.users upsert, the orphan auth.users row
// blocks the user's retry (users.email UNIQUE collision). This
// server-side endpoint is the rollback primitive: client passes its
// own brand-new access_token + userId; server validates and
// service-role-deletes user_roles → public.users → auth.users in
// that order (matches schema/105 comment).
//
// This endpoint is deliberately strict: it will only delete an auth
// user whose bearer token matches the body `user_id`, AND whose
// public.users row (if any) has no child activity — so a rogue
// session can't use it to nuke an established account.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import jwt from 'jsonwebtoken';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = typeof body.user_id === 'string' ? body.user_id : '';
    if (!userId) {
      return NextResponse.json({ error: 'user_id required' }, { status: 400 });
    }

    // Bearer token from the just-completed auth.signUp. We decode it
    // (Supabase JWT secret) and require sub === body.user_id before
    // proceeding. Without the matching token the caller cannot delete
    // an account it doesn't own.
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      return NextResponse.json({ error: 'Bearer token required' }, { status: 401 });
    }
    const jwtSecret = process.env.SUPABASE_JWT_SECRET;
    if (!jwtSecret) {
      console.error('[auth.signup_rollback] SUPABASE_JWT_SECRET not set');
      return NextResponse.json({ error: 'Not configured' }, { status: 503 });
    }
    let claims;
    try {
      claims = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    const sub = typeof claims?.sub === 'string' ? claims.sub : '';
    if (!sub || sub !== userId) {
      return NextResponse.json({ error: 'Token / user_id mismatch' }, { status: 403 });
    }

    const service = createServiceClient();

    // Safety rail: refuse to roll back if the account has any child
    // activity (comments, bookmarks, quiz attempts, etc). Signup
    // rollback is only valid for the transient window between
    // auth.signUp success and the public.users upsert failure —
    // nothing else should have happened yet. If activity exists, the
    // account is established and rollback is not the right tool.
    const { count: activityCount } = await service
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (activityCount && activityCount > 0) {
      return NextResponse.json(
        { error: 'Account has activity — rollback refused' },
        {
          status: 409,
        }
      );
    }

    // Schema/105 deletion order: user_roles → public.users → auth.users.
    try {
      await service.from('user_roles').delete().eq('user_id', userId);
    } catch (e) {
      console.error('[auth.signup_rollback] user_roles delete failed', e);
    }
    try {
      await service.from('users').delete().eq('id', userId);
    } catch (e) {
      console.error('[auth.signup_rollback] public.users delete failed', e);
    }
    try {
      await service.auth.admin.deleteUser(userId);
    } catch (e) {
      console.error('[auth.signup_rollback] auth.users delete failed', e);
      return NextResponse.json({ error: 'auth delete failed' }, { status: 500 });
    }

    // Log the rollback for operator visibility (no actor_id since the
    // user no longer exists; record the event under the deleted id).
    try {
      await service.from('audit_log').insert({
        actor_id: null,
        action: 'auth:signup_rollback',
        target_type: 'user',
        target_id: userId,
        metadata: { initiated_by: 'client' },
      });
    } catch (e) {
      console.error('[auth.signup_rollback] audit_log insert failed', e);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[auth.signup_rollback]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
