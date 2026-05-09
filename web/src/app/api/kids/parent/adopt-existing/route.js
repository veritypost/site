// POST /api/kids/parent/adopt-existing
//   Parent-authenticated. Parent picks one of their existing, active,
//   non-paused kids and the server mints a kid JWT for that profile.
//   Sister route to /api/kids/pair-direct: same JWT shape, same kid_sessions
//   row, but no kid_profiles INSERT and no COPPA consent re-capture
//   (consent was captured at original creation).
//
//   Input: { kid_profile_id: UUID, device?: string }
//   Authorization: Bearer <parent_access_token>
//   Output: { access_token, kid_profile_id, kid_name, expires_at }
//
//   Why this exists:
//     Returning parents — including Apple reviewers — would otherwise hit
//     /api/kids/pair-direct on every device and create duplicate kid rows.
//     This is the "pick the existing reader" path.
//
//   Auth contract: identical to pair-direct.
//   Rate limits: identical to pair-direct (5/min per IP, 5/min per parent,
//                policyKey 'kids_pair_direct' so admins can override both
//                routes with one knob).
//   JWT payload: identical to pair-direct (Q3b shape).
//
//   Ownership check:
//     parent_user_id = decoded.sub AND is_active = true.
//     A 404 is returned for any miss to avoid leaking the existence of
//     soft-deleted profiles. Paused kids return 409 with code 'kid_paused'
//     so the picker can render a paused-row affordance.

import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { verifyBearerToken } from '@/lib/auth';
import { isFlagEnabled } from '@/lib/featureFlags';

const TOKEN_TTL_SECONDS = 60 * 60 * 24;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request) {
  try {
    // ── 1. Verify parent JWT ─────────────────────────────────────────────
    const authHeader = request.headers.get('authorization') || '';
    const bearerToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null;
    if (!bearerToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    let decoded;
    try {
      decoded = await verifyBearerToken(bearerToken);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (decoded.aud !== 'authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (decoded.is_kid_delegated === true) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const parentUserId = decoded.sub;
    if (!parentUserId || typeof parentUserId !== 'string' || !UUID_RE.test(parentUserId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── 2. Rate limits (same policyKey as pair-direct) ──────────────────
    const svc = createServiceClient();
    const ip = await getClientIp();
    const ipRate = await checkRateLimit(svc, {
      key: `kids-adopt-existing:${ip}`,
      policyKey: 'kids_pair_direct',
      max: 5,
      windowSec: 60,
    });
    if (ipRate.limited) {
      return NextResponse.json(
        { error: 'Too many attempts — try again shortly' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
    const parentRate = await checkRateLimit(svc, {
      key: `kids-adopt-existing-parent:${parentUserId}`,
      policyKey: 'kids_pair_direct',
      max: 5,
      windowSec: 60,
    });
    if (parentRate.limited) {
      return NextResponse.json(
        { error: 'Too many attempts — try again shortly' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    // ── 2.5. (V2-only) Email-verified gate, parity with pair-direct ───────
    // A parent who later changed email + has not re-verified should not
    // mint fresh 24h kid JWTs from a new device until they re-verify.
    // Same flag as pair-direct so admins can flip both routes together.
    const v2 = await isFlagEnabled(svc, 'pair_direct_v2_enforced', false);
    if (v2) {
      try {
        const { data: adminData, error: adminErr } = await svc.auth.admin.getUserById(parentUserId);
        if (adminErr || !adminData?.user) {
          console.error('[kids.adopt-existing.admin_lookup_err]', adminErr?.message || adminErr);
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (!adminData.user.email_confirmed_at) {
          return NextResponse.json(
            { error: 'verify email first', code: 'email_unverified' },
            { status: 403 }
          );
        }
      } catch (err) {
        console.error('[kids.adopt-existing.admin_lookup_err]', err?.message || err);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
      }
    }

    // ── 3. Parse body ────────────────────────────────────────────────────
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    const kidProfileId = (body || {}).kid_profile_id;
    if (typeof kidProfileId !== 'string' || !UUID_RE.test(kidProfileId)) {
      return NextResponse.json({ error: 'Invalid kid_profile_id' }, { status: 400 });
    }
    const trimmedDevice = String((body || {}).device || '').trim().slice(0, 128);

    // ── 4. Verify ownership + adoptability ───────────────────────────────
    const { data: kidRow, error: kidErr } = await svc
      .from('kid_profiles')
      .select('id, display_name, parent_user_id, is_active, paused_at')
      .eq('id', kidProfileId)
      .eq('parent_user_id', parentUserId)
      .maybeSingle();

    if (kidErr) {
      console.error('[kids.adopt-existing.lookup_err]', kidErr.message || kidErr);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
    if (!kidRow || !kidRow.is_active) {
      return NextResponse.json({ error: 'Kid profile not found' }, { status: 404 });
    }
    if (kidRow.paused_at) {
      return NextResponse.json(
        { error: 'Kid profile is paused', code: 'kid_paused' },
        { status: 409 }
      );
    }

    const kidName = kidRow.display_name;

    // ── 5. Mint kid JWT (Q3b shape — identical to pair-direct) ───────────
    const nowSec = Math.floor(Date.now() / 1000);
    const exp = nowSec + TOKEN_TTL_SECONDS;
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      console.error('[kids.adopt-existing] missing SUPABASE_URL for issuer');
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
    const issuer = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`;
    const jwtSecret = process.env.SUPABASE_JWT_SECRET;
    if (!jwtSecret) {
      console.error('[kids.adopt-existing] missing SUPABASE_JWT_SECRET');
      return NextResponse.json({ error: 'Pairing not configured' }, { status: 503 });
    }

    const token = jwt.sign(
      {
        aud: 'authenticated',
        exp,
        iat: nowSec,
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

    // ── 6. Track session (best-effort) ───────────────────────────────────
    const nowIso = new Date(nowSec * 1000).toISOString();
    try {
      const { error: sessionErr } = await svc.from('kid_sessions').insert({
        kid_profile_id: kidProfileId,
        parent_user_id: parentUserId,
        device_id: trimmedDevice || 'adopt-existing',
        token,
        started_at: nowIso,
        expires_at: new Date(exp * 1000).toISOString(),
      });
      if (sessionErr) {
        console.error('[kids.adopt-existing.session_track_err]', sessionErr.message || sessionErr);
      }
    } catch (err) {
      console.error('[kids.adopt-existing.session_track_err]', err);
    }

    return NextResponse.json({
      access_token: token,
      kid_profile_id: kidProfileId,
      kid_name: kidName,
      expires_at: new Date(exp * 1000).toISOString(),
    });
  } catch (err) {
    console.error('[kids.adopt-existing]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
