// POST /api/kids/pair-direct
//   Parent-authenticated (no pair code). A parent who is already signed
//   in on the Kids iOS app calls this to create a kid profile and receive
//   a kid JWT in one step — no pair code ceremony required.
//
//   Input: { kid_name: string }  (1–40 chars, trimmed)
//   Authorization: Bearer <parent_access_token>
//   Output: { access_token, kid_profile_id, kid_name, expires_at }
//
// Auth contract:
//   - Caller must present a valid parent JWT (signed with SUPABASE_JWT_SECRET).
//   - Tokens with is_kid_delegated === true are rejected — kid tokens cannot
//     create new kid profiles.
//   - decoded.sub is used as parent_user_id and must be a UUID string.
//
// JWT payload minted for the new kid (same Q3b shape as /api/kids/pair):
//   - iss: `${SUPABASE_URL}/auth/v1`  — matches the Supabase issuer so
//          the supabase-swift client treats this as a first-class
//          session and auth.jwt() resolves it through the standard path
//   - sub: kid_profile_id  (so auth.uid() returns the kid_profile_id)
//   - role: 'authenticated'
//   - is_kid_delegated: true  (top-level; public.is_kid_delegated() RLS
//          helper reads this top-level)
//   - app_metadata: { is_kid_delegated, kid_profile_id, parent_user_id }
//          (public.current_kid_profile_id() reads kid_profile_id from
//          app_metadata; standard Supabase shape)
//   - kid_profile_id, parent_user_id at top level too — backward-compat
//          for in-flight kid tokens minted under the pre-Q3b shape +
//          for `lib/auth.js` getUser() which reads either location.
//
// COPPA consent:
//   - coppa_consent_given is set to true on the new kid_profiles row.
//   - A parental_consents record is upserted with consent_method
//     'pair_direct_v1' as the evidentiary trail.
//
// Rate limits:
//   - 5/min per client IP   (key: kids-pair-direct:<ip>)
//   - 5/min per parent UUID (key: kids-pair-direct-parent:<parent_user_id>)

import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

// Same 24-hour TTL as /api/kids/pair (see T301 note there).
const TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24 hours

// Simple UUID-v4 shape check — guards against malformed sub claims
// being forwarded as parent_user_id into DB queries.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request) {
  try {
    // ── 1. Extract + verify parent JWT ────────────────────────────────────
    const authHeader = request.headers.get('authorization') || '';
    const bearerToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null;
    if (!bearerToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const jwtSecret = process.env.SUPABASE_JWT_SECRET;
    if (!jwtSecret) {
      console.error('[kids.pair-direct] missing SUPABASE_JWT_SECRET');
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }

    let decoded;
    try {
      decoded = jwt.verify(bearerToken, jwtSecret);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Reject kid tokens — only parent sessions may create kid profiles.
    if (decoded.is_kid_delegated === true) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parentUserId = decoded.sub;
    if (!parentUserId || typeof parentUserId !== 'string' || !UUID_RE.test(parentUserId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── 2. Rate limits ─────────────────────────────────────────────────────
    const svc = createServiceClient();
    const ip = await getClientIp();

    const ipRate = await checkRateLimit(svc, {
      key: `kids-pair-direct:${ip}`,
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
      key: `kids-pair-direct-parent:${parentUserId}`,
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

    // ── 3. Validate body ───────────────────────────────────────────────────
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid kid name' }, { status: 400 });
    }

    const rawName = (body || {}).kid_name;
    if (typeof rawName !== 'string') {
      return NextResponse.json({ error: 'Invalid kid name' }, { status: 400 });
    }
    const kidName = rawName.trim();
    if (kidName.length < 1 || kidName.length > 40) {
      return NextResponse.json({ error: 'Invalid kid name' }, { status: 400 });
    }

    // ── 4. Create kid_profiles row ─────────────────────────────────────────
    const now = new Date().toISOString();
    const { data: profileData, error: profileErr } = await svc
      .from('kid_profiles')
      .insert({
        parent_user_id: parentUserId,
        display_name: kidName,
        coppa_consent_given: true,
        coppa_consent_at: now,
      })
      .select('id, display_name')
      .single();

    if (profileErr) {
      console.error('[kids.pair-direct.profile_err]', profileErr.message || profileErr);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }

    const kidProfileId = profileData.id;

    // ── 5. Log parental consent (best-effort) ──────────────────────────────
    // C15-equivalent: evidentiary trail for COPPA consent via direct-pair
    // ceremony. ON CONFLICT replaces any stale record for this pair.
    // Failure is logged but does NOT block the response.
    try {
      const userAgent = (request.headers.get('user-agent') || '').slice(0, 512);
      const { error: consentErr } = await svc.from('parental_consents').upsert(
        {
          parent_user_id: parentUserId,
          kid_profile_id: kidProfileId,
          consent_method: 'pair_direct_v1',
          consent_ip: ip || null,
          consent_user_agent: userAgent || null,
          consented_at: now,
        },
        { onConflict: 'parent_user_id,kid_profile_id' }
      );
      if (consentErr) {
        console.error('[kids.pair-direct.consent_log_err]', consentErr.message || consentErr);
      }
    } catch (err) {
      console.error('[kids.pair-direct.consent_log_err]', err);
    }

    // ── 6. Mint kid JWT (Q3b shape, identical to /api/kids/pair) ──────────
    const nowSec = Math.floor(Date.now() / 1000);
    const exp = nowSec + TOKEN_TTL_SECONDS;

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      console.error('[kids.pair-direct] missing SUPABASE_URL for issuer');
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
    const issuer = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`;

    const token = jwt.sign(
      {
        aud: 'authenticated',
        exp,
        iat: nowSec,
        iss: issuer,
        sub: kidProfileId,
        role: 'authenticated',
        // Top-level: read by public.is_kid_delegated() and by the
        // backward-compat branch in lib/auth.js getUser().
        is_kid_delegated: true,
        kid_profile_id: kidProfileId,
        parent_user_id: parentUserId,
        // app_metadata: read by public.current_kid_profile_id() and by
        // S3's preferred branch in lib/auth.js getUser(). Mirrors the
        // top-level fields so both shapes resolve to the same identity.
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
      access_token: token,
      kid_profile_id: kidProfileId,
      kid_name: kidName,
      expires_at: new Date(exp * 1000).toISOString(),
    });
  } catch (err) {
    console.error('[kids.pair-direct]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
