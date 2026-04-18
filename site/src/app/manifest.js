// DA-181 — Web App Manifest so Android / iOS 16+ expose an
// "Add to Home Screen" that installs with correct branding.
// Next 14 serves this file at /manifest.webmanifest.

export default function manifest() {
  return {
    name: 'Verity Post',
    short_name: 'Verity Post',
    description:
      'News with a quiz-gated comment section. Score 3/5 on the article quiz to join the discussion.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
