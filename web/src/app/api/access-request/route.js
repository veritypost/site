// Public access-request intake. During closed beta, anyone without
// an invite link can submit name + email + reason. Lands in
// access_requests; admin reviews at /admin/access-requests; on approve
// they get a one-time owner-link via email.
//
// Reactivates the route that was 410'd by Ext-AA1 (2026-04-25). The
// route is intentionally permissive on insert (RLS policy with_check
// is `true`) so unauthenticated visitors can submit; rate-limited by IP
// to make scraping/spamming uneconomic.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request) {
  try {
    const service = createServiceClient();

    const ip = await getClientIp();
    const rate = await checkRateLimit(service, {
      key: `access_request:ip:${ip || 'unknown'}`,
      policyKey: 'access_request_ip',
      max: 5,
      windowSec: 3600,
    });
    if (rate.limited) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 3600) } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : null;
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 1500) : null;
    const referral_source =
      typeof body.referral_source === 'string' ? body.referral_source.trim().slice(0, 200) : null;

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
    }

    const userAgent = request.headers.get('user-agent') || null;

    // Idempotency: if a pending request from the same email already exists,
    // refresh its updated_at + reason and return success without creating
    // duplicates.
    const { data: existing } = await service
      .from('access_requests')
      .select('id, status')
      .eq('email', email)
      .in('status', ['pending'])
      .maybeSingle();

    if (existing) {
      await service
        .from('access_requests')
        .update({
          name: name ?? undefined,
          reason: reason ?? undefined,
          referral_source: referral_source ?? undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      return NextResponse.json({ ok: true, status: 'pending_existing' });
    }

    // If a previously-approved request exists, the user already has a
    // link in their inbox; tell them so without re-queueing.
    const { data: approved } = await service
      .from('access_requests')
      .select('id')
      .eq('email', email)
      .eq('status', 'approved')
      .maybeSingle();
    if (approved) {
      return NextResponse.json({
        ok: true,
        status: 'already_approved',
        message: 'You were already approved. Check your inbox for the invite link.',
      });
    }

    const { error } = await service.from('access_requests').insert({
      email,
      name,
      type: 'beta',
      reason,
      referral_source,
      status: 'pending',
      ip_address: ip || null,
      user_agent: userAgent,
    });
    if (error) {
      console.error('[access-request]', error.message);
      return NextResponse.json({ error: 'Could not submit request' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, status: 'submitted' });
  } catch (err) {
    console.error('[access-request]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
