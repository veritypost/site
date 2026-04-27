// Email-confirm landing for /request-access. The user clicks the link
// in their inbox, this route validates the token + expiry, stamps
// email_confirmed_at, clears the token, and redirects to a success page.
// On invalid/expired token it redirects to a generic "link expired" UX
// (still on /request-access/confirmed with a query flag).

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSiteUrl } from '@/lib/siteUrl';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const siteUrl = getSiteUrl();
  const fail = (reason: string) =>
    NextResponse.redirect(
      `${siteUrl}/request-access/confirmed?status=${encodeURIComponent(reason)}`,
      302
    );

  if (!token || token.length < 16) return fail('invalid');

  const service = createServiceClient();

  // Type cast: the email_confirm_* columns are added by
  // 2026-04-26_access_request_email_confirm.sql; remove the cast after
  // types regen post-migration.
  const { data: row } = await (
    service.from('access_requests') as unknown as {
      select: (s: string) => {
        eq: (
          k: string,
          v: string
        ) => {
          maybeSingle: () => Promise<{
            data: {
              id: string;
              email_confirmed_at: string | null;
              email_confirm_expires_at: string | null;
            } | null;
          }>;
        };
      };
    }
  )
    .select('id, email_confirmed_at, email_confirm_expires_at')
    .eq('email_confirm_token', token)
    .maybeSingle();

  if (!row) return fail('invalid');

  // Already confirmed: still send to success page so a double-click is idempotent.
  if (row.email_confirmed_at) {
    return NextResponse.redirect(`${siteUrl}/request-access/confirmed?status=ok`, 302);
  }

  if (row.email_confirm_expires_at && new Date(row.email_confirm_expires_at) < new Date()) {
    return fail('expired');
  }

  // Type cast for the same migration-not-regenerated reason as above.
  const { error } = await (
    service.from('access_requests') as unknown as {
      update: (v: Record<string, unknown>) => {
        eq: (k: string, v: string) => Promise<{ error: { message: string } | null }>;
      };
    }
  )
    .update({
      email_confirmed_at: new Date().toISOString(),
      email_confirm_token: null,
      email_confirm_expires_at: null,
    })
    .eq('id', row.id);

  if (error) {
    console.error('[access-request.confirm]', error.message);
    return fail('error');
  }

  return NextResponse.redirect(`${siteUrl}/request-access/confirmed?status=ok`, 302);
}
