export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createOtpClient, createServiceClient } from '@/lib/supabase/server';
import { getSiteUrl } from '@/lib/siteUrl';
import {
  runSignupBookkeeping,
  runReturningUserBookkeeping,
} from '@/lib/auth/postLoginBookkeeping';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const t = searchParams.get('t');
  const e = searchParams.get('e');
  const siteUrl = getSiteUrl();

  if (!t || !e) {
    return NextResponse.redirect(`${siteUrl}/login?error=missing_params`);
  }

  // Verify the token and establish the session. createOtpClient() has
  // cookie-writing handlers so session cookies are set automatically on
  // successful verifyOtp.
  const otpClient = createOtpClient();
  const { data, error } = await otpClient.auth.verifyOtp({
    email: e,
    token: t,
    type: 'magiclink',
  });

  if (error || !data.user) {
    return NextResponse.redirect(`${siteUrl}/login?error=link_expired`);
  }

  const user = data.user;
  const service = createServiceClient();

  const { data: existing } = await service
    .from('users')
    .select('id, email_verified')
    .eq('id', user.id)
    .maybeSingle();

  // Build the redirect response first. runSignupBookkeeping writes the
  // referral cookie-clear to this object — must be the same object returned.
  const redirectResponse = NextResponse.redirect(`${siteUrl}/`);

  if (!existing) {
    const provider = (user.app_metadata?.provider as string | undefined) || 'email';
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    await runSignupBookkeeping(service, user, provider, meta, request, redirectResponse);
  } else {
    await runReturningUserBookkeeping(service, user, existing, request);
  }

  return redirectResponse;
}
