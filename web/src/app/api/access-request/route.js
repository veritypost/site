// Public access-request intake. Email-only. After submission we email
// the requester a confirm link; only after they click does the row's
// email_confirmed_at flip and the admin queue surfaces it for review.
//
// Reactivates the route that was 410'd by Ext-AA1 (2026-04-25).

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { renderTemplate, sendEmail } from '@/lib/email';
import { REQUEST_CONFIRM_TEMPLATE } from '@/lib/accessRequestEmail';
import { getSiteUrl } from '@/lib/siteUrl';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TOKEN_TTL_HOURS = 24;

function newToken() {
  // 32 url-safe bytes — 256 bits. Resists guessing.
  return crypto
    .randomBytes(32)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

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

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
    }

    const userAgent = request.headers.get('user-agent') || null;

    // Already approved? Tell them to check their inbox for the invite.
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

    const token = newToken();
    const expires = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const siteUrl = getSiteUrl();
    const confirmUrl = `${siteUrl}/api/access-request/confirm?token=${encodeURIComponent(token)}`;
    const expiresHuman = new Date(expires).toLocaleString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    // Idempotency: if there's an existing pending row for this email,
    // refresh the token (don't create dups). The user might have lost
    // the prior email or it expired.
    const { data: existing } = await service
      .from('access_requests')
      .select('id, status, email_confirmed_at')
      .eq('email', email)
      .in('status', ['pending'])
      .maybeSingle();

    let upsertErr = null;
    if (existing) {
      const { error } = await service
        .from('access_requests')
        .update({
          email_confirm_token: token,
          email_confirm_expires_at: expires,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      upsertErr = error;
    } else {
      const { error } = await service.from('access_requests').insert({
        email,
        type: 'beta',
        status: 'pending',
        email_confirm_token: token,
        email_confirm_expires_at: expires,
        ip_address: ip || null,
        user_agent: userAgent,
      });
      upsertErr = error;
    }

    if (upsertErr) {
      console.error('[access-request]', upsertErr.message);
      return NextResponse.json({ error: 'Could not submit request' }, { status: 500 });
    }

    // Send the confirm email. Failure here is recoverable — user can
    // re-submit to get a new token.
    try {
      const tpl = renderTemplate(REQUEST_CONFIRM_TEMPLATE, {
        confirm_url: confirmUrl,
        expires_at: expiresHuman,
      });
      await sendEmail({
        to: email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        fromName: tpl.fromName,
        fromEmail: tpl.fromEmail,
        replyTo: undefined,
        unsubscribeUrl: undefined,
      });
    } catch (e) {
      console.error('[access-request] sendEmail failed:', e);
      return NextResponse.json(
        { error: 'Could not send confirmation email. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      status: existing ? 'pending_existing' : 'submitted',
      message: 'Check your email for a confirmation link.',
    });
  } catch (err) {
    console.error('[access-request]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
