// POST /api/kids/refresh
//   Bearer-authed. Kids iOS calls this when the stored JWT has <24h of TTL
//   left. Verifies the bearer JWT + confirms the kid_profile is still active,
//   then re-signs a fresh 7-day JWT with the same claims. The old token stays
//   valid until its own exp — rolling overlap, no dead sessions.
//
// Input:  Authorization: Bearer <current kid JWT>, no body required.
// Output: { access_token, kid_profile_id, expires_at }
//
// Failure modes:
//   - Missing/invalid signature/expired  → 401 (client should clear + re-pair)
//   - Profile deleted / inactive / paused → 401
//   - Rate limited                        → 429 Retry-After
//
// Token rotation does NOT change kid_profile_id or parent_user_id — RLS
// semantics are unchanged across the rotation.

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

// Ext-W.1 — placeholder device_ids written by older kid_sessions inserts
// before iOS started forwarding `device` on /pair-direct + /refresh. Rows
// tagged with these markers bypass install-id binding enforcement so
// pre-2026-05-08 paired kids don't get locked out; the next time their
// session is rotated by an updated client, the column will hold a real
// device id and enforcement engages from then on.
const PLACEHOLDER_DEVICE_IDS = new Set(['unknown', 'pair-direct']);

// Hash a device id down to 8 hex chars for log redaction. Never log the
// raw value — install-scoped UUIDs are PII-ish identifiers per device.
function hashDevice(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 8);
}

const TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24 hours — matches /api/kids/pair (T301)

export async function POST(request) {
  try {
    const svc = createServiceClient();
    const ip = await getClientIp();
    const rate = await checkRateLimit(svc, {
      key: `kids-refresh:${ip}`,
      policyKey: 'kids_refresh',
      max: 30,
      windowSec: 60,
    });
    if (rate.limited) {
      return NextResponse.json(
        { error: 'Too many attempts — try again shortly' },
        { status: 429, headers: { 'Retry-After': String(rate.windowSec || 60) } }
      );
    }

    const authHeader = request.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 });
    }
    const token = match[1];

    // Ext-W.1 — install-id binding. iOS forwards its install-scoped UUID on
    // every refresh; we compare against the device_id stored on the live
    // kid_sessions row. Strict from the start: a request with no device is
    // refused outright, no lenient bypass — every shipping kids client
    // sends one.
    let body;
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const requestDevice = String((body && body.device) || '').trim().slice(0, 128);
    if (!requestDevice) {
      return NextResponse.json({ error: 'device_required' }, { status: 401 });
    }

    const jwtSecret = process.env.SUPABASE_JWT_SECRET;
    if (!jwtSecret) {
      return NextResponse.json({ error: 'Pairing not configured' }, { status: 503 });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
    } catch (err) {
      console.warn('[kids.refresh] jwt.verify failed:', err?.message || err);
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    // Shape guard — refuse any token that isn't a kid-delegated pair JWT, even
    // if signed correctly. Stops an adult GoTrue access_token (same secret)
    // from being rotated into a kid JWT by this endpoint. Q3b: read claims
    // from BOTH top-level (pre-Q3b shape, still in flight on existing
    // devices) AND app_metadata (post-Q3b Supabase-issuer shape).
    const claims = decoded || {};
    const meta =
      claims.app_metadata && typeof claims.app_metadata === 'object'
        ? claims.app_metadata
        : {};
    const isKidDelegated =
      claims.is_kid_delegated === true || meta.is_kid_delegated === true;
    const kidProfileId =
      typeof claims.kid_profile_id === 'string' && claims.kid_profile_id
        ? claims.kid_profile_id
        : typeof meta.kid_profile_id === 'string'
          ? meta.kid_profile_id
          : null;
    const parentUserId =
      typeof claims.parent_user_id === 'string' && claims.parent_user_id
        ? claims.parent_user_id
        : typeof meta.parent_user_id === 'string'
          ? meta.parent_user_id
          : null;
    if (!isKidDelegated || !kidProfileId || !parentUserId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Profile state check. kid_profiles has no frozen_at/deleted_at columns;
    // `is_active=false` is the soft-delete slot, `paused_at IS NOT NULL` is the
    // parent-pause state. Both must be clear to rotate the token.
    const { data: profile, error: profileErr } = await svc
      .from('kid_profiles')
      .select('id, parent_user_id, is_active, paused_at')
      .eq('id', kidProfileId)
      .maybeSingle();

    if (profileErr) {
      console.error('[kids.refresh] kid_profiles lookup:', profileErr);
      return NextResponse.json({ error: 'Could not refresh token' }, { status: 500 });
    }
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 401 });
    }
    if (profile.is_active === false || profile.paused_at) {
      return NextResponse.json({ error: 'Profile unavailable' }, { status: 401 });
    }
    if (profile.parent_user_id !== parentUserId) {
      // Parent reassignment is structurally impossible today, but fail closed
      // if it ever happens — kid device must re-pair against the new parent.
      return NextResponse.json({ error: 'Profile reassigned' }, { status: 401 });
    }

    // Server-side revocation check. /api/kids/pair and /api/kids/pair-direct
    // INSERT a kid_sessions row keyed by kid_profile_id; the parent-mode
    // destructive-unpair flow flips revoked_at on those rows (and inserts
    // a synthetic revoked row if no live row existed at unpair-time).
    //
    // Three-state logic:
    //   1. Live row (revoked_at IS NULL) exists  → proceed, rotate token.
    //   2. No live row but at least one revoked row exists
    //                                             → 401 kid_token_revoked.
    //      This covers both real unpairs AND the synthetic-row case where
    //      pair-time INSERT failed initially and unpair reconstructed.
    //   3. No rows at all (live or revoked)      → graceful pass.
    //      Legacy tokens minted before kid_sessions started being
    //      populated (pre-2026-05-08 server-side-revocation work). New
    //      pairings post-2026-05-08 always have a row, so once in-flight
    //      24h-TTL kid tokens roll over, every kid is fully covered.
    // ORDER BY started_at DESC LIMIT 1 — newest live row wins. Multiple
    // live rows can coexist when a kid re-pairs without an explicit unpair
    // (the unpair sweep is what flips revoked_at), so picking the newest
    // makes the device-binding check deterministic.
    const { data: liveRow, error: liveErr } = await svc
      .from('kid_sessions')
      .select('id, device_id')
      .eq('kid_profile_id', kidProfileId)
      .is('revoked_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (liveErr) {
      console.error('[kids.refresh] kid_sessions live lookup:', liveErr);
      return NextResponse.json({ error: 'Could not refresh token' }, { status: 500 });
    }
    if (liveRow) {
      // Ext-W.1 — install-id binding enforcement. Skip when the stored
      // device id is one of the legacy placeholders (no real device id was
      // captured at pair time); enforce strictly otherwise. Never log the
      // raw device ids — hash to 8 hex chars first.
      const isPlaceholder = PLACEHOLDER_DEVICE_IDS.has(liveRow.device_id);
      if (!isPlaceholder && liveRow.device_id !== requestDevice) {
        console.warn('[kids.refresh.device_mismatch]', {
          kid_profile_id: kidProfileId,
          expected_hash: hashDevice(liveRow.device_id),
          got_hash: hashDevice(requestDevice),
        });
        return NextResponse.json({ error: 'device_mismatch' }, { status: 401 });
      }
    }
    if (!liveRow) {
      // No live row — check whether any row exists at all. If yes, the
      // kid was unpaired (real or synthetic revoked row); if no, this is
      // a legacy token from before kid_sessions tracking — graceful pass.
      const { data: anyRow, error: anyErr } = await svc
        .from('kid_sessions')
        .select('id')
        .eq('kid_profile_id', kidProfileId)
        .limit(1)
        .maybeSingle();
      if (anyErr) {
        console.error('[kids.refresh] kid_sessions any lookup:', anyErr);
        return NextResponse.json({ error: 'Could not refresh token' }, { status: 500 });
      }
      if (anyRow) {
        return NextResponse.json({ error: 'kid_token_revoked' }, { status: 401 });
      }
      // anyRow is null — graceful pass for legacy pre-tracking tokens.
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = now + TOKEN_TTL_SECONDS;

    // Q3b — issuer flip. See web/src/app/api/kids/pair/route.js for the
    // full rationale. Same Supabase-issuer URL so auth.jwt() resolves
    // through the standard path; same dual-shape claim placement (top-
    // level + app_metadata) so both pre-Q3b and post-Q3b consumers
    // (lib/auth.js getUser, public.is_kid_delegated, and
    // public.current_kid_profile_id) read the same identity.
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      console.error('[kids.refresh] missing SUPABASE_URL for issuer');
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });
    }
    const issuer = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`;

    const newToken = jwt.sign(
      {
        aud: 'authenticated',
        exp,
        iat: now,
        iss: issuer,
        sub: kidProfileId,
        role: 'authenticated',
        is_kid_delegated: true,
        kid_profile_id: kidProfileId,
        parent_user_id: parentUserId,
        app_metadata: {
          is_kid_delegated: true,
          kid_profile_id: kidProfileId,
          parent_user_id: parentUserId,
        },
      },
      jwtSecret,
      { algorithm: 'HS256' }
    );

    return NextResponse.json({
      access_token: newToken,
      kid_profile_id: kidProfileId,
      expires_at: new Date(exp * 1000).toISOString(),
    });
  } catch (err) {
    console.error('[kids.refresh]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
