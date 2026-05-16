/** @type {import('next').NextConfig} */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseHostname = (() => {
  try {
    return new URL(SUPABASE_URL).hostname;
  } catch {
    return null;
  }
})();

// H-05 / L-02 — Content-Security-Policy is emitted from
// `web/src/middleware.js` on every request so a per-request nonce can
// be interpolated into `script-src`. The rest of the security header
// block still ships here as static headers (no per-request data).
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // Content-Security-Policy intentionally emitted from middleware.js so
  // the per-request nonce (required by script-src) can be interpolated.
];

// DA-022 / DA-048 — re-enable Next.js image optimization. Any future
// `<Image>` callers get WebP/AVIF negotiation, responsive srcset, and
// lazy loading for free. Only allow Supabase storage + our own CDN
// by default; add remote patterns here as other image hosts are used.
const imageRemotePatterns = [];
if (supabaseHostname) {
  imageRemotePatterns.push({
    protocol: 'https',
    hostname: supabaseHostname,
    pathname: '/storage/v1/object/public/**',
  });
}

const nextConfig = {
  images: {
    remotePatterns: imageRemotePatterns,
    formats: ['image/avif', 'image/webp'],
  },
  poweredByHeader: false,
  async redirects() {
    // /category/<slug> is a real route again as of 2026-05-16 — the
    // page renders the same UnifiedSearch component as /search but
    // pinned to the slug. The earlier 308 redirect to /search?topic=
    // was reverted on owner request to keep the cleaner category
    // URL. No redirect entry for /category/* is needed.
    return [
      // Owner cleanup item 2 — bookmarks concept retired. The successor
      // (Following) doesn't have a dedicated page — it lives in the
      // Sections menu on the home page. Old /bookmarks links land on
      // home; users can open the Sections menu from there.
      {
        source: '/bookmarks',
        destination: '/',
        permanent: true,
      },
      // Owner cleanup item 12 — same for the brief /following page that
      // existed mid-batch; it was replaced by the Sections menu surface.
      {
        source: '/following',
        destination: '/',
        permanent: true,
      },
      // Owner cleanup item 2 — `/notifications` page retired (locked
      // decision: notifications stay security-only, no rich inbox).
      {
        source: '/notifications',
        destination: '/',
        permanent: true,
      },
      // Canonical article URL is `/{slug}` (sitemap already broadcasts
      // this shape; Google indexes it). The legacy `/story/{slug}` route
      // is folded into a 308 (permanent) so old bookmarks, social-share
      // archives, and iOS app shares (until the next iOS release) keep
      // resolving. Fires at the edge — never hits the page handler, so
      // the `/story/[slug]/*.js` files become unreachable defense-in-
      // depth, not load-bearing. Safe to delete in a later session.
      {
        source: '/story/:slug',
        destination: '/:slug',
        permanent: true,
      },
      // Wave 0 redesign — legacy `/admin/ad-*` page paths consolidated under
      // `/admin/ads/*`. API routes (`/api/admin/ad-*`) are unchanged and stay
      // kebab-case. NOTE for Wave 7: when `ad-units` → `ad-creatives` rename
      // lands, update `/admin/ad-units/:id` to point at `/admin/ads/creatives/:id`
      // directly here to avoid a double-hop through `/admin/ads/units/:id`.
      {
        source: '/admin/ad-analytics',
        destination: '/admin/ads/analytics',
        permanent: true,
      },
      {
        source: '/admin/ad-campaigns',
        destination: '/admin/ads/campaigns',
        permanent: true,
      },
      {
        source: '/admin/ad-placements',
        destination: '/admin/ads/placements',
        permanent: true,
      },
      {
        source: '/admin/ad-units/:id',
        destination: '/admin/ads/units/:id',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Apple-app-site-association (AASA) must be served as
      // application/json so iOS Universal Links validation accepts it.
      // Next.js auto-detects MIME from file extension; AASA has no
      // extension, so we set the header explicitly. Static — Apple
      // re-fetches occasionally; long cache is fine.
      {
        source: '/.well-known/apple-app-site-association',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Cache-Control', value: 'public, max-age=3600' },
        ],
      },
    ];
  },
};

// Sentry: deferred until post-launch (no DSN / org / auth token
// configured anyway). Each build was generating + attempting to upload
// source maps that went nowhere — pure wasted build time. When error
// reporting matters again, re-wrap with withSentryConfig and populate
// the env vars (DSN, ORG, PROJECT, AUTH_TOKEN).
module.exports = nextConfig;
