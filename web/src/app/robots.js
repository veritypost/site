import { getSiteUrl } from '../lib/siteUrl';

export default function robots() {
  // getSiteUrl throws in prod when NEXT_PUBLIC_SITE_URL is unset — fail
  // loud rather than emit prod URLs from a preview branch into Google.
  const base = getSiteUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/admin/',
          '/api/',
          '/bookmarks',
          '/forgot-password',
          '/logout',
          '/messages',
          '/notifications',
          '/preview',
          '/profile/settings',
          '/reset-password',
          '/verify-email',
          '/welcome',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
