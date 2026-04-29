// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { resolveNext, resolveNextForRedirect } from '@/lib/authRedirect';
import { getSiteUrl } from '@/lib/siteUrl';
import { checkSignupGate } from '@/lib/betaGate';
import { REF_COOKIE_NAME } from '@/lib/referralCookie';
import { cookies } from 'next/headers';
import {
  runSignupBookkeeping,
  runReturningUserBookkeeping,
} from '@/lib/auth/postLoginBookkeeping';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next');
  const siteUrl = getSiteUrl();

  if (!code) {
    return NextResponse.redirect(`${siteUrl}/login?error=missing_code`);
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[callback] Exchange error:', error.message);
      return NextResponse.redirect(`${siteUrl}/login?error=auth_failed`);
    }

    const user = data.user;
    if (!user) {
      return NextResponse.redirect(`${siteUrl}/login?error=no_user`);
    }

    const { data: existing } = await supabase
      .from('users')
      .select('id, username, onboarding_completed_at, email_verified')
      .eq('id', user.id)
      .maybeSingle();

    if (!existing) {
      // Closed-beta gate for new OAuth signups. The session was already
      // exchanged (auth.users row exists in supabase auth), but we
      // refuse to create the public.users row + role + auth_provider
      // entries unless a valid vp_ref cookie is present. The auth.users
      // record is rolled back via deleteUser so the email isn't
      // reserved indefinitely, and we redirect to /beta-locked. This
      // mirrors the email-signup gate.
      const gateService = createServiceClient();
      const cookieJar = await cookies();
      const refCookie = cookieJar.get(REF_COOKIE_NAME)?.value;
      const gate = await checkSignupGate(gateService, refCookie);
      if (!gate.allowed) {
        try {
          await gateService.auth.admin.deleteUser(user.id);
        } catch (e) {
          console.error('[auth.callback] gate-deny: deleteUser failed:', e);
        }
        return NextResponse.redirect(
          `${siteUrl}/beta-locked?reason=${encodeURIComponent(gate.reason)}`
        );
      }

      const provider = user.app_metadata?.provider || 'unknown';
      const meta = user.user_metadata || {};
      const service = createServiceClient();

      // New users land at their intended destination (or /). WelcomeModal
      // fires automatically on the client when username is still null.
      const validatedNext = resolveNext(rawNext, null);
      const redirectTarget = validatedNext || '/';
      const oauthRedirect = NextResponse.redirect(`${siteUrl}${redirectTarget}`);
      await runSignupBookkeeping(service, user, provider, meta, request, oauthRedirect);
      return oauthRedirect;
    }

    // Returning user — update stale flags + cancel pending deletion.
    const serviceForExisting = createServiceClient();
    await runReturningUserBookkeeping(serviceForExisting, user, existing, request);

    // DA-021 / DA-100 / F-029 — validate `next` server-side. Rejects
    // `//evil.com`, backslash tricks, Unicode slash homoglyphs, and
    // anything non-ASCII. Falls back to `/` on any shape mismatch.
    // WelcomeModal fires on the client for any user still missing a
    // username — no server redirect to pick-username needed.
    return NextResponse.redirect(resolveNextForRedirect(siteUrl, rawNext, '/'));
  } catch (err) {
    console.error('[callback]', err);
    return NextResponse.redirect(`${siteUrl}/login?error=internal`);
  }
}
