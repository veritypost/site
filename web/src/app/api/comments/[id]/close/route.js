// EXPERT_THREADS Wave 3 — POST /api/comments/[id]/close
//
// Toggles `expert_thread_closed_at` on an expert-thread root comment.
//   default          → close_expert_thread (asker close, 60s cooldown)
//   ?action=reopen   → reopen_expert_thread (mod-only, sets last_reopen_at)
//
// Both RPCs are SECURITY DEFINER and enforce auth themselves:
//   close: caller holds `comments.thread.close.own` AND is thread originator,
//          OR owner-mode. Cooldown predicate uses
//          GREATEST(last_expert_reply_at, last_reopen_at) — see §5.
//   reopen: caller holds `comments.moderate`, OR owner-mode. Sets
//           last_reopen_at = now() so asker can't immediately re-close.
//
// Kill switch read once at entry — feature off → 404.
// Cooldown rejection from close RPC returns { ok: false, reason:
// 'wait_for_cooldown', seconds_remaining } → HTTP 429 with that body.

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';
import { checkRateLimit } from '@/lib/rateLimit';
import { isExpertThreadsEnabled } from '@/lib/expertConfig';

export async function POST(request, { params }) {
  if (!(await isExpertThreadsEnabled())) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let user;
  try {
    user = await requireAuth();
  } catch (err) {
    if (err.status) {
      console.error('[comments.close.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action') === 'reopen' ? 'reopen' : 'close';

  const service = createServiceClient();

  // Per-user cap across all threads. Distinguish from the per-thread
  // 60s cooldown in close_expert_thread (which returns
  // { ok: false, reason: 'wait_for_cooldown', seconds_remaining }) so
  // clients can show "you're closing too many threads" vs "wait Ns
  // on this thread."
  const rl = await checkRateLimit(service, {
    key: `comment-thread-close:${user.id}`,
    policyKey: 'comment-thread-close',
    max: 20,
    windowSec: 60,
  });
  if (rl.limited) {
    return NextResponse.json(
      { error: 'rate_limited', scope: 'global' },
      { status: 429, headers: { 'Retry-After': String(rl.windowSec ?? 60) } }
    );
  }

  if (action === 'reopen') {
    const { error } = await service.rpc('reopen_expert_thread', {
      p_user_id: user.id,
      p_root_id: params.id,
    });
    if (error) {
      console.error('[comments.close.reopen.rpc]', error?.message || error);
      return safeErrorResponse(NextResponse, error, {
        route: 'comments.id.close.reopen',
        fallbackStatus: 403,
      });
    }
    return NextResponse.json({ ok: true });
  }

  // Close
  const { data, error } = await service.rpc('close_expert_thread', {
    p_user_id: user.id,
    p_root_id: params.id,
  });

  if (error) {
    console.error('[comments.close.rpc]', error?.message || error);
    return safeErrorResponse(NextResponse, error, {
      route: 'comments.id.close',
      fallbackStatus: 403,
    });
  }

  // Cooldown rejection — RPC returns jsonb { ok: false, reason:
  // 'wait_for_cooldown', seconds_remaining: N }. Map to 429 with the
  // payload intact so the client can surface "try again in Ns".
  if (data && typeof data === 'object' && data.ok === false) {
    if (data.reason === 'wait_for_cooldown') {
      return NextResponse.json(data, { status: 429 });
    }
    // Any other structured rejection from the RPC → 400 with payload.
    return NextResponse.json(data, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
