// POST /api/kids/pair-direct
//   Parent-authenticated (no pair code). A parent who is already signed
//   in on the Kids iOS app calls this to create a kid profile and receive
//   a kid JWT in one step — no pair code ceremony required.
//
//   Input (V1 — flag OFF, default):
//     { kid_name: string }
//
//   Input (V2 — flag pair_direct_v2_enforced=ON):
//     { kid_name: string,
//       date_of_birth: 'YYYY-MM-DD',
//       consent: { parent_name, ack: true, version: '2026-04-15-v1' },
//       device?: string }
//
//   Authorization: Bearer <parent_access_token>
//   Output: { access_token, kid_profile_id, kid_name, expires_at }
//
// Auth contract:
//   - Caller must present a valid parent JWT (signed with SUPABASE_JWT_SECRET).
//   - Tokens with is_kid_delegated === true are rejected — kid tokens cannot
//     create new kid profiles.
//   - decoded.sub is used as parent_user_id and must be a UUID string.
//   - V2: decoded.aud must equal 'authenticated'.
//   - V2: parent's email_confirmed_at must be non-null (auth.users via
//     svc.auth.admin.getUserById).
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
//   - V1: coppa_consent_given is set to true on the new kid_profiles row
//         and a parental_consents record is upserted with consent_method
//         'pair_direct_v1' as the evidentiary trail.
//   - V2: same plus structured consent block on
//         kid_profiles.metadata.coppa_consent (version, parent_name,
//         accepted_at, ip).
//
// Rate limits:
//   - 5/min per client IP   (key: kids-pair-direct:<ip>)
//   - 5/min per parent UUID (key: kids-pair-direct-parent:<parent_user_id>)

import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { isFlagEnabled } from '@/lib/featureFlags';
import { verifyBearerToken } from '@/lib/auth';
import { validateConsentPayload, COPPA_CONSENT_VERSION } from '@/lib/coppaConsent';

// Same 24-hour TTL as /api/kids/pair (see T301 note there).
const TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24 hours

// Simple UUID-v4 shape check — guards against malformed sub claims
// being forwarded as parent_user_id into DB queries.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Calendar-year age (not ms/365.25). Mirrors the COPPA cliff at full
// calendar years rather than the ~6h drift that 365.25 introduces around
// birthdays. Inputs are UTC Date objects.
function computeCalendarAge(dob, today) {
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const m = today.getUTCMonth();
  const dM = dob.getUTCMonth();
  if (m < dM || (m === dM && today.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
}

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

    // BugList #9 — parent bearer here is a real Supabase access_token.
    // The Supabase project issues ES256-signed JWTs (asymmetric signing
    // keys), so a bare HS256 verify breaks every iOS Kids parent
    // pairing. Use the shared alg-aware verifier from `lib/auth`,
    // which handles HS256 (legacy + e2e) and ES256/RS256 (JWKS) and
    // applies the same aud + iss checks.
    let decoded;
    try {
      decoded = await verifyBearerToken(bearerToken);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── 2. Feature flag — picks V1 (legacy) vs V2 (hardened) path ─────────
    const svc = createServiceClient();
    const v2 = await isFlagEnabled(svc, 'pair_direct_v2_enforced', false);

    // ── 3. (V2-only) Audience check ───────────────────────────────────────
    // Defends against a service_role / anon JWT being forwarded here. V1
    // historically didn't check aud; preserve that behavior under the flag.
    if (v2 && decoded.aud !== 'authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── 4. Reject kid tokens — only parent sessions may create kid profiles
    if (decoded.is_kid_delegated === true) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parentUserId = decoded.sub;
    if (!parentUserId || typeof parentUserId !== 'string' || !UUID_RE.test(parentUserId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── 5. Rate limits (kept BEFORE admin lookup to avoid burning the
    //      auth.admin.getUserById cost on attacker traffic) ────────────────
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

    // ── 6. (V2-only) Email-verified gate ──────────────────────────────────
    // Mirrors the auth.admin.getUserById pattern at
    // /api/kids/parent/reset-pin/route.js:85. Rate limit fires above this
    // so the admin call is bounded.
    if (v2) {
      try {
        const { data: adminData, error: adminErr } = await svc.auth.admin.getUserById(parentUserId);
        if (adminErr || !adminData?.user) {
          console.error('[kids.pair-direct.admin_lookup_err]', adminErr?.message || adminErr);
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (!adminData.user.email_confirmed_at) {
          return NextResponse.json(
            { error: 'verify email first', code: 'email_unverified' },
            { status: 403 }
          );
        }
      } catch (err) {
        console.error('[kids.pair-direct.admin_lookup_err]', err?.message || err);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
      }
    }

    // ── 7. Parse body ─────────────────────────────────────────────────────
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid kid name' }, { status: 400 });
    }

    // ── 8. Validate kid_name ──────────────────────────────────────────────
    const rawName = (body || {}).kid_name;
    if (typeof rawName !== 'string') {
      return NextResponse.json({ error: 'Invalid kid name' }, { status: 400 });
    }
    const kidName = rawName.trim();
    if (kidName.length < 1 || kidName.length > 40) {
      return NextResponse.json({ error: 'Invalid kid name' }, { status: 400 });
    }

    // Ext-W.1 — capture the install-scoped device id when forwarded so
    // /api/kids/refresh can enforce binding. Optional on this route (the
    // input contract historically didn't accept it); when absent we fall
    // back to the legacy 'pair-direct' placeholder, which the refresh
    // route treats as bypass-eligible until the next rotation lands a
    // real id.
    const trimmedDevice = String((body || {}).device || '').trim().slice(0, 128);

    const now = new Date();
    const nowIso = now.toISOString();

    // ── 9. (V2-only) DOB validation ──────────────────────────────────────
    // Parses 'YYYY-MM-DD' explicitly (not `new Date(string)` which is
    // engine-dependent on partial inputs), then checks calendar age.
    let dobString = null; // forwarded into kid_profiles.date_of_birth in V2
    if (v2) {
      const rawDob = (body || {}).date_of_birth;
      if (typeof rawDob !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(rawDob)) {
        return NextResponse.json(
          { error: 'Date of birth required and must be in the past.' },
          { status: 400 }
        );
      }
      const [y, m, d] = rawDob.split('-').map(Number);
      if (
        !Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d) ||
        m < 1 || m > 12 || d < 1 || d > 31
      ) {
        return NextResponse.json(
          { error: 'Date of birth required and must be in the past.' },
          { status: 400 }
        );
      }
      const dob = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
      if (
        Number.isNaN(dob.getTime()) ||
        dob.getUTCFullYear() !== y ||
        dob.getUTCMonth() !== m - 1 ||
        dob.getUTCDate() !== d ||
        dob >= now
      ) {
        return NextResponse.json(
          { error: 'Date of birth required and must be in the past.' },
          { status: 400 }
        );
      }
      const age = computeCalendarAge(dob, now);
      if (age < 3) {
        return NextResponse.json(
          { error: 'Kid must be at least 3 years old.' },
          { status: 400 }
        );
      }
      if (age >= 13) {
        return NextResponse.json(
          { error: 'Kid profiles are for children under 13.' },
          { status: 400 }
        );
      }
      dobString = rawDob;
    }

    // ── 10. (V2-only) Consent validation ─────────────────────────────────
    if (v2) {
      const consentErr = validateConsentPayload((body || {}).consent);
      if (consentErr) {
        // Distinguish stale-version so iOS can prompt for an app update
        // rather than show a generic validation error.
        if (consentErr === 'Consent version out of date — reload the page') {
          return NextResponse.json(
            {
              error: consentErr,
              code: 'consent_version_stale',
              current_version: COPPA_CONSENT_VERSION,
            },
            { status: 400 }
          );
        }
        return NextResponse.json(
          { error: consentErr, code: 'consent_invalid' },
          { status: 400 }
        );
      }
    }

    // ── 11. (V2-only) Seat-cap check ─────────────────────────────────────
    // Lifted verbatim from /api/kids POST (route.js:111-174) with
    // owner-mode bypass dropped.
    //
    // Owner-mode bypass intentionally not implemented here; pair-direct
    // is JWT-only, owner-mode permission lookup requires a cookie session.
    if (v2) {
      try {
        const [{ count: activeKidCount }, subRes] = await Promise.all([
          svc
            .from('kid_profiles')
            .select('id', { count: 'exact', head: true })
            .eq('parent_user_id', parentUserId)
            .eq('is_active', true),
          svc
            .from('subscriptions')
            .select('kid_seats_paid, status, plan_id, plans!inner(tier, metadata)')
            .eq('user_id', parentUserId)
            .in('status', ['active', 'trialing'])
            .maybeSingle(),
        ]);
        const seatsPaid = subRes?.data?.kid_seats_paid ?? 1;
        const planMeta = subRes?.data?.plans?.metadata ?? {};
        const maxKids = Number(planMeta.max_kids) || 4;
        const extraKidPriceCents = Number(planMeta.extra_kid_price_cents) || 499;
        const next = (activeKidCount ?? 0) + 1;
        if (next > maxKids) {
          return NextResponse.json(
            {
              error: `Plan limit reached: up to ${maxKids} kid profiles per family.`,
              code: 'kid_cap_reached',
              max_kids: maxKids,
            },
            { status: 400 }
          );
        }
        if (next > seatsPaid) {
          return NextResponse.json(
            {
              error: `Adding this kid increases your subscription by $${(extraKidPriceCents / 100).toFixed(2)}/mo. Confirm seat purchase before retrying.`,
              code: 'kid_seat_required',
              current_kid_count: activeKidCount ?? 0,
              kid_seats_paid: seatsPaid,
              extra_kid_price_cents: extraKidPriceCents,
            },
            { status: 402 }
          );
        }
      } catch (err) {
        // A27 — fail closed on any seat-check exception. Plan-cap math is
        // the single guardrail; we don't want to bypass it on transient
        // errors. Mirrors /api/kids POST 503 path.
        console.error('[kids.pair-direct.seat_check]', err?.message || err);
        return NextResponse.json(
          {
            error: 'Could not verify seat availability — try again in a moment.',
            code: 'seat_check_unavailable',
          },
          {
            status: 503,
            headers: { 'Retry-After': '5' },
          }
        );
      }
    }

    // ── 12. Create kid_profiles row ──────────────────────────────────────
    const insertRow = {
      parent_user_id: parentUserId,
      display_name: kidName,
      coppa_consent_given: true,
      coppa_consent_at: nowIso,
    };
    if (v2) {
      insertRow.date_of_birth = dobString;
      insertRow.metadata = {
        coppa_consent: {
          version: COPPA_CONSENT_VERSION,
          parent_name: body.consent.parent_name.trim(),
          accepted_at: nowIso,
          ip: ip || null,
        },
      };
    }

    const { data: profileData, error: profileErr } = await svc
      .from('kid_profiles')
      .insert(insertRow)
      .select('id, display_name')
      .single();

    if (profileErr) {
      console.error('[kids.pair-direct.profile_err]', profileErr.message || profileErr);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }

    const kidProfileId = profileData.id;

    // ── 13. Log parental consent (best-effort) ───────────────────────────
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
          consented_at: nowIso,
        },
        { onConflict: 'parent_user_id,kid_profile_id' }
      );
      if (consentErr) {
        console.error('[kids.pair-direct.consent_log_err]', consentErr.message || consentErr);
      }
    } catch (err) {
      console.error('[kids.pair-direct.consent_log_err]', err);
    }

    // ── 14. (V2-only) flip users.has_kids_profiles ───────────────────────
    // Best-effort parity with /api/kids POST (route.js:206); failure does
    // not block kid creation.
    if (v2) {
      try {
        await svc.from('users').update({ has_kids_profiles: true }).eq('id', parentUserId);
      } catch (err) {
        console.error('[kids.pair-direct.has_kids_flag_err]', err?.message || err);
      }
    }

    // ── 15. Mint kid JWT (Q3b shape, identical to /api/kids/pair) ────────
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

    // ── 16. Track the live kid session (Ext-W.1 device binding) ──────────
    try {
      const { error: sessionErr } = await svc.from('kid_sessions').insert({
        kid_profile_id: kidProfileId,
        parent_user_id: parentUserId,
        device_id: trimmedDevice || 'pair-direct',
        token,
        started_at: nowIso,
        expires_at: new Date(exp * 1000).toISOString(),
      });
      if (sessionErr) {
        console.error('[kids.pair-direct.session_track_err]', sessionErr.message || sessionErr);
      }
    } catch (err) {
      console.error('[kids.pair-direct.session_track_err]', err);
    }

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
