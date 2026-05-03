export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createOtpClient, createServiceClient } from '@/lib/supabase/server';
import { getSiteUrl } from '@/lib/siteUrl';
import { resolveNextForRedirect } from '@/lib/authRedirect';
import {
  runSignupBookkeeping,
  runReturningUserBookkeeping,
} from '@/lib/auth/postLoginBookkeeping';
import { checkSignupGate, isApprovedEmail } from '@/lib/betaGate';
import { REF_COOKIE_NAME } from '@/lib/referralCookie';
import { cookies } from 'next/headers';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { getRateLimitPolicy } from '@/lib/rateLimits';
import { truncateIpV4 } from '@/lib/apiErrors';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const t = searchParams.get('t');
  const e = searchParams.get('e');
  const rawNext = searchParams.get('next');
  const siteUrl = getSiteUrl();

  if (!t || !e) {
    return NextResponse.redirect(`${siteUrl}/login?error=missing_params`);
  }

  const service = createServiceClient();
  const rawIp = await getClientIp();
  const ipTruncated = truncateIpV4(rawIp);
  const clickIpPolicy = getRateLimitPolicy('AUTH_MAGIC_LINK_CLICK_PER_IP');
  const clickIpHit = await checkRateLimit(service, {
    key: `magic_link_click_ip:${ipTruncated || rawIp}`,
    policyKey: 'auth_magic_link_click_per_ip',
    ...clickIpPolicy,
  });
  if (clickIpHit.limited) {
    return NextResponse.redirect(`${siteUrl}/login?error=too_many_requests`);
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

  const { data: existing } = await service
    .from('users')
    .select('id, email_verified')
    .eq('id', user.id)
    .maybeSingle();

  // Build the redirect response first. runSignupBookkeeping writes the
  // referral cookie-clear to this object — must be the same object returned.
  const redirectResponse = NextResponse.redirect(resolveNextForRedirect(siteUrl, rawNext, '/'));

  if (!existing) {
    const cookieJar = await cookies();
    const refCookie = cookieJar.get(REF_COOKIE_NAME)?.value;
    let approvedBypass = false;
    try {
      approvedBypass = await isApprovedEmail(service, user.email!);
    } catch (err) {
      console.error('[auth.confirm] approvedEmail check threw:', err);
    }
    if (!approvedBypass) {
      const gate = await checkSignupGate(service, refCookie);
      if (!gate.allowed) {
        try {
          await service.auth.admin.deleteUser(user.id);
        } catch (err) {
          console.error('[auth.confirm] gate-deny: deleteUser failed:', err);
        }
        try {
          await otpClient.auth.signOut();
        } catch (err) {
          console.error('[auth.confirm] gate-deny: signOut failed:', err);
        }
        return NextResponse.redirect(`${siteUrl}/login?error=invite_required`);
      }
    }

    const provider = (user.app_metadata?.provider as string | undefined) || 'email';
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    try {
      await runSignupBookkeeping(service, user, provider, meta, request, redirectResponse);
    } catch (err) {
      console.error('[auth.confirm] runSignupBookkeeping failed (non-fatal):', err);
    }
  } else {
    await runReturningUserBookkeeping(service, user, existing, request);
  }

  return redirectResponse;
}
