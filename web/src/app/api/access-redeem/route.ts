// Public: accepts a referral slug or full /r/<slug> URL, validates the
// code, sets the vp_ref cookie, and returns ok so the client can route
// the visitor to /signup. Mirrors what /r/[slug] does on link click,
// for the case where the user types/pastes their code into the login
// page's "have an invite" field.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { signRef, REF_COOKIE_NAME, REF_COOKIE_TTL_SEC } from '@/lib/referralCookie';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SLUG_RE = /^[a-z0-9]{8,12}$/;

function extractSlug(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  // Bare slug
  if (SLUG_RE.test(trimmed)) return trimmed;
  // Full URL: pull last path segment
  try {
    const u = new URL(trimmed);
    const parts = u.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && SLUG_RE.test(last)) return last;
  } catch {
    // not a URL — ignore
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const service = createServiceClient();

    const ip = await getClientIp();
    const rate = await checkRateLimit(service, {
      key: `access_redeem:ip:${ip || 'unknown'}`,
      policyKey: 'access_redeem_ip',
      max: 30,
      windowSec: 600,
    });
    if (rate.limited) {
      return NextResponse.json(
        { ok: false, reason: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 600) } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const code = typeof body.code === 'string' ? body.code : '';
    const slug = extractSlug(code);
    if (!slug) {
      return NextResponse.json({ ok: false, reason: 'invalid_format' }, { status: 400 });
    }

    const { data: row } = await service
      .from('access_codes')
      .select('id, type, tier, is_active, disabled_at, expires_at, max_uses, current_uses')
      .eq('code', slug)
      .eq('type', 'referral')
      .maybeSingle();

    if (!row) {
      return NextResponse.json({ ok: false, reason: 'code_not_found' }, { status: 404 });
    }
    if (!row.is_active || row.disabled_at) {
      return NextResponse.json({ ok: false, reason: 'code_disabled' }, { status: 410 });
    }
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return NextResponse.json({ ok: false, reason: 'code_expired' }, { status: 410 });
    }
    if (row.max_uses != null && (row.current_uses || 0) >= row.max_uses) {
      return NextResponse.json({ ok: false, reason: 'code_exhausted' }, { status: 410 });
    }

    const { data: setting } = await service
      .from('settings')
      .select('value')
      .eq('key', 'signup_cohort')
      .maybeSingle();
    const cohortSnapshot = (setting?.value as string | undefined) || null;

    const signed = signRef({ c: row.id, t: Date.now(), h: cohortSnapshot });
    if (!signed) {
      return NextResponse.json({ ok: false, reason: 'server_misconfig' }, { status: 500 });
    }

    const res = NextResponse.json({ ok: true, redirect_to: '/login?mode=create' });
    res.cookies.set(REF_COOKIE_NAME, signed, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: REF_COOKIE_TTL_SEC,
    });
    return res;
  } catch (err) {
    console.error('[access-redeem]', err);
    return NextResponse.json({ ok: false, reason: 'internal_error' }, { status: 500 });
  }
}
