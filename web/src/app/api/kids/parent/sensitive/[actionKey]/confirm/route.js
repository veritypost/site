// POST /api/kids/parent/sensitive/[actionKey]/confirm
//
//   Step 2 of the sensitive-action OTP gate. Caller submits the OTP code
//   from the email together with the pending_id from `/request`. On
//   success the route mints a one-shot, 5-minute confirmation_token bound
//   to (parent_user_id, action). Plaintext token is returned to the
//   client; only sha256(token) is stored. Destructive routes (e.g.
//   unpair) re-hash incoming tokens and look them up in
//   parent_action_tokens.
//
//   Auth:    Authorization: Bearer <elevated_parent_token>
//   Params:  actionKey   — currently only 'unpair' is allowed
//   Body:    { pending_id: uuid, otp_code: 4-10 digit string }
//   Output (200):
//     {
//       ok: true,
//       confirmation_token: <base64url string>,
//       action: <actionKey>,
//       expires_at: ISO,
//     }
//
//   Errors:
//     400  invalid_action | invalid_body
//     401  unauthenticated | invalid_token | session_revoked | invalid_otp
//     429  rate_limited | pin_locked      (Retry-After header set)
//     500  server_error
//
//   Rate limits (BOTH must pass; tighter than /request per Chunk 4 review):
//     parent-sensitive-confirm-ip:<ip>     10 / 15min
//     parent-sensitive-confirm-uid:<uid>    5 / 15min
//   policyKey 'parent_sensitive_otp_confirm' for both.
//
//   Audit-log:
//     sensitive_action_used / sensitive_action_failed (helper writes)
//     sensitive_action_confirm_blocked (route: rate-limited / unauthenticated)
//     sensitive_action_confirmed       (route: token minted)
//     sensitive_action_consumed        (reserved for destructive routes —
//                                       written when they redeem the
//                                       confirmation_token, NOT here)

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import {
  verifyElevatedParentToken,
  isElevatedSessionLive,
  logParentEvent,
} from '@/lib/parentAuth';
import { verifySensitiveActionOtp } from '@/lib/parentSensitiveOtp';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Confirmation token TTL — 5 min, per spec. Short on purpose: the iOS
// client should redeem against the destructive route immediately.
const CONFIRM_TTL_SECONDS = 5 * 60;

export async function POST(request, { params }) {
  const svc = createServiceClient();
  const ip = await getClientIp();
  const userAgent = request.headers.get('user-agent') || '';

  try {
    const resolved = await params;
    const actionKey =
      typeof resolved?.actionKey === 'string' ? resolved.actionKey : null;
    if (!actionKey) {
      return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
    }

    // ── 1. IP rate limit ─────────────────────────────────────────────────
    const ipRate = await checkRateLimit(svc, {
      key: `parent-sensitive-confirm-ip:${ip}`,
      policyKey: 'parent_sensitive_otp_confirm',
      max: 10,
      windowSec: 900,
    });
    if (ipRate.limited) {
      return NextResponse.json(
        { error: 'rate_limited', retryAfter: ipRate.windowSec || 900 },
        {
          status: 429,
          headers: { 'Retry-After': String(ipRate.windowSec || 900) },
        }
      );
    }

    // ── 2. Auth ──────────────────────────────────────────────────────────
    const authHeader = request.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    const claims = verifyElevatedParentToken(match[1]);
    if (!claims) {
      return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
    }
    const { parentUserId, parentSessionId, kidContext } = claims;

    const live = await isElevatedSessionLive(svc, parentUserId, parentSessionId);
    if (!live) {
      return NextResponse.json({ error: 'session_revoked' }, { status: 401 });
    }

    // ── 3. Per-parent rate limit ─────────────────────────────────────────
    const uidRate = await checkRateLimit(svc, {
      key: `parent-sensitive-confirm-uid:${parentUserId}`,
      policyKey: 'parent_sensitive_otp_confirm',
      max: 5,
      windowSec: 900,
    });
    if (uidRate.limited) {
      await logParentEvent(svc, {
        parentUserId,
        eventType: 'sensitive_action_confirm_blocked',
        metadata: {
          reason: 'rate_limited',
          action: actionKey,
          kid_context: kidContext || null,
        },
        ip,
        userAgent,
      });
      return NextResponse.json(
        { error: 'rate_limited', retryAfter: uidRate.windowSec || 900 },
        {
          status: 429,
          headers: { 'Retry-After': String(uidRate.windowSec || 900) },
        }
      );
    }

    // ── 4. Body shape ────────────────────────────────────────────────────
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }
    const pendingId =
      typeof body?.pending_id === 'string' ? body.pending_id.trim() : null;
    const otpCode =
      typeof body?.otp_code === 'string' ? body.otp_code.trim() : null;
    if (!pendingId || !UUID_RE.test(pendingId)) {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }
    if (!otpCode || !/^\d{4,10}$/.test(otpCode)) {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }

    // ── 5. Verify OTP via helper ─────────────────────────────────────────
    // 2026-05-08: positional signature; passes parentSessionId so step-2
    // can session-bind against the row written by step-1.
    const result = await verifySensitiveActionOtp(
      svc,
      parentUserId,
      parentSessionId,
      actionKey,
      pendingId,
      otpCode,
      ip,
      userAgent
    );

    if (!result.ok) {
      if (result.reason === 'invalid_action') {
        return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
      }
      if (result.reason === 'pin_locked') {
        return NextResponse.json(
          { error: 'pin_locked', retryAfter: 60 },
          { status: 429, headers: { 'Retry-After': '60' } }
        );
      }
      // All other helper-failure reasons collapse to invalid_otp at the
      // wire so we don't leak internal pending-row state to the client.
      // (pending_not_found / already_consumed / action_mismatch /
      // identity_mismatch / invalid_otp / bad_*_shape / lookup_error /
      // email_lookup) — helper has already written sensitive_action_failed.
      return NextResponse.json({ error: 'invalid_otp' }, { status: 401 });
    }

    // ── 6. Mint confirmation token, persist hash ─────────────────────────
    const plaintext = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(plaintext).digest('hex');
    const expiresAtIso = new Date(
      Date.now() + CONFIRM_TTL_SECONDS * 1000
    ).toISOString();

    // 2026-05-08: helper now returns the kid_profile_id stored on the
    // pending row (set at step-1 from the elevated session's kid context).
    // Persist it on the action token + add session binding so the
    // destructive route can verify session match without re-deriving.
    const resolvedKidProfileId = result.kid_profile_id || null;
    const { error: insertErr } = await svc
      .from('parent_action_tokens')
      .insert({
        token_hash: tokenHash,
        parent_user_id: parentUserId,
        action: actionKey,
        expires_at: expiresAtIso,
        parent_session_id: parentSessionId || null,
        kid_profile_id: resolvedKidProfileId,
        metadata: {
          pending_id: pendingId,
          kid_context: kidContext || null,
          kid_profile_id: resolvedKidProfileId,
        },
      });

    if (insertErr) {
      console.error(
        '[parent.sensitive.confirm.insert]',
        insertErr.message || insertErr
      );
      return NextResponse.json({ error: 'server_error' }, { status: 500 });
    }

    await logParentEvent(svc, {
      parentUserId,
      eventType: 'sensitive_action_confirmed',
      metadata: {
        action: actionKey,
        pending_id: pendingId,
        kid_context: kidContext || null,
        token_hash: tokenHash,
        expires_at: expiresAtIso,
      },
      ip,
      userAgent,
    });

    return NextResponse.json({
      ok: true,
      confirmation_token: plaintext,
      action: actionKey,
      expires_at: expiresAtIso,
    });
  } catch (err) {
    console.error('[parent.sensitive.confirm]', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
