// @migrated-to-permissions 2026-04-18
// @feature-verified shared_components 2026-04-18
import './globals.css';
import Script from 'next/script';
import { Suspense } from 'react';
import { Inter, Source_Serif_4 } from 'next/font/google';
import NavWrapper from './NavWrapper';
import { ToastProvider } from '../components/Toast';
import ObservabilityInit from '../components/ObservabilityInit';
import { PermissionsProvider } from '../components/PermissionsProvider';
import GAListener from '../components/GAListener';
import { getSiteUrl } from '../lib/siteUrl';
import { JsonLd, organizationAndWebSite } from '../components/JsonLd';
import { BRAND_NAME, BRAND_DOMAIN } from '../lib/brand';

// GA4 measurement ID. Set via NEXT_PUBLIC_GA_MEASUREMENT_ID in Vercel env;
// fallback literal is the Verity Post production property so the tag ships
// even if the env var isn't configured on a branch preview.
const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-NE37VG1FP6';

// Google AdSense publisher ID (ca-pub-xxxxxxxxxxxxxxxx). Only set this
// once AdSense has approved the domain; until then the script tag stays
// off. `AdSenseSlot` components gate themselves on this being present.
const ADSENSE_PUB_ID = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID || '';

// DA-030 — self-host fonts via next/font/google. Killed the cross-
// origin @import in globals.css which was paying DNS + TLS + fetch
// cost on every cold load. `display: 'swap'` avoids FOIT; `variable`
// lets the tokens in globals.css continue to reference
// `var(--font-sans)` and `var(--font-serif)` unchanged.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-inter',
});

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  display: 'swap',
  variable: '--font-source-serif',
});

export const metadata = {
  // metadataBase resolves OG image + canonical URLs. Using getSiteUrl
  // (which throws in prod when NEXT_PUBLIC_SITE_URL is unset) prevents
  // a preview branch from silently emitting prod URLs in OG tags.
  metadataBase: new URL(getSiteUrl()),
  // Brand strings imported from `lib/brand.ts` — single source of truth.
  // Mixed casing in the wild ("verity post" / "veritypost.com") drifted
  // across the codebase and shipped to every social unfurl + Google
  // result. Owner-locked Title Case "Verity Post" is canonical now.
  title: {
    default: BRAND_NAME,
    template: `%s · ${BRAND_NAME}`,
  },
  description: 'News with a comprehension quiz. Read, prove you read it, then join the discussion.',
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: BRAND_NAME,
    siteName: BRAND_NAME,
    type: 'website',
    url: getSiteUrl(),
    // Note: og:image + twitter:image are injected automatically by
    // Next.js from `app/opengraph-image.tsx` — do not list them here
    // or both layers will fight for the slot.
  },
  twitter: {
    card: 'summary_large_image',
    title: BRAND_NAME,
    site: `@${BRAND_DOMAIN.replace('.com', '')}`,
  },
  // DA-183 — apple mobile PWA hints. Without these, iOS Add-to-Home-Screen
  // installs with a blurred screenshot icon. `themeColor` moved to the
  // viewport export below per Next 14 deprecation.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: BRAND_NAME,
  },
  // Icons are injected automatically by Next.js from app-level
  // `icon.tsx` + `apple-icon.tsx` files (App Router file-based metadata).
  // Real PNGs ship via owner — those files become a one-line edit then.
  other: {
    'mobile-web-app-capable': 'yes',
    'google-adsense-account': 'ca-pub-3486969662269929',
  },
};

// DA-185 — viewport-fit=cover lets CSS env(safe-area-inset-*) work on
// iPhone notch / home bar. Bottom nav uses this so the home bar
// doesn't overlap tappable targets.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${sourceSerif.variable}`}>
      <body
        style={{
          margin: 0,
          padding: 0,
          background: '#ffffff',
          color: '#111111',
          fontFamily:
            'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {/* Ext-SS.2 — Organization + WebSite JSON-LD on every page.
            Required for Google's News carousel + sitelinks; site-wide
            constants so injection at the layout root is the right call. */}
        {organizationAndWebSite(getSiteUrl()).map((schema, i) => (
          <JsonLd key={i} data={schema} />
        ))}
        {/* DA-050 — skip-to-main link. First focusable element; visible
            only when focused so keyboard users can bypass nav + banner +
            category pills straight to article content. T222 — styling
            for this element + the form-focus rules moved into
            globals.css; the inline <style> previously here was being
            re-shipped on every page render. */}
        <a href="#main-content" className="vp-skip-link">
          Skip to main content
        </a>
        {/* GA4 (gtag.js). Loaded afterInteractive so it doesn't block
            first paint. The GAListener component below subscribes to
            App Router navigation changes and fires page_view events,
            since gtag's auto-pageview only covers the initial hard load.
            TODO (master plan Phase B step 4): wrap both in a
            consent-gated loader once the CMP is installed. Until then
            the tag loads unconditionally, which is fine for US traffic
            but not EU. */}
        <Script
          id="ga4-loader"
          strategy="afterInteractive"
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = gtag;
            gtag('js', new Date());
            gtag('config', '${GA_ID}', { send_page_view: false });
          `}
        </Script>
        <Suspense fallback={null}>
          <GAListener />
        </Suspense>

        {/* Google AdSense library. Loaded only when NEXT_PUBLIC_ADSENSE_
            PUBLISHER_ID is set — keeps the script off the page entirely
            until the publisher ID is in hand. `afterInteractive` so first
            paint is unblocked. AdSense per-slot <ins> blocks are rendered
            by <AdSenseSlot /> (see components/AdSenseSlot.tsx). */}
        {ADSENSE_PUB_ID && (
          <Script
            id="adsense-loader"
            strategy="afterInteractive"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_PUB_ID}`}
            crossOrigin="anonymous"
          />
        )}

        <ObservabilityInit />
        <PermissionsProvider>
          <ToastProvider>
            {/* DA-051 — `<main>` landmark wraps every page. Pages that
                need full-bleed can re-wrap children, but the default
                landmark is present for screen readers. */}
            <main id="main-content">
              <NavWrapper>{children}</NavWrapper>
            </main>
          </ToastProvider>
        </PermissionsProvider>
      </body>
    </html>
  );
}
