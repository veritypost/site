// Sensitive-action OTP gate — server-side only.
//
// 2026-05-08 rewrite: state moved off parent_auth_events (audit log) onto
// the dedicated parent_pending_actions table. The previous design
// piggybacked attempt-counters and consumed-flags onto JSON metadata
// scans, which (a) couldn't enforce uniqueness/idempotency at the DB
// layer, (b) required N+1 audit reads per verify, and (c) had no
// session/kid binding. parent_pending_actions gives us a real row with
// attempts, expires_at, consumed_at, parent_session_id, kid_profile_id,
// idempotency_key as proper columns + indexes.
//
// Audit-log writes still happen (sensitive_action_requested /
// _used / _failed) for forensic continuity, but the helper no longer
// reads the audit log to make decisions.
//
// Callers
// -------
//
//   Step 1 — initiate (returns a pending_id):
//
//     const result = await requireSensitiveActionStep1(
//       svc,
//       parentUserId,
//       parentSessionId,
//       actionKey,        // 'unpair' | 'delete-kid' | 'delete-account' | 'change-email'
//       kidProfileId,     // nullable for account-level actions
//       ip,
//       userAgent,
//       idempotencyKey,   // optional; lets retried step-1 return same pending_id
//       extra,            // optional jsonb payload, surfaced to destructive route via .extra
//     );
//     // { ok, pending_id, expires_in: 600 } on success
//     // { ok:false, reason:'invalid_action' | 'email_lookup' | 'email_throttled' }
//
//   Step 2 — verify:
//
//     const result = await verifySensitiveActionOtp(
//       svc,
//       parentUserId,
//       parentSessionId,
//       actionKey,
//       pendingId,
//       otpCode,
//       ip,
//       userAgent,
//     );
//     // { ok:true, kid_profile_id }                         on success
//     // { ok:false, reason:'pending_not_found' | 'action_mismatch'
//     //                   | 'session_mismatch' | 'pin_locked'
//     //                   | 'invalid_otp' | 'identity_mismatch'
//     //                   | 'invalid_action' | 'bad_*' | 'lookup_error' | 'email_lookup' }

import crypto from 'crypto';
import { createEphemeralClient } from '@/lib/supabase/server';
import { logParentEvent } from '@/lib/parentAuth';

const PENDING_TTL_MS = 10 * 60 * 1000;
const PENDING_TTL_SECONDS = 600;

// Defense-in-depth allowlist. The destructive-route layer ALSO restricts
// which actions are wired up (e.g. `/destructive/[actionKey]` only
// accepts `unpair` today and 400s the rest as `not_implemented_yet`),
// but we accept the future actions here so the OTP ceremony itself
// works in lockstep when those flows ship.
const ALLOWED_ACTIONS = new Set([
  'unpair',
  'delete-kid',
  'delete-account',
  'change-email',
]);

const MAX_VERIFY_ATTEMPTS_PER_PENDING = 5;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v) {
  return typeof v === 'string' && UUID_RE.test(v);
}

// Step 1 — issue OTP + create the pending row.
export async function requireSensitiveActionStep1(
  svc,
  parentUserId,
  parentSessionId,
  actionKey,
  kidProfileId,
  ip,
  userAgent,
  idempotencyKey,
  extra
) {
  if (!svc) throw new Error('parentSensitiveOtp.step1: svc required');
  if (!isUuid(parentUserId)) {
    throw new Error('parentSensitiveOtp.step1: bad parentUserId');
  }
  if (parentSessionId != null && !isUuid(parentSessionId)) {
    throw new Error('parentSensitiveOtp.step1: bad parentSessionId');
  }
  if (kidProfileId != null && !isUuid(kidProfileId)) {
    throw new Error('parentSensitiveOtp.step1: bad kidProfileId');
  }
  if (!actionKey || typeof actionKey !== 'string') {
    throw new Error('parentSensitiveOtp.step1: actionKey required');
  }
  if (!ALLOWED_ACTIONS.has(actionKey)) {
    return { ok: false, reason: 'invalid_action' };
  }

  const userAgentTrunc = (userAgent || '').toString().slice(0, 512);

  // Idempotency lookup. If the caller passed an Idempotency-Key and we
  // have a non-consumed, non-expired pending row that matches
  // (parent_user_id, parent_session_id, action, idempotency_key), return
  // its pending_id without sending another OTP. This is the cure for
  // the "user double-tapped Send Code" / "iOS retried after network
  // blip" problem that previously minted two pending rows + two emails.
  if (idempotencyKey && parentSessionId) {
    const nowIso = new Date().toISOString();
    const { data: existing, error: existingErr } = await svc
      .from('parent_pending_actions')
      .select('pending_id, expires_at')
      .eq('parent_user_id', parentUserId)
      .eq('parent_session_id', parentSessionId)
      .eq('action', actionKey)
      .eq('idempotency_key', idempotencyKey)
      .is('consumed_at', null)
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingErr) {
      console.error(
        '[parentSensitiveOtp.step1.idempotency_lookup]',
        existingErr.message || existingErr
      );
      // Fall through — idempotency is best-effort, not a hard block.
    } else if (existing?.pending_id) {
      return {
        ok: true,
        pending_id: existing.pending_id,
        expires_in: PENDING_TTL_SECONDS,
        idempotent: true,
      };
    }
  }

  // Look up parent email for OTP.
  const { data: userData, error: userErr } = await svc.auth.admin.getUserById(parentUserId);
  if (userErr || !userData?.user?.email) {
    return { ok: false, reason: 'email_lookup' };
  }
  const parentEmail = userData.user.email;

  // Issue OTP via cookie-less ephemeral client.
  let throttled = false;
  try {
    const ephemeral = createEphemeralClient();
    const { error: otpErr } = await ephemeral.auth.signInWithOtp({
      email: parentEmail,
      options: { shouldCreateUser: false },
    });
    if (otpErr) {
      const status = otpErr?.status ?? otpErr?.statusCode ?? null;
      const code = (otpErr?.code || '').toString();
      const message = (otpErr?.message || '').toString().toLowerCase();
      if (
        status === 429 ||
        code === 'over_email_send_rate_limit' ||
        message.includes('rate limit') ||
        message.includes('too many')
      ) {
        throttled = true;
      }
      console.error(
        '[parentSensitiveOtp.step1.otp_send]',
        otpErr.message || otpErr
      );
    }
  } catch (err) {
    console.error('[parentSensitiveOtp.step1.threw]', err?.message || err);
  }

  if (throttled) {
    await logParentEvent(svc, {
      parentUserId,
      eventType: 'sensitive_action_failed',
      metadata: { reason: 'email_throttled', action: actionKey },
      ip,
      userAgent: userAgentTrunc,
    });
    return { ok: false, reason: 'email_throttled' };
  }

  // Insert pending row. expires_at = now + TTL.
  const expiresAtIso = new Date(Date.now() + PENDING_TTL_MS).toISOString();
  const { data: inserted, error: insertErr } = await svc
    .from('parent_pending_actions')
    .insert({
      parent_user_id: parentUserId,
      parent_session_id: parentSessionId || null,
      action: actionKey,
      kid_profile_id: kidProfileId || null,
      expires_at: expiresAtIso,
      idempotency_key: idempotencyKey || null,
      extra: extra && typeof extra === 'object' ? extra : {},
    })
    .select('pending_id')
    .single();

  if (insertErr || !inserted?.pending_id) {
    console.error(
      '[parentSensitiveOtp.step1.insert]',
      insertErr?.message || insertErr
    );
    return { ok: false, reason: 'lookup_error' };
  }

  await logParentEvent(svc, {
    parentUserId,
    eventType: 'sensitive_action_requested',
    metadata: {
      pending_id: inserted.pending_id,
      action: actionKey,
      kid_profile_id: kidProfileId || null,
      parent_session_id: parentSessionId || null,
    },
    ip,
    userAgent: userAgentTrunc,
  });

  return {
    ok: true,
    pending_id: inserted.pending_id,
    expires_in: PENDING_TTL_SECONDS,
  };
}

// Step 2 — verify OTP + mark pending row consumed.
export async function verifySensitiveActionOtp(
  svc,
  parentUserId,
  parentSessionId,
  actionKey,
  pendingId,
  otpCode,
  ip,
  userAgent
) {
  if (!svc) throw new Error('parentSensitiveOtp.step2: svc required');
  const userAgentTrunc = (userAgent || '').toString().slice(0, 512);

  const fail = async (reason, extra) => {
    await logParentEvent(svc, {
      parentUserId,
      eventType: 'sensitive_action_failed',
      metadata: {
        reason,
        action: actionKey || null,
        pending_id: pendingId || null,
        ...(extra && typeof extra === 'object' ? extra : {}),
      },
      ip,
      userAgent: userAgentTrunc,
    });
    return { ok: false, reason };
  };

  if (!actionKey || typeof actionKey !== 'string' || !ALLOWED_ACTIONS.has(actionKey)) {
    return fail('invalid_action');
  }
  if (!isUuid(parentUserId)) return fail('bad_parent');
  if (!isUuid(pendingId)) return fail('bad_pending_id');
  if (typeof otpCode !== 'string' || otpCode.length < 4) return fail('bad_otp_shape');

  const nowIso = new Date().toISOString();

  // Look up the pending row. We bind on parent_user_id (any other parent
  // forging this id can't match) + consumed_at IS NULL + non-expired.
  const { data: pending, error: lookupErr } = await svc
    .from('parent_pending_actions')
    .select(
      'pending_id, parent_user_id, parent_session_id, action, kid_profile_id, attempts, expires_at, consumed_at'
    )
    .eq('pending_id', pendingId)
    .eq('parent_user_id', parentUserId)
    .is('consumed_at', null)
    .gt('expires_at', nowIso)
    .maybeSingle();

  if (lookupErr) {
    console.error(
      '[parentSensitiveOtp.step2.lookup]',
      lookupErr.message || lookupErr
    );
    return fail('lookup_error');
  }
  if (!pending) return fail('pending_not_found');

  // Action binding — pending row's action MUST match the actionKey the
  // caller is presenting. Otherwise a parent who consented to 'unpair'
  // could be replayed by a route into 'delete-account' (consent
  // laundering). Anchor consent to what step-1 wrote, never the caller.
  if (pending.action !== actionKey) {
    return fail('action_mismatch', { pending_action: pending.action });
  }

  // Session binding — the same parent on a NEW elevated session
  // shouldn't be able to consume a pending row issued by a previous,
  // possibly-revoked session. parent_session_id can be null (legacy
  // pre-2026-05-08 callers); enforce match only when both sides set it.
  if (
    pending.parent_session_id != null &&
    parentSessionId != null &&
    pending.parent_session_id !== parentSessionId
  ) {
    return fail('session_mismatch');
  }

  // Attempt cap (column-backed now; previous design scanned audit log).
  if (pending.attempts >= MAX_VERIFY_ATTEMPTS_PER_PENDING) {
    return { ok: false, reason: 'pin_locked' };
  }

  // Resolve email + verify OTP via ephemeral client.
  const { data: userRow, error: userErr } = await svc.auth.admin.getUserById(parentUserId);
  if (userErr || !userRow?.user?.email) return fail('email_lookup');
  const parentEmail = userRow.user.email;

  const ephemeral = createEphemeralClient();
  const { data: verifyData, error: verifyErr } = await ephemeral.auth.verifyOtp({
    email: parentEmail,
    token: otpCode.trim(),
    type: 'email',
  });
  try {
    await ephemeral.auth.signOut();
  } catch {
    /* best-effort */
  }

  // Helper for failure paths: bump attempts; if the bump crosses the
  // cap, also stamp consumed_at = now() so the row is permanently locked
  // (saves the next caller a verifyOtp round-trip + double-billing the
  // attempt counter).
  const recordFailedAttempt = async (reason, extra) => {
    const newAttempts = (pending.attempts || 0) + 1;
    const update = { attempts: newAttempts };
    if (newAttempts >= MAX_VERIFY_ATTEMPTS_PER_PENDING) {
      update.consumed_at = new Date().toISOString();
    }
    const { error: updErr } = await svc
      .from('parent_pending_actions')
      .update(update)
      .eq('pending_id', pendingId)
      // Race-safe: only bump from the value WE read. If a concurrent
      // verify already bumped, skip — its update wins.
      .eq('attempts', pending.attempts);
    if (updErr) {
      console.error(
        '[parentSensitiveOtp.step2.update_attempts]',
        updErr.message || updErr
      );
    }
    if (newAttempts >= MAX_VERIFY_ATTEMPTS_PER_PENDING) {
      await logParentEvent(svc, {
        parentUserId,
        eventType: 'sensitive_action_failed',
        metadata: {
          reason: 'pin_locked',
          action: actionKey,
          pending_id: pendingId,
          attempts: newAttempts,
        },
        ip,
        userAgent: userAgentTrunc,
      });
      return { ok: false, reason: 'pin_locked' };
    }
    return fail(reason, { attempts: newAttempts, ...(extra || {}) });
  };

  if (verifyErr || !verifyData?.user) {
    return recordFailedAttempt('invalid_otp');
  }
  if (verifyData.user.id !== parentUserId) {
    return recordFailedAttempt('identity_mismatch');
  }

  // Success — atomically mark consumed. Use eq on consumed_at IS NULL via
  // .is('consumed_at', null) to avoid double-consume races.
  const { data: consumed, error: consumeErr } = await svc
    .from('parent_pending_actions')
    .update({ consumed_at: new Date().toISOString() })
    .eq('pending_id', pendingId)
    .is('consumed_at', null)
    .select('pending_id, kid_profile_id')
    .maybeSingle();

  if (consumeErr) {
    console.error(
      '[parentSensitiveOtp.step2.consume]',
      consumeErr.message || consumeErr
    );
    return fail('lookup_error');
  }
  if (!consumed) {
    // Concurrent verify won the race — treat as already consumed.
    return fail('already_consumed');
  }

  await logParentEvent(svc, {
    parentUserId,
    eventType: 'sensitive_action_used',
    metadata: {
      pending_id: pendingId,
      action: actionKey,
      kid_profile_id: consumed.kid_profile_id || pending.kid_profile_id || null,
    },
    ip,
    userAgent: userAgentTrunc,
  });

  return {
    ok: true,
    kid_profile_id: consumed.kid_profile_id || pending.kid_profile_id || null,
  };
}
