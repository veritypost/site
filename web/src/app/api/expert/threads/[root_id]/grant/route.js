// EXPERT_THREADS Wave 3 — POST /api/expert/threads/[root_id]/grant
//
// Lifts the asker reply cap on a single (asker, expert) chain inside the
// thread rooted at `root_id`. Calls the SECURITY DEFINER RPC
// `grant_expert_thread_free_pass` which itself enforces auth — caller must
// hold `comments.expert_thread.allow_followup` AND have a comment in the
// thread, OR be in owner mode (the RPC writes `via=owner_mode` to the
// audit log in that branch). See EXPERT_THREADS.md §5 + §6.
//
// Body: { asker_user_id: uuid }
// Auth: bearer required; RPC does the per-action permission check.
// Kill switch: read once at entry via isExpertThreadsEnabled() — feature
// off → 404 (don't reveal the surface exists).

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';
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
      console.error('[expert.threads.grant.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const askerUserId = body?.asker_user_id;
  if (typeof askerUserId !== 'string' || askerUserId.length === 0) {
    return NextResponse.json(
      { error: 'asker_user_id required' },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  const { error } = await service.rpc('grant_expert_thread_free_pass', {
    p_granting_expert_id: user.id,
    p_thread_root_id: params.root_id,
    p_asker_user_id: askerUserId,
  });

  if (error) {
    // RPC raises on auth failure (caller lacks permission, no comment in
    // thread, etc.). Surface as 403 with the RPC's own message — the RPC
    // is the source of truth for "why not".
    console.error('[expert.threads.grant.rpc]', error?.message || error);
    return safeErrorResponse(NextResponse, error, {
      route: 'expert.threads.grant',
      fallbackStatus: 403,
    });
  }

  return NextResponse.json({ ok: true });
}
