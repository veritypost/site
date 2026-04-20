// @migrated-to-permissions 2026-04-18
// @feature-verified shared_components 2026-04-18
import './globals.css';
import { Inter, Source_Serif_4 } from 'next/font/google';
import NavWrapper from './NavWrapper';
import { ToastProvider } from '../components/Toast';
import ObservabilityInit from '../components/ObservabilityInit';
import { PermissionsProvider } from '../components/PermissionsProvider';

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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://veritypost.com'),
  title: 'Verity Post — Read. Prove it. Discuss.',
  description: 'News with a quiz-gated comment section. Score 3/5 on the article quiz to join the discussion — every commenter read the article.',
  openGraph: {
    title: 'Verity Post — Read. Prove it. Discuss.',
    description: 'News with a quiz-gated comment section. Score 3/5 on the article quiz to join the discussion — every commenter read the article.',
    siteName: 'Verity Post',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    site: '@VerityPostApp',
    creator: '@VerityPostApp',
    title: 'Verity Post — Read. Prove it. Discuss.',
    description: 'News with a quiz-gated comment section. Score 3/5 on the article quiz to join the discussion.',
  },
  // DA-183 — apple mobile PWA hints. Without these, iOS Add-to-Home-Screen
  // installs with a blurred screenshot icon. `themeColor` moved to the
  // viewport export below per Next 14 deprecation.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Verity Post',
  },
  // DA-184 — apple-touch-icon. Owner must create the 180×180 PNG at
  // public/apple-touch-icon.png. Next emits the <link> automatically
  // from this metadata entry.
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  other: {
    'mobile-web-app-capable': 'yes',
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
      <body style={{ margin: 0, padding: 0, background: '#ffffff', color: '#111111', fontFamily: 'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        {/* DA-050 — skip-to-main link. First focusable element; visible
            only when focused so keyboard users can bypass nav + banner +
            category pills straight to article content. */}
        <a href="#main-content" className="vp-skip-link">Skip to main content</a>
        <style>{`
          input, textarea, select { color: #111111; }
          input::placeholder, textarea::placeholder { color: #999999; }
          *:focus-visible { outline: 2px solid #111111; outline-offset: 2px; }
          .vp-skip-link {
            position: absolute;
            left: -9999px;
            top: auto;
            width: 1px;
            height: 1px;
            overflow: hidden;
          }
          .vp-skip-link:focus {
            position: fixed;
            left: 8px;
            top: 8px;
            width: auto;
            height: auto;
            padding: 8px 12px;
            background: #111111;
            color: #ffffff;
            text-decoration: none;
            font-weight: 600;
            z-index: 100000;
            border-radius: 4px;
          }
        `}</style>
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
