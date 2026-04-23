// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-18
// @apple-guideline-1.2 2026-04-22 — explicit POST/DELETE split (was a single toggle).
// Apple Guideline 1.2 (UGC) reviewers want unambiguous "block user" + "unblock"
// surfaces in the iOS app; the iOS handlers call POST to block and DELETE to
// unblock so the response is deterministic without requiring a pre-fetch.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

const RATE = { policyKey: 'users_block', max: 30, windowSec: 60 };

async function gate(targetId) {
  const user = await requirePermission('settings.privacy.blocked_users.manage');
  if (!user.email_verified) {
    const err = new Error('verify email to block');
    err.status = 403;
    throw err;
  }
  if (targetId === user.id) {
    const err = new Error('cannot block yourself');
    err.status = 400;
    throw err;
  }
  return user;
}

function rateLimited() {
  return NextResponse.json(
    { error: 'Too many requests' },
    { status: 429, headers: { 'Retry-After': String(RATE.windowSec) } }
  );
}

// POST /api/users/[id]/block — block target. Idempotent: re-blocking is a no-op.
export async function POST(request, { params }) {
  let user;
  try {
    user = await gate(params.id);
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[users-block:POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const { reason } = await request.json().catch(() => ({}));
  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `users-block:${user.id}`,
    policyKey: RATE.policyKey,
    max: RATE.max,
    windowSec: RATE.windowSec,
  });
  if (rate.limited) return rateLimited();

  const { data: existing } = await service
    .from('blocked_users')
    .select('id')
    .eq('blocker_id', user.id)
    .eq('blocked_id', params.id)
    .maybeSingle();

  if (existing) return NextResponse.json({ blocked: true });

  const { error } = await service.from('blocked_users').insert({
    blocker_id: user.id,
    blocked_id: params.id,
    reason: reason || null,
  });
  if (error) {
    console.error('[users-block:POST]', error);
    return NextResponse.json({ error: 'Could not block user' }, { status: 500 });
  }
  return NextResponse.json({ blocked: true });
}

// DELETE /api/users/[id]/block — unblock target. Idempotent: deleting a
// non-existent block returns { blocked: false } without error.
export async function DELETE(_request, { params }) {
  let user;
  try {
    user = await gate(params.id);
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[users-block:DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `users-block:${user.id}`,
    policyKey: RATE.policyKey,
    max: RATE.max,
    windowSec: RATE.windowSec,
  });
  if (rate.limited) return rateLimited();

  const { error } = await service
    .from('blocked_users')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', params.id);
  if (error) {
    console.error('[users-block:DELETE]', error);
    return NextResponse.json({ error: 'Could not unblock user' }, { status: 500 });
  }
  return NextResponse.json({ blocked: false });
}
