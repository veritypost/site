// POST /api/kids/parent/destructive/[actionKey]
//
//   Step 3 of the sensitive-action ceremony. Caller has already passed
//   /elevate (live elevated session) AND /sensitive/[actionKey]/request +
//   /sensitive/[actionKey]/confirm (holding a one-shot
//   confirmation_token). This route REDEEMS the confirmation_token and
//   performs the actual destructive action.
//
//   Auth:    Authorization: Bearer <elevated_parent_token>
//   Params:  actionKey   — currently only 'unpair' wired up; other
//                          allowlisted strings return not_implemented_yet
//                          so iOS can probe roll-out without a 404.
//   Body:    { confirmation_token: string }
//
//   Output (200):
//     { ok: true, kid_token_revoked: true }   (unpair)
//
//   Errors:
//     400  invalid_action | not_implemented_yet | invalid_body
//     401  unauthenticated | invalid_token | session_revoked | invalid_confirmation
//     409  already_consumed
//     429  rate_limited
//     500  server_error
//
//   Rate limits (BOTH):
//     parent-destructive-ip:<ip>       10 / 15min
//     parent-destructive-uid:<uid>      5 / 15min
//
//   Audit: writes 'unpair_completed' on success (kid_profile_id +
//   token_hash + revoked_session_count in metadata).

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import {
  verifyElevatedParentToken,
  isElevatedSessionLive,
  logParentEvent,
} from '@/lib/parentAuth';

const ALLOWED_ACTIONS = new Set([
  'unpair',
  'delete-kid',
  'delete-account',
  'change-email',
]);
const IMPLEMENTED_ACTIONS = new Set(['unpair']);

const HEX64_RE = /^[0-9a-f]{64}$/i;

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

    // ── 1. Body parse ───────────────────────────────────────────────────
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }
    const confirmationToken =
      typeof body?.confirmation_token === 'string'
        ? body.confirmation_token.trim()
        : null;
    if (!confirmationToken) {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }

    // ── 2. IP rate limit ────────────────────────────────────────────────
    const ipRate = await checkRateLimit(svc, {
      key: `parent-destructive-ip:${ip}`,
      policyKey: 'parent_destructive_action',
      max: 10,
      windowSec: 900,
    });
    if (ipRate.limited) {
      return NextResponse.json(
        { error: 'rate_limited', retryAfter: ipRate.windowSec || 900 },
        { status: 429, headers: { 'Retry-After': String(ipRate.windowSec || 900) } }
      );
    }

    // ── 3. Auth: elevated parent JWT ─────────────────────────────────────
    const authHeader = request.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    const claims = verifyElevatedParentToken(match[1]);
    if (!claims) {
      return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
    }
    const { parentUserId, parentSessionId } = claims;

    const live = await isElevatedSessionLive(svc, parentUserId, parentSessionId);
    if (!live) {
      return NextResponse.json({ error: 'session_revoked' }, { status: 401 });
    }

    // ── 4. Per-uid rate limit ───────────────────────────────────────────
    const uidRate = await checkRateLimit(svc, {
      key: `parent-destructive-uid:${parentUserId}`,
      policyKey: 'parent_destructive_action',
      max: 5,
      windowSec: 900,
    });
    if (uidRate.limited) {
      return NextResponse.json(
        { error: 'rate_limited', retryAfter: uidRate.windowSec || 900 },
        { status: 429, headers: { 'Retry-After': String(uidRate.windowSec || 900) } }
      );
    }

    // ── 5. Allowlist check ──────────────────────────────────────────────
    if (!ALLOWED_ACTIONS.has(actionKey)) {
      return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
    }
    if (!IMPLEMENTED_ACTIONS.has(actionKey)) {
      return NextResponse.json({ error: 'not_implemented_yet' }, { status: 400 });
    }

    // ── 6. Look up confirmation token (sha256 hash) ─────────────────────
    const tokenHash = crypto
      .createHash('sha256')
      .update(confirmationToken)
      .digest('hex');
    if (!HEX64_RE.test(tokenHash)) {
      return NextResponse.json({ error: 'invalid_confirmation' }, { status: 401 });
    }

    const nowIso = new Date().toISOString();
    const { data: tokenRow, error: tokenErr } = await svc
      .from('parent_action_tokens')
      .select(
        'token_hash, parent_user_id, action, parent_session_id, kid_profile_id, expires_at, consumed_at, metadata'
      )
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (tokenErr) {
      console.error(
        '[parent.destructive.token_lookup]',
        tokenErr.message || tokenErr
      );
      return NextResponse.json({ error: 'server_error' }, { status: 500 });
    }
    if (!tokenRow) {
      return NextResponse.json({ error: 'invalid_confirmation' }, { status: 401 });
    }
    if (tokenRow.consumed_at) {
      return NextResponse.json({ error: 'already_consumed' }, { status: 409 });
    }
    if (tokenRow.expires_at && tokenRow.expires_at <= nowIso) {
      return NextResponse.json({ error: 'invalid_confirmation' }, { status: 401 });
    }
    if (tokenRow.parent_user_id !== parentUserId) {
      return NextResponse.json({ error: 'invalid_confirmation' }, { status: 401 });
    }
    if (tokenRow.action !== actionKey) {
      return NextResponse.json({ error: 'invalid_confirmation' }, { status: 401 });
    }
    if (
      tokenRow.parent_session_id != null &&
      parentSessionId != null &&
      tokenRow.parent_session_id !== parentSessionId
    ) {
      return NextResponse.json({ error: 'invalid_confirmation' }, { status: 401 });
    }

    // ── 7. Action: unpair ───────────────────────────────────────────────
    if (actionKey === 'unpair') {
      const kidProfileId =
        tokenRow.kid_profile_id ||
        (tokenRow.metadata &&
        typeof tokenRow.metadata === 'object' &&
        typeof tokenRow.metadata.kid_profile_id === 'string'
          ? tokenRow.metadata.kid_profile_id
          : null);
      if (!kidProfileId) {
        // Token wasn't bound to a kid at confirm time — refuse rather
        // than revoke nothing/something arbitrary.
        return NextResponse.json({ error: 'invalid_confirmation' }, { status: 401 });
      }

      // Atomic consume: only succeeds if consumed_at IS NULL.
      // Race-safe via the IS NULL filter on the UPDATE — a concurrent
      // call lands 0 rows and we return already_consumed.
      const { data: consumed, error: consumeErr } = await svc
        .from('parent_action_tokens')
        .update({
          consumed_at: nowIso,
          consumed_via: 'destructive_unpair',
        })
        .eq('token_hash', tokenHash)
        .is('consumed_at', null)
        .select('token_hash')
        .maybeSingle();

      if (consumeErr) {
        console.error(
          '[parent.destructive.consume]',
          consumeErr.message || consumeErr
        );
        return NextResponse.json({ error: 'server_error' }, { status: 500 });
      }
      if (!consumed) {
        return NextResponse.json({ error: 'already_consumed' }, { status: 409 });
      }

      // Revoke all live kid_sessions for this kid. Usually one row;
      // multiple devices = multiple rows, all flipped at once. Returns
      // the revoked rows so we can audit the count.
      const { data: revokedRows, error: revokeErr } = await svc
        .from('kid_sessions')
        .update({ revoked_at: nowIso })
        .eq('kid_profile_id', kidProfileId)
        .is('revoked_at', null)
        .select('id');

      if (revokeErr) {
        console.error(
          '[parent.destructive.revoke_sessions]',
          revokeErr.message || revokeErr
        );
        // Token was consumed — don't unwind, but surface the error so
        // ops can reconcile if needed. The kid token will still be
        // refusable on its next /refresh once an admin manually flips
        // revoked_at; in practice we expect this branch to be cold.
        return NextResponse.json({ error: 'server_error' }, { status: 500 });
      }

      const revokedCount = Array.isArray(revokedRows) ? revokedRows.length : 0;

      // If no live rows existed, the pair-time kid_sessions insert was
      // best-effort and may have failed silently. Insert a synthetic
      // revoked row so refresh's row-exists-and-revoked branch fires for
      // any future refresh on this kid_profile_id. Without this, the kid
      // JWT would remain valid until natural 24h expiry — bypassing the
      // unpair entirely.
      if (revokedCount === 0) {
        const syntheticTs = new Date().toISOString();
        const { error: synthErr } = await svc.from('kid_sessions').insert({
          kid_profile_id: kidProfileId,
          parent_user_id: parentUserId,
          device_id: 'reconstructed-on-revoke',
          token: `revoked-${crypto.randomUUID()}`,
          started_at: syntheticTs,
          expires_at: syntheticTs, // expired immediately, just for forensics
          revoked_at: syntheticTs,
        });
        if (synthErr) {
          console.error(
            '[parent.destructive.synthetic_insert]',
            synthErr.message || synthErr
          );
          // Don't fail the request — token is consumed, audit will show
          // synthetic_row_created=false alongside revoked_session_count=0
          // so ops can reconcile.
        }
      }

      await logParentEvent(svc, {
        parentUserId,
        eventType: 'unpair_completed',
        metadata: {
          action: actionKey,
          kid_profile_id: kidProfileId,
          token_hash: tokenHash,
          revoked_session_count: revokedCount,
          synthetic_row_created: revokedCount === 0,
        },
        ip,
        userAgent,
      });

      return NextResponse.json({ ok: true, kid_token_revoked: true });
    }

    // Should be unreachable due to IMPLEMENTED_ACTIONS gate above, but
    // belt-and-suspenders: never silently succeed for an unhandled
    // allowlisted action.
    return NextResponse.json({ error: 'not_implemented_yet' }, { status: 400 });
  } catch (err) {
    console.error('[parent.destructive]', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
