// Public access-request intake — beta waitlist.
//
// Phase 1 design (matches "best teams" intake flow):
//   - Email-only payload. No confirm-email step; the access codes & invite
//     link admin sends on approval are the actual proof-of-control of the
//     inbox. Spam/bogus entries get filtered in the admin queue.
//   - Anti-enumeration response shape:
//       * Generic 200 across every account-state branch (already a user,
//         already approved, already pending, bot-rejected, per-email
//         rate-limit hit, success). Attacker can't probe email state.
//       * Per-IP rate-limit returns 429 with Retry-After. The hammering
//         party IS the attacker — leaking that they're capped is
//         intentional and the proper retry signal for legitimate users.
//       * Malformed payload returns 400.
//   - Captures attribution at intake (UTM, referrer, vp_ref cookie,
//     signup_cohort snapshot) into `metadata` jsonb — frozen at submit
//     time so later cohort flips don't rewrite history.
//   - Two rate-limit scopes (policy keys in lib/rateLimits.ts):
//       ACCESS_REQUEST_SUBMIT_PER_IP    (5/hour)
//       ACCESS_REQUEST_SUBMIT_PER_EMAIL (1/day)
//   - Short-circuits before insert: already an active user, already
//     approved (re-fire invite re-mint is admin's call), already pending
//     (idempotent — refresh updated_at, no dup row).

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { getRateLimitPolicy } from '@/lib/rateLimits';
import { isAsciiEmail } from '@/lib/emailNormalize';
import { REF_COOKIE_NAME, verifyRef } from '@/lib/referralCookie';
import { cookies } from 'next/headers';
import { renderTemplate, sendEmail } from '@/lib/email';
import { WAITLIST_TEMPLATE, buildWaitlistVars } from '@/lib/waitlistEmail';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const GENERIC_OK = {
  ok: true,
  message: "Request received. We'll email a sign-in link once your account is approved.",
};

function genericOk() {
  return NextResponse.json(GENERIC_OK, {
    status: 200,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

// Pull attribution from headers + body. Frozen at intake. Stored on
// metadata jsonb so the schema doesn't churn every time we add a field.
function buildAttribution(request, body, refCookie, cohortSnapshot, ipTruncated) {
  // Headers are runtime-bounded, but defensively cap. Hostile UAs can be
  // multi-KB; we don't want metadata jsonb growing unbounded.
  const referer = (request.headers.get('referer') || '').slice(0, 1024) || null;
  const ua = (request.headers.get('user-agent') || '').slice(0, 1024) || null;
  // Pull UTM from the body when present (the form may forward window.location
  // params at submit), falling back to parsing the referer header.
  const utm = {
    source: pickUtm(body, referer, 'utm_source'),
    medium: pickUtm(body, referer, 'utm_medium'),
    campaign: pickUtm(body, referer, 'utm_campaign'),
    term: pickUtm(body, referer, 'utm_term'),
    content: pickUtm(body, referer, 'utm_content'),
  };
  let referralCodeId = null;
  if (refCookie) {
    const decoded = verifyRef(refCookie);
    if (decoded?.c) referralCodeId = decoded.c;
  }
  return {
    captured_at: new Date().toISOString(),
    cohort_snapshot: cohortSnapshot || null,
    referral_code_id: referralCodeId,
    referer,
    user_agent: ua,
    ip_24: ipTruncated,
    utm,
  };
}

function pickUtm(body, referer, key) {
  if (body && typeof body[key] === 'string' && body[key].length <= 200) return body[key];
  if (!referer) return null;
  try {
    const u = new URL(referer);
    const v = u.searchParams.get(key);
    return v ? v.slice(0, 200) : null;
  } catch {
    return null;
  }
}

// Truncate IPv4 to /24. IPv6 falls through unchanged because /24 doesn't
// map; full v6 is fine for rate-limit keys.
function truncateIp(ip) {
  if (!ip) return null;
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  return ip;
}

export async function POST(request) {
  try {
    const service = createServiceClient();

    // Parse body once. Malformed → 400.
    let body = null;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    const rawEmail = typeof body?.email === 'string' ? body.email.trim() : '';
    if (!rawEmail || rawEmail.length > 254 || !EMAIL_RE.test(rawEmail) || !isAsciiEmail(rawEmail)) {
      return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
    }
    const email = rawEmail.toLowerCase();

    // Optional name + reason — schema columns already exist.
    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 100) : null;
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : null;

    const rawIp = await getClientIp();
    const ipTruncated = truncateIp(rawIp);

    // Per-IP rate limit. Returns 429 (intentional — see header comment).
    const ipPolicy = getRateLimitPolicy('ACCESS_REQUEST_SUBMIT_PER_IP');
    const ipRate = await checkRateLimit(service, {
      key: `access_request:ip:${rawIp || 'unknown'}`,
      policyKey: 'access_request_submit_per_ip',
      ...ipPolicy,
    });
    if (ipRate.limited) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(ipRate.windowSec ?? ipPolicy.windowSec) } }
      );
    }

    // Per-email rate limit. Cap-hit returns generic ok — anti-enumeration.
    const emailPolicy = getRateLimitPolicy('ACCESS_REQUEST_SUBMIT_PER_EMAIL');
    const emailRate = await checkRateLimit(service, {
      key: `access_request:email:${email}`,
      policyKey: 'access_request_submit_per_email',
      ...emailPolicy,
    });
    if (emailRate.limited) {
      return genericOk();
    }

    // Cohort snapshot — frozen at intake so a later admin flip of
    // signup_cohort doesn't rewrite the row's attribution.
    const { data: setting } = await service
      .from('settings')
      .select('value')
      .eq('key', 'signup_cohort')
      .maybeSingle();
    const cohortSnapshot = (setting?.value && String(setting.value)) || null;

    const cookieJar = await cookies();
    const refCookie = cookieJar.get(REF_COOKIE_NAME)?.value || null;
    const attribution = buildAttribution(request, body, refCookie, cohortSnapshot, ipTruncated);

    // Short-circuit: already an active user. Don't insert; return generic ok.
    // Anti-enumeration: same response shape as a real submission.
    // `email` is already lowercased; users.email is lowercased at insert
    // time across the auth pipeline, so eq is the correct primitive.
    const { data: existingUser } = await service
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existingUser) {
      return genericOk();
    }

    // Short-circuit: already approved. Same generic ok — admin can re-fire
    // the invite manually from the queue if the user lost the email.
    const { data: approved } = await service
      .from('access_requests')
      .select('id')
      .eq('email', email)
      .eq('status', 'approved')
      .maybeSingle();
    if (approved) {
      return genericOk();
    }

    // Idempotent insert / refresh. If a pending row exists we just bump
    // updated_at + refresh attribution — no dup.
    const { data: existingPending } = await service
      .from('access_requests')
      .select('id')
      .eq('email', email)
      .eq('status', 'pending')
      .maybeSingle();

    // DB write failures collapse to genericOk + console.error — never
    // surface a 500 to the public surface (anti-enumeration: hostile
    // probing must not get a different status code on a triggered error).
    if (existingPending) {
      const { error } = await service
        .from('access_requests')
        .update({
          ...(name !== null ? { name } : {}),
          ...(reason !== null ? { reason } : {}),
          metadata: attribution,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingPending.id);
      if (error) {
        console.error('[access-request] refresh error:', error.message);
        return genericOk();
      }
    } else {
      const { error } = await service.from('access_requests').insert({
        email,
        type: 'beta',
        status: 'pending',
        ...(name ? { name } : {}),
        ...(reason ? { reason } : {}),
        ip_address: rawIp || null,
        user_agent: (request.headers.get('user-agent') || '').slice(0, 1024) || null,
        metadata: attribution,
      });
      if (error) {
        console.error('[access-request] insert error:', error.message);
        return genericOk();
      }
    }

    // Best-effort audit row — visibility for ops without coupling to the
    // primary write. Failure here doesn't fail the response.
    try {
      await service.from('audit_log').insert({
        actor_id: null,
        action: 'access_request:submit',
        target_type: 'email',
        target_id: null,
        metadata: { email_lc: email, ip_24: ipTruncated, cohort: cohortSnapshot },
      });
    } catch {}

    // Send waitlist confirmation email. Best-effort — failure never blocks
    // the response or changes the DB state.
    try {
      const tpl = renderTemplate(WAITLIST_TEMPLATE, buildWaitlistVars(name));
      await sendEmail({
        to: email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        fromName: tpl.fromName,
        fromEmail: tpl.fromEmail,
      });
    } catch (e) {
      console.error('[access-request] waitlist confirmation email failed:', e);
    }

    return genericOk();
  } catch (err) {
    // Anti-enumeration: even a top-level throw collapses to generic ok.
    // Real failure visibility is via console.error (and Sentry once wired).
    console.error('[access-request]', err);
    return genericOk();
  }
}
