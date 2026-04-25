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
// Anon access model (owner directive 2026-04-24, supersedes 2026-04-23):
// anon visitors can see the home page, story pages, auth flow, legal +
// marketing surfaces, plus every sitemap-published surface (/browse,
// /category, /card, /search) and the /u profile shell (which carries
// its own launch kill-switch). Surfaces that only exist as per-user
// private state (profile settings, messages, bookmarks, notifications,
// billing, appeal, expert queue) remain sign-in-gated because they
// have nothing to render for anon. /leaderboard + /recap stay protected
// pending a separate anon-safety sweep. Block surfaces are NOT 404s —
// they redirect to /login?next=<path> so the value is preserved for
// the post-login bounce.
//
// To unhide a surface to anon: remove its prefix here, no other change
// needed (matches the launch-hide pattern documented in CLAUDE.md).
const PROTECTED_PREFIXES = [
  '/profile',
  '/messages',
  '/bookmarks',
  '/notifications',
  '/leaderboard',
  '/recap',
  '/expert-queue',
  '/billing',
  '/appeal',
  // NOT included: `/preview` — owner's coming-soon-mode bypass route
  // (sets the bypass cookie). Gating it would defeat the bypass.
];

function isProtected(pathname) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
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
    try {
      return new URL(SUPABASE_URL).origin;
    } catch {
      return '';
    }
  })();
  const supabaseWss = supabaseOrigin ? supabaseOrigin.replace('https://', 'wss://') : '';

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self' ${supabaseOrigin} ${supabaseWss} https://api.stripe.com https://api.openai.com https://*.ingest.sentry.io`
      .replace(/\s+/g, ' ')
      .trim(),
    'frame-src https://js.stripe.com https://hooks.stripe.com',
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    'report-uri /api/csp-report',
  ].join('; ');
}

// Ext-OO.2 — second CSP shipped as Report-Only WITHOUT 'unsafe-inline'
// in style-src. We still ship the primary CSP with 'unsafe-inline' (the
// codebase has many inline style attributes; tightening live would break
// the page). This second header collects violation reports against the
// stricter policy so we can plan the migration to nonce-based styles.
// When /api/csp-report is quiet under this policy, swap the primary CSP
// to drop 'unsafe-inline'.
function buildCspStrictReport(nonce) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseOrigin = (() => {
    try {
      return new URL(SUPABASE_URL).origin;
    } catch {
      return '';
    }
  })();
  const supabaseWss = supabaseOrigin ? supabaseOrigin.replace('https://', 'wss://') : '';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com`,
    `style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com`,
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self' ${supabaseOrigin} ${supabaseWss} https://api.stripe.com https://api.openai.com https://*.ingest.sentry.io`
      .replace(/\s+/g, ' ')
      .trim(),
    'frame-src https://js.stripe.com https://hooks.stripe.com',
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    'report-uri /api/csp-report?policy=strict',
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
const CORS_ALLOW_HEADERS =
  'authorization, content-type, x-health-token, x-request-id, x-vercel-cron';

function applyCors(request, response) {
  const origin = request.headers.get('origin');
  if (!origin) return; // same-origin / server-to-server: no CORS needed
  if (!ALLOWED_ORIGINS.has(origin)) return; // unlisted: browser will block
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.append('Vary', 'Origin');
}

// CSP enforcement is env-gated. CSP_ENFORCE=true flips from Report-Only
// to the enforcing header name. The owner can enable in production once
// /api/csp-report has zero violations for a day. Leaving it Report-Only
// by default means a stray violation in a pre-rendered page doesn't
// break rendering; the report endpoint still collects signal for tuning.
const CSP_HEADER_NAME =
  process.env.CSP_ENFORCE === 'true'
    ? 'Content-Security-Policy'
    : 'Content-Security-Policy-Report-Only';
function setCspHeader(res, csp, strictReportCsp) {
  res.headers.set(CSP_HEADER_NAME, csp);
  // Ext-OO.2 — emit a SECOND report-only header carrying the strict
  // policy (no 'unsafe-inline' in style-src). Browsers evaluate every
  // CSP independently; this one only reports violations to
  // /api/csp-report?policy=strict so we can quantify the migration
  // before flipping the primary CSP. Always Report-Only — never
  // enforced — even when CSP_ENFORCE=true (which only affects the
  // primary header).
  if (strictReportCsp) {
    res.headers.append('Content-Security-Policy-Report-Only', strictReportCsp);
  }
}

export async function middleware(request) {
  const requestId = getOrMintRequestId(request);
  const nonce = mintNonce();
  const csp = buildCsp(nonce);
  const cspStrictReport = buildCspStrictReport(nonce);
  const pathname = request.nextUrl.pathname;

  // Standalone-preview short-circuit. /ideas/* renders inline sample data
  // with no DB, no auth, no Supabase. Returning early means this surface
  // keeps working even when Supabase env vars aren't configured locally
  // (e.g., missing .env.local). Must come before the createServerClient
  // call below or that call throws and the route 404s.
  if (pathname.startsWith('/ideas')) {
    const passthrough = NextResponse.next();
    passthrough.headers.set('x-request-id', requestId);
    return passthrough;
  }

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

  // H-05 — Content-Security-Policy. Mode is env-gated via CSP_ENFORCE
  // (see setCspHeader above). Prior enforce flip (2026-04-20) broke
  // pre-rendered pages because `'strict-dynamic'` requires a nonce on
  // Next.js's inline bootstrap scripts; pre-rendered pages ship without
  // one. The env switch lets the owner enable enforce in prod once
  // /api/csp-report shows zero violations for a day — no code change
  // needed. Default remains Report-Only.
  setCspHeader(response, csp, cspStrictReport);

  // M-17 — CORS allow-list for /api/* on normal (non-preflight) requests.
  if (pathname.startsWith('/api/')) {
    applyCors(request, response);
  }

  // F7 Decision 1 — legacy admin shells deleted. Exact-match 301 redirects
  // so external deep links (emails, Slack, bookmarks) keep working without
  // catching the F7 sub-routes /admin/pipeline/{runs,costs,settings} that
  // share the prefix. Both legacy pages carried @admin-verified markers;
  // Decision 1 + the F7-pipeline-restructure plan are the deferred approval.
  if (pathname === '/admin/pipeline' || pathname === '/admin/ingest') {
    const dest = request.nextUrl.clone();
    dest.pathname = '/admin/newsroom';
    dest.search = '';
    const redirect = NextResponse.redirect(dest, { status: 301 });
    redirect.headers.set('x-request-id', requestId);
    setCspHeader(redirect, csp, cspStrictReport);
    return redirect;
  }

  // T-046 — pre-launch holding mode. When NEXT_PUBLIC_SITE_MODE=coming_soon,
  // redirect every public request to /welcome (which renders a minimal brand
  // card). Owner bypass: hit /preview?token=PREVIEW_BYPASS_TOKEN once and a
  // long-lived `vp_preview=ok` cookie passes the check.
  //
  // Exempts: /welcome itself, /preview, /api/*, /admin/* (still 404s for
  // non-staff via its own layout), /_next/*, and standard public files.
  if (process.env.NEXT_PUBLIC_SITE_MODE === 'coming_soon') {
    // Hard-block account-creation paths even with the bypass cookie —
    // owner asked that no one (including staff browsing remotely) can
    // accidentally let public signups land while we're in coming-soon.
    // /api/auth/login + reset stay reachable so existing-account flows
    // work; only signup is closed.
    if (
      pathname === '/signup' ||
      pathname === '/api/auth/signup' ||
      pathname === '/signup/expert' ||
      pathname === '/signup/pick-username'
    ) {
      const dest = request.nextUrl.clone();
      dest.pathname = '/welcome';
      dest.search = '';
      const redirect = NextResponse.redirect(dest, { status: 307 });
      redirect.headers.set('x-request-id', requestId);
      setCspHeader(redirect, csp, cspStrictReport);
      redirect.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return redirect;
    }

    const allowed =
      pathname === '/welcome' ||
      pathname === '/preview' ||
      pathname === '/preview-as-admin' ||
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
      setCspHeader(redirect, csp, cspStrictReport);
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
          setCspHeader(response, csp, cspStrictReport);
          if (pathname.startsWith('/api/')) applyCors(request, response);
          response.cookies.set({ name, value, ...options });
        },
        remove(name, options) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({
            request: { headers: forwardedHeaders },
          });
          response.headers.set('x-request-id', requestId);
          setCspHeader(response, csp, cspStrictReport);
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
  const needsUser = isProtected(pathname) || pathname === '/kids' || pathname.startsWith('/kids/');
  const user = needsUser ? (await supabase.auth.getUser()).data.user : null;

  if (!user && isProtected(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('next', pathname + request.nextUrl.search);
    const redirect = NextResponse.redirect(loginUrl, { status: 302 });
    redirect.headers.set('x-request-id', requestId);
    setCspHeader(redirect, csp, cspStrictReport);
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
