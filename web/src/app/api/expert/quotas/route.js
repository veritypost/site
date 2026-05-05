// EXPERT_THREADS Wave 4a — POST /api/expert/quotas
//
// Persists Mention caps from the Expert profile section. Calls the
// SECURITY DEFINER RPC `set_expert_mention_quotas` which asserts caller
// owns the application (or holds owner mode) and validates the [1,10] /
// [1,200] ranges for per-post / per-day.
//
// Body: { per_post: number, per_day: number }
//
// Auth: bearer/cookie required; RPC uses auth.uid() for ownership check.

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';
import { checkRateLimit } from '@/lib/rateLimit';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

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

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `expert.quotas:${user.id}`,
    policyKey: 'expert_quotas_save',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests.' },
      { status: 429, headers: { 'Retry-After': '60', ...NO_STORE } }
    );
  }

  const b = await request.json().catch(() => ({}));
  const perPost = Number(b.per_post);
  const perDay = Number(b.per_day);

  if (!Number.isInteger(perPost) || perPost < 1 || perPost > 10) {
    return NextResponse.json(
      { error: 'per_post must be an integer in [1,10].' },
      { status: 400, headers: NO_STORE }
    );
  }
  if (!Number.isInteger(perDay) || perDay < 1 || perDay > 200) {
    return NextResponse.json(
      { error: 'per_day must be an integer in [1,200].' },
      { status: 400, headers: NO_STORE }
    );
  }

  // Resolve expert application id (most recent for this user).
  const { data: appRows, error: appErr } = await service
    .from('expert_applications')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1);

  if (appErr) {
    console.error('[expert.quotas.lookup]', appErr.message);
    return NextResponse.json(
      { error: 'Could not load application.' },
      { status: 500, headers: NO_STORE }
    );
  }
  const appId = appRows?.[0]?.id;
  if (!appId) {
    return NextResponse.json(
      { error: 'No expert application found.' },
      { status: 404, headers: NO_STORE }
    );
  }

  const { error: rpcErr } = await supabase.rpc('set_expert_mention_quotas', {
    p_expert_app_id: appId,
    p_per_post: perPost,
    p_per_day: perDay,
  });

  if (rpcErr) {
    console.error('[expert.quotas.rpc]', rpcErr?.message || rpcErr);
    return safeErrorResponse(NextResponse, rpcErr, {
      route: 'expert.quotas',
      fallbackStatus: 400,
      headers: NO_STORE,
    });
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
