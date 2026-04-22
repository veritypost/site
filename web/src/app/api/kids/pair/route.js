// @feature-verified kids_pair 2026-04-19
//
// POST /api/kids/pair
//   Public (no auth). Kid device calls this with a pair code.
//   Input: { code, device? }
//   Output: { access_token, kid_profile_id, kid_name, expires_at }
//
// JWT payload signed with SUPABASE_JWT_SECRET:
//   - sub: kid_profile_id  (so auth.uid() returns the kid_profile_id)
//   - role: 'authenticated'
//   - is_kid_delegated: true  (custom claim; RLS branches on this)
//   - kid_profile_id: uuid     (duplicate of sub for clarity)
//   - parent_user_id: uuid     (used by RLS to bind writes to the parent's users.id)
//
// Kid iOS stores this token + uses it as the bearer on all Supabase calls.
// RLS policies on kid-readable tables accept either adult session (parent path)
// or kid JWT (kid_profile_id match path).

import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days — kid re-pairs weekly

export async function POST(request) {
  try {
    // Rate-limit: 10 attempts per minute per IP. Fails CLOSED in prod.
    const svc = createServiceClient();
    const ip = await getClientIp();
    const rate = await checkRateLimit(svc, {
      key: `kids-pair:${ip}`,
      policyKey: 'kids_pair',
      max: 10,
      windowSec: 60,
    });
    if (rate.limited) {
      return NextResponse.json({ error: 'Too many attempts — try again shortly' }, { status: 429 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { code, device } = body || {};
    if (!code || typeof code !== 'string' || code.length < 6 || code.length > 16) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
    }
    const normalised = code.trim().toUpperCase();

    const jwtSecret = process.env.SUPABASE_JWT_SECRET;
    if (!jwtSecret) {
      return NextResponse.json({ error: 'Pairing not configured' }, { status: 503 });
    }

    // Redeem via service-role RPC (atomic: marks used + returns payload)
    const { data, error } = await svc.rpc('redeem_kid_pair_code', {
      p_code: normalised,
      p_device: typeof device === 'string' ? device.slice(0, 128) : null,
    });

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('invalid code'))
        return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
      if (msg.includes('already used'))
        return NextResponse.json({ error: 'Code already used' }, { status: 410 });
      if (msg.includes('expired'))
        return NextResponse.json({ error: 'Code expired' }, { status: 410 });
      return NextResponse.json({ error: 'Could not pair' }, { status: 500 });
    }

    const { kid_profile_id, parent_user_id, kid_name } = data || {};
    if (!kid_profile_id || !parent_user_id) {
      return NextResponse.json({ error: 'Pair response missing data' }, { status: 500 });
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = now + TOKEN_TTL_SECONDS;

    const token = jwt.sign(
      {
        aud: 'authenticated',
        exp,
        iat: now,
        iss: 'verity-post-kids-pair',
        sub: kid_profile_id,
        role: 'authenticated',
        is_kid_delegated: true,
        kid_profile_id,
        parent_user_id,
      },
      jwtSecret,
      { algorithm: 'HS256' }
    );

    return NextResponse.json({
      access_token: token,
      kid_profile_id,
      kid_name: kid_name || 'Reader',
      expires_at: new Date(exp * 1000).toISOString(),
    });
  } catch (err) {
    console.error('[kids.pair]', err);
    // NOTE: iOS `PairingClient.swift` parses the error string for keywords
    // "used" / "expired". Those keywords are only emitted by the RPC-error
    // mapping above (lines 62-67), which already returns safe hardcoded
    // messages. This catch-all covers unexpected failures (JWT signing,
    // network, etc.) and returns a generic safe response.
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
