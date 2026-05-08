// POST /api/kids/parent/end-session
//
//   Revoke the calling elevated parent session. Used by the iOS app's
//   "Done in parent mode" button and on app background. Idempotent —
//   calling twice is fine; the second call sees active_session_id = null
//   and no-ops cleanly.
//
//   Auth:   Authorization: Bearer <elevated_parent_token>
//   Body:   none
//   Output: { ok: true }
//
//   Errors:
//     401  unauthenticated | invalid_token | session_revoked
//     500  server_error
//
//   Audit log:
//     session_ended (always, on success)
//
//   The 'session_revoked' code is distinct from 'invalid_token' so iOS
//   can tell "your session was already killed elsewhere" apart from "the
//   token you sent was malformed/expired/forged".

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import {
  verifyElevatedParentToken,
  isElevatedSessionLive,
  logParentEvent,
} from '@/lib/parentAuth';

export async function POST(request) {
  const svc = createServiceClient();
  const ip = await getClientIp();
  const userAgent = request.headers.get('user-agent') || '';

  try {
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
      // Idempotent on the user-visible side, but emit a distinct error
      // code so the client can short-circuit its own "ending session" UI.
      return NextResponse.json({ error: 'session_revoked' }, { status: 401 });
    }

    // Per-parent rate limit. iOS calls this on the "Done in parent
    // mode" tap AND on app background, so back-and-forth toggling can
    // burst legitimately. 30/min covers normal use; tighter caps would
    // trip on routine foreground/background cycles.
    const rl = await checkRateLimit(svc, {
      key: `kids_end_session:${parentUserId}`,
      policyKey: 'kids_end_session',
      max: 30,
      windowSec: 60,
    });
    if (rl.limited) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(rl.windowSec ?? 60) } }
      );
    }

    const { error: writeErr } = await svc
      .from('parent_pins')
      .update({
        active_session_id: null,
        session_issued_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('parent_user_id', parentUserId)
      // Guard against a race with another end-session / set-pin /
      // reset-pin call: only clear if we still own the session.
      .eq('active_session_id', parentSessionId);

    if (writeErr) {
      console.error('[parent.end-session.write]', writeErr.message || writeErr);
      return NextResponse.json({ error: 'server_error' }, { status: 500 });
    }

    await logParentEvent(svc, {
      parentUserId,
      eventType: 'session_ended',
      metadata: {
        parent_session_id: parentSessionId,
        kid_context: kidContext || null,
      },
      ip,
      userAgent,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[parent.end-session]', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
