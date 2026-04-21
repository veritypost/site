import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Logged-in-only route trees. Anonymous visitors get 302'd to
// /login?next=<path> so they can sign in and be bounced back. Middleware
// handles presence only — permission-specific authorization stays in
// server components via requirePermission() / requireVerifiedEmail().
// R13-T3 — `/notifications` intentionally NOT in this list; the page
// renders its own anon CTA in-place (see notifications/page.tsx) instead
// of redirecting to /login, which was jarring when the tab is one of the
// primary bottom-nav destinations.
// /admin intentionally NOT in this list. The admin segment layout
// (app/admin/layout.tsx) handles its own auth + role check and returns
// a 404 for anon or non-staff callers. Putting /admin here would redirect
// anon to /login?next=/admin, disclosing that /admin is a real surface.
const PROTECTED_PREFIXES = [
  '/profile',
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

// H-05 / L-02 — per-request CSP nonce. Must be unpredictable and fresh
// per response so `'strict-dynamic'` can trust the Next.js bootstrap
// script without whitelisting every `_next/...` URL. Next.js App Router
// reads the nonce off the inbound `x-nonce` request header and attaches
// it automatically to framework scripts; server components can also
// read it via `headers().get('x-nonce')` if they emit their own inline
// script.
function mintNonce() {
  // 128 bits of entropy, base64-urlsafe. Matches OWASP guidance.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  // btoa is available in the Edge runtime.
  return btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function buildCsp(nonce) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseOrigin = (() => {
    try { return new URL(SUPABASE_URL).origin; } catch { return ''; }
  })();
  const supabaseWss = supabaseOrigin ? supabaseOrigin.replace('https://', 'wss://') : '';

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self' ${supabaseOrigin} ${supabaseWss} https://api.stripe.com https://api.openai.com https://*.ingest.sentry.io`.replace(/\s+/g, ' ').trim(),
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "report-uri /api/csp-report",
  ].join('; ');
}

// M-17 — CORS allow-list for `/api/*`.
//
// Allow-list contents:
//   - NEXT_PUBLIC_SITE_URL (prod origin, defaults to https://veritypost.com)
//   - http://localhost:3000 + http://localhost:3333 for local dev
//
// The iOS native client is unaffected because native fetch() has no
// browser-enforced CORS engine; Authorization-header calls from the
// app continue to work regardless of this allow-list.
//
// To add a preview origin later, extend ALLOWED_ORIGINS here or wire
// an env var (e.g., CORS_EXTRA_ORIGINS) and split on commas.
const PROD_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || 'https://veritypost.com';
const ALLOWED_ORIGINS = new Set([
  PROD_ORIGIN,
  'https://veritypost.com',
  'https://www.veritypost.com',
  'http://localhost:3000',
  'http://localhost:3333',
]);
const CORS_ALLOW_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
const CORS_ALLOW_HEADERS = 'authorization, content-type, x-health-token, x-request-id, x-vercel-cron';

function applyCors(request, response) {
  const origin = request.headers.get('origin');
  if (!origin) return; // same-origin / server-to-server: no CORS needed
  if (!ALLOWED_ORIGINS.has(origin)) return; // unlisted: browser will block
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.append('Vary', 'Origin');
}

export async function middleware(request) {
  const requestId = getOrMintRequestId(request);
  const nonce = mintNonce();
  const csp = buildCsp(nonce);
  const pathname = request.nextUrl.pathname;

  // M-17 — preflight short-circuit for /api/*.
  if (pathname.startsWith('/api/') && request.method === 'OPTIONS') {
    const preflight = new NextResponse(null, { status: 204 });
    preflight.headers.set('Access-Control-Allow-Methods', CORS_ALLOW_METHODS);
    preflight.headers.set('Access-Control-Allow-Headers', CORS_ALLOW_HEADERS);
    applyCors(request, preflight);
    preflight.headers.set('x-request-id', requestId);
    return preflight;
  }

  // Mirror the request-id and nonce onto the inbound headers so server
  // components / route handlers can read them via `headers()`.
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set('x-request-id', requestId);
  forwardedHeaders.set('x-nonce', nonce);

  let response = NextResponse.next({
    request: { headers: forwardedHeaders },
  });
  response.headers.set('x-request-id', requestId);

  // H-05 — Content-Security-Policy (Report-Only). The enforce flip on
  // 2026-04-20 broke statically-prerendered pages: `'strict-dynamic'`
  // requires the nonce on Next.js's own inline bootstrap scripts, but
  // pages pre-rendered at build time ship without any nonce. Until the
  // nonce is read in the root layout (which opts the whole tree into
  // dynamic rendering), or pages that need the nonce add
  // `export const dynamic = 'force-dynamic'`, we keep CSP in Report-Only
  // so violations still surface via /api/csp-report without blocking.
  response.headers.set('Content-Security-Policy-Report-Only', csp);

  // M-17 — CORS allow-list for /api/* on normal (non-preflight) requests.
  if (pathname.startsWith('/api/')) {
    applyCors(request, response);
  }

  // T-046 — pre-launch holding mode. When NEXT_PUBLIC_SITE_MODE=coming_soon,
  // redirect every public request to /welcome (which renders a minimal brand
  // card). Owner bypass: hit /preview?token=PREVIEW_BYPASS_TOKEN once and a
  // long-lived `vp_preview=ok` cookie passes the check.
  //
  // Exempts: /welcome itself, /preview, /api/*, /admin/* (still 404s for
  // non-staff via its own layout), /_next/*, and standard public files.
  if (process.env.NEXT_PUBLIC_SITE_MODE === 'coming_soon') {
    const allowed =
      pathname === '/welcome' ||
      pathname === '/preview' ||
      pathname.startsWith('/api/') ||
      pathname.startsWith('/admin') ||
      pathname.startsWith('/ideas') ||
      pathname.startsWith('/_next/') ||
      pathname === '/favicon.ico' ||
      pathname === '/robots.txt' ||
      pathname === '/sitemap.xml';
    const hasBypass = request.cookies.get('vp_preview')?.value === 'ok';
    if (!allowed && !hasBypass) {
      const dest = request.nextUrl.clone();
      dest.pathname = '/welcome';
      dest.search = '';
      const redirect = NextResponse.redirect(dest, { status: 307 });
      redirect.headers.set('x-request-id', requestId);
      redirect.headers.set('Content-Security-Policy-Report-Only', csp);
      redirect.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return redirect;
    }
    // Still serving — tell crawlers not to index anything while in coming_soon.
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

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
          response.headers.set('Content-Security-Policy-Report-Only', csp);
          if (pathname.startsWith('/api/')) applyCors(request, response);
          response.cookies.set({ name, value, ...options });
        },
        remove(name, options) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({
            request: { headers: forwardedHeaders },
          });
          response.headers.set('x-request-id', requestId);
          response.headers.set('Content-Security-Policy-Report-Only', csp);
          if (pathname.startsWith('/api/')) applyCors(request, response);
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  // Skip GoTrue call on public routes. Only the protected-route redirect
  // and the /kids/* fork below branch on `user`, so every other request
  // (home, story, /api/*, /login, etc.) can avoid a Supabase auth round-trip
  // entirely. Cuts middleware p50 on public pages dramatically.
  const needsUser =
    isProtected(pathname) ||
    pathname === '/kids' ||
    pathname.startsWith('/kids/');
  const user = needsUser
    ? (await supabase.auth.getUser()).data.user
    : null;

  if (!user && isProtected(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('next', pathname + request.nextUrl.search);
    const redirect = NextResponse.redirect(loginUrl, { status: 302 });
    redirect.headers.set('x-request-id', requestId);
    redirect.headers.set('Content-Security-Policy-Report-Only', csp);
    return redirect;
  }

  // /kids/* used to host the kid-facing web UI. That surface moved to the
  // VerityPostKids iOS app; the adult web app now only manages kid profiles
  // under /profile/kids. Logged-in parents get bounced to the management
  // dashboard; anonymous visitors land on the kids-app marketing page.
  if (pathname === '/kids' || pathname.startsWith('/kids/')) {
    const dest = request.nextUrl.clone();
    dest.search = '';
    dest.pathname = user ? '/profile/kids' : '/kids-app';
    return NextResponse.redirect(dest, { status: 302 });
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
