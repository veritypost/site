// POST /api/kids/parent/reset-pin
//
//   Two-step OTP recovery for a forgotten / tier-3-locked parent PIN.
//   The kid token authorizes the request (we have no parent session at
//   this point — by design parent is signed out). Email OTP confirms
//   ownership of the parent account before the new PIN is written.
//
//   Body shape (action determines which other fields are required):
//     { kid_token: string, action: 'request',  /* */ }
//     { kid_token: string, action: 'confirm', otp_code: string, new_pin: string }
//
//   Output: { ok: true } in both cases. The 'request' shape never reveals
//   whether the parent's email exists / is reachable — that would leak
//   parent-account presence to anyone holding a kid token.
//
//   Errors:
//     400  invalid_body | invalid_action | missing_otp | pin_format | pin_too_weak
//     401  invalid_kid_token | invalid_otp
//     404  parent_not_found        (only on 'confirm' when admin lookup fails)
//     429  rate_limited            (Retry-After header set)
//     500  server_error
//
//   Rate limit: parent-reset-pin:<parent_user_id>, 3 / hour, policyKey
//   'parent_pin_reset'. Same bucket for both actions; OTP issuance is
//   the expensive part.
//
//   Audit log:
//     pin_reset_requested  (action=request)
//     pin_reset_completed  (action=confirm, success)
//     pin_reset_failed     (action=confirm, otp invalid)

import { NextResponse } from 'next/server';
import {
  createServiceClient,
  createEphemeralClient,
} from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { validateParentPin, buildParentPinCredential } from '@/lib/parentPin';
import { verifyKidToken, logParentEvent } from '@/lib/parentAuth';

export async function POST(request) {
  const svc = createServiceClient();
  const ip = await getClientIp();
  const userAgent = request.headers.get('user-agent') || '';

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }
    const kidToken = typeof body?.kid_token === 'string' ? body.kid_token : null;
    const action = body?.action;
    if (!kidToken) {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }
    if (action !== 'request' && action !== 'confirm') {
      return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
    }

    const kidClaims = verifyKidToken(kidToken);
    if (!kidClaims) {
      return NextResponse.json({ error: 'invalid_kid_token' }, { status: 401 });
    }
    const { parentUserId, kidProfileId } = kidClaims;

    const rate = await checkRateLimit(svc, {
      key: `parent-reset-pin:${parentUserId}`,
      policyKey: 'parent_pin_reset',
      max: 3,
      windowSec: 3600,
    });
    if (rate.limited) {
      return NextResponse.json(
        { error: 'rate_limited', retryAfter: rate.windowSec || 3600 },
        { status: 429, headers: { 'Retry-After': String(rate.windowSec || 3600) } }
      );
    }

    // Resolve parent email via admin API. Same path used by the kid-side
    // reset-pin flow's password probe.
    let parentEmail = null;
    try {
      const { data, error } = await svc.auth.admin.getUserById(parentUserId);
      if (!error) parentEmail = data?.user?.email || null;
    } catch (err) {
      console.error('[parent.reset-pin.admin_lookup]', err?.message || err);
    }

    if (action === 'request') {
      // Issue OTP via an ephemeral cookie-less client so the caller's
      // session (none, in this flow) is never touched. We do NOT branch
      // on whether parentEmail is null — silent ok prevents enumeration.
      if (parentEmail) {
        try {
          const ephemeral = createEphemeralClient();
          const { error: otpErr } = await ephemeral.auth.signInWithOtp({
            email: parentEmail,
            options: { shouldCreateUser: false },
          });
          if (otpErr) {
            console.error('[parent.reset-pin.otp_send]', otpErr.message || otpErr);
          }
        } catch (err) {
          console.error('[parent.reset-pin.otp_send.threw]', err?.message || err);
        }
      }

      await logParentEvent(svc, {
        parentUserId,
        eventType: 'pin_reset_requested',
        metadata: { kid_profile_id: kidProfileId, email_known: !!parentEmail },
        ip,
        userAgent,
      });

      return NextResponse.json({ ok: true });
    }

    // ── action === 'confirm' ──────────────────────────────────────────────
    const otpCode = typeof body?.otp_code === 'string' ? body.otp_code.trim() : '';
    const newPin = body?.new_pin;
    if (!otpCode) {
      return NextResponse.json({ error: 'missing_otp' }, { status: 400 });
    }
    const pinErr = validateParentPin(newPin);
    if (pinErr) {
      return NextResponse.json({ error: pinErr }, { status: 400 });
    }
    if (!parentEmail) {
      // Can't verify OTP without an email — explicit 404 because at this
      // point the kid_token was valid, so leaking "parent missing" is not
      // an enumeration vector (caller already proved knowledge of a kid
      // token bound to this parent).
      return NextResponse.json({ error: 'parent_not_found' }, { status: 404 });
    }

    const ephemeral = createEphemeralClient();
    const { data: verifyData, error: verifyErr } = await ephemeral.auth.verifyOtp({
      email: parentEmail,
      token: otpCode,
      type: 'email',
    });

    if (verifyErr || !verifyData?.user) {
      await logParentEvent(svc, {
        parentUserId,
        eventType: 'pin_reset_failed',
        metadata: {
          reason: 'invalid_otp',
          kid_profile_id: kidProfileId,
        },
        ip,
        userAgent,
      });
      return NextResponse.json({ error: 'invalid_otp' }, { status: 401 });
    }

    // Sign out the ephemeral session immediately so the OTP doesn't
    // leave a dangling auth artifact tied to the parent account.
    try {
      await ephemeral.auth.signOut();
    } catch {
      /* best-effort */
    }

    // Belt-and-suspenders — the OTP must verify as the SAME parent the
    // kid token referenced. Otherwise an attacker holding a kid token
    // for parent A who can answer OTP for parent B could rotate A's PIN.
    if (verifyData.user.id !== parentUserId) {
      await logParentEvent(svc, {
        parentUserId,
        eventType: 'pin_reset_failed',
        metadata: {
          reason: 'identity_mismatch',
          kid_profile_id: kidProfileId,
          otp_user_id: verifyData.user.id,
        },
        ip,
        userAgent,
      });
      return NextResponse.json({ error: 'invalid_otp' }, { status: 401 });
    }

    const cred = await buildParentPinCredential(newPin);
    const nowIso = new Date().toISOString();

    const { error: upsertErr } = await svc.from('parent_pins').upsert(
      {
        parent_user_id: parentUserId,
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
      console.error('[parent.reset-pin.upsert]', upsertErr.message || upsertErr);
      return NextResponse.json({ error: 'server_error' }, { status: 500 });
    }

    await logParentEvent(svc, {
      parentUserId,
      eventType: 'pin_reset_completed',
      metadata: { kid_profile_id: kidProfileId },
      ip,
      userAgent,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[parent.reset-pin]', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
