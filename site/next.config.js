/** @type {import('next').NextConfig} */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseOrigin = (() => {
  try { return new URL(SUPABASE_URL).origin; } catch { return ''; }
})();
const supabaseHostname = (() => {
  try { return new URL(SUPABASE_URL).hostname; } catch { return null; }
})();

const connectSrc = [
  "'self'",
  supabaseOrigin,
  supabaseOrigin ? supabaseOrigin.replace('https://', 'wss://') : '',
  'https://api.stripe.com',
  'https://api.openai.com',
].filter(Boolean).join(' ');

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src ${connectSrc}`,
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Content-Security-Policy', value: csp },
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
// + auto-instrumentation when @sentry/nextjs is installed. Guarded so
// a fresh checkout without `npm install` still `next build`s.
let withSentryConfig = (cfg) => cfg;
try {
  // eslint-disable-next-line global-require
  withSentryConfig = require('@sentry/nextjs').withSentryConfig;
} catch {
  // @sentry/nextjs not installed yet — owner will run npm install
  // separately. Fallback keeps the build green.
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
