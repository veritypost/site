import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Logged-in-only route trees. Anonymous visitors get 302'd to
// /login?next=<path> so they can sign in and be bounced back. Middleware
// handles presence only — role-specific authorization stays in server
// components via requireRole() / requireVerifiedEmail().
const PROTECTED_PREFIXES = [
  '/admin',
  '/profile',
  '/notifications',
  '/messages',
  '/bookmarks',
];

function isProtected(pathname) {
  return PROTECTED_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(prefix + '/')
  );
}

// DA-141 — request-id propagation. Every request gets a stable id
// (either honor the upstream `x-request-id` if the platform/edge set
// one, or mint a fresh UUID). The id flows through to the response
// header so log pipelines can correlate client/server/edge lines for
// a single interaction. Downstream handlers read it from
// `request.headers.get('x-request-id')`.
function getOrMintRequestId(request) {
  const existing = request.headers.get('x-request-id');
  if (existing && /^[A-Za-z0-9_-]{8,128}$/.test(existing)) return existing;
  // Edge runtime has crypto.randomUUID in modern Node + Vercel Edge.
  return crypto.randomUUID();
}

export async function middleware(request) {
  const requestId = getOrMintRequestId(request);

  // Mirror the request-id onto the inbound headers so server
  // components / route handlers can read it via `headers()`.
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set('x-request-id', requestId);

  let response = NextResponse.next({
    request: { headers: forwardedHeaders },
  });
  response.headers.set('x-request-id', requestId);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return request.cookies.get(name)?.value;
        },
        set(name, value, options) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: { headers: forwardedHeaders },
          });
          response.headers.set('x-request-id', requestId);
          response.cookies.set({ name, value, ...options });
        },
        remove(name, options) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({
            request: { headers: forwardedHeaders },
          });
          response.headers.set('x-request-id', requestId);
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  if (!user && isProtected(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('next', pathname + request.nextUrl.search);
    const redirect = NextResponse.redirect(loginUrl, { status: 302 });
    redirect.headers.set('x-request-id', requestId);
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
