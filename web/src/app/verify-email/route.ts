// Narrow GET handler for Supabase email-change confirmation links.
// Supabase sends a link to the new email address after updateUser({email}).
// The link contains either a PKCE code or a token_hash+type pair.
// On success, redirect to /profile/settings so the user can see the update.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSiteUrl } from '@/lib/siteUrl';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const siteUrl = getSiteUrl();
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as 'email_change' | 'email' | null;

  try {
    const supabase = createClient();

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error('[verify-email] exchangeCodeForSession error:', error.message);
        return NextResponse.redirect(`${siteUrl}/profile/settings?error=email_change_failed`);
      }
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (error) {
        console.error('[verify-email] verifyOtp error:', error.message);
        return NextResponse.redirect(`${siteUrl}/profile/settings?error=email_change_failed`);
      }
    } else {
      return NextResponse.redirect(`${siteUrl}/profile/settings?error=email_change_failed`);
    }

    return NextResponse.redirect(`${siteUrl}/profile/settings?notice=email_changed`);
  } catch (err) {
    console.error('[verify-email]', err);
    return NextResponse.redirect(`${siteUrl}/profile/settings?error=email_change_failed`);
  }
}
