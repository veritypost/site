// S5-§H4 — push token status surface for the iOS Settings UI.
//
// Apple/FCM marks a device push token invalid on uninstall, opt-out, or
// app reinstall under a different APNs configuration; the send-push cron
// flips invalidated_at when delivery fails with the documented codes
// (Unregistered, BadDeviceToken, ExpiredToken, etc). Pre-§H4 there was
// no API exposing that state to the user, so the iOS Settings line for
// "Push notifications" appeared "on" while the underlying token was dead.
//
// Contract (S9 implements the iOS Settings row):
//   GET /api/push/status
//   Auth: bearer required.
//   Resp: 200 {
//     web:     { registered, last_seen_at, last_invalidated_at, status },
//     ios:     { registered, last_seen_at, last_invalidated_at, status },
//     android: { registered, last_seen_at, last_invalidated_at, status }
//   }
//   status ∈ 'active' | 'invalidated' | 'absent'
//   401 when unauthenticated.
//
// Aggregation:
//   - per platform we look at all rows for the user (any provider).
//   - If any row has invalidated_at IS NULL → status = 'active' and
//     last_seen_at = max(last_registered_at) across active rows.
//   - Else if any rows exist → status = 'invalidated' and
//     last_invalidated_at = max(invalidated_at) across rows.
//   - Else → status = 'absent'.
//
// Schema reality (queried via MCP):
//   user_push_tokens has last_registered_at + invalidated_at; no
//   separate last_seen_at column. last_seen_at in the response surfaces
//   last_registered_at — the cron updates the row on each successful
//   send, so it tracks the most recent successful delivery cadence.
//
// Rate-limit: 30/min per user. Token-status enumeration would otherwise
// give an attacker a side-channel for "is account X registered for
// push?" — the auth gate blocks cross-user reads, the rate cap defeats
// burst probing of the caller's own token graveyard.

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

// T170/T209 — per-user state, never cacheable.
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

const PLATFORMS = /** @type {const} */ (['web', 'ios', 'android']);

/** @typedef {{ registered: boolean, last_seen_at: string | null, last_invalidated_at: string | null, status: 'active' | 'invalidated' | 'absent' }} PlatformStatus */

/**
 * @param {Array<{ platform: string | null, last_registered_at: string | null, invalidated_at: string | null }>} rows
 * @returns {Record<typeof PLATFORMS[number], PlatformStatus>}
 */
function aggregateByPlatform(rows) {
  /** @type {Record<string, PlatformStatus>} */
  const out = {};
  for (const p of PLATFORMS) {
    out[p] = {
      registered: false,
      last_seen_at: null,
      last_invalidated_at: null,
      status: 'absent',
    };
  }
  for (const row of rows) {
    const p = String(row.platform || '').toLowerCase();
    if (!PLATFORMS.includes(/** @type {typeof PLATFORMS[number]} */ (p))) continue;
    const slot = out[p];
    if (row.invalidated_at == null) {
      // Active row wins — bump last_seen_at to the most recent register.
      slot.registered = true;
      slot.status = 'active';
      if (
        row.last_registered_at &&
        (!slot.last_seen_at || row.last_registered_at > slot.last_seen_at)
      ) {
        slot.last_seen_at = row.last_registered_at;
      }
    } else if (slot.status !== 'active') {
      // No active row yet on this platform; carry the latest invalidated
      // timestamp so the iOS UI can show "needs re-register" with context.
      slot.status = 'invalidated';
      if (
        row.invalidated_at &&
        (!slot.last_invalidated_at || row.invalidated_at > slot.last_invalidated_at)
      ) {
        slot.last_invalidated_at = row.invalidated_at;
      }
      if (
        row.last_registered_at &&
        (!slot.last_seen_at || row.last_registered_at > slot.last_seen_at)
      ) {
        slot.last_seen_at = row.last_registered_at;
      }
    }
  }
  return out;
}

export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch (err) {
    if (err.status) {
      console.error('[push.status.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status, headers: NO_STORE }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401, headers: NO_STORE });
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `push-status:${user.id}`,
    policyKey: 'push_status',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { ...NO_STORE, 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const { data, error } = await service
    .from('user_push_tokens')
    .select('platform, last_registered_at, invalidated_at')
    .eq('user_id', user.id);
  if (error) {
    console.error('[push.status]', error);
    return NextResponse.json(
      { error: 'Could not load push status' },
      { status: 500, headers: NO_STORE }
    );
  }

  const status = aggregateByPlatform(data || []);
  return NextResponse.json(status, { headers: NO_STORE });
}
