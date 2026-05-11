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
    // The standalone `/category/[id]` route was retired in favour of
    // `/?cat=<slug>` filtering in the home shell. Old external links are
    // 301'd. The `?sub=` query param can't be templated into the
    // destination via Next.js redirect syntax (named query captures are
    // not interpolated back), so URLs that carried a sub will land on the
    // parent-category-filtered home and drop the sub. Acceptable for now;
    // the destination page can re-resolve the sub from the URL once we
    // wire that pass.
    return [
      {
        source: '/category/:slug',
        destination: '/?cat=:slug',
        permanent: true,
      },
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
