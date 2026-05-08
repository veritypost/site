// POST /api/kids/parent/sensitive/[actionKey]/request
//
//   Step 1 of the sensitive-action OTP gate. Caller has already passed
//   /api/kids/parent/elevate (i.e. holds a live elevated parent JWT) and
//   wants to perform a destructive action (e.g. unpair). This route
//   issues the email OTP + records the pending_id; step 2 (`/confirm`)
//   verifies the OTP and mints the one-shot confirmation token that
//   destructive routes require.
//
//   Auth:    Authorization: Bearer <elevated_parent_token>
//   Params:  actionKey   — currently only 'unpair' is allowed (helper allowlist)
//   Headers: Idempotency-Key (optional) — see step 8 below
//   Body:    none
//   Output (200):
//     { pending_id: uuid, otp_sent: true, expires_in: 600 }
//
//   Errors:
//     400  invalid_action
//     401  unauthenticated | invalid_token | session_revoked
//     429  rate_limited | otp_throttled    (Retry-After header set)
//     500  server_error
//
//   Rate limits (BOTH must pass):
//     parent-sensitive-request-ip:<ip>     10 / 15min
//     parent-sensitive-request-uid:<uid>    5 / hour
//   policyKey 'parent_sensitive_otp_request' for both — admin can override.
//
//   Audit-log:
//     sensitive_action_requested        (helper writes; happy path)
//     sensitive_action_request_failed   (route-level: rate, throttle, etc.)
//     sensitive_action_failed           (helper: invalid_action, email_throttled, etc.)
//
//   Idempotency: NOT IMPLEMENTED in v1. The Idempotency-Key header is
//   accepted and logged but currently ignored. Re-trying step 1 just
//   issues a fresh pending_id; the prior pending_id stays valid until
//   its 10-min TTL or the user successfully confirms a different one.
//   See risk register in Chunk 4 SHIP_NOTES — TODO when iOS retry
//   semantics are nailed down (would need an extra column on
//   parent_action_tokens or a small parent_action_idempotency table).

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import {
  verifyElevatedParentToken,
  isElevatedSessionLive,
  logParentEvent,
} from '@/lib/parentAuth';
import { requireSensitiveActionStep1 } from '@/lib/parentSensitiveOtp';

// 10 min — must match PENDING_TTL_MS in parentSensitiveOtp.js.
const PENDING_TTL_SECONDS = 600;

export async function POST(request, { params }) {
  const svc = createServiceClient();
  const ip = await getClientIp();
  const userAgent = request.headers.get('user-agent') || '';

  try {
    // Next 14 dynamic params are async — `await` for forward-compat with
    // Next 15's strict promise contract.
    const resolved = await params;
    const actionKey =
      typeof resolved?.actionKey === 'string' ? resolved.actionKey : null;
    if (!actionKey) {
      return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
    }

    // Idempotency key is read but currently unused. See header doc above.
    const idempotencyKey = request.headers.get('idempotency-key') || null;

    // ── 1. IP rate limit (cheapest gate) ─────────────────────────────────
    const ipRate = await checkRateLimit(svc, {
      key: `parent-sensitive-request-ip:${ip}`,
      policyKey: 'parent_sensitive_otp_request',
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

    // ── 2. Auth: elevated parent JWT ─────────────────────────────────────
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
      key: `parent-sensitive-request-uid:${parentUserId}`,
      policyKey: 'parent_sensitive_otp_request',
      max: 5,
      windowSec: 3600,
    });
    if (uidRate.limited) {
      await logParentEvent(svc, {
        parentUserId,
        eventType: 'sensitive_action_request_failed',
        metadata: {
          reason: 'rate_limited',
          action: actionKey,
          kid_context: kidContext || null,
        },
        ip,
        userAgent,
      });
      return NextResponse.json(
        { error: 'rate_limited', retryAfter: uidRate.windowSec || 3600 },
        {
          status: 429,
          headers: { 'Retry-After': String(uidRate.windowSec || 3600) },
        }
      );
    }

    // ── 4. Issue OTP via helper ──────────────────────────────────────────
    // 2026-05-08: helper signature flipped to positional (svc + IDs)
    // because state moved to parent_pending_actions. We pass the elevated
    // session id (so step-2 can session-bind) + kid_profile_id from the
    // elevated JWT's kid context (so destructive routes can plumb the
    // kid through without trusting client-side restate).
    const kidProfileId =
      kidContext && typeof kidContext === 'object' && typeof kidContext.kid_profile_id === 'string'
        ? kidContext.kid_profile_id
        : null;
    const result = await requireSensitiveActionStep1(
      svc,
      parentUserId,
      parentSessionId,
      actionKey,
      kidProfileId,
      ip,
      userAgent,
      idempotencyKey,
      { kid_context: kidContext || null }
    );

    if (!result.ok) {
      if (result.reason === 'invalid_action') {
        await logParentEvent(svc, {
          parentUserId,
          eventType: 'sensitive_action_request_failed',
          metadata: {
            reason: 'invalid_action',
            action: actionKey,
            kid_context: kidContext || null,
          },
          ip,
          userAgent,
        });
        return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
      }
      if (result.reason === 'email_throttled') {
        // Helper already wrote sensitive_action_failed{reason:email_throttled}.
        return NextResponse.json(
          { error: 'otp_throttled', retryAfter: 60 },
          { status: 429, headers: { 'Retry-After': '60' } }
        );
      }
      if (result.reason === 'email_lookup') {
        await logParentEvent(svc, {
          parentUserId,
          eventType: 'sensitive_action_request_failed',
          metadata: {
            reason: 'email_lookup',
            action: actionKey,
            kid_context: kidContext || null,
          },
          ip,
          userAgent,
        });
        return NextResponse.json({ error: 'server_error' }, { status: 500 });
      }
      // Unknown helper reason — log and 500.
      console.error('[parent.sensitive.request] unknown helper reason', result.reason);
      return NextResponse.json({ error: 'server_error' }, { status: 500 });
    }

    return NextResponse.json({
      pending_id: result.pending_id,
      otp_sent: true,
      expires_in: PENDING_TTL_SECONDS,
    });
  } catch (err) {
    console.error('[parent.sensitive.request]', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
