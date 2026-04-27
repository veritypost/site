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

// T301 — reduced from 7 days to 24 hours. The JWT minted on a successful
// pair grants kid_profile_id + parent_user_id full-session access; a 7-day
// window meant a leaked code (SMS, screenshot, screen-share) could be
// replayed for a week before the kid re-pairs. 24h cuts the leak window
// 7× without breaking common kid usage (a long reading session in one day
// stays signed in; the next day re-pair takes ~10 seconds with the parent
// device). Pairs with the kids-security follow-up (parent out-of-band
// confirmation + first-pair alert) — that's a separate item.
const TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24 hours

export async function POST(request) {
  try {
    // First-line per-IP rate limit (10/min). Fails CLOSED in prod.
    const svc = createServiceClient();
    const ip = await getClientIp();
    const rate = await checkRateLimit(svc, {
      key: `kids-pair:${ip}`,
      policyKey: 'kids_pair',
      max: 10,
      windowSec: 60,
    });
    if (rate.limited) {
      return NextResponse.json(
        { error: 'Too many attempts — try again shortly' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
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

    // H11 — secondary per-device rate-limit. An attacker that rotates IPs
    // but reuses a device (or vice versa) was uncapped by IP-only keying.
    // Truncate device to a stable suffix so the key length stays bounded;
    // fallback to a separate `nodevice` bucket so devices not yet
    // sending the field don't share the same key as everyone else.
    const deviceTag =
      typeof device === 'string' && device.trim().length > 0
        ? device.trim().slice(0, 64)
        : 'nodevice';
    const deviceRate = await checkRateLimit(svc, {
      key: `kids-pair-device:${deviceTag}`,
      policyKey: 'kids_pair',
      max: 10,
      windowSec: 60,
    });
    if (deviceRate.limited) {
      return NextResponse.json(
        { error: 'Too many attempts — try again shortly' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

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

    // C15 — write a structured COPPA consent record tied to this exact
    // pairing event. parent_user_id ↔ kid_profile_id is the evidentiary
    // link; consent_method names the ceremony; IP + UA aid forensics.
    // ON CONFLICT replaces a stale record (e.g., re-pair after unpair)
    // so the table holds the most recent consent per pair. Best-effort
    // — a consent-log write failure shouldn't brick pairing, but we
    // log it loudly so it can be reconciled.
    try {
      const userAgent = (request.headers.get('user-agent') || '').slice(0, 512);
      const { error: consentErr } = await svc.from('parental_consents').upsert(
        {
          parent_user_id,
          kid_profile_id,
          consent_method: 'pair_code_redeem_v1',
          consent_ip: ip || null,
          consent_user_agent: userAgent || null,
          consented_at: new Date().toISOString(),
        },
        { onConflict: 'parent_user_id,kid_profile_id' }
      );
      if (consentErr) {
        console.error('[kids.pair.consent_log_err]', consentErr.message || consentErr);
      }
    } catch (err) {
      console.error('[kids.pair.consent_log_err]', err);
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
