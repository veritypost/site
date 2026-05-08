// POST /api/kids/parent/elevate
//
//   The critical route: trade a kid token + the parent's PIN for a 30-min
//   elevated parent JWT. By design the parent is signed OUT of the kids
//   iOS app at this point — the kid token is the only proof that this
//   device is paired to this parent.
//
//   Body:    { kid_token: string, pin: string }
//   Output (200):
//     {
//       elevated_token:    string,
//       parent_session_id: uuid,
//       expires_at:        ISO,
//       kid_profile_id:    uuid    // echo for client convenience
//     }
//
//   Errors (always JSON `{error: '<code>', ...}`):
//     400  invalid_body | invalid_kid_token | pin_format | pin_too_weak
//     401  invalid_kid_token | incorrect_pin
//     409  pin_not_set
//     429  rate_limited       (Retry-After header set)
//     429  locked              (Retry-After header set; tier1/tier2 cooldown)
//     429  pin_locked          (tier3 — must reset via OTP)
//     500  server_error
//
//   Rate limits (BOTH must pass):
//     parent-elevate-ip:<ip>     10 / 15min
//     parent-elevate-uid:<uid>   10 / 15min
//   Both share policyKey 'parent_pin_elevate' so an admin can override.
//
//   Audit-log on every terminal outcome (best-effort):
//     elevate_failed (reason: invalid_kid_token | pin_not_set | locked |
//                     incorrect_pin | tier1 | tier2 | tier3)
//     elevate_success
//
//   Email alert: when pin_attempts crosses email_alert_threshold (default
//   10), we send a "someone is trying to enter your parent PIN" message
//   to the parent's email. Best-effort — never blocks the response. If
//   no transactional mailer is wired up at all we console.log with a
//   tagged prefix so ops can see it during pre-launch testing.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { getSettings, getNumber } from '@/lib/settings';
import { validateParentPin, verifyParentPinForRow } from '@/lib/parentPin';
import {
  verifyKidToken,
  mintElevatedParentJwt,
  logParentEvent,
  applyLockoutOnFailure,
  readActiveLockout,
} from '@/lib/parentAuth';

export async function POST(request) {
  const svc = createServiceClient();
  const ip = await getClientIp();
  const userAgent = request.headers.get('user-agent') || '';

  try {
    // ── 1. Body shape ─────────────────────────────────────────────────────
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }
    const kidToken = typeof body?.kid_token === 'string' ? body.kid_token : null;
    const pin = body?.pin;
    if (!kidToken) {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }
    // Validate PIN shape early so we don't burn rate-limit budget on
    // obviously-bad input. We do NOT reject weak PINs here — only
    // shape — because a weak existing PIN shouldn't lock a parent out.
    if (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) {
      return NextResponse.json({ error: 'pin_format' }, { status: 400 });
    }

    // ── 2. IP rate limit (cheapest gate; runs before token verify) ────────
    const ipRate = await checkRateLimit(svc, {
      key: `parent-elevate-ip:${ip}`,
      policyKey: 'parent_pin_elevate',
      max: 10,
      windowSec: 900,
    });
    if (ipRate.limited) {
      return NextResponse.json(
        { error: 'rate_limited', retryAfter: ipRate.windowSec || 900 },
        { status: 429, headers: { 'Retry-After': String(ipRate.windowSec || 900) } }
      );
    }

    // ── 3. Kid token ──────────────────────────────────────────────────────
    const kidClaims = verifyKidToken(kidToken);
    if (!kidClaims) {
      return NextResponse.json({ error: 'invalid_kid_token' }, { status: 401 });
    }
    const { parentUserId, kidProfileId } = kidClaims;

    // ── 4. Per-parent rate limit ──────────────────────────────────────────
    const uidRate = await checkRateLimit(svc, {
      key: `parent-elevate-uid:${parentUserId}`,
      policyKey: 'parent_pin_elevate',
      max: 10,
      windowSec: 900,
    });
    if (uidRate.limited) {
      await logParentEvent(svc, {
        parentUserId,
        eventType: 'elevate_failed',
        metadata: { reason: 'rate_limited', kid_profile_id: kidProfileId },
        ip,
        userAgent,
      });
      return NextResponse.json(
        { error: 'rate_limited', retryAfter: uidRate.windowSec || 900 },
        { status: 429, headers: { 'Retry-After': String(uidRate.windowSec || 900) } }
      );
    }

    // ── 5. Load parent_pins row ───────────────────────────────────────────
    const { data: row, error: rowErr } = await svc
      .from('parent_pins')
      .select(
        'parent_user_id, pin_hash, pin_salt, pin_hash_algo, pin_attempts, pin_locked_until'
      )
      .eq('parent_user_id', parentUserId)
      .maybeSingle();

    if (rowErr) {
      console.error('[parent.elevate.row]', rowErr.message || rowErr);
      return NextResponse.json({ error: 'server_error' }, { status: 500 });
    }
    if (!row || !row.pin_hash) {
      await logParentEvent(svc, {
        parentUserId,
        eventType: 'elevate_failed',
        metadata: { reason: 'pin_not_set', kid_profile_id: kidProfileId },
        ip,
        userAgent,
      });
      return NextResponse.json({ error: 'pin_not_set' }, { status: 409 });
    }

    // ── 6. Active lockout? ────────────────────────────────────────────────
    const lock = readActiveLockout(row);
    if (lock.locked) {
      const code = lock.tier3 ? 'pin_locked' : 'locked';
      await logParentEvent(svc, {
        parentUserId,
        eventType: 'elevate_failed',
        metadata: {
          reason: code,
          retry_after: lock.retryAfter,
          kid_profile_id: kidProfileId,
        },
        ip,
        userAgent,
      });
      return NextResponse.json(
        { error: code, retryAfter: lock.retryAfter, code },
        { status: 429, headers: { 'Retry-After': String(lock.retryAfter) } }
      );
    }

    // ── 7. Verify the PIN ─────────────────────────────────────────────────
    const { ok } = await verifyParentPinForRow(pin, row);
    const settings = await getSettings(svc);

    if (!ok) {
      const patch = applyLockoutOnFailure(row, settings);

      await svc
        .from('parent_pins')
        .update({
          pin_attempts: patch.pin_attempts,
          pin_locked_until: patch.pin_locked_until,
          updated_at: new Date().toISOString(),
        })
        .eq('parent_user_id', parentUserId);

      // Best-effort email alert at tier-2 threshold crossing.
      if (patch.emailAlert) {
        try {
          // eslint-disable-next-line no-empty-pattern
          const { data: { user: parentUser } = {} } =
            (await svc.auth.admin.getUserById(parentUserId)) || {};
          const parentEmail = parentUser?.email || null;
          if (parentEmail) {
            // No production transactional mailer is universally wired up
            // here — surface via console with a stable prefix so ops can
            // grep, and stash the email in metadata for the audit row.
            // eslint-disable-next-line no-console
            console.warn(
              '[parent-pin.email_alert]',
              JSON.stringify({ parentUserId, email: parentEmail, attempts: patch.pin_attempts })
            );
          }
        } catch (e) {
          console.error('[parent.elevate.email_alert]', e?.message || e);
        }
      }

      const reason =
        patch.tier === 3
          ? 'tier3'
          : patch.tier === 2
            ? 'tier2'
            : patch.tier === 1
              ? 'tier1'
              : 'incorrect_pin';

      await logParentEvent(svc, {
        parentUserId,
        eventType: 'elevate_failed',
        metadata: {
          reason,
          attempts: patch.pin_attempts,
          tier: patch.tier,
          email_alert_fired: patch.emailAlert,
          kid_profile_id: kidProfileId,
        },
        ip,
        userAgent,
      });

      // Always 401 incorrect_pin to the client even when we just locked —
      // tier transitions are observable to the device only via the next
      // elevate attempt's 429. This avoids leaking the exact attempt
      // count, which the spec calls out.
      return NextResponse.json({ error: 'incorrect_pin' }, { status: 401 });
    }

    // ── 8. Success — mint elevated token, persist single-row session ──────
    const ttlSeconds = getNumber(settings, 'kids.parent_pin.elevated_ttl_seconds', 1800);
    const minted = mintElevatedParentJwt({
      parentUserId,
      kidProfileId,
      ttlSeconds,
    });

    const { error: writeErr } = await svc
      .from('parent_pins')
      .update({
        active_session_id: minted.sessionId,
        session_issued_at: new Date().toISOString(),
        pin_attempts: 0,
        pin_locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq('parent_user_id', parentUserId);

    if (writeErr) {
      console.error('[parent.elevate.session_write]', writeErr.message || writeErr);
      return NextResponse.json({ error: 'server_error' }, { status: 500 });
    }

    await logParentEvent(svc, {
      parentUserId,
      eventType: 'elevate_success',
      metadata: {
        parent_session_id: minted.sessionId,
        kid_profile_id: kidProfileId,
        ttl_seconds: ttlSeconds,
      },
      ip,
      userAgent,
    });

    return NextResponse.json({
      elevated_token: minted.token,
      parent_session_id: minted.sessionId,
      expires_at: minted.expiresAt,
      kid_profile_id: kidProfileId,
    });
  } catch (err) {
    console.error('[parent.elevate]', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
