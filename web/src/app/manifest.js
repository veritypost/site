// DA-181 — Web App Manifest so Android / iOS 16+ expose an
// "Add to Home Screen" that installs with correct branding.
// Next 14 serves this file at /manifest.webmanifest.
//
// Coming-soon mode: name/short_name reduced to the domain and the
// product description is removed so nothing product-descriptive leaks
// into Google / social crawlers via the manifest. Restore at launch:
// name: 'Verity Post', short_name: 'Verity Post', description:
// 'News with a quiz-gated comment section. Score 3/5 on the article
// quiz to join the discussion.'

export default function manifest() {
  return {
    name: 'veritypost.com',
    short_name: 'veritypost.com',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    // Icons omitted until owner drops PNGs into web/public/. Listing
    // missing files here made every Android / iOS install attempt 404
    // on icon download and fall back to the default browser glyph.
    icons: [],
  };
}
