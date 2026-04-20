// T-046 — owner bypass for pre-launch holding mode.
//
// Usage: visit /preview?token=<PREVIEW_BYPASS_TOKEN> once per browser.
// Sets a 30-day httpOnly cookie (`vp_preview=ok`) that the middleware
// accepts as a pass-through when NEXT_PUBLIC_SITE_MODE=coming_soon is on.
//
// Rotate the bypass token in Vercel env whenever you want to invalidate
// every existing cookie (owner lost device, teammate left, etc.).

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const expected = process.env.PREVIEW_BYPASS_TOKEN;

  if (!expected || token !== expected) {
    // Missing or bad token → send to the holding page, no cookie.
    return NextResponse.redirect(new URL('/welcome', request.url));
  }

  const res = NextResponse.redirect(new URL('/', request.url));
  res.cookies.set('vp_preview', 'ok', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });
  return res;
}
