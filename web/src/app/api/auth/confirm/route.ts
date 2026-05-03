export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSiteUrl } from '@/lib/siteUrl';

// Q05 grace-period no-op. Magic-link clicks are deprecated (OTP-only since
// 2026-05-03). Any in-flight click from before the cutover lands here and
// is redirected to a soft error page instead of producing a confusing 404.
// TODO: delete this route after the two-week grace window (2026-05-17).
export async function GET(_request: NextRequest) {
  const siteUrl = getSiteUrl();
  return NextResponse.redirect(`${siteUrl}/login?error=link_deprecated`);
}
