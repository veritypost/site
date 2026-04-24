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
import jwt from 'jsonwebtoken';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // matches /api/kids/pair

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
    // from being rotated into a kid JWT by this endpoint.
    if (
      !decoded ||
      decoded.is_kid_delegated !== true ||
      typeof decoded.kid_profile_id !== 'string' ||
      typeof decoded.parent_user_id !== 'string'
    ) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const kidProfileId = decoded.kid_profile_id;
    const parentUserId = decoded.parent_user_id;

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

    const now = Math.floor(Date.now() / 1000);
    const exp = now + TOKEN_TTL_SECONDS;

    const newToken = jwt.sign(
      {
        aud: 'authenticated',
        exp,
        iat: now,
        iss: 'verity-post-kids-pair',
        sub: kidProfileId,
        role: 'authenticated',
        is_kid_delegated: true,
        kid_profile_id: kidProfileId,
        parent_user_id: parentUserId,
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
