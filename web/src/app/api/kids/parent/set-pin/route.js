// POST /api/kids/parent/set-pin
//
//   Set or rotate the parent-mode PIN for the calling parent. Auth is
//   the parent's normal Supabase session (cookie or Authorization bearer);
//   we gate on the seeded permission `kids.parent_pin.set`.
//
//   Body:    { pin: string }                     // 4–6 digits
//   Output:  { ok: true, was_rotation: boolean } // distinguishes set vs change
//
//   Side effects (all on parent_pins for auth.uid()):
//     - Upserts pin_hash/pin_salt/pin_hash_algo from buildParentPinCredential
//     - Resets pin_attempts=0, pin_locked_until=null
//     - Clears active_session_id (any in-flight elevated token is revoked
//       — rotating the PIN must not leave an old elevated session live)
//     - Bumps updated_at
//
//   Audit:
//     - 'pin_set'      on first-ever credential
//     - 'pin_changed'  when an existing row had a different hash
//     - Both include ip + user_agent + the rotation flag
//
//   Rate limit: parent-set-pin:<userId>, 5/hour, policyKey 'parent_pin_set'.
//   Hot enough to detect abuse, generous enough that "I mistyped — try
//   again" doesn't lock a parent out.

import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { validateParentPin, buildParentPinCredential } from '@/lib/parentPin';
import { logParentEvent } from '@/lib/parentAuth';

export async function POST(request) {
  try {
    const supabase = await createClient();
    let user;
    try {
      user = await requirePermission('kids.parent_pin.set', supabase);
    } catch (err) {
      console.error('[parent.set-pin.permission]', err?.message || err);
      return NextResponse.json(
        { error: err?.status === 401 ? 'unauthenticated' : 'forbidden' },
        { status: err?.status || 401 }
      );
    }

    const svc = createServiceClient();
    const ip = await getClientIp();
    const userAgent = request.headers.get('user-agent') || '';

    const rate = await checkRateLimit(svc, {
      key: `parent-set-pin:${user.id}`,
      policyKey: 'parent_pin_set',
      max: 5,
      windowSec: 3600,
    });
    if (rate.limited) {
      return NextResponse.json(
        { error: 'rate_limited', retryAfter: rate.windowSec || 3600 },
        { status: 429, headers: { 'Retry-After': String(rate.windowSec || 3600) } }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }

    const pinErr = validateParentPin(body?.pin);
    if (pinErr) {
      return NextResponse.json({ error: pinErr }, { status: 400 });
    }

    const cred = await buildParentPinCredential(body.pin);

    // Detect rotation vs first-ever set so the audit log distinguishes.
    // Service-role read because parent_pins RLS is owner-of-row only and
    // we want a deterministic answer regardless of policy quirks.
    const { data: existing } = await svc
      .from('parent_pins')
      .select('parent_user_id, pin_hash')
      .eq('parent_user_id', user.id)
      .maybeSingle();

    const wasRotation = !!existing && existing.pin_hash !== cred.pin_hash;
    const eventType = existing ? 'pin_changed' : 'pin_set';

    const nowIso = new Date().toISOString();
    const { error: upsertErr } = await svc.from('parent_pins').upsert(
      {
        parent_user_id: user.id,
        pin_hash: cred.pin_hash,
        pin_salt: cred.pin_salt,
        pin_hash_algo: cred.pin_hash_algo,
        pin_attempts: 0,
        pin_locked_until: null,
        active_session_id: null,
        session_issued_at: null,
        updated_at: nowIso,
      },
      { onConflict: 'parent_user_id' }
    );

    if (upsertErr) {
      console.error('[parent.set-pin.upsert]', upsertErr.message || upsertErr);
      return NextResponse.json({ error: 'server_error' }, { status: 500 });
    }

    // Audit-log AFTER the row write so a successful audit always
    // corresponds to a successful credential change.
    await logParentEvent(svc, {
      parentUserId: user.id,
      eventType,
      metadata: { rotation: wasRotation },
      ip,
      userAgent,
    });

    return NextResponse.json({ ok: true, was_rotation: wasRotation });
  } catch (err) {
    if (err && err.status) {
      console.error('[parent.set-pin.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'unauthenticated' : 'forbidden' },
        { status: err.status }
      );
    }
    console.error('[parent.set-pin]', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
