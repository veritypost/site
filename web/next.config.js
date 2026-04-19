/** @type {import('next').NextConfig} */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseHostname = (() => {
  try { return new URL(SUPABASE_URL).hostname; } catch { return null; }
})();

// H-05 / L-02 — Content-Security-Policy is emitted from
// `site/src/middleware.js` on every request so a per-request nonce can
// be interpolated into `script-src`. The rest of the security header
// block still ships here as static headers (no per-request data).
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
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
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
    ];
  },
};

// Sentry wrapper (Chunk 10) — wraps the config with source-map upload
// + auto-instrumentation when @sentry/nextjs is installed.
//
// M-18 — fail loud in production. A Vercel build that silently shipped
// without Sentry would leave us blind to runtime errors. Production
// builds now refuse to start if the dependency fails to load; local
// and preview builds continue to soft-fail so owners can iterate
// without a full npm install.
let withSentryConfig = (cfg) => cfg;
try {
  // eslint-disable-next-line global-require
  withSentryConfig = require('@sentry/nextjs').withSentryConfig;
} catch (err) {
  const isProd = process.env.VERCEL_ENV === 'production';
  if (isProd) {
    throw new Error(
      `[next.config] @sentry/nextjs failed to load in production: ${err?.message || err}. ` +
      `Refusing to build without error reporting. Fix the dependency and redeploy.`
    );
  }
  console.warn('[next.config] @sentry/nextjs not installed; local/preview build continues without Sentry.');
}

module.exports = withSentryConfig(
  nextConfig,
  {
    silent: true,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    disableLogger: true,
    automaticVercelMonitors: false,
  }
);
