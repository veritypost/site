// Dev-only passwordless sign-in. Hard-gated to non-production builds.
// Used by /dev/login page so QA can switch roles without entering OTPs.
//
// Accepts BOTH form-encoded POSTs (the no-JS path used by the page) and
// JSON POSTs (for scripts / curl). On form-encoded success we 303 redirect
// to /; on JSON success we return { ok: true }.
//
// SECURITY:
//   - 404 unless NODE_ENV !== 'production'.
//   - Email allowlist (the 6 QA accounts + admin@) — even on dev.
//   - No password ever crosses the wire.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createOtpClient, createServiceClient } from '@/lib/supabase/server';

const ALLOWED_EMAILS = new Set([
  'admin@veritypost.com',
  'free@veritypost.com',
  'pro@veritypost.com',
  'family@veritypost.com',
  'expert@veritypost.com',
  'mod@veritypost.com',
  'editor@veritypost.com',
]);

function devGateOpen(): boolean {
  return process.env.NODE_ENV !== 'production';
}

async function readEmail(
  request: NextRequest
): Promise<{ email: string | null; mode: 'json' | 'form' }> {
  const ct = (request.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('application/json')) {
    try {
      const body = (await request.json()) as { email?: unknown };
      const email = typeof body?.email === 'string' ? body.email : null;
      return { email, mode: 'json' };
    } catch {
      return { email: null, mode: 'json' };
    }
  }
  // Default: form-encoded (or multipart). request.formData handles both.
  try {
    const form = await request.formData();
    const v = form.get('email');
    return { email: typeof v === 'string' ? v : null, mode: 'form' };
  } catch {
    return { email: null, mode: 'form' };
  }
}

function failResponse(mode: 'json' | 'form', message: string, status = 400) {
  if (mode === 'json') {
    return NextResponse.json({ error: message }, { status });
  }
  // Form path: redirect back to /dev/login with the error in the query.
  const url = new URL('/dev/login', 'http://placeholder');
  url.searchParams.set('error', message);
  return NextResponse.redirect(
    new URL(url.pathname + url.search, 'http://localhost'),
    { status: 303 }
  );
}

export async function POST(request: NextRequest) {
  if (!devGateOpen()) {
    return new NextResponse('Not found', { status: 404 });
  }

  const { email: raw, mode } = await readEmail(request);
  const email = (raw || '').trim().toLowerCase();

  if (!email || !ALLOWED_EMAILS.has(email)) {
    return failResponse(mode, 'Email not in QA allowlist');
  }

  const service = createServiceClient();

  const { data: link, error: linkErr } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkErr || !link?.properties?.email_otp) {
    return failResponse(
      mode,
      linkErr?.message || 'Failed to generate link',
      500
    );
  }

  const otpClient = createOtpClient();
  const { error: verifyErr } = await otpClient.auth.verifyOtp({
    email,
    token: link.properties.email_otp,
    type: 'magiclink',
  });
  if (verifyErr) {
    return failResponse(mode, verifyErr.message, 500);
  }

  if (mode === 'form') {
    // Browser POSTed a form; redirect to home so the cookie sticks.
    return NextResponse.redirect(new URL('/', request.url), { status: 303 });
  }
  return NextResponse.json({ ok: true, email });
}

export async function GET() {
  if (!devGateOpen()) return new NextResponse('Not found', { status: 404 });
  return NextResponse.json({ allowed: Array.from(ALLOWED_EMAILS) });
}
