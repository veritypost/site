// DA-181 — Web App Manifest so Android / iOS 16+ expose an
// "Add to Home Screen" that installs with correct branding.
// Next 14 serves this file at /manifest.webmanifest.
//
// Icons reference the Next.js file-based icon route (`app/icon.tsx`
// generates `/icon` → 32×32 PNG). Real PNGs ship from owner; this
// manifest swaps to those files in one edit when they land.

import { BRAND_NAME, BRAND_DOMAIN } from '../lib/brand';

export default function manifest() {
  return {
    name: BRAND_NAME,
    short_name: BRAND_NAME,
    description: 'News with a comprehension quiz.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    id: `https://${BRAND_DOMAIN}/`,
    icons: [
      {
        src: '/icon',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
